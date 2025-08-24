// SightEdit Database Migration System
// Export all public APIs

// Core migration engine
export { 
  MigrationEngine, 
  type Migration, 
  type MigrationConfig, 
  type MigrationResult,
  type DatabaseConnection,
  type DatabaseType
} from './core/migration-engine';

// Backup management
export { 
  BackupManager,
  type BackupOptions,
  type BackupMetadata
} from './core/backup-manager';

// Schema validation
export { 
  SchemaValidator,
  type SchemaValidationResult,
  type SchemaValidationError,
  type SchemaValidationWarning,
  type TableSchema,
  type ColumnSchema,
  type IndexSchema,
  type ConstraintSchema
} from './core/schema-validator';

// Database adapters
export { DatabaseAdapter } from './core/adapters/database-adapter';
export { PostgreSQLAdapter } from './core/adapters/postgresql-adapter';
export { MySQLAdapter } from './core/adapters/mysql-adapter';
export { SQLiteAdapter } from './core/adapters/sqlite-adapter';
export { MongoDBAdapter } from './core/adapters/mongodb-adapter';

// CLI tools
export { MigrationCLI } from './cli/migrate';
export { ConfigGenerator } from './cli/config-generator';

// Testing framework
export {
  MigrationTestRunner,
  type TestConfig,
  type TestResult,
  type TestError,
  type TestWarning,
  type PerformanceMetrics
} from './testing/migration-test-runner';

// Version information
export const VERSION = '1.0.0';

// Default configurations for common setups
export const CONFIG_TEMPLATES = {
  POSTGRESQL_LOCAL: {
    database: {
      type: 'postgresql' as const,
      connection: {
        host: 'localhost',
        port: 5432,
        username: 'sightedit',
        password: 'password',
        database: 'sightedit_dev',
        ssl: false,
      }
    },
    migrations: {
      directory: './migrations',
      lockTimeout: 300000,
      transactionMode: 'per-migration' as const,
    },
    backup: {
      enabled: true,
      directory: './backups',
      retention: 30,
    }
  },
  
  POSTGRESQL_PRODUCTION: {
    database: {
      type: 'postgresql' as const,
      connection: {
        host: 'localhost',
        port: 5432,
        username: 'sightedit',
        password: process.env.DB_PASSWORD || '',
        database: 'sightedit_prod',
        ssl: true,
      }
    },
    migrations: {
      directory: './migrations',
      lockTimeout: 600000, // 10 minutes for production
      transactionMode: 'all' as const,
    },
    backup: {
      enabled: true,
      directory: './backups',
      retention: 90, // 3 months for production
    }
  },
  
  MYSQL_LOCAL: {
    database: {
      type: 'mysql' as const,
      connection: {
        host: 'localhost',
        port: 3306,
        username: 'sightedit',
        password: 'password',
        database: 'sightedit_dev',
      }
    },
    migrations: {
      directory: './migrations',
      lockTimeout: 300000,
      transactionMode: 'per-migration' as const,
    },
    backup: {
      enabled: true,
      directory: './backups',
      retention: 30,
    }
  },
  
  SQLITE_LOCAL: {
    database: {
      type: 'sqlite' as const,
      connection: './database/sightedit.sqlite',
    },
    migrations: {
      directory: './migrations',
      lockTimeout: 60000,
      transactionMode: 'per-migration' as const,
    },
    backup: {
      enabled: true,
      directory: './backups',
      retention: 14,
    }
  },
  
  MONGODB_LOCAL: {
    database: {
      type: 'mongodb' as const,
      connection: 'mongodb://localhost:27017/sightedit_dev',
    },
    migrations: {
      directory: './migrations',
      lockTimeout: 300000,
      transactionMode: 'per-migration' as const,
    },
    backup: {
      enabled: true,
      directory: './backups',
      retention: 30,
    }
  }
};

// Utility functions
export const createMigrationEngine = (config: MigrationConfig) => {
  return new MigrationEngine(config);
};

export const createTestRunner = (config: TestConfig) => {
  return new MigrationTestRunner(config);
};

export const createSchemaValidator = async (databaseConfig: MigrationConfig['database']) => {
  const { DatabaseAdapter } = await import('./core/adapters/database-adapter');
  const connection = await DatabaseAdapter.create(databaseConfig);
  return new SchemaValidator(connection);
};

export const createBackupManager = (config: MigrationConfig) => {
  return new BackupManager(config);
};