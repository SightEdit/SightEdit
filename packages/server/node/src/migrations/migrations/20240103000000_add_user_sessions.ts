import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Add user sessions and authentication tokens management';

export async function up(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await addMongoDBSessions(connection);
  } else {
    await addSQLSessions(connection);
  }
}

export async function down(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await removeMongoDBSessions(connection);
  } else {
    await removeSQLSessions(connection);
  }
}

async function addSQLSessions(connection: DatabaseConnection): Promise<void> {
  let ipAddressType = 'INET';
  if (connection.type === 'mysql') {
    ipAddressType = 'VARCHAR(45)';
  } else if (connection.type === 'sqlite') {
    ipAddressType = 'TEXT';
  }

  // Create user_sessions table
  await connection.query(`
    CREATE TABLE user_sessions (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token VARCHAR(255) NOT NULL UNIQUE,
      refresh_token VARCHAR(255),
      device_info ${connection.type === 'sqlite' ? 'TEXT' : 'JSONB'},
      ip_address ${ipAddressType},
      user_agent TEXT,
      is_active BOOLEAN NOT NULL DEFAULT ${connection.type === 'sqlite' ? '1' : 'TRUE'},
      last_activity_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP,
      expires_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} NOT NULL,
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create user_tokens table for API tokens and password reset tokens
  await connection.query(`
    CREATE TABLE user_tokens (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_type VARCHAR(50) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      token_name VARCHAR(255),
      scopes ${connection.type === 'sqlite' ? 'TEXT' : 'JSONB'},
      metadata ${connection.type === 'sqlite' ? 'TEXT' : 'JSONB'},
      is_active BOOLEAN NOT NULL DEFAULT ${connection.type === 'sqlite' ? '1' : 'TRUE'},
      last_used_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'},
      expires_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'},
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns to users table for authentication enhancements
  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN email_verified BOOLEAN DEFAULT ${connection.type === 'sqlite' ? '0' : 'FALSE'}
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN email_verified_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'}
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN password_changed_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'}
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN failed_login_attempts INTEGER DEFAULT 0
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN locked_until ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'}
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN last_login_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'}
  `);

  await connection.query(`
    ALTER TABLE users 
    ADD COLUMN last_login_ip ${ipAddressType}
  `);

  // Create indexes for user_sessions
  await connection.query('CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id)');
  await connection.query('CREATE INDEX idx_user_sessions_token ON user_sessions(session_token)');
  await connection.query('CREATE INDEX idx_user_sessions_active ON user_sessions(is_active)');
  await connection.query('CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at)');
  await connection.query('CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity_at)');

  // Create indexes for user_tokens
  await connection.query('CREATE INDEX idx_user_tokens_user_id ON user_tokens(user_id)');
  await connection.query('CREATE INDEX idx_user_tokens_type ON user_tokens(token_type)');
  await connection.query('CREATE INDEX idx_user_tokens_hash ON user_tokens(token_hash)');
  await connection.query('CREATE INDEX idx_user_tokens_active ON user_tokens(is_active)');
  await connection.query('CREATE INDEX idx_user_tokens_expires_at ON user_tokens(expires_at)');

  // Create indexes for new user columns
  await connection.query('CREATE INDEX idx_users_email_verified ON users(email_verified)');
  await connection.query('CREATE INDEX idx_users_last_login ON users(last_login_at)');
  await connection.query('CREATE INDEX idx_users_locked_until ON users(locked_until)');

  // Add composite index for common session queries
  await connection.query('CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, is_active)');

  // Add check constraints
  if (connection.type === 'postgresql' || connection.type === 'mysql') {
    try {
      await connection.query(`
        ALTER TABLE user_tokens 
        ADD CONSTRAINT ck_user_tokens_type 
        CHECK (token_type IN ('api_token', 'password_reset', 'email_verification', 'two_factor'))
      `);

      await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT ck_users_failed_attempts 
        CHECK (failed_login_attempts >= 0 AND failed_login_attempts <= 10)
      `);
    } catch (error) {
      console.warn('Failed to add check constraints:', error);
    }
  }

  // Create cleanup function for expired sessions (PostgreSQL)
  if (connection.type === 'postgresql') {
    await connection.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM user_sessions 
        WHERE expires_at < CURRENT_TIMESTAMP OR 
              (last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days');
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        DELETE FROM user_tokens 
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
        
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  // Create function to update last activity
  if (connection.type === 'postgresql') {
    await connection.query(`
      CREATE OR REPLACE FUNCTION update_session_activity(session_token_param VARCHAR(255))
      RETURNS VOID AS $$
      BEGIN
        UPDATE user_sessions 
        SET last_activity_at = CURRENT_TIMESTAMP 
        WHERE session_token = session_token_param AND is_active = TRUE;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}

async function addMongoDBSessions(connection: DatabaseConnection): Promise<void> {
  // Create user_sessions collection
  await connection.query('db.createCollection("user_sessions")');

  // Create user_tokens collection
  await connection.query('db.createCollection("user_tokens")');

  // Create indexes for user_sessions
  await connection.query(`
    db.user_sessions.createIndex({ "sessionToken": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.user_sessions.createIndex({ "userId": 1 })
  `);
  await connection.query(`
    db.user_sessions.createIndex({ "isActive": 1 })
  `);
  await connection.query(`
    db.user_sessions.createIndex({ "expiresAt": 1 })
  `);
  await connection.query(`
    db.user_sessions.createIndex({ "lastActivityAt": -1 })
  `);
  await connection.query(`
    db.user_sessions.createIndex({ "userId": 1, "isActive": 1 })
  `);

  // Create indexes for user_tokens
  await connection.query(`
    db.user_tokens.createIndex({ "tokenHash": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.user_tokens.createIndex({ "userId": 1 })
  `);
  await connection.query(`
    db.user_tokens.createIndex({ "tokenType": 1 })
  `);
  await connection.query(`
    db.user_tokens.createIndex({ "isActive": 1 })
  `);
  await connection.query(`
    db.user_tokens.createIndex({ "expiresAt": 1 })
  `);

  // Update existing user documents to add new fields
  await connection.query(`
    db.users.updateMany(
      { emailVerified: { $exists: false } },
      { 
        $set: { 
          emailVerified: false,
          emailVerifiedAt: null,
          passwordChangedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          lastLoginIp: null
        }
      }
    )
  `);

  // Create indexes for new user fields
  await connection.query(`
    db.users.createIndex({ "emailVerified": 1 })
  `);
  await connection.query(`
    db.users.createIndex({ "lastLoginAt": -1 })
  `);
  await connection.query(`
    db.users.createIndex({ "lockedUntil": 1 })
  `);

  // Create TTL index for automatic cleanup of expired sessions
  await connection.query(`
    db.user_sessions.createIndex({ "expiresAt": 1 }, { "expireAfterSeconds": 0 })
  `);

  // Create TTL index for expired tokens
  await connection.query(`
    db.user_tokens.createIndex({ "expiresAt": 1 }, { "expireAfterSeconds": 0 })
  `);
}

async function removeSQLSessions(connection: DatabaseConnection): Promise<void> {
  // Drop functions (PostgreSQL)
  if (connection.type === 'postgresql') {
    try {
      await connection.query('DROP FUNCTION IF EXISTS cleanup_expired_sessions()');
      await connection.query('DROP FUNCTION IF EXISTS update_session_activity(VARCHAR)');
    } catch (error) {
      console.warn('Failed to drop PostgreSQL functions:', error);
    }
  }

  // Drop tables
  await connection.query('DROP TABLE IF EXISTS user_tokens');
  await connection.query('DROP TABLE IF EXISTS user_sessions');

  // Remove columns from users table
  const columnsToRemove = [
    'email_verified',
    'email_verified_at',
    'password_changed_at',
    'failed_login_attempts',
    'locked_until',
    'last_login_at',
    'last_login_ip',
  ];

  for (const column of columnsToRemove) {
    try {
      await connection.query(`ALTER TABLE users DROP COLUMN ${column}`);
    } catch (error) {
      console.warn(`Failed to drop column ${column}:`, error);
    }
  }
}

async function removeMongoDBSessions(connection: DatabaseConnection): Promise<void> {
  // Drop collections
  await connection.query('db.user_sessions.drop()');
  await connection.query('db.user_tokens.drop()');

  // Remove fields from user documents
  await connection.query(`
    db.users.updateMany(
      {},
      { 
        $unset: { 
          emailVerified: "",
          emailVerifiedAt: "",
          passwordChangedAt: "",
          failedLoginAttempts: "",
          lockedUntil: "",
          lastLoginAt: "",
          lastLoginIp: ""
        }
      }
    )
  `);
}