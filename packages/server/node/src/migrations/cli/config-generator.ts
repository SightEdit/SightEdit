#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationConfig } from '../core/migration-engine';

const program = new Command();

interface ConfigTemplate {
  name: string;
  description: string;
  config: MigrationConfig;
}

const CONFIG_TEMPLATES: ConfigTemplate[] = [
  {
    name: 'postgresql-local',
    description: 'PostgreSQL local development setup',
    config: {
      database: {
        type: 'postgresql',
        connection: {
          host: 'localhost',
          port: 5432,
          username: 'sightedit',
          password: 'password',
          database: 'sightedit_dev',
          ssl: false,
        },
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
      },
      migrations: {
        directory: './migrations',
        pattern: /^\d{14}_.+\.(js|ts)$/,
        lockTimeout: 300000,
        transactionMode: 'per-migration',
      },
      backup: {
        enabled: true,
        directory: './backups',
        retention: 30,
      },
      logging: {
        level: 'info',
        file: './logs/migration.log',
      },
    },
  },
  {
    name: 'postgresql-production',
    description: 'PostgreSQL production setup with SSL',
    config: {
      database: {
        type: 'postgresql',
        connection: {
          host: 'prod-db.example.com',
          port: 5432,
          username: 'sightedit',
          password: '${DB_PASSWORD}',
          database: 'sightedit_prod',
          ssl: true,
        },
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
      },
      migrations: {
        directory: './migrations',
        lockTimeout: 600000, // 10 minutes for production
        transactionMode: 'all',
      },
      backup: {
        enabled: true,
        directory: '/var/backups/sightedit',
        retention: 90, // 3 months for production
      },
      logging: {
        level: 'warn',
        file: '/var/log/sightedit/migration.log',
      },
    },
  },
  {
    name: 'mysql-local',
    description: 'MySQL local development setup',
    config: {
      database: {
        type: 'mysql',
        connection: {
          host: 'localhost',
          port: 3306,
          username: 'sightedit',
          password: 'password',
          database: 'sightedit_dev',
          ssl: false,
        },
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
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
      },
      logging: {
        level: 'info',
      },
    },
  },
  {
    name: 'sqlite-local',
    description: 'SQLite local development setup',
    config: {
      database: {
        type: 'sqlite',
        connection: './database/sightedit.sqlite',
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
      },
      migrations: {
        directory: './migrations',
        lockTimeout: 60000, // Shorter timeout for SQLite
        transactionMode: 'per-migration',
      },
      backup: {
        enabled: true,
        directory: './backups',
        retention: 14,
      },
      logging: {
        level: 'info',
      },
    },
  },
  {
    name: 'mongodb-local',
    description: 'MongoDB local development setup',
    config: {
      database: {
        type: 'mongodb',
        connection: 'mongodb://localhost:27017/sightedit_dev',
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
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
      },
      logging: {
        level: 'info',
      },
    },
  },
  {
    name: 'mongodb-atlas',
    description: 'MongoDB Atlas cloud setup',
    config: {
      database: {
        type: 'mongodb',
        connection: 'mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@cluster0.xxxxx.mongodb.net/sightedit_prod?retryWrites=true&w=majority',
        migrationTable: 'sightedit_migrations',
        migrationLockTable: 'sightedit_migration_lock',
      },
      migrations: {
        directory: './migrations',
        lockTimeout: 600000,
        transactionMode: 'all',
      },
      backup: {
        enabled: true,
        directory: './backups',
        retention: 90,
      },
      logging: {
        level: 'warn',
        file: './logs/migration.log',
      },
    },
  },
];

class ConfigGenerator {
  async generateConfig(template: string, outputPath: string, overwrite = false): Promise<void> {
    const configTemplate = CONFIG_TEMPLATES.find(t => t.name === template);
    if (!configTemplate) {
      throw new Error(`Template '${template}' not found. Available templates: ${CONFIG_TEMPLATES.map(t => t.name).join(', ')}`);
    }

    const fullPath = path.resolve(outputPath);
    
    // Check if file exists
    if (!overwrite) {
      try {
        await fs.access(fullPath);
        throw new Error(`Config file already exists: ${fullPath}. Use --overwrite to replace it.`);
      } catch (error) {
        if ((error as any).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Generate config content
    const configContent = this.formatConfig(configTemplate);
    
    // Write config file
    await fs.writeFile(fullPath, configContent);
    
    console.log(`✅ Generated config file: ${fullPath}`);
    console.log(`📝 Template: ${configTemplate.name} - ${configTemplate.description}`);
    console.log(`\n📚 Next steps:`);
    console.log(`1. Review and customize the configuration`);
    console.log(`2. Set up your database connection`);
    console.log(`3. Run: npx sightedit-migrate -c ${path.basename(fullPath)} status`);
  }

  private formatConfig(template: ConfigTemplate): string {
    const header = `// SightEdit Migration Configuration
// Template: ${template.name} - ${template.description}
// Generated at: ${new Date().toISOString()}
//
// Environment Variables:
// You can use environment variables in your config by using \${VARIABLE_NAME} syntax
// These will be automatically replaced at runtime.
//
// Usage: npx sightedit-migrate -c ${template.name}.config.js <command>

`;

    const config = JSON.stringify(template.config, null, 2)
      .replace(/"/g, "'")
      .replace(/'(\$\{[^}]+\})'/g, 'process.env.$1 || \'$1\'')
      .replace(/'(\d+)'/g, '$1')
      .replace(/'(true|false)'/g, '$1')
      .replace(/'(per-migration|all)'/g, "'$1'")
      .replace(/'(debug|info|warn|error)'/g, "'$1'")
      .replace(/'(postgresql|mysql|sqlite|mongodb)'/g, "'$1'")
      .replace(/^  }/gm, '  },')
      .replace(/,(\s*})$/gm, '$1');

    return `${header}module.exports = ${config};
`;
  }

  async listTemplates(): Promise<void> {
    console.log('\n📋 Available Configuration Templates');
    console.log('='.repeat(60));
    
    CONFIG_TEMPLATES.forEach(template => {
      console.log(`\n🔧 ${template.name}`);
      console.log(`   ${template.description}`);
      console.log(`   Database: ${template.config.database.type.toUpperCase()}`);
      console.log(`   Transactions: ${template.config.migrations.transactionMode}`);
      console.log(`   Backup: ${template.config.backup?.enabled ? 'Enabled' : 'Disabled'}`);
    });

    console.log(`\n💡 Usage: npx sightedit-config generate <template-name> <output-file>`);
  }

  async initProject(projectPath: string, template = 'sqlite-local'): Promise<void> {
    const fullPath = path.resolve(projectPath);
    
    // Create project structure
    const directories = [
      'migrations',
      'backups',
      'logs',
      'database',
    ];

    for (const dir of directories) {
      await fs.mkdir(path.join(fullPath, dir), { recursive: true });
    }

    // Generate config file
    const configPath = path.join(fullPath, 'migration.config.js');
    await this.generateConfig(template, configPath, false);

    // Create package.json if it doesn't exist
    const packageJsonPath = path.join(fullPath, 'package.json');
    try {
      await fs.access(packageJsonPath);
    } catch {
      const packageJson = {
        name: 'sightedit-migrations',
        version: '1.0.0',
        description: 'SightEdit database migrations',
        scripts: {
          'migrate:up': 'sightedit-migrate -c migration.config.js up',
          'migrate:down': 'sightedit-migrate -c migration.config.js down',
          'migrate:status': 'sightedit-migrate -c migration.config.js status',
          'migrate:create': 'sightedit-migrate -c migration.config.js create',
          'migrate:backup': 'sightedit-migrate -c migration.config.js backup',
          'migrate:restore': 'sightedit-migrate -c migration.config.js restore',
        },
        devDependencies: {
          '@sightedit/server-node': '^1.0.0',
        },
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`📦 Created package.json with migration scripts`);
    }

    // Create initial migration
    const migrationTemplate = this.getInitialMigrationTemplate(template);
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const migrationPath = path.join(fullPath, 'migrations', `${timestamp}_initial_schema.ts`);
    await fs.writeFile(migrationPath, migrationTemplate);

    // Create .gitignore
    const gitignorePath = path.join(fullPath, '.gitignore');
    const gitignoreContent = `# SightEdit Migration Files
backups/
logs/
*.log
database/*.sqlite
database/*.db

# Environment variables
.env
.env.local
.env.production

# Node modules
node_modules/

# OS generated files
.DS_Store
Thumbs.db
`;

    await fs.writeFile(gitignorePath, gitignoreContent);

    // Create README
    const readmePath = path.join(fullPath, 'README.md');
    const readmeContent = this.getProjectReadme(template);
    await fs.writeFile(readmePath, readmeContent);

    console.log(`\n✅ Initialized SightEdit migration project at: ${fullPath}`);
    console.log(`📋 Created directories: ${directories.join(', ')}`);
    console.log(`⚙️ Generated configuration: migration.config.js`);
    console.log(`🔄 Created initial migration: ${timestamp}_initial_schema.ts`);
    console.log(`\n🚀 Next steps:`);
    console.log(`1. cd ${path.relative(process.cwd(), fullPath)}`);
    console.log(`2. npm install`);
    console.log(`3. Review migration.config.js and update database settings`);
    console.log(`4. Run: npm run migrate:up`);
  }

  private getInitialMigrationTemplate(template: string): string {
    const config = CONFIG_TEMPLATES.find(t => t.name === template)!;
    
    if (config.config.database.type === 'mongodb') {
      return `import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Create initial SightEdit schema for MongoDB';

export async function up(connection: DatabaseConnection): Promise<void> {
  // Create users collection
  await connection.query('db.createCollection("users")');
  await connection.query(\`
    db.users.createIndex({ "email": 1 }, { "unique": true })
  \`);
  await connection.query(\`
    db.users.createIndex({ "username": 1 }, { "unique": true })
  \`);

  // Create content collection
  await connection.query('db.createCollection("content")');
  await connection.query(\`
    db.content.createIndex({ "sight": 1, "context.path": 1 })
  \`);
  await connection.query(\`
    db.content.createIndex({ "updatedAt": -1 })
  \`);

  // Create permissions collection
  await connection.query('db.createCollection("permissions")');
  await connection.query(\`
    db.permissions.createIndex({ "userId": 1, "resource": 1 }, { "unique": true })
  \`);

  // Create audit_logs collection
  await connection.query('db.createCollection("audit_logs")');
  await connection.query(\`
    db.audit_logs.createIndex({ "userId": 1, "createdAt": -1 })
  \`);
  await connection.query(\`
    db.audit_logs.createIndex({ "action": 1, "createdAt": -1 })
  \`);
}

export async function down(connection: DatabaseConnection): Promise<void> {
  await connection.query('db.audit_logs.drop()');
  await connection.query('db.permissions.drop()');
  await connection.query('db.content.drop()');
  await connection.query('db.users.drop()');
}
`;
    } else {
      return `import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Create initial SightEdit schema';

export async function up(connection: DatabaseConnection): Promise<void> {
  // Create users table
  await connection.query(\`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`);

  // Create content table
  await connection.query(\`
    CREATE TABLE content (
      id SERIAL PRIMARY KEY,
      sight VARCHAR(255) NOT NULL,
      element_type VARCHAR(50) NOT NULL,
      content_data JSONB NOT NULL,
      context JSONB NOT NULL,
      version INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`);

  // Create permissions table
  await connection.query(\`
    CREATE TABLE permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      resource VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      granted BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, resource, action)
    )
  \`);

  // Create audit_logs table
  await connection.query(\`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id VARCHAR(255),
      old_values JSONB,
      new_values JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`);

  // Create indexes
  await connection.query(\`CREATE INDEX idx_content_sight_context ON content(sight, (context->>'path'))\`);
  await connection.query(\`CREATE INDEX idx_content_updated_at ON content(updated_at)\`);
  await connection.query(\`CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)\`);
  await connection.query(\`CREATE INDEX idx_audit_logs_action ON audit_logs(action)\`);
  await connection.query(\`CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)\`);
}

export async function down(connection: DatabaseConnection): Promise<void> {
  await connection.query('DROP TABLE IF EXISTS audit_logs');
  await connection.query('DROP TABLE IF EXISTS permissions');
  await connection.query('DROP TABLE IF EXISTS content');
  await connection.query('DROP TABLE IF EXISTS users');
}
`;
    }
  }

  private getProjectReadme(template: string): string {
    const config = CONFIG_TEMPLATES.find(t => t.name === template)!;
    
    return `# SightEdit Database Migrations

This project contains database migrations for SightEdit using the ${config.config.database.type.toUpperCase()} database.

## Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Configure your database connection in \`migration.config.js\`

3. Run initial migration:
   \`\`\`bash
   npm run migrate:up
   \`\`\`

## Available Scripts

- \`npm run migrate:up\` - Run pending migrations
- \`npm run migrate:down\` - Rollback last migration
- \`npm run migrate:status\` - Show migration status
- \`npm run migrate:create <name>\` - Create new migration
- \`npm run migrate:backup\` - Create database backup
- \`npm run migrate:restore <backup-file>\` - Restore from backup

## Directory Structure

- \`migrations/\` - Migration files
- \`backups/\` - Database backups
- \`logs/\` - Migration logs
- \`database/\` - Local database files (SQLite)

## Database Schema

The initial migration creates the following tables:

### users
- User accounts and authentication
- Stores username, email, password hash, role, and status

### content
- SightEdit content storage
- Stores element data, context, and versioning information

### permissions
- User permissions and access control
- Granular resource-based permissions

### audit_logs
- Audit trail for all database changes
- Tracks user actions, IP addresses, and data changes

## Environment Variables

You can use environment variables in your configuration:

- \`DB_HOST\` - Database host
- \`DB_PORT\` - Database port
- \`DB_USERNAME\` - Database username
- \`DB_PASSWORD\` - Database password
- \`DB_NAME\` - Database name

Example:
\`\`\`bash
export DB_PASSWORD=your_password
npm run migrate:up
\`\`\`

## Production Deployment

1. Set appropriate environment variables
2. Create backup before migration: \`npm run migrate:backup\`
3. Run migrations: \`npm run migrate:up\`
4. Verify deployment: \`npm run migrate:status\`

## Troubleshooting

- Check database connection settings
- Ensure database user has appropriate permissions
- Review migration logs in \`logs/\` directory
- Use \`--verbose\` flag for detailed output

For more information, see the SightEdit documentation.
`;
  }
}

// CLI Commands
program
  .name('sightedit-config')
  .description('SightEdit migration configuration generator')
  .version('1.0.0');

program
  .command('generate')
  .description('generate configuration file from template')
  .argument('<template>', 'template name')
  .argument('<output>', 'output file path')
  .option('-o, --overwrite', 'overwrite existing file')
  .action(async (template, output, options) => {
    const generator = new ConfigGenerator();
    try {
      await generator.generateConfig(template, output, options.overwrite);
    } catch (error) {
      console.error(`❌ ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('list available configuration templates')
  .action(async () => {
    const generator = new ConfigGenerator();
    await generator.listTemplates();
  });

program
  .command('init')
  .description('initialize new migration project')
  .argument('<path>', 'project directory')
  .option('-t, --template <template>', 'configuration template to use', 'sqlite-local')
  .action(async (projectPath, options) => {
    const generator = new ConfigGenerator();
    try {
      await generator.initProject(projectPath, options.template);
    } catch (error) {
      console.error(`❌ ${(error as Error).message}`);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}

export { ConfigGenerator };