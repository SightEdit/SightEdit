import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { MigrationConfig, DatabaseConnection, DatabaseType } from './migration-engine';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface BackupOptions {
  compression?: boolean;
  includeData?: boolean;
  includeLogs?: boolean;
  customTables?: string[];
  excludeTables?: string[];
}

export interface BackupMetadata {
  id: string;
  database: string;
  type: DatabaseType;
  createdAt: Date;
  size: number;
  checksum: string;
  options: BackupOptions;
  version: string;
}

export class BackupManager {
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  async createBackup(options: BackupOptions = {}): Promise<string> {
    const backupDir = this.config.backup?.directory || path.join(process.cwd(), 'backups');
    await this.ensureBackupDirectory(backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `sightedit-backup-${timestamp}`;
    const backupPath = path.join(backupDir, `${backupId}.sql`);

    try {
      // Create database connection
      const { DatabaseAdapter } = await import('./adapters/database-adapter');
      const connection = await DatabaseAdapter.create(this.config.database);

      // Generate backup based on database type
      let backupContent: string;
      switch (this.config.database.type) {
        case 'postgresql':
          backupContent = await this.createPostgreSQLBackup(connection, options);
          break;
        case 'mysql':
          backupContent = await this.createMySQLBackup(connection, options);
          break;
        case 'sqlite':
          backupContent = await this.createSQLiteBackup(connection, options);
          break;
        case 'mongodb':
          backupContent = await this.createMongoDBBackup(connection, options);
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.database.type}`);
      }

      // Write backup content
      if (options.compression !== false) {
        const compressed = await gzipAsync(Buffer.from(backupContent));
        await fs.writeFile(`${backupPath}.gz`, compressed);
      } else {
        await fs.writeFile(backupPath, backupContent, 'utf8');
      }

      // Create metadata file
      const metadata: BackupMetadata = {
        id: backupId,
        database: connection.database,
        type: this.config.database.type,
        createdAt: new Date(),
        size: Buffer.byteLength(backupContent),
        checksum: this.calculateChecksum(backupContent),
        options,
        version: await this.getDatabaseVersion(connection),
      };

      await fs.writeFile(
        path.join(backupDir, `${backupId}.meta.json`),
        JSON.stringify(metadata, null, 2)
      );

      await connection.close();

      // Clean old backups if retention is configured
      if (this.config.backup?.retention) {
        await this.cleanOldBackups(backupDir, this.config.backup.retention);
      }

      return options.compression !== false ? `${backupPath}.gz` : backupPath;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error}`);
    }
  }

  async restoreBackup(backupPath: string, options: { force?: boolean } = {}): Promise<void> {
    if (!(await this.backupExists(backupPath))) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    try {
      // Load backup metadata
      const metadataPath = backupPath.replace(/\.(sql|json)(\.gz)?$/, '.meta.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata: BackupMetadata = JSON.parse(metadataContent);

      // Validate compatibility
      if (metadata.type !== this.config.database.type && !options.force) {
        throw new Error(
          `Database type mismatch. Backup: ${metadata.type}, Current: ${this.config.database.type}`
        );
      }

      // Read backup content
      let backupContent: string;
      if (backupPath.endsWith('.gz')) {
        const compressed = await fs.readFile(backupPath);
        const decompressed = await gunzipAsync(compressed);
        backupContent = decompressed.toString('utf8');
      } else {
        backupContent = await fs.readFile(backupPath, 'utf8');
      }

      // Verify checksum
      const currentChecksum = this.calculateChecksum(backupContent);
      if (currentChecksum !== metadata.checksum && !options.force) {
        throw new Error('Backup file integrity check failed');
      }

      // Create database connection
      const { DatabaseAdapter } = await import('./adapters/database-adapter');
      const connection = await DatabaseAdapter.create(this.config.database);

      // Execute restore based on database type
      switch (metadata.type) {
        case 'postgresql':
          await this.restorePostgreSQL(connection, backupContent, metadata);
          break;
        case 'mysql':
          await this.restoreMySQL(connection, backupContent, metadata);
          break;
        case 'sqlite':
          await this.restoreSQLite(connection, backupContent, metadata);
          break;
        case 'mongodb':
          await this.restoreMongoDB(connection, backupContent, metadata);
          break;
        default:
          throw new Error(`Unsupported database type: ${metadata.type}`);
      }

      await connection.close();
    } catch (error) {
      throw new Error(`Backup restore failed: ${error}`);
    }
  }

  async listBackups(directory?: string): Promise<BackupMetadata[]> {
    const backupDir = directory || this.config.backup?.directory || path.join(process.cwd(), 'backups');
    
    try {
      const files = await fs.readdir(backupDir);
      const metadataFiles = files.filter(file => file.endsWith('.meta.json'));
      
      const backups: BackupMetadata[] = [];
      for (const file of metadataFiles) {
        const content = await fs.readFile(path.join(backupDir, file), 'utf8');
        backups.push(JSON.parse(content));
      }

      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      throw new Error(`Failed to list backups: ${error}`);
    }
  }

  async deleteBackup(backupId: string): Promise<void> {
    const backupDir = this.config.backup?.directory || path.join(process.cwd(), 'backups');
    
    const filesToDelete = [
      path.join(backupDir, `${backupId}.sql`),
      path.join(backupDir, `${backupId}.sql.gz`),
      path.join(backupDir, `${backupId}.meta.json`),
    ];

    for (const file of filesToDelete) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // Ignore if file doesn't exist
        if ((error as any).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  private async ensureBackupDirectory(directory: string): Promise<void> {
    try {
      await fs.access(directory);
    } catch {
      await fs.mkdir(directory, { recursive: true });
    }
  }

  private async backupExists(backupPath: string): Promise<boolean> {
    try {
      await fs.access(backupPath);
      return true;
    } catch {
      return false;
    }
  }

  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async getDatabaseVersion(connection: DatabaseConnection): Promise<string> {
    try {
      let versionQuery: string;
      switch (connection.type) {
        case 'postgresql':
          versionQuery = 'SELECT version()';
          break;
        case 'mysql':
          versionQuery = 'SELECT VERSION()';
          break;
        case 'sqlite':
          versionQuery = 'SELECT sqlite_version()';
          break;
        case 'mongodb':
          versionQuery = 'db.version()';
          break;
        default:
          return 'unknown';
      }

      const result = await connection.query(versionQuery);
      return connection.type === 'mongodb' ? result : result[0][Object.keys(result[0])[0]];
    } catch {
      return 'unknown';
    }
  }

  private async createPostgreSQLBackup(connection: DatabaseConnection, options: BackupOptions): Promise<string> {
    const includeData = options.includeData !== false;
    const tables = await this.getTables(connection, options);
    let backup = `-- PostgreSQL database backup\n-- Generated at ${new Date().toISOString()}\n\n`;

    // Set session parameters
    backup += `SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;\n\n`;

    for (const table of tables) {
      // Get table schema
      const schemaQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `;
      const columns = await connection.query(schemaQuery, [table]);
      
      backup += `-- Table: ${table}\n`;
      backup += `CREATE TABLE IF NOT EXISTS ${table} (\n`;
      backup += columns.map((col: any) => {
        let def = `  ${col.column_name} ${col.data_type}`;
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        if (col.column_default) def += ` DEFAULT ${col.column_default}`;
        return def;
      }).join(',\n');
      backup += '\n);\n\n';

      if (includeData) {
        const data = await connection.query(`SELECT * FROM ${table}`);
        if (data.length > 0) {
          backup += `-- Data for table: ${table}\n`;
          for (const row of data) {
            const values = Object.values(row).map(val => 
              val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`
            ).join(', ');
            backup += `INSERT INTO ${table} VALUES (${values});\n`;
          }
          backup += '\n';
        }
      }
    }

    return backup;
  }

  private async createMySQLBackup(connection: DatabaseConnection, options: BackupOptions): Promise<string> {
    const includeData = options.includeData !== false;
    const tables = await this.getTables(connection, options);
    let backup = `-- MySQL database backup\n-- Generated at ${new Date().toISOString()}\n\n`;

    backup += `SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;\n\n`;

    for (const table of tables) {
      // Get CREATE TABLE statement
      const createTableResult = await connection.query(`SHOW CREATE TABLE ${table}`);
      backup += `-- Table structure for table \`${table}\`\n`;
      backup += `DROP TABLE IF EXISTS \`${table}\`;\n`;
      backup += `${createTableResult[0]['Create Table']};\n\n`;

      if (includeData) {
        const data = await connection.query(`SELECT * FROM ${table}`);
        if (data.length > 0) {
          backup += `-- Dumping data for table \`${table}\`\n`;
          backup += `LOCK TABLES \`${table}\` WRITE;\n`;
          backup += `INSERT INTO \`${table}\` VALUES `;
          
          const rows = data.map((row: any) => {
            const values = Object.values(row).map(val => 
              val === null ? 'NULL' : `'${String(val).replace(/'/g, "\\'")}'`
            ).join(', ');
            return `(${values})`;
          });
          
          backup += rows.join(',\n') + ';\n';
          backup += `UNLOCK TABLES;\n\n`;
        }
      }
    }

    backup += `SET FOREIGN_KEY_CHECKS=1;
COMMIT;\n`;

    return backup;
  }

  private async createSQLiteBackup(connection: DatabaseConnection, options: BackupOptions): Promise<string> {
    const includeData = options.includeData !== false;
    const tables = await this.getTables(connection, options);
    let backup = `-- SQLite database backup\n-- Generated at ${new Date().toISOString()}\n\n`;

    backup += `PRAGMA foreign_keys=OFF;\n`;
    backup += `BEGIN TRANSACTION;\n\n`;

    for (const table of tables) {
      // Get table schema
      const schemaResult = await connection.query(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`);
      if (schemaResult.length > 0) {
        backup += `-- Table: ${table}\n`;
        backup += `${schemaResult[0].sql};\n\n`;

        if (includeData) {
          const data = await connection.query(`SELECT * FROM ${table}`);
          if (data.length > 0) {
            backup += `-- Data for table: ${table}\n`;
            for (const row of data) {
              const values = Object.values(row).map(val => 
                val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`
              ).join(', ');
              backup += `INSERT INTO ${table} VALUES (${values});\n`;
            }
            backup += '\n';
          }
        }
      }
    }

    backup += `COMMIT;\n`;
    backup += `PRAGMA foreign_keys=ON;\n`;

    return backup;
  }

  private async createMongoDBBackup(connection: DatabaseConnection, options: BackupOptions): Promise<string> {
    const includeData = options.includeData !== false;
    const collections = await this.getTables(connection, options); // Collections in MongoDB
    let backup = `// MongoDB database backup\n// Generated at ${new Date().toISOString()}\n\n`;

    for (const collection of collections) {
      backup += `// Collection: ${collection}\n`;
      
      if (includeData) {
        const data = await connection.query(`db.${collection}.find({})`);
        if (data && data.length > 0) {
          backup += `db.${collection}.deleteMany({});\n`;
          backup += `db.${collection}.insertMany([\n`;
          backup += data.map((doc: any) => `  ${JSON.stringify(doc, null, 2)}`).join(',\n');
          backup += '\n]);\n\n';
        }
      }

      // Get indexes
      const indexes = await connection.query(`db.${collection}.getIndexes()`);
      if (indexes && indexes.length > 0) {
        backup += `// Indexes for ${collection}\n`;
        for (const index of indexes) {
          if (index.name !== '_id_') { // Skip default _id index
            backup += `db.${collection}.createIndex(${JSON.stringify(index.key)}, ${JSON.stringify({
              name: index.name,
              unique: index.unique || false,
              sparse: index.sparse || false,
            })});\n`;
          }
        }
        backup += '\n';
      }
    }

    return backup;
  }

  private async getTables(connection: DatabaseConnection, options: BackupOptions): Promise<string[]> {
    let query: string;
    let tables: string[];

    switch (connection.type) {
      case 'postgresql':
        query = `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
        break;
      case 'mysql':
        query = `SHOW TABLES`;
        break;
      case 'sqlite':
        query = `SELECT name FROM sqlite_master WHERE type='table'`;
        break;
      case 'mongodb':
        query = `db.listCollectionNames()`;
        break;
      default:
        throw new Error(`Unsupported database type: ${connection.type}`);
    }

    const result = await connection.query(query);
    
    if (connection.type === 'mongodb') {
      tables = result;
    } else {
      const firstKey = Object.keys(result[0])[0];
      tables = result.map((row: any) => row[firstKey]);
    }

    // Apply table filters
    if (options.customTables && options.customTables.length > 0) {
      tables = tables.filter(table => options.customTables!.includes(table));
    }

    if (options.excludeTables && options.excludeTables.length > 0) {
      tables = tables.filter(table => !options.excludeTables!.includes(table));
    }

    return tables.sort();
  }

  private async restorePostgreSQL(connection: DatabaseConnection, content: string, metadata: BackupMetadata): Promise<void> {
    const statements = content.split(';').filter(stmt => stmt.trim());
    
    await connection.transaction(async (conn) => {
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          await conn.query(trimmed);
        }
      }
    });
  }

  private async restoreMySQL(connection: DatabaseConnection, content: string, metadata: BackupMetadata): Promise<void> {
    const statements = content.split(';').filter(stmt => stmt.trim());
    
    await connection.transaction(async (conn) => {
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          await conn.query(trimmed);
        }
      }
    });
  }

  private async restoreSQLite(connection: DatabaseConnection, content: string, metadata: BackupMetadata): Promise<void> {
    const statements = content.split(';').filter(stmt => stmt.trim());
    
    await connection.transaction(async (conn) => {
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          await conn.query(trimmed);
        }
      }
    });
  }

  private async restoreMongoDB(connection: DatabaseConnection, content: string, metadata: BackupMetadata): Promise<void> {
    // MongoDB restore is more complex as it involves JavaScript code execution
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('//'));
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('db.')) {
        await connection.query(trimmed);
      }
    }
  }

  private async cleanOldBackups(directory: string, retentionDays: number): Promise<void> {
    const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
    
    try {
      const backups = await this.listBackups(directory);
      const oldBackups = backups.filter(backup => new Date(backup.createdAt) < cutoffDate);
      
      for (const backup of oldBackups) {
        await this.deleteBackup(backup.id);
      }
    } catch (error) {
      console.warn(`Failed to clean old backups: ${error}`);
    }
  }
}