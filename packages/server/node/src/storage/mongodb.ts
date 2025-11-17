import { StorageAdapter } from '../index';

export interface MongoDBConfig {
  uri: string;
  database: string;
  collection?: string;
  options?: any;
}

export class MongoDBStorageAdapter implements StorageAdapter {
  private config: MongoDBConfig;
  private client: any;
  private db: any;
  private collection: any;

  constructor(config: MongoDBConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import to avoid requiring mongodb when not used
      const { MongoClient } = await import('mongodb');
      
      this.client = new MongoClient(this.config.uri, {
        ...this.config.options,
        useUnifiedTopology: true
      });
      
      await this.client.connect();
      this.db = this.client.db(this.config.database);
      this.collection = this.db.collection(this.config.collection || 'sightedit');
      
      // Create indexes
      await this.collection.createIndex({ key: 1 }, { unique: true });
      await this.collection.createIndex({ updatedAt: -1 });
      await this.collection.createIndex({ sight: 1 });
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    if (!this.collection) await this.connect();
    
    try {
      const doc = await this.collection.findOne({ key });
      return doc ? doc.value : null;
    } catch (error) {
      console.error('MongoDB get error:', error);
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.collection) await this.connect();
    
    try {
      await this.collection.replaceOne(
        { key },
        {
          key,
          value,
          sight: value.sight || key,
          updatedAt: new Date(),
          createdAt: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('MongoDB set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.collection) await this.connect();
    
    try {
      await this.collection.deleteOne({ key });
    } catch (error) {
      console.error('MongoDB delete error:', error);
      throw error;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    if (!this.collection) await this.connect();

    try {
      let query = {};

      if (prefix) {
        // Escape regex special characters to prevent NoSQL injection and ReDoS
        const escapedPrefix = this.escapeRegex(prefix);
        query = { key: { $regex: `^${escapedPrefix}` } };
      }

      const docs = await this.collection.find(query, { projection: { key: 1 } }).toArray();
      return docs.map((doc: any) => doc.key);
    } catch (error) {
      console.error('MongoDB list error:', error);
      return [];
    }
  }

  /**
   * Escape regex special characters to prevent NoSQL injection
   */
  private escapeRegex(str: string): string {
    // Escape all regex metacharacters
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get all changes for a specific sight identifier
   */
  async getHistory(sight: string, limit: number = 100): Promise<any[]> {
    if (!this.collection) await this.connect();
    
    try {
      const docs = await this.collection
        .find({ sight })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      
      return docs.map((doc: any) => ({
        key: doc.key,
        value: doc.value,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt
      }));
    } catch (error) {
      console.error('MongoDB history error:', error);
      return [];
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}