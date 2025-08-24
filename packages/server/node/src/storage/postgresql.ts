import { StorageAdapter } from '../index';

export interface PostgreSQLConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  table?: string;
  ssl?: boolean | any;
}

export class PostgreSQLStorageAdapter implements StorageAdapter {
  private config: PostgreSQLConfig;
  private pool: any;
  private tableName: string;

  constructor(config: PostgreSQLConfig) {
    this.config = config;
    this.tableName = config.table || 'sightedit';
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import to avoid requiring pg when not used
      const { Pool } = await import('pg');
      
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port || 5432,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });

      // Create table if not exists
      await this.createTable();
    } catch (error) {
      console.error('PostgreSQL connection error:', error);
      throw error;
    }
  }

  private async createTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        sight VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_sight ON ${this.tableName}(sight);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated_at ON ${this.tableName}(updated_at DESC);
    `;

    try {
      await this.pool.query(query);
    } catch (error) {
      console.error('Failed to create table:', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    if (!this.pool) await this.connect();
    
    try {
      const query = `SELECT value FROM ${this.tableName} WHERE key = $1`;
      const result = await this.pool.query(query, [key]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].value;
    } catch (error) {
      console.error('PostgreSQL get error:', error);
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.pool) await this.connect();
    
    try {
      const query = `
        INSERT INTO ${this.tableName} (key, value, sight, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET 
          value = EXCLUDED.value,
          sight = EXCLUDED.sight,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await this.pool.query(query, [
        key,
        JSON.stringify(value),
        value.sight || key
      ]);
    } catch (error) {
      console.error('PostgreSQL set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.pool) await this.connect();
    
    try {
      const query = `DELETE FROM ${this.tableName} WHERE key = $1`;
      await this.pool.query(query, [key]);
    } catch (error) {
      console.error('PostgreSQL delete error:', error);
      throw error;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    if (!this.pool) await this.connect();
    
    try {
      let query = `SELECT key FROM ${this.tableName}`;
      const params: any[] = [];
      
      if (prefix) {
        query += ` WHERE key LIKE $1`;
        params.push(`${prefix}%`);
      }
      
      query += ` ORDER BY updated_at DESC`;
      
      const result = await this.pool.query(query, params);
      return result.rows.map((row: any) => row.key);
    } catch (error) {
      console.error('PostgreSQL list error:', error);
      return [];
    }
  }

  /**
   * Get all changes for a specific sight identifier
   */
  async getHistory(sight: string, limit: number = 100): Promise<any[]> {
    if (!this.pool) await this.connect();
    
    try {
      const query = `
        SELECT key, value, created_at, updated_at 
        FROM ${this.tableName}
        WHERE sight = $1
        ORDER BY updated_at DESC
        LIMIT $2
      `;
      
      const result = await this.pool.query(query, [sight, limit]);
      
      return result.rows.map((row: any) => ({
        key: row.key,
        value: row.value,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('PostgreSQL history error:', error);
      return [];
    }
  }

  /**
   * Execute raw SQL query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.pool) await this.connect();
    
    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      console.error('PostgreSQL query error:', error);
      throw error;
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}