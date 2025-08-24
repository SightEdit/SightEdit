export interface ContentRecord {
  sight: string;
  value: any;
  type: string;
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'sight';
  sortOrder?: 'asc' | 'desc';
  filter?: {
    type?: string;
    createdBy?: string;
    updatedAfter?: Date;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ContentRepository {
  findBySight(sight: string): Promise<ContentRecord | null>;
  findByContext(context: ElementContext): Promise<ContentRecord[]>;
  save(record: Omit<ContentRecord, 'version' | 'createdAt' | 'updatedAt'>): Promise<ContentRecord>;
  update(sight: string, updates: Partial<ContentRecord>): Promise<ContentRecord>;
  delete(sight: string): Promise<void>;
  list(options?: ListOptions): Promise<PaginatedResult<ContentRecord>>;
  getHistory(sight: string, limit?: number): Promise<ContentRecord[]>;
  search(query: string, options?: ListOptions): Promise<PaginatedResult<ContentRecord>>;
  exists(sight: string): Promise<boolean>;
  count(filter?: ListOptions['filter']): Promise<number>;
}

export interface ElementContext {
  url?: string;
  path?: string;
  element?: string;
  userId?: string;
  sessionId?: string;
  timestamp?: Date;
}

export interface StorageAdapter {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

export class CachedContentRepository implements ContentRepository {
  private cache: LRUCache<string, ContentRecord>;

  constructor(
    private storage: StorageAdapter,
    options: { cacheSize?: number; cacheTTL?: number } = {}
  ) {
    this.cache = new LRUCache<string, ContentRecord>({
      max: options.cacheSize || 1000,
      ttl: options.cacheTTL || 3600000 // 1 hour
    });
  }

  async findBySight(sight: string): Promise<ContentRecord | null> {
    // Check cache first
    const cached = this.cache.get(sight);
    if (cached) {
      return cached;
    }

    try {
      const record = await this.storage.get(`content:${sight}`);
      if (record) {
        const contentRecord = this.deserializeRecord(record);
        this.cache.set(sight, contentRecord);
        return contentRecord;
      }
      return null;
    } catch (error) {
      console.warn(`Failed to find content by sight "${sight}":`, error);
      return null;
    }
  }

  async findByContext(context: ElementContext): Promise<ContentRecord[]> {
    try {
      // Generate context-based query keys
      const keys = this.generateContextKeys(context);
      const records: ContentRecord[] = [];

      for (const key of keys) {
        const keyRecords = await this.storage.list(key);
        for (const recordKey of keyRecords) {
          const record = await this.storage.get(recordKey);
          if (record) {
            records.push(this.deserializeRecord(record));
          }
        }
      }

      return records;
    } catch (error) {
      console.warn('Failed to find content by context:', error);
      return [];
    }
  }

  async save(record: Omit<ContentRecord, 'version' | 'createdAt' | 'updatedAt'>): Promise<ContentRecord> {
    const now = new Date();
    
    // Check if record exists to determine version
    const existing = await this.findBySight(record.sight);
    const version = existing ? existing.version + 1 : 1;

    const fullRecord: ContentRecord = {
      ...record,
      version,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    try {
      await this.storage.set(`content:${record.sight}`, this.serializeRecord(fullRecord));
      
      // Also store history
      await this.storage.set(
        `history:${record.sight}:${version}`,
        this.serializeRecord(fullRecord)
      );

      // Update cache
      this.cache.set(record.sight, fullRecord);

      return fullRecord;
    } catch (error) {
      console.error('Failed to save content record:', error);
      throw new Error(`Failed to save content for sight "${record.sight}"`);
    }
  }

  async update(sight: string, updates: Partial<ContentRecord>): Promise<ContentRecord> {
    const existing = await this.findBySight(sight);
    if (!existing) {
      throw new Error(`Content not found for sight "${sight}"`);
    }

    const updated = {
      ...existing,
      ...updates,
      sight, // Ensure sight cannot be changed
      version: existing.version + 1,
      updatedAt: new Date()
    };

    return this.save(updated);
  }

  async delete(sight: string): Promise<void> {
    try {
      await this.storage.delete(`content:${sight}`);
      this.cache.delete(sight);

      // Also delete history (optional - might want to keep for audit)
      const historyKeys = await this.storage.list(`history:${sight}:`);
      for (const key of historyKeys) {
        await this.storage.delete(key);
      }
    } catch (error) {
      console.error(`Failed to delete content for sight "${sight}":`, error);
      throw error;
    }
  }

  async list(options: ListOptions = {}): Promise<PaginatedResult<ContentRecord>> {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;

      const keys = await this.storage.list('content:');
      const records: ContentRecord[] = [];

      // Fetch all records (in a production system, you'd want server-side filtering)
      for (const key of keys) {
        const record = await this.storage.get(key);
        if (record) {
          const contentRecord = this.deserializeRecord(record);
          if (this.matchesFilter(contentRecord, options.filter)) {
            records.push(contentRecord);
          }
        }
      }

      // Sort records
      records.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      // Paginate
      const paginatedRecords = records.slice(offset, offset + limit);
      
      return {
        items: paginatedRecords,
        total: records.length,
        limit,
        offset,
        hasMore: offset + limit < records.length
      };
    } catch (error) {
      console.error('Failed to list content records:', error);
      return {
        items: [],
        total: 0,
        limit: options.limit || 50,
        offset: options.offset || 0,
        hasMore: false
      };
    }
  }

  async getHistory(sight: string, limit: number = 100): Promise<ContentRecord[]> {
    try {
      const historyKeys = await this.storage.list(`history:${sight}:`);
      const records: ContentRecord[] = [];

      for (const key of historyKeys.slice(0, limit)) {
        const record = await this.storage.get(key);
        if (record) {
          records.push(this.deserializeRecord(record));
        }
      }

      // Sort by version descending (newest first)
      return records.sort((a, b) => b.version - a.version);
    } catch (error) {
      console.warn(`Failed to get history for sight "${sight}":`, error);
      return [];
    }
  }

  async search(query: string, options: ListOptions = {}): Promise<PaginatedResult<ContentRecord>> {
    try {
      const allRecords = await this.list({ ...options, limit: undefined, offset: undefined });
      
      // Simple text search (in production, use proper search engine)
      const searchResults = allRecords.items.filter(record => {
        const searchText = `${record.sight} ${JSON.stringify(record.value)}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      const { limit = 50, offset = 0 } = options;
      const paginatedResults = searchResults.slice(offset, offset + limit);

      return {
        items: paginatedResults,
        total: searchResults.length,
        limit,
        offset,
        hasMore: offset + limit < searchResults.length
      };
    } catch (error) {
      console.error('Search failed:', error);
      return {
        items: [],
        total: 0,
        limit: options.limit || 50,
        offset: options.offset || 0,
        hasMore: false
      };
    }
  }

  async exists(sight: string): Promise<boolean> {
    if (this.cache.has(sight)) {
      return true;
    }

    if (this.storage.exists) {
      return this.storage.exists(`content:${sight}`);
    }

    // Fallback: try to get the record
    try {
      const record = await this.storage.get(`content:${sight}`);
      return record !== null && record !== undefined;
    } catch {
      return false;
    }
  }

  async count(filter?: ListOptions['filter']): Promise<number> {
    try {
      if (!filter) {
        const keys = await this.storage.list('content:');
        return keys.length;
      }

      // With filter, we need to load and check each record
      const keys = await this.storage.list('content:');
      let count = 0;

      for (const key of keys) {
        const record = await this.storage.get(key);
        if (record && this.matchesFilter(this.deserializeRecord(record), filter)) {
          count++;
        }
      }

      return count;
    } catch (error) {
      console.warn('Failed to count records:', error);
      return 0;
    }
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      hitRate: 0 // Would need to implement hit tracking in cache
    };
  }

  private serializeRecord(record: ContentRecord): any {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private deserializeRecord(data: any): ContentRecord {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  private generateContextKeys(context: ElementContext): string[] {
    const keys: string[] = [];
    
    if (context.url) {
      keys.push(`context:url:${context.url}`);
    }
    
    if (context.path) {
      keys.push(`context:path:${context.path}`);
    }
    
    if (context.userId) {
      keys.push(`context:user:${context.userId}`);
    }

    return keys;
  }

  private matchesFilter(record: ContentRecord, filter?: ListOptions['filter']): boolean {
    if (!filter) return true;

    if (filter.type && record.type !== filter.type) {
      return false;
    }

    if (filter.createdBy && record.createdBy !== filter.createdBy) {
      return false;
    }

    if (filter.updatedAfter && record.updatedAt < filter.updatedAfter) {
      return false;
    }

    return true;
  }
}

// Simple LRU Cache implementation
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number; accessTime: number }>();
  private accessOrder = new Map<K, number>();
  private currentTime = 0;

  constructor(
    private options: { max: number; ttl: number }
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.delete(key);
      return undefined;
    }

    // Update access time
    entry.accessTime = Date.now();
    this.accessOrder.set(key, this.currentTime++);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.options.max && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + this.options.ttl,
      accessTime: Date.now()
    });

    this.accessOrder.set(key, this.currentTime++);
  }

  delete(key: K): void {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get max(): number {
    return this.options.max;
  }

  private evictOldest(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.delete(oldestKey);
    }
  }
}