# SightEdit Database Migration System

A comprehensive, production-ready database migration system for SightEdit that supports multiple database backends including PostgreSQL, MySQL, SQLite, and MongoDB.

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, SQLite, and MongoDB
- **Transaction Safety**: Atomic migrations with rollback support
- **Schema Validation**: Automatic schema integrity checks
- **Backup & Restore**: Automatic backups before migrations
- **CLI Tools**: Full-featured command-line interface
- **CI/CD Integration**: GitHub Actions workflows included
- **Docker Support**: Containerized migration runner
- **Testing Framework**: Comprehensive migration testing
- **Performance Monitoring**: Built-in performance metrics
- **Concurrent Safety**: Migration locking prevents conflicts

## Quick Start

### 1. Installation

```bash
npm install @sightedit/server-node
```

### 2. Initialize Project

```bash
# Create a new migration project
npx sightedit-config init ./my-migrations --template postgresql-local

# Or generate just a config file
npx sightedit-config generate postgresql-local migration.config.js
```

### 3. Configure Database

Edit `migration.config.js`:

```javascript
module.exports = {
  database: {
    type: 'postgresql',
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
    transactionMode: 'per-migration',
  },
  backup: {
    enabled: true,
    directory: './backups',
    retention: 30,
  }
};
```

### 4. Run Migrations

```bash
# Check status
npx sightedit-migrate -c migration.config.js status

# Run pending migrations
npx sightedit-migrate -c migration.config.js up

# Rollback last migration
npx sightedit-migrate -c migration.config.js down
```

## Command Reference

### Migration Commands

```bash
# Run all pending migrations
sightedit-migrate up

# Run migrations to specific target
sightedit-migrate up 20240101120000_add_users_table

# Rollback last N migrations
sightedit-migrate down --steps 2

# Show migration status
sightedit-migrate status

# Create new migration
sightedit-migrate create "add user sessions table"
```

### Backup Commands

```bash
# Create database backup
sightedit-migrate backup

# Restore from backup
sightedit-migrate restore ./backups/backup-20240101.sql.gz

# List available backups
sightedit-migrate list-backups
```

### Configuration Commands

```bash
# List available templates
sightedit-config list

# Generate config from template
sightedit-config generate postgresql-production config.js

# Initialize new project
sightedit-config init ./new-project --template mongodb-atlas
```

## Database Configuration

### PostgreSQL

```javascript
{
  database: {
    type: 'postgresql',
    connection: 'postgresql://user:pass@localhost:5432/dbname',
    // OR
    connection: {
      host: 'localhost',
      port: 5432,
      username: 'sightedit',
      password: 'password',
      database: 'sightedit',
      ssl: true
    }
  }
}
```

### MySQL

```javascript
{
  database: {
    type: 'mysql',
    connection: 'mysql://user:pass@localhost:3306/dbname',
    // OR
    connection: {
      host: 'localhost',
      port: 3306,
      username: 'sightedit',
      password: 'password',
      database: 'sightedit'
    }
  }
}
```

### SQLite

```javascript
{
  database: {
    type: 'sqlite',
    connection: './database/sightedit.sqlite'
  }
}
```

### MongoDB

```javascript
{
  database: {
    type: 'mongodb',
    connection: 'mongodb://localhost:27017/sightedit',
    // OR Atlas
    connection: 'mongodb+srv://user:pass@cluster.mongodb.net/sightedit'
  }
}
```

## Writing Migrations

### SQL Database Migration

```typescript
import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Add user sessions table';

export async function up(connection: DatabaseConnection): Promise<void> {
  await connection.query(`
    CREATE TABLE user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      session_token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE INDEX idx_user_sessions_token ON user_sessions(session_token)
  `);
}

export async function down(connection: DatabaseConnection): Promise<void> {
  await connection.query('DROP TABLE IF EXISTS user_sessions');
}
```

### MongoDB Migration

```typescript
import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Add user sessions collection';

export async function up(connection: DatabaseConnection): Promise<void> {
  // Create collection
  await connection.query('db.createCollection("user_sessions")');

  // Create indexes
  await connection.query(`
    db.user_sessions.createIndex({ "sessionToken": 1 }, { "unique": true })
  `);
  
  await connection.query(`
    db.user_sessions.createIndex({ "userId": 1 })
  `);
  
  await connection.query(`
    db.user_sessions.createIndex({ "expiresAt": 1 }, { "expireAfterSeconds": 0 })
  `);
}

export async function down(connection: DatabaseConnection): Promise<void> {
  await connection.query('db.user_sessions.drop()');
}
```

## Testing

### Run Migration Tests

```bash
# Run all tests
npm test

# Test specific database
npm run test:postgresql
npm run test:mysql
npm run test:mongodb
npm run test:sqlite

# Run performance tests
npm run test:performance
```

### Custom Test Configuration

```typescript
import { MigrationTestRunner } from './src/migrations/testing/migration-test-runner';

const testRunner = new MigrationTestRunner({
  testName: 'My Test Suite',
  database: {
    type: 'postgresql',
    connection: 'postgresql://test:test@localhost:5432/test_db'
  },
  migrations: {
    directory: './migrations',
    testDataDirectory: './test-data'
  },
  cleanup: true,
  validateSchema: true,
  createTestData: true,
  runPerformanceTests: true
});

const results = await testRunner.runAllTests();
```

## Docker Usage

### Build Migration Container

```bash
# Build the migration container
docker build -f src/migrations/ci/docker-migrate.dockerfile -t sightedit-migrate .

# Run migrations
docker run --rm \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e DATABASE_TYPE=postgresql \
  sightedit-migrate up

# Interactive shell
docker run -it --rm sightedit-migrate shell
```

### Docker Compose

```bash
# Start all services
docker-compose -f src/migrations/ci/docker-compose.yml up -d

# Run migrations on PostgreSQL
docker-compose -f src/migrations/ci/docker-compose.yml run migrate-postgresql up

# Run tests
docker-compose -f src/migrations/ci/docker-compose.yml run migration-tests
```

## CI/CD Integration

### GitHub Actions

The migration system includes a comprehensive GitHub Actions workflow:

- **Multi-database validation** on PostgreSQL, MySQL, SQLite, and MongoDB
- **Performance testing** with large datasets
- **Automatic staging deployment** on develop branch
- **Production deployment** with manual approval
- **Backup creation** before all migrations
- **Schema validation** after migrations
- **Slack notifications** for deployment status

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/db
DATABASE_TYPE=postgresql

# Optional
MIGRATION_TIMEOUT=600000
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=30
VERBOSE=true
DRY_RUN=false
```

## Schema Validation

The system includes comprehensive schema validation:

```bash
# Validate current schema
sightedit-migrate validate

# Generate migration from validation results
sightedit-migrate validate --generate-migration
```

### Custom Schema Validation

```typescript
import { SchemaValidator } from './core/schema-validator';

const validator = new SchemaValidator(connection);
const result = await validator.validateSchema();

if (!result.isValid) {
  console.error('Schema validation failed:', result.errors);
  
  // Generate fix migration
  const migration = await validator.generateMigration(result);
  console.log('Generated migration:', migration);
}
```

## Monitoring and Observability

### Built-in Metrics

- Migration execution time
- Memory usage during migrations
- Database connection health
- Lock acquisition time
- Backup creation time

### Integration with Monitoring Systems

The Docker Compose setup includes:
- **Grafana** for dashboards
- **Prometheus** for metrics collection
- **Loki** for log aggregation

### Health Checks

```bash
# Container health check
docker run --rm sightedit-migrate healthcheck

# Manual health check
curl http://localhost:8080/health
```

## Best Practices

### Migration Design

1. **Always add rollback logic** in the `down()` function
2. **Test migrations** on production-like data before deployment
3. **Use transactions** for atomic operations
4. **Create backups** before running migrations in production
5. **Validate schema** after migrations

### Performance Considerations

1. **Add indexes** for frequently queried columns
2. **Use batch operations** for large data migrations
3. **Avoid long-running transactions** in busy databases
4. **Consider maintenance windows** for large migrations

### Security

1. **Use environment variables** for sensitive configuration
2. **Restrict database permissions** to migration user
3. **Audit migration execution** with proper logging
4. **Use SSL/TLS** for database connections

## Troubleshooting

### Common Issues

1. **Migration lock timeout**
   ```bash
   # Check for stuck locks
   sightedit-migrate status --verbose
   
   # Force unlock (use with caution)
   sightedit-migrate unlock --force
   ```

2. **Schema validation failures**
   ```bash
   # Generate fix migration
   sightedit-migrate validate --generate-migration
   ```

3. **Backup restore failures**
   ```bash
   # List available backups
   sightedit-migrate list-backups
   
   # Restore with force flag
   sightedit-migrate restore backup.sql.gz --force
   ```

### Debug Mode

```bash
# Enable verbose logging
sightedit-migrate --verbose up

# Debug specific migration
sightedit-migrate --debug up 20240101120000_migration_name
```

### Support

For issues and questions:

- **GitHub Issues**: https://github.com/sightedit/sightedit/issues
- **Documentation**: https://docs.sightedit.com/migrations
- **Discord**: https://discord.gg/sightedit

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.