#!/usr/bin/env node

import { Command } from 'commander';
import { MigrationTestRunner, TestConfig } from './migration-test-runner';

const program = new Command();

program
  .name('sightedit-test-migrations')
  .description('Run SightEdit migration tests')
  .version('1.0.0');

program
  .option('--database-type <type>', 'database type (postgresql|mysql|sqlite|mongodb)')
  .option('--connection <string>', 'database connection string')
  .option('--migrations-dir <dir>', 'migrations directory')
  .option('--test-data-dir <dir>', 'test data directory')
  .option('--output-file <file>', 'output file for test results')
  .option('--no-cleanup', 'skip cleanup after tests')
  .option('--no-validate', 'skip schema validation')
  .option('--no-test-data', 'skip test data creation')
  .option('--performance', 'run performance tests')
  .option('--suite-name <name>', 'test suite name', 'Migration Tests')
  .action(async (options) => {
    if (!options.databaseType || !options.connection || !options.migrationsDir) {
      console.error('Required options: --database-type, --connection, --migrations-dir');
      process.exit(1);
    }

    const testConfig: TestConfig = {
      testName: options.suiteName,
      database: {
        type: options.databaseType as any,
        connection: options.connection,
      },
      migrations: {
        directory: options.migrationsDir,
        testDataDirectory: options.testDataDir,
      },
      cleanup: options.cleanup !== false,
      validateSchema: options.validate !== false,
      createTestData: options.testData !== false,
      runPerformanceTests: options.performance || false,
    };

    try {
      const testRunner = new MigrationTestRunner(testConfig);
      const results = await testRunner.runAllTests();

      // Output results
      if (options.outputFile) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.outputFile, JSON.stringify(results, null, 2));
        console.log(`Test results written to: ${options.outputFile}`);
      }

      // Exit with proper code
      const hasFailures = results.some(r => !r.success);
      process.exit(hasFailures ? 1 : 0);
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}