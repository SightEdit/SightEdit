import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

/**
 * Global setup for integration tests
 * Starts Docker services, initializes databases, and sets up test environment
 */
export default async function globalSetup(): Promise<void> {
  console.log('🚀 Starting integration test global setup...');
  
  // Load test environment variables
  dotenv.config({ path: path.join(__dirname, '../../.env.test') });
  
  try {
    // Start Docker services for testing
    console.log('📦 Starting Docker test services...');
    await execAsync('docker-compose -f docker/docker-compose.test.yml up -d', {
      cwd: path.join(__dirname, '../..')
    });
    
    // Wait for services to be healthy
    console.log('⏳ Waiting for services to be healthy...');
    await waitForHealthyServices();
    
    // Initialize test databases
    console.log('🗄️  Initializing test databases...');
    await initializeTestDatabases();
    
    // Setup test data
    console.log('📊 Setting up test fixtures...');
    await setupTestFixtures();
    
    console.log('✅ Global setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

async function waitForHealthyServices(): Promise<void> {
  const services = ['postgres-test', 'mysql-test', 'mongodb-test', 'redis-test'];
  const maxAttempts = 30;
  const delay = 2000;
  
  for (const service of services) {
    console.log(`⏳ Waiting for ${service} to be healthy...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { stdout } = await execAsync(`docker-compose -f docker/docker-compose.test.yml ps --filter "health=healthy" ${service}`, {
          cwd: path.join(__dirname, '../..')
        });
        
        if (stdout.includes(service)) {
          console.log(`✅ ${service} is healthy`);
          break;
        }
        
        if (attempt === maxAttempts) {
          throw new Error(`${service} failed to become healthy after ${maxAttempts} attempts`);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Failed to check health status of ${service}: ${error}`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

async function initializeTestDatabases(): Promise<void> {
  // Initialize PostgreSQL
  try {
    await execAsync(`docker exec integration-tests-postgres-test-1 psql -U test_user -d sightedit_test -c "
      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        sight VARCHAR(255) NOT NULL,
        value TEXT,
        context JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        expires_at TIMESTAMP,
        data JSONB
      );
    "`);
    console.log('✅ PostgreSQL database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL:', error);
  }

  // Initialize MySQL
  try {
    await execAsync(`docker exec integration-tests-mysql-test-1 mysql -u test_user -ptest_password sightedit_test -e "
      CREATE TABLE IF NOT EXISTS content (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sight VARCHAR(255) NOT NULL,
        value TEXT,
        context JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INT,
        expires_at TIMESTAMP,
        data JSON,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    "`);
    console.log('✅ MySQL database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize MySQL:', error);
  }

  // Initialize MongoDB collections
  try {
    await execAsync(`docker exec integration-tests-mongodb-test-1 mongosh sightedit_test --eval "
      db.content.createIndex({ sight: 1 });
      db.users.createIndex({ email: 1 }, { unique: true });
      db.sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    "`);
    console.log('✅ MongoDB database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize MongoDB:', error);
  }
}

async function setupTestFixtures(): Promise<void> {
  // This will be called by individual test setup files
  console.log('📊 Test fixtures will be setup by individual test suites');
}