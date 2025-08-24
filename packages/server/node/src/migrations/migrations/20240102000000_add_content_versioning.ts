import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Add content versioning and revision history support';

export async function up(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await addMongoDBVersioning(connection);
  } else {
    await addSQLVersioning(connection);
  }
}

export async function down(connection: DatabaseConnection): Promise<void> {
  if (connection.type === 'mongodb') {
    await removeMongoDBVersioning(connection);
  } else {
    await removeSQLVersioning(connection);
  }
}

async function addSQLVersioning(connection: DatabaseConnection): Promise<void> {
  // Create content_revisions table for version history
  let contentDataType = 'JSONB';
  if (connection.type === 'mysql') {
    contentDataType = 'JSON';
  } else if (connection.type === 'sqlite') {
    contentDataType = 'TEXT';
  }

  await connection.query(`
    CREATE TABLE content_revisions (
      id ${connection.type === 'sqlite' ? 'INTEGER' : 'SERIAL'} PRIMARY KEY,
      content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content_data ${contentDataType} NOT NULL,
      context ${contentDataType} NOT NULL,
      change_summary VARCHAR(500),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(content_id, version)
    )
  `);

  // Add columns to existing content table
  await connection.query(`
    ALTER TABLE content 
    ADD COLUMN is_published BOOLEAN DEFAULT ${connection.type === 'sqlite' ? '0' : 'FALSE'}
  `);

  await connection.query(`
    ALTER TABLE content 
    ADD COLUMN published_version INTEGER DEFAULT NULL
  `);

  await connection.query(`
    ALTER TABLE content 
    ADD COLUMN published_at ${connection.type === 'mysql' ? 'TIMESTAMP' : 'TIMESTAMP'} DEFAULT NULL
  `);

  await connection.query(`
    ALTER TABLE content 
    ADD COLUMN published_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);

  // Create indexes for content_revisions
  await connection.query('CREATE INDEX idx_content_revisions_content_id ON content_revisions(content_id)');
  await connection.query('CREATE INDEX idx_content_revisions_version ON content_revisions(content_id, version)');
  await connection.query('CREATE INDEX idx_content_revisions_user_id ON content_revisions(user_id)');
  await connection.query('CREATE INDEX idx_content_revisions_created_at ON content_revisions(created_at)');

  // Create indexes for new content columns
  await connection.query('CREATE INDEX idx_content_is_published ON content(is_published)');
  await connection.query('CREATE INDEX idx_content_published_at ON content(published_at)');
  await connection.query('CREATE INDEX idx_content_published_by ON content(published_by)');

  // Create trigger to automatically create revisions
  if (connection.type === 'postgresql') {
    await connection.query(`
      CREATE OR REPLACE FUNCTION create_content_revision()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Insert a new revision when content is updated
        INSERT INTO content_revisions (content_id, version, content_data, context, user_id, created_at)
        VALUES (OLD.id, OLD.version, OLD.content_data, OLD.context, OLD.user_id, OLD.updated_at);
        
        -- Increment version number
        NEW.version = OLD.version + 1;
        NEW.updated_at = CURRENT_TIMESTAMP;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await connection.query(`
      CREATE TRIGGER content_versioning_trigger
      BEFORE UPDATE ON content
      FOR EACH ROW
      WHEN (OLD.content_data IS DISTINCT FROM NEW.content_data OR OLD.context IS DISTINCT FROM NEW.context)
      EXECUTE FUNCTION create_content_revision();
    `);
  } else if (connection.type === 'mysql') {
    await connection.query(`
      CREATE TRIGGER content_versioning_trigger
      BEFORE UPDATE ON content
      FOR EACH ROW
      BEGIN
        IF OLD.content_data != NEW.content_data OR OLD.context != NEW.context THEN
          INSERT INTO content_revisions (content_id, version, content_data, context, user_id, created_at)
          VALUES (OLD.id, OLD.version, OLD.content_data, OLD.context, OLD.user_id, OLD.updated_at);
          
          SET NEW.version = OLD.version + 1;
          SET NEW.updated_at = CURRENT_TIMESTAMP;
        END IF;
      END;
    `);
  }

  // Add check constraint for published_version
  if (connection.type === 'postgresql' || connection.type === 'mysql') {
    try {
      await connection.query(`
        ALTER TABLE content 
        ADD CONSTRAINT ck_content_published_version 
        CHECK (published_version IS NULL OR published_version <= version)
      `);
    } catch (error) {
      console.warn('Failed to add published_version check constraint:', error);
    }
  }
}

async function addMongoDBVersioning(connection: DatabaseConnection): Promise<void> {
  // Create content_revisions collection
  await connection.query('db.createCollection("content_revisions")');

  // Create indexes for content_revisions
  await connection.query(`
    db.content_revisions.createIndex({ "contentId": 1, "version": 1 }, { "unique": true })
  `);
  await connection.query(`
    db.content_revisions.createIndex({ "contentId": 1 })
  `);
  await connection.query(`
    db.content_revisions.createIndex({ "userId": 1 })
  `);
  await connection.query(`
    db.content_revisions.createIndex({ "createdAt": -1 })
  `);

  // Update existing content documents to add versioning fields
  await connection.query(`
    db.content.updateMany(
      { isPublished: { $exists: false } },
      { 
        $set: { 
          isPublished: false,
          publishedVersion: null,
          publishedAt: null,
          publishedBy: null
        }
      }
    )
  `);

  // Create indexes for new fields
  await connection.query(`
    db.content.createIndex({ "isPublished": 1 })
  `);
  await connection.query(`
    db.content.createIndex({ "publishedAt": -1 })
  `);
  await connection.query(`
    db.content.createIndex({ "publishedBy": 1 })
  `);
}

async function removeSQLVersioning(connection: DatabaseConnection): Promise<void> {
  // Drop triggers first
  if (connection.type === 'postgresql') {
    try {
      await connection.query('DROP TRIGGER IF EXISTS content_versioning_trigger ON content');
      await connection.query('DROP FUNCTION IF EXISTS create_content_revision()');
    } catch (error) {
      console.warn('Failed to drop PostgreSQL versioning triggers:', error);
    }
  } else if (connection.type === 'mysql') {
    try {
      await connection.query('DROP TRIGGER IF EXISTS content_versioning_trigger');
    } catch (error) {
      console.warn('Failed to drop MySQL versioning trigger:', error);
    }
  }

  // Drop content_revisions table
  await connection.query('DROP TABLE IF EXISTS content_revisions');

  // Remove columns from content table
  const columnsToRemove = ['is_published', 'published_version', 'published_at', 'published_by'];
  
  for (const column of columnsToRemove) {
    try {
      await connection.query(`ALTER TABLE content DROP COLUMN ${column}`);
    } catch (error) {
      console.warn(`Failed to drop column ${column}:`, error);
    }
  }
}

async function removeMongoDBVersioning(connection: DatabaseConnection): Promise<void> {
  // Drop content_revisions collection
  await connection.query('db.content_revisions.drop()');

  // Remove versioning fields from content documents
  await connection.query(`
    db.content.updateMany(
      {},
      { 
        $unset: { 
          isPublished: "",
          publishedVersion: "",
          publishedAt: "",
          publishedBy: ""
        }
      }
    )
  `);
}