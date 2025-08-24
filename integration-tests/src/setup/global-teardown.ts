import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

/**
 * Global teardown for integration tests
 * Cleans up Docker services and test data
 */
export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Starting integration test global teardown...');
  
  try {
    // Clean up test data
    console.log('🗄️  Cleaning up test databases...');
    await cleanupTestDatabases();
    
    // Stop Docker services
    console.log('🛑 Stopping Docker test services...');
    await execAsync('docker-compose -f docker/docker-compose.test.yml down -v', {
      cwd: path.join(__dirname, '../..')
    });
    
    // Remove any dangling test containers
    try {
      await execAsync('docker system prune -f --filter "label=com.docker.compose.project=integration-tests"');
    } catch (error) {
      // Ignore errors from cleanup
      console.warn('⚠️  Warning during container cleanup:', error);
    }
    
    console.log('✅ Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw to prevent masking test failures
  }
}

async function cleanupTestDatabases(): Promise<void> {
  const cleanupCommands = [
    // PostgreSQL cleanup
    {
      name: 'PostgreSQL',
      command: `docker exec integration-tests-postgres-test-1 psql -U test_user -d sightedit_test -c "
        TRUNCATE TABLE sessions, content, users RESTART IDENTITY CASCADE;
      " 2>/dev/null || true`
    },
    
    // MySQL cleanup
    {
      name: 'MySQL',
      command: `docker exec integration-tests-mysql-test-1 mysql -u test_user -ptest_password sightedit_test -e "
        SET FOREIGN_KEY_CHECKS = 0;
        TRUNCATE TABLE sessions;
        TRUNCATE TABLE content;
        TRUNCATE TABLE users;
        SET FOREIGN_KEY_CHECKS = 1;
      " 2>/dev/null || true`
    },
    
    // MongoDB cleanup
    {
      name: 'MongoDB',
      command: `docker exec integration-tests-mongodb-test-1 mongosh sightedit_test --eval "
        db.content.deleteMany({});
        db.users.deleteMany({});
        db.sessions.deleteMany({});
      " 2>/dev/null || true`
    },
    
    // Redis cleanup
    {
      name: 'Redis',
      command: `docker exec integration-tests-redis-test-1 redis-cli FLUSHDB 2>/dev/null || true`
    }
  ];

  for (const { name, command } of cleanupCommands) {
    try {
      await execAsync(command);
      console.log(`✅ ${name} cleanup completed`);
    } catch (error) {
      console.warn(`⚠️  Warning during ${name} cleanup:`, error);
    }
  }
}