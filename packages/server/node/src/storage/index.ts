export { S3StorageAdapter, S3Config } from './s3';
export { MongoDBStorageAdapter, MongoDBConfig } from './mongodb';
export { PostgreSQLStorageAdapter, PostgreSQLConfig } from './postgresql';

import { StorageAdapter } from '../index';

/**
 * In-memory storage adapter for development/testing
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private data: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.data.keys());
    if (!prefix) return keys;
    return keys.filter(key => key.startsWith(prefix));
  }

  clear(): void {
    this.data.clear();
  }
}