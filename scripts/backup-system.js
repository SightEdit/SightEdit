#!/usr/bin/env node

/**
 * SightEdit Automated Backup and Recovery System
 * 
 * This script provides comprehensive backup and recovery capabilities for SightEdit deployments.
 * It supports multiple storage backends, encryption, compression, and automated scheduling.
 */

const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { createGzip, createGunzip } = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

class BackupSystem {
  constructor(config = {}) {
    this.config = {
      // Database settings
      dbType: process.env.DB_TYPE || 'postgresql',
      dbHost: process.env.DB_HOST || 'localhost',
      dbPort: process.env.DB_PORT || 5432,
      dbName: process.env.DB_NAME || 'sightedit',
      dbUser: process.env.DB_USER || 'postgres',
      dbPassword: process.env.DB_PASSWORD,
      
      // Backup settings
      backupDir: process.env.BACKUP_DIR || './backups',
      maxBackups: parseInt(process.env.MAX_BACKUPS) || 30,
      compression: process.env.BACKUP_COMPRESSION === 'true',
      encryption: process.env.BACKUP_ENCRYPTION === 'true',
      encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
      
      // Storage backends
      s3Bucket: process.env.S3_BACKUP_BUCKET,
      s3Region: process.env.S3_REGION || 'us-east-1',
      gcsProject: process.env.GCS_PROJECT,
      gcsBucket: process.env.GCS_BACKUP_BUCKET,
      
      // File backup settings
      includeFiles: process.env.BACKUP_INCLUDE_FILES === 'true',
      filePatterns: (process.env.BACKUP_FILE_PATTERNS || 'uploads/**,public/**').split(','),
      excludePatterns: (process.env.BACKUP_EXCLUDE_PATTERNS || 'node_modules/**,*.log,*.tmp').split(','),
      
      // Notification settings
      webhookUrl: process.env.BACKUP_WEBHOOK_URL,
      notifySuccess: process.env.BACKUP_NOTIFY_SUCCESS === 'true',
      notifyFailure: process.env.BACKUP_NOTIFY_FAILURE !== 'false',
      
      ...config
    };

    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
      error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
    };
  }

  /**
   * Create a complete backup including database and files
   */
  async createBackup(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `sightedit-backup-${timestamp}`;
    const backupPath = path.join(this.config.backupDir, backupId);

    this.logger.info(`Starting backup: ${backupId}`);

    try {
      // Ensure backup directory exists
      await fs.mkdir(backupPath, { recursive: true });

      const manifest = {
        id: backupId,
        timestamp: new Date().toISOString(),
        version: await this.getSightEditVersion(),
        components: [],
        size: 0,
        compressed: this.config.compression,
        encrypted: this.config.encryption
      };

      // Backup database
      if (!options.skipDatabase) {
        this.logger.info('Backing up database...');
        const dbBackup = await this.backupDatabase(backupPath);
        manifest.components.push(dbBackup);
        manifest.size += dbBackup.size;
      }

      // Backup files
      if (this.config.includeFiles && !options.skipFiles) {
        this.logger.info('Backing up files...');
        const fileBackup = await this.backupFiles(backupPath);
        manifest.components.push(fileBackup);
        manifest.size += fileBackup.size;
      }

      // Backup configuration
      if (!options.skipConfig) {
        this.logger.info('Backing up configuration...');
        const configBackup = await this.backupConfiguration(backupPath);
        manifest.components.push(configBackup);
        manifest.size += configBackup.size;
      }

      // Create manifest
      const manifestPath = path.join(backupPath, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Compress backup if enabled
      if (this.config.compression) {
        this.logger.info('Compressing backup...');
        await this.compressBackup(backupPath);
      }

      // Encrypt backup if enabled
      if (this.config.encryption) {
        this.logger.info('Encrypting backup...');
        await this.encryptBackup(backupPath);
      }

      // Upload to remote storage if configured
      await this.uploadBackup(backupPath, manifest);

      // Clean up old backups
      await this.cleanupOldBackups();

      // Send notification
      await this.sendNotification('success', {
        backupId,
        size: this.formatFileSize(manifest.size),
        duration: Date.now() - new Date(manifest.timestamp).getTime()
      });

      this.logger.info(`Backup completed successfully: ${backupId}`);
      return { success: true, backupId, manifest };

    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`);
      
      // Clean up failed backup
      try {
        await fs.rmdir(backupPath, { recursive: true });
      } catch (cleanupError) {
        this.logger.warn(`Failed to clean up failed backup: ${cleanupError.message}`);
      }

      // Send failure notification
      await this.sendNotification('failure', {
        error: error.message,
        backupId
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(backupId, options = {}) {
    this.logger.info(`Starting restore from backup: ${backupId}`);

    try {
      const backupPath = path.join(this.config.backupDir, backupId);
      
      // Check if backup exists
      const manifestPath = path.join(backupPath, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      this.logger.info(`Restoring backup from ${manifest.timestamp}`);

      // Decrypt if needed
      if (manifest.encrypted) {
        this.logger.info('Decrypting backup...');
        await this.decryptBackup(backupPath);
      }

      // Decompress if needed
      if (manifest.compressed) {
        this.logger.info('Decompressing backup...');
        await this.decompressBackup(backupPath);
      }

      // Create database backup before restore
      if (!options.skipBackupCurrent) {
        this.logger.info('Creating safety backup of current data...');
        await this.createBackup({ 
          skipFiles: options.onlyDatabase,
          skipConfig: true
        });
      }

      // Restore database
      if (!options.skipDatabase) {
        const dbComponent = manifest.components.find(c => c.type === 'database');
        if (dbComponent) {
          this.logger.info('Restoring database...');
          await this.restoreDatabase(path.join(backupPath, dbComponent.filename));
        }
      }

      // Restore files
      if (!options.skipFiles) {
        const fileComponent = manifest.components.find(c => c.type === 'files');
        if (fileComponent) {
          this.logger.info('Restoring files...');
          await this.restoreFiles(path.join(backupPath, fileComponent.filename));
        }
      }

      // Restore configuration
      if (!options.skipConfig) {
        const configComponent = manifest.components.find(c => c.type === 'configuration');
        if (configComponent) {
          this.logger.info('Restoring configuration...');
          await this.restoreConfiguration(path.join(backupPath, configComponent.filename));
        }
      }

      // Send notification
      await this.sendNotification('restore', {
        backupId,
        restoredAt: new Date().toISOString()
      });

      this.logger.info(`Restore completed successfully from backup: ${backupId}`);
      return { success: true, backupId, manifest };

    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`);
      
      await this.sendNotification('restore_failure', {
        backupId,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const backups = [];
      const backupDir = await fs.readdir(this.config.backupDir);
      
      for (const item of backupDir) {
        const backupPath = path.join(this.config.backupDir, item);
        const stat = await fs.stat(backupPath);
        
        if (stat.isDirectory() && item.startsWith('sightedit-backup-')) {
          const manifestPath = path.join(backupPath, 'manifest.json');
          
          try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            backups.push({
              id: item,
              timestamp: manifest.timestamp,
              size: this.formatFileSize(manifest.size),
              components: manifest.components.map(c => c.type),
              version: manifest.version
            });
          } catch (error) {
            this.logger.warn(`Failed to read manifest for backup ${item}: ${error.message}`);
          }
        }
      }
      
      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      this.logger.error(`Failed to list backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Backup database
   */
  async backupDatabase(backupPath) {
    const filename = 'database.sql';
    const filePath = path.join(backupPath, filename);

    switch (this.config.dbType) {
      case 'postgresql':
        await this.execCommand('pg_dump', [
          '-h', this.config.dbHost,
          '-p', this.config.dbPort.toString(),
          '-U', this.config.dbUser,
          '-d', this.config.dbName,
          '-f', filePath,
          '--no-password'
        ], {
          PGPASSWORD: this.config.dbPassword
        });
        break;

      case 'mysql':
        await this.execCommand('mysqldump', [
          '-h', this.config.dbHost,
          '-P', this.config.dbPort.toString(),
          '-u', this.config.dbUser,
          `-p${this.config.dbPassword}`,
          this.config.dbName
        ], {}, filePath);
        break;

      case 'sqlite':
        // Copy SQLite file
        await fs.copyFile(this.config.dbName, filePath);
        break;

      default:
        throw new Error(`Unsupported database type: ${this.config.dbType}`);
    }

    const stat = await fs.stat(filePath);
    return {
      type: 'database',
      filename,
      size: stat.size,
      created: new Date().toISOString()
    };
  }

  /**
   * Backup files
   */
  async backupFiles(backupPath) {
    const filename = 'files.tar.gz';
    const filePath = path.join(backupPath, filename);
    const tempDir = path.join(backupPath, 'temp_files');
    
    await fs.mkdir(tempDir, { recursive: true });

    // Copy matching files
    let totalSize = 0;
    for (const pattern of this.config.filePatterns) {
      const files = await this.globFiles(pattern);
      
      for (const file of files) {
        // Check exclude patterns
        if (this.config.excludePatterns.some(exclude => this.matchPattern(file, exclude))) {
          continue;
        }

        const relativePath = path.relative(process.cwd(), file);
        const targetPath = path.join(tempDir, relativePath);
        
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(file, targetPath);
        
        const stat = await fs.stat(file);
        totalSize += stat.size;
      }
    }

    // Create tar.gz archive
    await this.execCommand('tar', [
      '-czf', filePath,
      '-C', tempDir,
      '.'
    ]);

    // Clean up temp directory
    await fs.rmdir(tempDir, { recursive: true });

    return {
      type: 'files',
      filename,
      size: totalSize,
      created: new Date().toISOString()
    };
  }

  /**
   * Backup configuration
   */
  async backupConfiguration(backupPath) {
    const filename = 'configuration.json';
    const filePath = path.join(backupPath, filename);

    const config = {
      environment: process.env.NODE_ENV || 'production',
      sightEditVersion: await this.getSightEditVersion(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      
      // Backup environment variables (excluding secrets)
      environment_variables: this.getSafeEnvironmentVariables(),
      
      // Package.json if exists
      packageJson: await this.getPackageJson(),
      
      // SightEdit specific configuration
      sightEditConfig: await this.getSightEditConfig()
    };

    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    
    const stat = await fs.stat(filePath);
    return {
      type: 'configuration',
      filename,
      size: stat.size,
      created: new Date().toISOString()
    };
  }

  /**
   * Compress backup directory
   */
  async compressBackup(backupPath) {
    const compressedPath = `${backupPath}.tar.gz`;
    const backupName = path.basename(backupPath);
    const parentDir = path.dirname(backupPath);
    
    await this.execCommand('tar', [
      '-czf', compressedPath,
      '-C', parentDir,
      backupName
    ]);

    // Remove original directory
    await fs.rmdir(backupPath, { recursive: true });
  }

  /**
   * Encrypt backup
   */
  async encryptBackup(backupPath) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const inputPath = this.config.compression ? `${backupPath}.tar.gz` : backupPath;
    const outputPath = `${inputPath}.enc`;

    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 24);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher('aes192', key);
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);

    // Write IV to start of file
    output.write(iv);

    return new Promise((resolve, reject) => {
      input.pipe(cipher).pipe(output)
        .on('finish', () => {
          // Remove unencrypted file
          fs.unlink(inputPath).then(resolve).catch(reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Upload backup to remote storage
   */
  async uploadBackup(backupPath, manifest) {
    const backupFile = this.getBackupFilePath(backupPath);
    
    if (this.config.s3Bucket) {
      await this.uploadToS3(backupFile, manifest);
    }
    
    if (this.config.gcsBucket) {
      await this.uploadToGCS(backupFile, manifest);
    }
  }

  /**
   * Upload to AWS S3
   */
  async uploadToS3(filePath, manifest) {
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({ region: this.config.s3Region });
    
    const fileName = path.basename(filePath);
    const fileStream = createReadStream(filePath);
    
    const params = {
      Bucket: this.config.s3Bucket,
      Key: `sightedit-backups/${fileName}`,
      Body: fileStream,
      Metadata: {
        'backup-id': manifest.id,
        'backup-timestamp': manifest.timestamp,
        'backup-version': manifest.version
      }
    };

    await s3.upload(params).promise();
    this.logger.info(`Backup uploaded to S3: s3://${this.config.s3Bucket}/${params.Key}`);
  }

  /**
   * Upload to Google Cloud Storage
   */
  async uploadToGCS(filePath, manifest) {
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage({ projectId: this.config.gcsProject });
    
    const fileName = path.basename(filePath);
    const bucket = storage.bucket(this.config.gcsBucket);
    const file = bucket.file(`sightedit-backups/${fileName}`);
    
    await bucket.upload(filePath, {
      destination: file,
      metadata: {
        metadata: {
          'backup-id': manifest.id,
          'backup-timestamp': manifest.timestamp,
          'backup-version': manifest.version
        }
      }
    });

    this.logger.info(`Backup uploaded to GCS: gs://${this.config.gcsBucket}/sightedit-backups/${fileName}`);
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      
      if (backups.length > this.config.maxBackups) {
        const backupsToDelete = backups.slice(this.config.maxBackups);
        
        for (const backup of backupsToDelete) {
          const backupPath = path.join(this.config.backupDir, backup.id);
          await fs.rmdir(backupPath, { recursive: true });
          this.logger.info(`Deleted old backup: ${backup.id}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to clean up old backups: ${error.message}`);
    }
  }

  /**
   * Send notification
   */
  async sendNotification(type, data) {
    if (!this.config.webhookUrl) return;
    
    if (type === 'success' && !this.config.notifySuccess) return;
    if (type === 'failure' && !this.config.notifyFailure) return;

    const payload = {
      type,
      timestamp: new Date().toISOString(),
      service: 'SightEdit Backup System',
      ...data
    };

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Execute command with proper error handling
   */
  async execCommand(command, args, env = {}, outputFile = null) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: outputFile ? ['pipe', 'pipe', 'pipe'] : 'inherit'
      });

      let output = '';
      let errorOutput = '';

      if (outputFile) {
        const writeStream = createWriteStream(outputFile);
        child.stdout.pipe(writeStream);
      }

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Helper methods
   */
  async getSightEditVersion() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      return packageJson.version || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  getSafeEnvironmentVariables() {
    const safe = {};
    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'api_key'];
    
    for (const [key, value] of Object.entries(process.env)) {
      const lowerKey = key.toLowerCase();
      
      if (!sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        safe[key] = value;
      }
    }
    
    return safe;
  }

  async getPackageJson() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      return JSON.parse(await fs.readFile(packagePath, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  async getSightEditConfig() {
    // Try to load SightEdit configuration from common locations
    const configPaths = [
      'sightedit.config.js',
      'sightedit.json',
      '.sighteditrc'
    ];

    for (const configPath of configPaths) {
      try {
        if (configPath.endsWith('.js')) {
          delete require.cache[require.resolve(path.resolve(configPath))];
          return require(path.resolve(configPath));
        } else {
          return JSON.parse(await fs.readFile(configPath, 'utf8'));
        }
      } catch (error) {
        // Config file doesn't exist or invalid
      }
    }

    return null;
  }

  getBackupFilePath(backupPath) {
    if (this.config.encryption) {
      return this.config.compression ? `${backupPath}.tar.gz.enc` : `${backupPath}.enc`;
    } else if (this.config.compression) {
      return `${backupPath}.tar.gz`;
    } else {
      return backupPath;
    }
  }

  async globFiles(pattern) {
    // Simple glob implementation - in production, use a proper glob library
    const glob = require('glob');
    return new Promise((resolve, reject) => {
      glob(pattern, (error, files) => {
        if (error) reject(error);
        else resolve(files);
      });
    });
  }

  matchPattern(file, pattern) {
    // Simple pattern matching - in production, use a proper matching library
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(file);
  }

  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }
}

// CLI Interface
if (require.main === module) {
  const backup = new BackupSystem();
  const command = process.argv[2];

  async function main() {
    switch (command) {
      case 'create':
        const result = await backup.createBackup();
        process.exit(result.success ? 0 : 1);
        break;

      case 'restore':
        const backupId = process.argv[3];
        if (!backupId) {
          console.error('Usage: node backup-system.js restore <backup-id>');
          process.exit(1);
        }
        const restoreResult = await backup.restoreBackup(backupId);
        process.exit(restoreResult.success ? 0 : 1);
        break;

      case 'list':
        const backups = await backup.listBackups();
        console.table(backups);
        break;

      case 'schedule':
        // Set up cron job or systemd timer
        console.log('Use cron or systemd timer to schedule regular backups:');
        console.log('# Daily backup at 2 AM');
        console.log('0 2 * * * /usr/bin/node /path/to/backup-system.js create');
        break;

      default:
        console.log('SightEdit Backup System');
        console.log('');
        console.log('Commands:');
        console.log('  create           Create a new backup');
        console.log('  restore <id>     Restore from backup');
        console.log('  list             List available backups');
        console.log('  schedule         Show scheduling examples');
        console.log('');
        console.log('Environment variables:');
        console.log('  DB_TYPE          Database type (postgresql, mysql, sqlite)');
        console.log('  DB_HOST          Database host');
        console.log('  DB_NAME          Database name');
        console.log('  DB_USER          Database user');
        console.log('  DB_PASSWORD      Database password');
        console.log('  BACKUP_DIR       Backup directory');
        console.log('  S3_BACKUP_BUCKET S3 bucket for remote storage');
        console.log('  BACKUP_ENCRYPTION_KEY Encryption key');
        break;
    }
  }

  main().catch(error => {
    console.error('Backup system error:', error);
    process.exit(1);
  });
}

module.exports = BackupSystem;