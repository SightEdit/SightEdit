import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Create initial SightEdit database schema with users, content, permissions, and audit logs';

export async function up(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await createMongoDBSchema(connection);
  } else {
    await createSQLSchema(connection);
  }
}

export async function down(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await dropMongoDBSchema(connection);
  } else {
    await dropSQLSchema(connection);
  }
}

async function createSQLSchema(connection: DatabaseConnection): Promise<void> {
  // Create users table
  await connection.query(`
    CREATE TABLE users (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT ${connection.type === 'sqlite' ? '1' : 'TRUE'},
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create content table
  let contentDataType = 'JSONB';
  if (connection.type === 'mysql') {
    contentDataType = 'JSON';
  } else if (connection.type === 'sqlite') {
    contentDataType = 'TEXT';
  }

  await connection.query(`
    CREATE TABLE content (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      sight VARCHAR(255) NOT NULL,
      element_type VARCHAR(50) NOT NULL,
      content_data ${contentDataType} NOT NULL,
      context ${contentDataType} NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create permissions table
  await connection.query(`
    CREATE TABLE permissions (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT ${connection.type === 'sqlite' ? '1' : 'TRUE'},
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, resource, action)
    )
  `);

  // Create audit_logs table
  let ipAddressType = 'INET';
  if (connection.type === 'mysql') {
    ipAddressType = 'VARCHAR(45)'; // IPv4/IPv6 compatible
  } else if (connection.type === 'sqlite') {
    ipAddressType = 'TEXT';
  }

  await connection.query(`
    CREATE TABLE audit_logs (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id VARCHAR(255),
      old_values ${contentDataType},
      new_values ${contentDataType},
      ip_address ${ipAddressType},
      user_agent TEXT,
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better performance
  await createSQLIndexes(connection);

  // Add constraints and checks
  await addSQLConstraints(connection);
}

async function createSQLIndexes(connection: DatabaseConnection): Promise<void> {
  const indexes = [
    // Users table indexes
    'CREATE INDEX idx_users_email ON users(email)',
    'CREATE INDEX idx_users_username ON users(username)',
    'CREATE INDEX idx_users_role ON users(role)',
    'CREATE INDEX idx_users_is_active ON users(is_active)',
    
    // Content table indexes
    'CREATE INDEX idx_content_sight ON content(sight)',
    'CREATE INDEX idx_content_element_type ON content(element_type)',
    'CREATE INDEX idx_content_user_id ON content(user_id)',
    'CREATE INDEX idx_content_updated_at ON content(updated_at)',
    'CREATE INDEX idx_content_created_at ON content(created_at)',
    
    // Permissions table indexes
    'CREATE INDEX idx_permissions_user_id ON permissions(user_id)',
    'CREATE INDEX idx_permissions_resource ON permissions(resource)',
    'CREATE INDEX idx_permissions_action ON permissions(action)',
    'CREATE INDEX idx_permissions_granted ON permissions(granted)',
    
    // Audit logs table indexes
    'CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)',
    'CREATE INDEX idx_audit_logs_action ON audit_logs(action)',
    'CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type)',
    'CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id)',
    'CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)',
  ];

  // Add composite indexes for common query patterns
  if (connection.type === 'postgresql') {
    indexes.push(
      "CREATE INDEX idx_content_sight_context ON content(sight, (context->>'path'))",
      'CREATE INDEX idx_content_context_gin ON content USING GIN(context)',
      'CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id)'
    );
  } else if (connection.type === 'mysql') {
    indexes.push(
      'CREATE INDEX idx_content_context_path ON content((CAST(context->"$.path" AS CHAR(255))))',
      'CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id)'
    );
  } else {
    // SQLite
    indexes.push(
      'CREATE INDEX idx_content_context_path ON content(json_extract(context, "$.path"))',
      'CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id)'
    );
  }

  for (const indexSQL of indexes) {
    try {
      await connection.query(indexSQL);
    } catch (error) {
      console.warn(`Failed to create index: ${indexSQL}`, error);
    }
  }
}

async function addSQLConstraints(connection: DatabaseConnection): Promise<void> {
  // Add check constraints where supported
  if (connection.type === 'postgresql' || connection.type === 'mysql') {
    try {
      await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT ck_users_role 
        CHECK (role IN ('admin', 'editor', 'user'))
      `);

      await connection.query(`
        ALTER TABLE permissions 
        ADD CONSTRAINT ck_permissions_action 
        CHECK (action IN ('read', 'write', 'delete', 'admin'))
      `);

      await connection.query(`
        ALTER TABLE content 
        ADD CONSTRAINT ck_content_version 
        CHECK (version > 0)
      `);
    } catch (error) {
      console.warn('Failed to add check constraints:', error);
    }
  }

  // Add triggers for updated_at timestamps where supported
  if (connection.type === 'postgresql') {
    await connection.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    const tables = ['users', 'content'];
    for (const table of tables) {
      await connection.query(`
        CREATE TRIGGER update_${table}_updated_at 
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
    }
  } else if (connection.type === 'mysql') {
    const tables = ['users', 'content'];
    for (const table of tables) {
      await connection.query(`
        CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;
      `);
    }
  }
}

async function createMongoDBSchema(connection: DatabaseConnection): Promise<void> {
  // Create collections
  await connection.query('db.createCollection("users")');
  await connection.query('db.createCollection("content")');
  await connection.query('db.createCollection("permissions")');
  await connection.query('db.createCollection("audit_logs")');

  // Create indexes for users collection
  await connection.query(`
    db.users.createIndex({ "email": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.users.createIndex({ "username": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.users.createIndex({ "role": 1 })
  `);
  await connection.query(`
    db.users.createIndex({ "isActive": 1 })
  `);
  await connection.query(`
    db.users.createIndex({ "createdAt": 1 })
  `);

  // Create indexes for content collection
  await connection.query(`
    db.content.createIndex({ "sight": 1 })
  `);
  await connection.query(`
    db.content.createIndex({ "elementType": 1 })
  `);
  await connection.query(`
    db.content.createIndex({ "sight": 1, "context.path": 1 })
  `);
  await connection.query(`
    db.content.createIndex({ "userId": 1 })
  `);
  await connection.query(`
    db.content.createIndex({ "updatedAt": -1 })
  `);
  await connection.query(`
    db.content.createIndex({ "createdAt": -1 })
  `);

  // Create indexes for permissions collection
  await connection.query(`
    db.permissions.createIndex({ "userId": 1, "resource": 1, "action": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.permissions.createIndex({ "userId": 1 })
  `);
  await connection.query(`
    db.permissions.createIndex({ "resource": 1 })
  `);
  await connection.query(`
    db.permissions.createIndex({ "action": 1 })
  `);

  // Create indexes for audit_logs collection
  await connection.query(`
    db.audit_logs.createIndex({ "userId": 1, "createdAt": -1 })
  `);
  await connection.query(`
    db.audit_logs.createIndex({ "action": 1, "createdAt": -1 })
  `);
  await connection.query(`
    db.audit_logs.createIndex({ "resourceType": 1, "resourceId": 1 })
  `);
  await connection.query(`
    db.audit_logs.createIndex({ "createdAt": -1 })
  `);

  // Insert default admin user
  await connection.query(`
    db.users.insertOne({
      username: "admin",
      email: "admin@sightedit.local",
      passwordHash: "$2a$10$...", // This should be replaced with actual hash
      role: "admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })
  `);
}

async function dropSQLSchema(connection: DatabaseConnection): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  const tables = ['audit_logs', 'permissions', 'content', 'users'];
  
  for (const table of tables) {
    await connection.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }

  // Drop triggers and functions for PostgreSQL
  if (connection.type === 'postgresql') {
    try {
      await connection.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
    } catch (error) {
      // Ignore if function doesn't exist
    }
  }
}

async function dropMongoDBSchema(connection: DatabaseConnection): Promise<void> {
  // Drop collections
  await connection.query('db.users.drop()');
  await connection.query('db.content.drop()');
  await connection.query('db.permissions.drop()');
  await connection.query('db.audit_logs.drop()');
}