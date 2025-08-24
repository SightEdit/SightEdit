import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';

export interface Migration {
  id: string;
  name: string;
  version: string;
  description: string;
  up: (connection: DatabaseConnection) => Promise<void>;
  down: (connection: DatabaseConnection) => Promise<void>;
  checksum: string;
  createdAt: Date;
  executedAt?: Date;
  rollbackAt?: Date;
}

export interface DatabaseConnection {
  query: (sql: string, params?: any[]) => Promise<any>;
  transaction: <T>(callback: (connection: DatabaseConnection) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
  database: string;
  type: DatabaseType;
}

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';

export interface MigrationConfig {
  database: {
    type: DatabaseType;
    connection: string | {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      ssl?: boolean;
    };
    migrationTable?: string;
    migrationLockTable?: string;
  };
  migrations: {
    directory: string;
    pattern?: string;
    lockTimeout?: number;
    transactionMode?: 'per-migration' | 'all';
  };
  backup?: {
    enabled: boolean;
    directory?: string;
    retention?: number; // days
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

export interface MigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
  rollback?: boolean;
  backupPath?: string;
  duration: number;
}

export class MigrationEngine extends EventEmitter {
  private config: MigrationConfig;
  private connection: DatabaseConnection | null = null;
  private lockAcquired = false;

  constructor(config: MigrationConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.connection = await this.createConnection();
    await this.ensureMigrationTables();
  }

  async migrate(target?: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationsExecuted: [],
      duration: 0,
    };

    try {
      if (!this.connection) {
        await this.initialize();
      }

      await this.acquireLock();
      this.emit('migrationStart', { target });

      // Create backup if enabled
      if (this.config.backup?.enabled) {
        result.backupPath = await this.createBackup();
        this.emit('backupCreated', { path: result.backupPath });
      }

      const migrations = await this.loadMigrations();
      const executedMigrations = await this.getExecutedMigrations();
      const pendingMigrations = this.getPendingMigrations(migrations, executedMigrations, target);

      this.emit('migrationsLoaded', { 
        total: migrations.length, 
        executed: executedMigrations.length,
        pending: pendingMigrations.length 
      });

      if (pendingMigrations.length === 0) {
        this.emit('migrationComplete', { message: 'No pending migrations' });
        result.success = true;
        return result;
      }

      // Validate migrations before execution
      await this.validateMigrations(pendingMigrations);

      // Execute migrations
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
        result.migrationsExecuted.push(migration.id);
        this.emit('migrationExecuted', { migration: migration.id });
      }

      result.success = true;
      this.emit('migrationComplete', { migrationsExecuted: result.migrationsExecuted });

    } catch (error) {
      result.error = error as Error;
      this.emit('migrationError', { error, migrationsExecuted: result.migrationsExecuted });

      // Attempt rollback if any migrations were executed
      if (result.migrationsExecuted.length > 0) {
        try {
          await this.rollbackMigrations(result.migrationsExecuted.reverse());
          result.rollback = true;
          this.emit('rollbackComplete', { migrations: result.migrationsExecuted });
        } catch (rollbackError) {
          this.emit('rollbackError', { error: rollbackError });
        }
      }
    } finally {
      await this.releaseLock();
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  async rollback(steps: number = 1): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationsExecuted: [],
      duration: 0,
    };

    try {
      if (!this.connection) {
        await this.initialize();
      }

      await this.acquireLock();
      this.emit('rollbackStart', { steps });

      const executedMigrations = await this.getExecutedMigrations();
      const toRollback = executedMigrations.slice(-steps);

      if (toRollback.length === 0) {
        this.emit('rollbackComplete', { message: 'No migrations to rollback' });
        result.success = true;
        return result;
      }

      // Create backup if enabled
      if (this.config.backup?.enabled) {
        result.backupPath = await this.createBackup();
        this.emit('backupCreated', { path: result.backupPath });
      }

      await this.rollbackMigrations(toRollback.reverse());
      result.migrationsExecuted = toRollback.map(m => m.id);
      result.success = true;

      this.emit('rollbackComplete', { migrations: result.migrationsExecuted });

    } catch (error) {
      result.error = error as Error;
      this.emit('rollbackError', { error });
    } finally {
      await this.releaseLock();
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  async status(): Promise<{
    current: string | null;
    executed: Migration[];
    pending: Migration[];
  }> {
    if (!this.connection) {
      await this.initialize();
    }

    const allMigrations = await this.loadMigrations();
    const executedMigrations = await this.getExecutedMigrations();
    const pendingMigrations = this.getPendingMigrations(allMigrations, executedMigrations);

    return {
      current: executedMigrations.length > 0 ? executedMigrations[executedMigrations.length - 1].id : null,
      executed: executedMigrations,
      pending: pendingMigrations,
    };
  }

  private async createConnection(): Promise<DatabaseConnection> {
    const { DatabaseAdapter } = await import('./adapters/database-adapter');
    return DatabaseAdapter.create(this.config.database);
  }

  private async ensureMigrationTables(): Promise<void> {
    if (!this.connection) throw new Error('Database connection not initialized');

    const migrationTable = this.config.database.migrationTable || 'sightedit_migrations';
    const lockTable = this.config.database.migrationLockTable || 'sightedit_migration_lock';

    // Create migrations table
    const createMigrationsTable = this.connection.type === 'mongodb' 
      ? `db.createCollection("${migrationTable}")`
      : `CREATE TABLE IF NOT EXISTS ${migrationTable} (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          description TEXT,
          checksum VARCHAR(64) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          rollback_at TIMESTAMP NULL,
          execution_time_ms INTEGER DEFAULT 0
        )`;

    await this.connection.query(createMigrationsTable);

    // Create migration lock table
    const createLockTable = this.connection.type === 'mongodb'
      ? `db.createCollection("${lockTable}")`
      : `CREATE TABLE IF NOT EXISTS ${lockTable} (
          id INTEGER PRIMARY KEY,
          is_locked BOOLEAN DEFAULT FALSE,
          locked_by VARCHAR(255),
          locked_at TIMESTAMP,
          CHECK (id = 1)
        )`;

    await this.connection.query(createLockTable);

    // Initialize lock row for SQL databases
    if (this.connection.type !== 'mongodb') {
      await this.connection.query(
        `INSERT OR IGNORE INTO ${lockTable} (id, is_locked) VALUES (1, FALSE)`
      );
    }
  }

  private async loadMigrations(): Promise<Migration[]> {
    const migrationDir = this.config.migrations.directory;
    const pattern = this.config.migrations.pattern || /^\d{14}_.+\.(js|ts)$/;

    try {
      const files = await fs.readdir(migrationDir);
      const migrationFiles = files.filter(file => pattern.test(file));
      
      const migrations: Migration[] = [];

      for (const file of migrationFiles.sort()) {
        const filePath = path.join(migrationDir, file);
        const migration = await this.loadMigrationFile(filePath);
        migrations.push(migration);
      }

      return migrations;
    } catch (error) {
      throw new Error(`Failed to load migrations from ${migrationDir}: ${error}`);
    }
  }

  private async loadMigrationFile(filePath: string): Promise<Migration> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      
      // Dynamic import for .js/.ts files
      const migrationModule = await import(filePath);
      const migration = migrationModule.default || migrationModule;

      const filename = path.basename(filePath, path.extname(filePath));
      const [version, ...nameParts] = filename.split('_');
      
      return {
        id: filename,
        name: nameParts.join('_'),
        version,
        description: migration.description || '',
        up: migration.up,
        down: migration.down,
        checksum,
        createdAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to load migration file ${filePath}: ${error}`);
    }
  }

  private async getExecutedMigrations(): Promise<Migration[]> {
    if (!this.connection) throw new Error('Database connection not initialized');

    const table = this.config.database.migrationTable || 'sightedit_migrations';
    const query = this.connection.type === 'mongodb'
      ? `db.${table}.find({}).sort({ executed_at: 1 })`
      : `SELECT * FROM ${table} WHERE rollback_at IS NULL ORDER BY executed_at ASC`;

    const results = await this.connection.query(query);
    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description || '',
      checksum: row.checksum,
      createdAt: new Date(row.executed_at),
      executedAt: new Date(row.executed_at),
      up: () => Promise.resolve(),
      down: () => Promise.resolve(),
    }));
  }

  private getPendingMigrations(
    allMigrations: Migration[],
    executedMigrations: Migration[],
    target?: string
  ): Migration[] {
    const executedIds = new Set(executedMigrations.map(m => m.id));
    let pending = allMigrations.filter(m => !executedIds.has(m.id));

    if (target) {
      const targetIndex = pending.findIndex(m => m.id === target);
      if (targetIndex !== -1) {
        pending = pending.slice(0, targetIndex + 1);
      }
    }

    return pending;
  }

  private async validateMigrations(migrations: Migration[]): Promise<void> {
    for (const migration of migrations) {
      if (!migration.up || typeof migration.up !== 'function') {
        throw new Error(`Migration ${migration.id} is missing up function`);
      }
      if (!migration.down || typeof migration.down !== 'function') {
        throw new Error(`Migration ${migration.id} is missing down function`);
      }
    }
  }

  private async executeMigration(migration: Migration): Promise<void> {
    if (!this.connection) throw new Error('Database connection not initialized');

    const startTime = Date.now();
    
    const executeInTransaction = async (conn: DatabaseConnection) => {
      await migration.up(conn);
      
      const table = this.config.database.migrationTable || 'sightedit_migrations';
      const executionTime = Date.now() - startTime;

      const insertQuery = this.connection!.type === 'mongodb'
        ? `db.${table}.insertOne({
            id: "${migration.id}",
            name: "${migration.name}",
            version: "${migration.version}",
            description: "${migration.description}",
            checksum: "${migration.checksum}",
            executed_at: new Date(),
            execution_time_ms: ${executionTime}
          })`
        : `INSERT INTO ${table} 
           (id, name, version, description, checksum, executed_at, execution_time_ms) 
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`;

      const params = this.connection!.type !== 'mongodb' 
        ? [migration.id, migration.name, migration.version, migration.description, migration.checksum, executionTime]
        : undefined;

      await conn.query(insertQuery, params);
    };

    if (this.config.migrations.transactionMode === 'per-migration') {
      await this.connection.transaction(executeInTransaction);
    } else {
      await executeInTransaction(this.connection);
    }
  }

  private async rollbackMigrations(migrations: Migration[]): Promise<void> {
    if (!this.connection) throw new Error('Database connection not initialized');

    const table = this.config.database.migrationTable || 'sightedit_migrations';

    for (const migration of migrations) {
      // Load the actual migration file to get the down function
      const migrationFiles = await this.loadMigrations();
      const migrationFile = migrationFiles.find(m => m.id === migration.id);
      
      if (!migrationFile) {
        throw new Error(`Migration file not found for ${migration.id}`);
      }

      const rollbackInTransaction = async (conn: DatabaseConnection) => {
        await migrationFile.down(conn);

        const updateQuery = this.connection!.type === 'mongodb'
          ? `db.${table}.updateOne(
              { id: "${migration.id}" },
              { $set: { rollback_at: new Date() } }
            )`
          : `UPDATE ${table} SET rollback_at = CURRENT_TIMESTAMP WHERE id = ?`;

        const params = this.connection!.type !== 'mongodb' ? [migration.id] : undefined;
        await conn.query(updateQuery, params);
      };

      if (this.config.migrations.transactionMode === 'per-migration') {
        await this.connection.transaction(rollbackInTransaction);
      } else {
        await rollbackInTransaction(this.connection);
      }

      this.emit('migrationRolledBack', { migration: migration.id });
    }
  }

  private async createBackup(): Promise<string> {
    const { BackupManager } = await import('./backup-manager');
    const backupManager = new BackupManager(this.config);
    return backupManager.createBackup();
  }

  private async acquireLock(): Promise<void> {
    if (!this.connection) throw new Error('Database connection not initialized');

    const lockTable = this.config.database.migrationLockTable || 'sightedit_migration_lock';
    const timeout = this.config.migrations.lockTimeout || 300000; // 5 minutes
    const lockId = `migration-${process.pid}-${Date.now()}`;
    
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const updateQuery = this.connection.type === 'mongodb'
          ? `db.${lockTable}.updateOne(
              { id: 1, is_locked: false },
              { $set: { is_locked: true, locked_by: "${lockId}", locked_at: new Date() } }
            )`
          : `UPDATE ${lockTable} 
             SET is_locked = TRUE, locked_by = ?, locked_at = CURRENT_TIMESTAMP 
             WHERE id = 1 AND is_locked = FALSE`;

        const params = this.connection.type !== 'mongodb' ? [lockId] : undefined;
        const result = await this.connection.query(updateQuery, params);

        if ((this.connection.type === 'mongodb' && result.modifiedCount > 0) || 
            (this.connection.type !== 'mongodb' && result.affectedRows > 0)) {
          this.lockAcquired = true;
          return;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        throw new Error(`Failed to acquire migration lock: ${error}`);
      }
    }

    throw new Error('Failed to acquire migration lock within timeout period');
  }

  private async releaseLock(): Promise<void> {
    if (!this.connection || !this.lockAcquired) return;

    const lockTable = this.config.database.migrationLockTable || 'sightedit_migration_lock';

    try {
      const updateQuery = this.connection.type === 'mongodb'
        ? `db.${lockTable}.updateOne(
            { id: 1 },
            { $set: { is_locked: false, locked_by: null, locked_at: null } }
          )`
        : `UPDATE ${lockTable} SET is_locked = FALSE, locked_by = NULL, locked_at = NULL WHERE id = 1`;

      await this.connection.query(updateQuery);
      this.lockAcquired = false;
    } catch (error) {
      this.emit('lockReleaseError', { error });
    }
  }

  async close(): Promise<void> {
    if (this.lockAcquired) {
      await this.releaseLock();
    }
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}