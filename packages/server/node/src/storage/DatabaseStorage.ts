import { StorageAdapter } from '../index';

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  type: 'postgres' | 'mysql' | 'sqlite' | 'mongodb';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  tableName?: string;
  connectionString?: string;
  pool?: {
    min?: number;
    max?: number;
    idle?: number;
  };
}

/**
 * Abstract base class for database storage adapters
 */
export abstract class BaseDatabaseStorage implements StorageAdapter {
  protected config: DatabaseConfig;
  protected tableName: string;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.tableName = config.tableName || 'sightedit_content';
    this.initialize();
  }

  protected abstract initialize(): Promise<void>;
  abstract get(key: string): Promise<any>;
  abstract set(key: string, value: any): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract list(prefix?: string): Promise<string[]>;
  abstract close(): Promise<void>;
}

/**
 * PostgreSQL storage adapter
 */
export class PostgreSQLStorage extends BaseDatabaseStorage {
  private client: any;

  protected async initialize(): Promise<void> {
    try {
      // @ts-ignore - Optional dependency
      const pg = await import('pg').catch(() => {
        throw new Error('PostgreSQL driver not installed. Run: npm install pg @types/pg');
      });
      const { Client } = pg;
      
      this.client = new Client({
        host: this.config.host || 'localhost',
        port: this.config.port || 5432,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        connectionString: this.config.connectionString,
      });

      await this.client.connect();
      await this.createTableIfNotExists();
    } catch (error) {
      console.error('Failed to initialize PostgreSQL storage:', error);
      throw error;
    }
  }

  private async createTableIfNotExists(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_key ON ${this.tableName}(key);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated_at ON ${this.tableName}(updated_at);
    `;
    
    await this.client.query(query);
  }

  async get(key: string): Promise<any> {
    const query = `SELECT value FROM ${this.tableName} WHERE key = $1`;
    const result = await this.client.query(query, [key]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].value;
  }

  async set(key: string, value: any): Promise<void> {
    const query = `
      INSERT INTO ${this.tableName} (key, value, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.client.query(query, [key, JSON.stringify(value)]);
  }

  async delete(key: string): Promise<void> {
    const query = `DELETE FROM ${this.tableName} WHERE key = $1`;
    await this.client.query(query, [key]);
  }

  async list(prefix?: string): Promise<string[]> {
    let query = `SELECT key FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (prefix) {
      query += ` WHERE key LIKE $1`;
      params.push(`${prefix}%`);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const result = await this.client.query(query, params);
    return result.rows.map((row: any) => row.key);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }
  }
}

/**
 * MySQL storage adapter
 */
export class MySQLStorage extends BaseDatabaseStorage {
  private connection: any;

  protected async initialize(): Promise<void> {
    try {
      // @ts-ignore - Optional dependency
      const mysql = await import('mysql2/promise').catch(() => {
        throw new Error('MySQL driver not installed. Run: npm install mysql2');
      });
      
      this.connection = await mysql.createConnection({
        host: this.config.host || 'localhost',
        port: this.config.port || 3306,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
      });

      await this.createTableIfNotExists();
    } catch (error) {
      console.error('Failed to initialize MySQL storage:', error);
      throw error;
    }
  }

  private async createTableIfNotExists(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        \`key\` VARCHAR(255) PRIMARY KEY,
        \`value\` JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (\`key\`),
        INDEX idx_updated_at (updated_at)
      )
    `;
    
    await this.connection.execute(query);
  }

  async get(key: string): Promise<any> {
    const query = `SELECT \`value\` FROM ${this.tableName} WHERE \`key\` = ?`;
    const [rows] = await this.connection.execute(query, [key]);
    
    if (!rows || rows.length === 0) {
      return null;
    }
    
    return rows[0].value;
  }

  async set(key: string, value: any): Promise<void> {
    const query = `
      INSERT INTO ${this.tableName} (\`key\`, \`value\`) 
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE 
      \`value\` = VALUES(\`value\`),
      updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.connection.execute(query, [key, JSON.stringify(value)]);
  }

  async delete(key: string): Promise<void> {
    const query = `DELETE FROM ${this.tableName} WHERE \`key\` = ?`;
    await this.connection.execute(query, [key]);
  }

  async list(prefix?: string): Promise<string[]> {
    let query = `SELECT \`key\` FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (prefix) {
      query += ` WHERE \`key\` LIKE ?`;
      params.push(`${prefix}%`);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const [rows] = await this.connection.execute(query, params);
    return rows.map((row: any) => row.key);
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
    }
  }
}

/**
 * SQLite storage adapter
 */
export class SQLiteStorage extends BaseDatabaseStorage {
  private db: any;

  protected async initialize(): Promise<void> {
    try {
      // @ts-ignore - Optional dependency
      const sqlite3 = await import('sqlite3').catch(() => {
        throw new Error('SQLite driver not installed. Run: npm install sqlite3 sqlite @types/sqlite3');
      });
      // @ts-ignore - Optional dependency
      const sqliteModule = await import('sqlite').catch(() => {
        throw new Error('SQLite wrapper not installed. Run: npm install sqlite');
      });
      const { open } = sqliteModule;
      
      this.db = await open({
        filename: this.config.database,
        driver: sqlite3.Database
      });

      await this.createTableIfNotExists();
    } catch (error) {
      console.error('Failed to initialize SQLite storage:', error);
      throw error;
    }
  }

  private async createTableIfNotExists(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_key ON ${this.tableName}(key);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated_at ON ${this.tableName}(updated_at);
    `;
    
    await this.db.exec(query);
  }

  async get(key: string): Promise<any> {
    const query = `SELECT value FROM ${this.tableName} WHERE key = ?`;
    const row = await this.db.get(query, [key]);
    
    if (!row) {
      return null;
    }
    
    return JSON.parse(row.value);
  }

  async set(key: string, value: any): Promise<void> {
    const query = `
      INSERT INTO ${this.tableName} (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) 
      DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.db.run(query, [key, JSON.stringify(value)]);
  }

  async delete(key: string): Promise<void> {
    const query = `DELETE FROM ${this.tableName} WHERE key = ?`;
    await this.db.run(query, [key]);
  }

  async list(prefix?: string): Promise<string[]> {
    let query = `SELECT key FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (prefix) {
      query += ` WHERE key LIKE ?`;
      params.push(`${prefix}%`);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const rows = await this.db.all(query, params);
    return rows.map((row: any) => row.key);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
  }
}

/**
 * MongoDB storage adapter
 */
export class MongoDBStorage extends BaseDatabaseStorage {
  private client: any;
  private db: any;
  private collection: any;

  protected async initialize(): Promise<void> {
    try {
      // @ts-ignore - Optional dependency
      const mongodb = await import('mongodb').catch(() => {
        throw new Error('MongoDB driver not installed. Run: npm install mongodb');
      });
      const { MongoClient } = mongodb;
      
      const url = this.config.connectionString || 
        `mongodb://${this.config.username}:${this.config.password}@${this.config.host || 'localhost'}:${this.config.port || 27017}/${this.config.database}`;
      
      this.client = new MongoClient(url);
      await this.client.connect();
      
      this.db = this.client.db(this.config.database);
      this.collection = this.db.collection(this.tableName);
      
      // Create indexes
      await this.collection.createIndex({ key: 1 }, { unique: true });
      await this.collection.createIndex({ updatedAt: -1 });
    } catch (error) {
      console.error('Failed to initialize MongoDB storage:', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    const document = await this.collection.findOne({ key });
    
    if (!document) {
      return null;
    }
    
    return document.value;
  }

  async set(key: string, value: any): Promise<void> {
    await this.collection.replaceOne(
      { key },
      {
        key,
        value,
        updatedAt: new Date()
      },
      { upsert: true }
    );
  }

  async delete(key: string): Promise<void> {
    await this.collection.deleteOne({ key });
  }

  async list(prefix?: string): Promise<string[]> {
    const filter = prefix ? { key: { $regex: `^${prefix}` } } : {};
    
    const documents = await this.collection
      .find(filter)
      .sort({ updatedAt: -1 })
      .project({ key: 1 })
      .toArray();
    
    return documents.map((doc: any) => doc.key);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

/**
 * Factory function to create a database storage adapter
 */
export function createDatabaseStorage(config: DatabaseConfig): StorageAdapter {
  switch (config.type) {
    case 'postgres':
      return new PostgreSQLStorage(config);
    case 'mysql':
      return new MySQLStorage(config);
    case 'sqlite':
      return new SQLiteStorage(config);
    case 'mongodb':
      return new MongoDBStorage(config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}