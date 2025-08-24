#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MigrationEngine, MigrationConfig, MigrationResult } from '../core/migration-engine';
import { BackupManager } from '../core/backup-manager';

const program = new Command();

interface CLIConfig {
  configFile?: string;
  database?: {
    type: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    connection?: string;
  };
  migrationsDir?: string;
  verbose?: boolean;
}

class MigrationCLI {
  private config: MigrationConfig | null = null;
  private engine: MigrationEngine | null = null;
  private verbose = false;

  async loadConfig(options: CLIConfig): Promise<void> {
    let config: Partial<MigrationConfig> = {};

    // Load from config file if specified
    if (options.configFile) {
      try {
        const configPath = path.resolve(options.configFile);
        const configContent = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(configContent);
        this.log(`Loaded config from ${configPath}`);
      } catch (error) {
        throw new Error(`Failed to load config file: ${error}`);
      }
    }

    // Override with CLI options
    if (options.database) {
      config.database = {
        type: options.database.type as any,
        connection: options.database.connection || {
          host: options.database.host || 'localhost',
          port: options.database.port || this.getDefaultPort(options.database.type),
          username: options.database.username || '',
          password: options.database.password || '',
          database: options.database.database || 'sightedit',
        },
      };
    }

    if (options.migrationsDir) {
      config.migrations = {
        directory: path.resolve(options.migrationsDir),
      };
    }

    this.verbose = options.verbose || false;

    // Set defaults
    this.config = {
      database: config.database || {
        type: 'sqlite',
        connection: './database.sqlite',
      },
      migrations: {
        directory: config.migrations?.directory || './migrations',
        lockTimeout: config.migrations?.lockTimeout || 300000,
        transactionMode: config.migrations?.transactionMode || 'per-migration',
      },
      backup: {
        enabled: config.backup?.enabled !== false,
        directory: config.backup?.directory || './backups',
        retention: config.backup?.retention || 30,
      },
      logging: {
        level: config.logging?.level || 'info',
      },
    };

    this.engine = new MigrationEngine(this.config);
    this.setupEngineListeners();
  }

  private getDefaultPort(type: string): number {
    switch (type) {
      case 'postgresql': return 5432;
      case 'mysql': return 3306;
      case 'mongodb': return 27017;
      default: return 0;
    }
  }

  private setupEngineListeners(): void {
    if (!this.engine) return;

    this.engine.on('migrationStart', ({ target }) => {
      this.log(`Starting migration${target ? ` to ${target}` : 's'}...`);
    });

    this.engine.on('migrationsLoaded', ({ total, executed, pending }) => {
      this.log(`Found ${total} migrations (${executed} executed, ${pending} pending)`);
    });

    this.engine.on('migrationExecuted', ({ migration }) => {
      this.log(`✓ Executed migration: ${migration}`);
    });

    this.engine.on('migrationComplete', ({ migrationsExecuted, message }) => {
      if (message) {
        console.log(message);
      } else {
        console.log(`✅ Successfully executed ${migrationsExecuted.length} migration(s)`);
      }
    });

    this.engine.on('migrationError', ({ error, migrationsExecuted }) => {
      console.error(`❌ Migration failed: ${error.message}`);
      if (migrationsExecuted.length > 0) {
        console.log(`Executed ${migrationsExecuted.length} migrations before failure`);
      }
    });

    this.engine.on('rollbackStart', ({ steps }) => {
      this.log(`Starting rollback of ${steps} migration(s)...`);
    });

    this.engine.on('rollbackComplete', ({ migrations, message }) => {
      if (message) {
        console.log(message);
      } else {
        console.log(`✅ Successfully rolled back ${migrations.length} migration(s)`);
      }
    });

    this.engine.on('rollbackError', ({ error }) => {
      console.error(`❌ Rollback failed: ${error.message}`);
    });

    this.engine.on('migrationRolledBack', ({ migration }) => {
      this.log(`↩ Rolled back migration: ${migration}`);
    });

    this.engine.on('backupCreated', ({ path }) => {
      this.log(`📦 Backup created: ${path}`);
    });
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  async migrate(target?: string): Promise<void> {
    if (!this.engine) throw new Error('Migration engine not initialized');

    try {
      const result = await this.engine.migrate(target);
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`Migration failed: ${error}`);
      process.exit(1);
    }
  }

  async rollback(steps: number): Promise<void> {
    if (!this.engine) throw new Error('Migration engine not initialized');

    try {
      const result = await this.engine.rollback(steps);
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`Rollback failed: ${error}`);
      process.exit(1);
    }
  }

  async status(): Promise<void> {
    if (!this.engine) throw new Error('Migration engine not initialized');

    try {
      const status = await this.engine.status();
      
      console.log('\n📊 Migration Status');
      console.log('='.repeat(50));
      console.log(`Current version: ${status.current || 'None'}`);
      console.log(`Executed migrations: ${status.executed.length}`);
      console.log(`Pending migrations: ${status.pending.length}`);

      if (status.executed.length > 0) {
        console.log('\n✅ Executed Migrations:');
        status.executed.forEach(migration => {
          console.log(`  ${migration.id} - ${migration.name} (${migration.executedAt?.toISOString()})`);
        });
      }

      if (status.pending.length > 0) {
        console.log('\n⏳ Pending Migrations:');
        status.pending.forEach(migration => {
          console.log(`  ${migration.id} - ${migration.name}`);
        });
      }
    } catch (error) {
      console.error(`Failed to get status: ${error}`);
      process.exit(1);
    }
  }

  async createMigration(name: string): Promise<void> {
    if (!this.config) throw new Error('Config not loaded');

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.ts`;
    const filePath = path.join(this.config.migrations.directory, filename);

    // Ensure migrations directory exists
    await fs.mkdir(this.config.migrations.directory, { recursive: true });

    const template = this.getMigrationTemplate(name);
    await fs.writeFile(filePath, template);

    console.log(`✅ Created migration: ${filePath}`);
  }

  private getMigrationTemplate(name: string): string {
    return `import { DatabaseConnection } from '../core/migration-engine';

export const description = '${name}';

export async function up(connection: DatabaseConnection): Promise<void> {
  // TODO: Implement migration
  // Example for SQL databases:
  // await connection.query(\`
  //   CREATE TABLE example (
  //     id SERIAL PRIMARY KEY,
  //     name VARCHAR(255) NOT NULL,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //   )
  // \`);
  
  // Example for MongoDB:
  // await connection.query('db.createCollection("example")');
  // await connection.query(\`
  //   db.example.createIndex({ "name": 1 }, { "unique": true })
  // \`);
}

export async function down(connection: DatabaseConnection): Promise<void> {
  // TODO: Implement rollback
  // Example for SQL databases:
  // await connection.query('DROP TABLE IF EXISTS example');
  
  // Example for MongoDB:
  // await connection.query('db.example.drop()');
}
`;
  }

  async backup(): Promise<void> {
    if (!this.config) throw new Error('Config not loaded');

    const backupManager = new BackupManager(this.config);
    
    try {
      const backupPath = await backupManager.createBackup({
        compression: true,
        includeData: true,
      });
      console.log(`✅ Backup created: ${backupPath}`);
    } catch (error) {
      console.error(`Backup failed: ${error}`);
      process.exit(1);
    }
  }

  async restore(backupPath: string, force = false): Promise<void> {
    if (!this.config) throw new Error('Config not loaded');

    const backupManager = new BackupManager(this.config);
    
    try {
      await backupManager.restoreBackup(backupPath, { force });
      console.log(`✅ Backup restored from: ${backupPath}`);
    } catch (error) {
      console.error(`Restore failed: ${error}`);
      process.exit(1);
    }
  }

  async listBackups(): Promise<void> {
    if (!this.config) throw new Error('Config not loaded');

    const backupManager = new BackupManager(this.config);
    
    try {
      const backups = await backupManager.listBackups();
      
      if (backups.length === 0) {
        console.log('No backups found');
        return;
      }

      console.log('\n📦 Available Backups');
      console.log('='.repeat(50));
      backups.forEach(backup => {
        const size = (backup.size / 1024 / 1024).toFixed(2);
        console.log(`${backup.id}`);
        console.log(`  Database: ${backup.database} (${backup.type})`);
        console.log(`  Created: ${backup.createdAt.toISOString()}`);
        console.log(`  Size: ${size} MB`);
        console.log('');
      });
    } catch (error) {
      console.error(`Failed to list backups: ${error}`);
      process.exit(1);
    }
  }

  async cleanup(): Promise<void> {
    if (this.engine) {
      await this.engine.close();
    }
  }
}

// CLI Commands
program
  .name('sightedit-migrate')
  .description('SightEdit database migration tool')
  .version('1.0.0');

// Global options
program
  .option('-c, --config <file>', 'config file path')
  .option('-d, --database-type <type>', 'database type (postgresql|mysql|sqlite|mongodb)')
  .option('-h, --host <host>', 'database host')
  .option('-p, --port <port>', 'database port', (val) => parseInt(val))
  .option('-u, --username <username>', 'database username')
  .option('-w, --password <password>', 'database password')
  .option('-n, --database <database>', 'database name')
  .option('--connection <string>', 'database connection string')
  .option('-m, --migrations-dir <dir>', 'migrations directory')
  .option('-v, --verbose', 'verbose output');

// Migration commands
program
  .command('up')
  .description('run pending migrations')
  .argument('[target]', 'target migration to migrate to')
  .action(async (target, options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.migrate(target);
    } finally {
      await cli.cleanup();
    }
  });

program
  .command('down')
  .description('rollback migrations')
  .option('-s, --steps <steps>', 'number of migrations to rollback', (val) => parseInt(val), 1)
  .action(async (options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.rollback(options.steps);
    } finally {
      await cli.cleanup();
    }
  });

program
  .command('status')
  .description('show migration status')
  .action(async (options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.status();
    } finally {
      await cli.cleanup();
    }
  });

program
  .command('create')
  .description('create a new migration')
  .argument('<name>', 'migration name')
  .action(async (name, options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.createMigration(name);
    } finally {
      await cli.cleanup();
    }
  });

// Backup commands
program
  .command('backup')
  .description('create database backup')
  .action(async (options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.backup();
    } finally {
      await cli.cleanup();
    }
  });

program
  .command('restore')
  .description('restore from backup')
  .argument('<backup-path>', 'path to backup file')
  .option('-f, --force', 'force restore even if there are compatibility issues')
  .action(async (backupPath, options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.restore(backupPath, options.force);
    } finally {
      await cli.cleanup();
    }
  });

program
  .command('list-backups')
  .description('list available backups')
  .action(async (options) => {
    const cli = new MigrationCLI();
    try {
      await cli.loadConfig({ ...program.opts(), ...options });
      await cli.listBackups();
    } finally {
      await cli.cleanup();
    }
  });

// Error handling
process.on('SIGINT', () => {
  console.log('\n👋 Migration cancelled');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  program.parse();
}

export { MigrationCLI };