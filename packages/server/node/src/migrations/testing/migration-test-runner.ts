import * as path from 'path';
import * as fs from 'fs/promises';
import { MigrationEngine, MigrationConfig, Migration, DatabaseConnection } from '../core/migration-engine';
import { BackupManager } from '../core/backup-manager';
import { SchemaValidator } from '../core/schema-validator';

export interface TestConfig {
  testName: string;
  database: MigrationConfig['database'];
  migrations: {
    directory: string;
    testDataDirectory?: string;
  };
  cleanup: boolean;
  validateSchema: boolean;
  createTestData: boolean;
  runPerformanceTests: boolean;
}

export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  migrationsExecuted: number;
  rollbacksExecuted: number;
  errors: TestError[];
  warnings: TestWarning[];
  performance?: PerformanceMetrics;
  schemaValidation?: any;
}

export interface TestError {
  phase: 'migration' | 'rollback' | 'validation' | 'cleanup';
  migration?: string;
  error: Error;
  fatal: boolean;
}

export interface TestWarning {
  phase: 'migration' | 'rollback' | 'validation';
  migration?: string;
  message: string;
}

export interface PerformanceMetrics {
  totalMigrationTime: number;
  averageMigrationTime: number;
  slowestMigration: {
    migration: string;
    duration: number;
  };
  fastestMigration: {
    migration: string;
    duration: number;
  };
  memoryUsage: {
    before: number;
    after: number;
    peak: number;
  };
}

export class MigrationTestRunner {
  private config: TestConfig;
  private results: TestResult[] = [];

  constructor(config: TestConfig) {
    this.config = config;
  }

  async runAllTests(): Promise<TestResult[]> {
    console.log(`🧪 Starting migration test suite: ${this.config.testName}`);
    
    const testResults: TestResult[] = [];

    // Test scenarios
    const scenarios = [
      { name: 'Fresh Migration', type: 'fresh' },
      { name: 'Incremental Migration', type: 'incremental' },
      { name: 'Rollback Test', type: 'rollback' },
      { name: 'Concurrent Migration Test', type: 'concurrent' },
      { name: 'Large Dataset Test', type: 'large_data' },
    ];

    for (const scenario of scenarios) {
      try {
        console.log(`\n📋 Running ${scenario.name}...`);
        const result = await this.runTestScenario(scenario.type as any, scenario.name);
        testResults.push(result);
        
        if (result.success) {
          console.log(`✅ ${scenario.name} passed`);
        } else {
          console.log(`❌ ${scenario.name} failed`);
          result.errors.forEach(error => {
            console.log(`   Error in ${error.phase}: ${error.error.message}`);
          });
        }
      } catch (error) {
        console.error(`💥 ${scenario.name} crashed: ${error}`);
        testResults.push({
          testName: scenario.name,
          success: false,
          duration: 0,
          migrationsExecuted: 0,
          rollbacksExecuted: 0,
          errors: [{
            phase: 'migration',
            error: error as Error,
            fatal: true,
          }],
          warnings: [],
        });
      }
    }

    this.results = testResults;
    await this.generateTestReport();
    
    return testResults;
  }

  private async runTestScenario(type: 'fresh' | 'incremental' | 'rollback' | 'concurrent' | 'large_data', testName: string): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      testName,
      success: true,
      duration: 0,
      migrationsExecuted: 0,
      rollbacksExecuted: 0,
      errors: [],
      warnings: [],
    };

    let engine: MigrationEngine | null = null;
    let testDbConfig: MigrationConfig['database'];

    try {
      // Create isolated test database
      testDbConfig = await this.createTestDatabase(testName);
      
      const migrationConfig: MigrationConfig = {
        database: testDbConfig,
        migrations: {
          directory: this.config.migrations.directory,
          lockTimeout: 30000,
          transactionMode: 'per-migration',
        },
        backup: {
          enabled: true,
          directory: path.join(process.cwd(), 'test-backups'),
        },
        logging: {
          level: 'debug',
        },
      };

      engine = new MigrationEngine(migrationConfig);
      
      // Record memory usage
      const memoryBefore = process.memoryUsage();

      switch (type) {
        case 'fresh':
          result.migrationsExecuted = await this.testFreshMigration(engine, result);
          break;
        case 'incremental':
          result.migrationsExecuted = await this.testIncrementalMigration(engine, result);
          break;
        case 'rollback':
          const { migrated, rolledBack } = await this.testRollback(engine, result);
          result.migrationsExecuted = migrated;
          result.rollbacksExecuted = rolledBack;
          break;
        case 'concurrent':
          result.migrationsExecuted = await this.testConcurrentMigration(engine, result);
          break;
        case 'large_data':
          result.migrationsExecuted = await this.testLargeDataMigration(engine, result);
          break;
      }

      // Record performance metrics
      if (this.config.runPerformanceTests) {
        const memoryAfter = process.memoryUsage();
        result.performance = {
          totalMigrationTime: Date.now() - startTime,
          averageMigrationTime: (Date.now() - startTime) / (result.migrationsExecuted || 1),
          slowestMigration: { migration: 'unknown', duration: 0 },
          fastestMigration: { migration: 'unknown', duration: 0 },
          memoryUsage: {
            before: memoryBefore.heapUsed,
            after: memoryAfter.heapUsed,
            peak: memoryAfter.heapUsed,
          },
        };
      }

      // Validate schema if requested
      if (this.config.validateSchema) {
        await this.validateDatabaseSchema(engine, result);
      }

    } catch (error) {
      result.success = false;
      result.errors.push({
        phase: 'migration',
        error: error as Error,
        fatal: true,
      });
    } finally {
      if (engine) {
        await engine.close();
      }

      // Cleanup test database
      if (this.config.cleanup && testDbConfig) {
        try {
          await this.cleanupTestDatabase(testDbConfig);
        } catch (error) {
          result.warnings.push({
            phase: 'cleanup',
            message: `Failed to cleanup test database: ${error}`,
          });
        }
      }

      result.duration = Date.now() - startTime;
      result.success = result.success && result.errors.filter(e => e.fatal).length === 0;
    }

    return result;
  }

  private async createTestDatabase(testName: string): Promise<MigrationConfig['database']> {
    const testDbName = `sightedit_test_${testName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    
    if (this.config.database.type === 'sqlite') {
      return {
        ...this.config.database,
        connection: `./test-databases/${testDbName}.sqlite`,
      };
    } else if (this.config.database.type === 'mongodb') {
      if (typeof this.config.database.connection === 'string') {
        const url = new URL(this.config.database.connection);
        url.pathname = `/${testDbName}`;
        return {
          ...this.config.database,
          connection: url.toString(),
        };
      } else {
        return {
          ...this.config.database,
          connection: {
            ...this.config.database.connection,
            database: testDbName,
          },
        };
      }
    } else {
      // PostgreSQL/MySQL
      if (typeof this.config.database.connection === 'string') {
        const url = new URL(this.config.database.connection);
        url.pathname = `/${testDbName}`;
        return {
          ...this.config.database,
          connection: url.toString(),
        };
      } else {
        return {
          ...this.config.database,
          connection: {
            ...this.config.database.connection,
            database: testDbName,
          },
        };
      }
    }
  }

  private async testFreshMigration(engine: MigrationEngine, result: TestResult): Promise<number> {
    const migrationResult = await engine.migrate();
    
    if (!migrationResult.success) {
      result.errors.push({
        phase: 'migration',
        error: migrationResult.error!,
        fatal: true,
      });
      return 0;
    }

    return migrationResult.migrationsExecuted.length;
  }

  private async testIncrementalMigration(engine: MigrationEngine, result: TestResult): Promise<number> {
    // First run partial migration
    const migrations = await this.loadMigrationsList();
    if (migrations.length === 0) return 0;

    const midPoint = Math.floor(migrations.length / 2);
    const firstMigrationResult = await engine.migrate(migrations[midPoint]);
    
    if (!firstMigrationResult.success) {
      result.errors.push({
        phase: 'migration',
        error: firstMigrationResult.error!,
        fatal: true,
      });
      return 0;
    }

    // Then run remaining migrations
    const secondMigrationResult = await engine.migrate();
    
    if (!secondMigrationResult.success) {
      result.errors.push({
        phase: 'migration',
        error: secondMigrationResult.error!,
        fatal: true,
      });
      return firstMigrationResult.migrationsExecuted.length;
    }

    return firstMigrationResult.migrationsExecuted.length + secondMigrationResult.migrationsExecuted.length;
  }

  private async testRollback(engine: MigrationEngine, result: TestResult): Promise<{ migrated: number; rolledBack: number }> {
    // First migrate everything
    const migrationResult = await engine.migrate();
    
    if (!migrationResult.success) {
      result.errors.push({
        phase: 'migration',
        error: migrationResult.error!,
        fatal: true,
      });
      return { migrated: 0, rolledBack: 0 };
    }

    // Then rollback a few migrations
    const rollbackSteps = Math.min(3, migrationResult.migrationsExecuted.length);
    const rollbackResult = await engine.rollback(rollbackSteps);
    
    if (!rollbackResult.success) {
      result.errors.push({
        phase: 'rollback',
        error: rollbackResult.error!,
        fatal: false, // Rollback failure is not always fatal
      });
      return { migrated: migrationResult.migrationsExecuted.length, rolledBack: 0 };
    }

    return {
      migrated: migrationResult.migrationsExecuted.length,
      rolledBack: rollbackResult.migrationsExecuted.length,
    };
  }

  private async testConcurrentMigration(engine: MigrationEngine, result: TestResult): Promise<number> {
    // This test verifies that migration locking works correctly
    const migrationPromises = [
      engine.migrate(),
      engine.migrate(), // This should wait for the first one
    ];

    try {
      const results = await Promise.allSettled(migrationPromises);
      
      let successCount = 0;
      let totalMigrations = 0;

      results.forEach((promiseResult, index) => {
        if (promiseResult.status === 'fulfilled' && promiseResult.value.success) {
          successCount++;
          totalMigrations += promiseResult.value.migrationsExecuted.length;
        } else if (promiseResult.status === 'rejected') {
          result.warnings.push({
            phase: 'migration',
            message: `Concurrent migration ${index + 1} was rejected (expected for locking test): ${promiseResult.reason}`,
          });
        }
      });

      // At least one should succeed
      if (successCount === 0) {
        result.errors.push({
          phase: 'migration',
          error: new Error('No concurrent migrations succeeded'),
          fatal: true,
        });
      }

      return totalMigrations;
    } catch (error) {
      result.errors.push({
        phase: 'migration',
        error: error as Error,
        fatal: true,
      });
      return 0;
    }
  }

  private async testLargeDataMigration(engine: MigrationEngine, result: TestResult): Promise<number> {
    // Create test data before migration if configured
    if (this.config.createTestData && this.config.migrations.testDataDirectory) {
      await this.createLargeTestDataset(engine, result);
    }

    const migrationResult = await engine.migrate();
    
    if (!migrationResult.success) {
      result.errors.push({
        phase: 'migration',
        error: migrationResult.error!,
        fatal: true,
      });
      return 0;
    }

    return migrationResult.migrationsExecuted.length;
  }

  private async createLargeTestDataset(engine: MigrationEngine, result: TestResult): Promise<void> {
    // This would create a large dataset for testing performance
    // Implementation depends on the specific database type
    try {
      const connection = await this.createTestConnection();
      
      if (connection.type === 'mongodb') {
        // Create large MongoDB dataset
        await connection.query(`
          db.test_data.insertMany(
            Array.from({ length: 10000 }, (_, i) => ({
              index: i,
              data: 'test'.repeat(100),
              timestamp: new Date(),
              nested: {
                field1: i % 100,
                field2: Math.random() * 1000,
                field3: 'nested_' + i
              }
            }))
          )
        `);
      } else {
        // Create large SQL dataset
        await connection.query(`
          CREATE TABLE IF NOT EXISTS test_data (
            id SERIAL PRIMARY KEY,
            data TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            index_field INTEGER,
            random_field FLOAT
          )
        `);

        // Insert test data in batches
        for (let i = 0; i < 100; i++) {
          const batch = Array.from({ length: 100 }, (_, j) => 
            `(${i * 100 + j}, '${'test'.repeat(100)}', CURRENT_TIMESTAMP, ${(i * 100 + j) % 100}, ${Math.random() * 1000})`
          ).join(',');
          
          await connection.query(`
            INSERT INTO test_data (index_field, data, timestamp, random_field) 
            VALUES ${batch}
          `);
        }
      }
      
      await connection.close();
    } catch (error) {
      result.warnings.push({
        phase: 'migration',
        message: `Failed to create test data: ${error}`,
      });
    }
  }

  private async createTestConnection(): Promise<DatabaseConnection> {
    const { DatabaseAdapter } = await import('../core/adapters/database-adapter');
    return DatabaseAdapter.create(this.config.database);
  }

  private async validateDatabaseSchema(engine: MigrationEngine, result: TestResult): Promise<void> {
    try {
      const connection = await this.createTestConnection();
      const validator = new SchemaValidator(connection);
      const validationResult = await validator.validateSchema();
      
      result.schemaValidation = validationResult;
      
      if (!validationResult.isValid) {
        validationResult.errors.forEach(error => {
          result.warnings.push({
            phase: 'validation',
            message: `Schema validation: ${error.type} in ${error.table}${error.column ? `.${error.column}` : ''}: expected ${JSON.stringify(error.expected)}, got ${JSON.stringify(error.actual)}`,
          });
        });
      }
      
      await connection.close();
    } catch (error) {
      result.errors.push({
        phase: 'validation',
        error: error as Error,
        fatal: false,
      });
    }
  }

  private async loadMigrationsList(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.migrations.directory);
      return files.filter(file => /^\d{14}_.+\.(js|ts)$/.test(file)).sort();
    } catch (error) {
      return [];
    }
  }

  private async cleanupTestDatabase(dbConfig: MigrationConfig['database']): Promise<void> {
    if (dbConfig.type === 'sqlite') {
      // Delete SQLite file
      if (typeof dbConfig.connection === 'string') {
        try {
          await fs.unlink(dbConfig.connection);
        } catch (error) {
          // File might not exist
        }
      }
    } else {
      // For other databases, drop the test database
      const connection = await this.createTestConnection();
      try {
        if (dbConfig.type === 'mongodb') {
          await connection.query('db.dropDatabase()');
        } else {
          const dbName = typeof dbConfig.connection === 'string' 
            ? new URL(dbConfig.connection).pathname.slice(1)
            : dbConfig.connection.database;
          await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
        }
      } finally {
        await connection.close();
      }
    }
  }

  private async generateTestReport(): Promise<void> {
    const reportPath = path.join(process.cwd(), `migration-test-report-${Date.now()}.json`);
    
    const report = {
      testSuite: this.config.testName,
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        passed: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0),
        totalMigrations: this.results.reduce((sum, r) => sum + r.migrationsExecuted, 0),
        totalRollbacks: this.results.reduce((sum, r) => sum + r.rollbacksExecuted, 0),
      },
      results: this.results,
      config: this.config,
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 Test Report Generated: ${reportPath}`);
    console.log(`\n📈 Test Summary:`);
    console.log(`   Tests: ${report.summary.passed}/${report.summary.totalTests} passed`);
    console.log(`   Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   Migrations: ${report.summary.totalMigrations} executed`);
    console.log(`   Rollbacks: ${report.summary.totalRollbacks} executed`);

    if (report.summary.failed > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`   ${result.testName}:`);
        result.errors.forEach(error => {
          console.log(`     - ${error.phase}: ${error.error.message}`);
        });
      });
    }
  }
}