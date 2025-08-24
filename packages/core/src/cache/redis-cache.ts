/**
 * Redis Application-Level Caching for SightEdit
 * Handles distributed caching, session storage, and cache synchronization
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface RedisConfig {
  // Connection settings
  host: string;
  port: number;
  password?: string;
  database: number;
  
  // Connection pool settings
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number;
  commandTimeout: number;
  retryDelayOnFailover: number;
  maxRetries: number;
  
  // Cluster settings
  cluster: {
    enabled: boolean;
    nodes: Array<{ host: string; port: number }>;
    failoverTimeout: number;
  };
  
  // Sentinel settings (for high availability)
  sentinel: {
    enabled: boolean;
    hosts: Array<{ host: string; port: number }>;
    masterName: string;
  };
  
  // Cache settings
  defaultTtl: number;
  maxMemory: string; // e.g., '1gb'
  evictionPolicy: 'allkeys-lru' | 'allkeys-lfu' | 'volatile-lru' | 'volatile-lfu';
  
  // Serialization
  serialization: {
    compress: boolean;
    compressionLevel: number;
    encoding: 'json' | 'msgpack' | 'binary';
  };
  
  // Security
  ssl: {
    enabled: boolean;
    cert?: string;
    key?: string;
    ca?: string;
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    slowLogEnabled: boolean;
    slowLogThreshold: number;
  };
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  created: number;
  accessed: number;
  version: string;
  tags: string[];
  size: number;
}

export interface RedisMetrics {
  totalConnections: number;
  activeConnections: number;
  totalCommands: number;
  commandsPerSecond: number;
  hitRate: number;
  memoryUsed: number;
  keysExpired: number;
  keysEvicted: number;
  slowQueries: number;
  averageResponseTime: number;
  replicationLag: number;
  uptime: number;
  lastUpdated: number;
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'exists' | 'ttl';
  key: string;
  value?: any;
  ttl?: number;
  timestamp: number;
}

/**
 * Redis cache client with advanced features
 */
export class RedisCacheClient extends EventEmitter {
  private config: RedisConfig;
  private client: any; // Redis client instance
  private isConnected = false;
  private connectionPool: any[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private operationQueue: CacheOperation[] = [];
  private batchProcessor?: NodeJS.Timeout;
  private circuitBreakerOpen = false;
  private lastFailureTime = 0;
  private failureCount = 0;
  private metrics: RedisMetrics;
  
  constructor(config: RedisConfig) {
    super();
    this.config = {
      // Default configuration
      host: 'localhost',
      port: 6379,
      database: 0,
      maxConnections: 10,
      minConnections: 2,
      connectionTimeout: 5000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetries: 3,
      cluster: { enabled: false, nodes: [], failoverTimeout: 5000 },
      sentinel: { enabled: false, hosts: [], masterName: 'mymaster' },
      defaultTtl: 3600,
      maxMemory: '1gb',
      evictionPolicy: 'allkeys-lru',
      serialization: { compress: true, compressionLevel: 6, encoding: 'json' },
      ssl: { enabled: false },
      monitoring: { enabled: true, metricsInterval: 60000, slowLogEnabled: true, slowLogThreshold: 1000 },
      ...config
    };
    
    this.initializeMetrics();
  }
  
  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to Redis', {
        component: 'RedisCacheClient',
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      });
      
      // Create Redis client based on configuration
      if (this.config.cluster.enabled) {
        this.client = this.createClusterClient();
      } else if (this.config.sentinel.enabled) {
        this.client = this.createSentinelClient();
      } else {
        this.client = this.createStandardClient();
      }
      
      await this.setupClient();
      await this.configureRedis();
      
      this.isConnected = true;
      this.circuitBreakerOpen = false;
      this.failureCount = 0;
      
      if (this.config.monitoring.enabled) {
        this.startMetricsCollection();
      }
      
      this.startBatchProcessor();
      this.emit('connected');
      
      logger.info('Redis connection established', {
        component: 'RedisCacheClient'
      });
      
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      this.stopMetricsCollection();
      this.stopBatchProcessor();
      
      if (this.client) {
        await this.client.quit();
      }
      
      this.isConnected = false;
      this.emit('disconnected');
      
      logger.info('Redis connection closed', {
        component: 'RedisCacheClient'
      });
      
    } catch (error) {
      logger.error('Error closing Redis connection', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return null;
    }
    
    const startTime = Date.now();
    
    try {
      const rawValue = await this.client.get(this.prefixKey(key));
      if (!rawValue) {
        this.recordMiss();
        return null;
      }
      
      const entry = this.deserialize<CacheEntry<T>>(rawValue);
      if (!entry) {
        this.recordMiss();
        return null;
      }
      
      // Check TTL
      if (entry.ttl > 0 && Date.now() > entry.created + (entry.ttl * 1000)) {
        await this.delete(key);
        this.recordMiss();
        return null;
      }
      
      // Update access time
      entry.accessed = Date.now();
      await this.client.set(
        this.prefixKey(key),
        this.serialize(entry),
        'EX',
        entry.ttl
      );
      
      this.recordHit(Date.now() - startTime);
      return entry.value;
      
    } catch (error) {
      this.handleError('get', error, { key });
      return null;
    }
  }
  
  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number, tags: string[] = []): Promise<void> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      // Queue for later processing
      this.queueOperation({
        operation: 'set',
        key,
        value,
        ttl,
        timestamp: Date.now()
      });
      return;
    }
    
    try {
      const effectiveTtl = ttl || this.config.defaultTtl;
      const entry: CacheEntry<T> = {
        key,
        value,
        ttl: effectiveTtl,
        created: Date.now(),
        accessed: Date.now(),
        version: this.generateVersion(),
        tags,
        size: this.estimateSize(value)
      };
      
      const serialized = this.serialize(entry);
      
      if (effectiveTtl > 0) {
        await this.client.setex(this.prefixKey(key), effectiveTtl, serialized);
      } else {
        await this.client.set(this.prefixKey(key), serialized);
      }
      
      // Add to tag index if tags are provided
      if (tags.length > 0) {
        await this.addToTagIndex(key, tags);
      }
      
      this.emit('set', { key, ttl: effectiveTtl, tags });
      
    } catch (error) {
      this.handleError('set', error, { key, ttl, tags });
      throw error;
    }
  }
  
  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      this.queueOperation({
        operation: 'delete',
        key,
        timestamp: Date.now()
      });
      return false;
    }
    
    try {
      const result = await this.client.del(this.prefixKey(key));
      
      // Remove from tag indices
      await this.removeFromTagIndex(key);
      
      this.emit('delete', { key });
      return result > 0;
      
    } catch (error) {
      this.handleError('delete', error, { key });
      return false;
    }
  }
  
  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return false;
    }
    
    try {
      const result = await this.client.exists(this.prefixKey(key));
      return result > 0;
    } catch (error) {
      this.handleError('exists', error, { key });
      return false;
    }
  }
  
  /**
   * Get TTL for key
   */
  async getTtl(key: string): Promise<number> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return -1;
    }
    
    try {
      return await this.client.ttl(this.prefixKey(key));
    } catch (error) {
      this.handleError('ttl', error, { key });
      return -1;
    }
  }
  
  /**
   * Increment numeric value
   */
  async increment(key: string, amount = 1): Promise<number> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return 0;
    }
    
    try {
      if (amount === 1) {
        return await this.client.incr(this.prefixKey(key));
      } else {
        return await this.client.incrby(this.prefixKey(key), amount);
      }
    } catch (error) {
      this.handleError('increment', error, { key, amount });
      return 0;
    }
  }
  
  /**
   * Set multiple keys at once
   */
  async mset(entries: Record<string, any>, ttl?: number): Promise<void> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return;
    }
    
    try {
      const pipeline = this.client.pipeline();
      
      for (const [key, value] of Object.entries(entries)) {
        const entry: CacheEntry = {
          key,
          value,
          ttl: ttl || this.config.defaultTtl,
          created: Date.now(),
          accessed: Date.now(),
          version: this.generateVersion(),
          tags: [],
          size: this.estimateSize(value)
        };
        
        const serialized = this.serialize(entry);
        
        if (ttl && ttl > 0) {
          pipeline.setex(this.prefixKey(key), ttl, serialized);
        } else {
          pipeline.set(this.prefixKey(key), serialized);
        }
      }
      
      await pipeline.exec();
      this.emit('mset', { keys: Object.keys(entries), count: Object.keys(entries).length });
      
    } catch (error) {
      this.handleError('mset', error, { keys: Object.keys(entries) });
      throw error;
    }
  }
  
  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<Record<string, T | null>> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return {};
    }
    
    try {
      const prefixedKeys = keys.map(key => this.prefixKey(key));
      const values = await this.client.mget(prefixedKeys);
      
      const result: Record<string, T | null> = {};
      
      for (let i = 0; i < keys.length; i++) {
        const rawValue = values[i];
        if (rawValue) {
          const entry = this.deserialize<CacheEntry<T>>(rawValue);
          if (entry && (entry.ttl === 0 || Date.now() <= entry.created + (entry.ttl * 1000))) {
            result[keys[i]] = entry.value;
          } else {
            result[keys[i]] = null;
          }
        } else {
          result[keys[i]] = null;
        }
      }
      
      return result;
      
    } catch (error) {
      this.handleError('mget', error, { keys });
      return {};
    }
  }
  
  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return;
    }
    
    try {
      const keysToDelete = new Set<string>();
      
      for (const tag of tags) {
        const tagKey = this.getTagIndexKey(tag);
        const keys = await this.client.smembers(tagKey);
        keys.forEach((key: string) => keysToDelete.add(key));
      }
      
      if (keysToDelete.size > 0) {
        const pipeline = this.client.pipeline();
        
        // Delete tagged keys
        for (const key of keysToDelete) {
          pipeline.del(this.prefixKey(key));
        }
        
        // Delete tag indices
        for (const tag of tags) {
          pipeline.del(this.getTagIndexKey(tag));
        }
        
        await pipeline.exec();
        
        logger.info('Cache invalidated by tags', {
          component: 'RedisCacheClient',
          tags,
          keysDeleted: keysToDelete.size
        });
        
        this.emit('invalidated', { tags, keysDeleted: keysToDelete.size });
      }
      
    } catch (error) {
      this.handleError('invalidateByTags', error, { tags });
      throw error;
    }
  }
  
  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return;
    }
    
    try {
      await this.client.flushdb();
      this.emit('cleared');
      
      logger.info('Cache cleared', {
        component: 'RedisCacheClient'
      });
      
    } catch (error) {
      this.handleError('clear', error, {});
      throw error;
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    if (!this.isConnected || this.circuitBreakerOpen) {
      return {};
    }
    
    try {
      const info = await this.client.info();
      const memory = await this.client.info('memory');
      const stats = await this.client.info('stats');
      
      return this.parseRedisInfo({ info, memory, stats });
      
    } catch (error) {
      this.handleError('getStats', error, {});
      return {};
    }
  }
  
  /**
   * Get comprehensive metrics
   */
  async getMetrics(): Promise<RedisMetrics> {
    try {
      const stats = await this.getStats();
      
      return {
        ...this.metrics,
        memoryUsed: stats.used_memory || 0,
        keysExpired: stats.expired_keys || 0,
        keysEvicted: stats.evicted_keys || 0,
        uptime: stats.uptime_in_seconds || 0,
        lastUpdated: Date.now()
      };
      
    } catch (error) {
      logger.error('Failed to get Redis metrics', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
      return this.metrics;
    }
  }
  
  private createStandardClient(): any {
    // This would use a Redis client like 'redis' or 'ioredis'
    // Simplified implementation
    return {
      connect: () => Promise.resolve(),
      get: (key: string) => Promise.resolve(null),
      set: (key: string, value: string) => Promise.resolve('OK'),
      setex: (key: string, ttl: number, value: string) => Promise.resolve('OK'),
      del: (key: string) => Promise.resolve(1),
      exists: (key: string) => Promise.resolve(1),
      ttl: (key: string) => Promise.resolve(-1),
      incr: (key: string) => Promise.resolve(1),
      incrby: (key: string, amount: number) => Promise.resolve(amount),
      mget: (keys: string[]) => Promise.resolve([]),
      smembers: (key: string) => Promise.resolve([]),
      sadd: (key: string, ...members: string[]) => Promise.resolve(members.length),
      srem: (key: string, ...members: string[]) => Promise.resolve(members.length),
      flushdb: () => Promise.resolve('OK'),
      info: (section?: string) => Promise.resolve(''),
      pipeline: () => ({
        set: () => {},
        setex: () => {},
        del: () => {},
        exec: () => Promise.resolve([])
      }),
      quit: () => Promise.resolve('OK')
    };
  }
  
  private createClusterClient(): any {
    // Cluster client implementation would go here
    return this.createStandardClient();
  }
  
  private createSentinelClient(): any {
    // Sentinel client implementation would go here
    return this.createStandardClient();
  }
  
  private async setupClient(): Promise<void> {
    // Setup event listeners
    // this.client.on('connect', () => this.emit('connected'));
    // this.client.on('error', (error) => this.handleConnectionError(error));
    // this.client.on('close', () => this.emit('disconnected'));
    
    await this.client.connect?.();
  }
  
  private async configureRedis(): Promise<void> {
    try {
      // Configure Redis settings
      // await this.client.config('SET', 'maxmemory', this.config.maxMemory);
      // await this.client.config('SET', 'maxmemory-policy', this.config.evictionPolicy);
      
      if (this.config.monitoring.slowLogEnabled) {
        // await this.client.config('SET', 'slowlog-log-slower-than', this.config.monitoring.slowLogThreshold);
      }
      
    } catch (error) {
      logger.warn('Failed to configure Redis settings', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private handleConnectionError(error: any): void {
    this.isConnected = false;
    this.circuitBreakerOpen = true;
    this.lastFailureTime = Date.now();
    this.failureCount++;
    
    logger.error('Redis connection error', {
      component: 'RedisCacheClient',
      error: error instanceof Error ? error.message : String(error),
      failureCount: this.failureCount
    });
    
    this.emit('error', error);
    
    // Attempt reconnection
    setTimeout(() => {
      this.attemptReconnection();
    }, this.config.retryDelayOnFailover * this.failureCount);
  }
  
  private async attemptReconnection(): Promise<void> {
    if (this.failureCount >= this.config.maxRetries) {
      logger.error('Maximum reconnection attempts reached', {
        component: 'RedisCacheClient',
        failureCount: this.failureCount
      });
      return;
    }
    
    try {
      await this.connect();
      logger.info('Redis reconnection successful', {
        component: 'RedisCacheClient'
      });
    } catch (error) {
      logger.warn('Reconnection attempt failed', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private handleError(operation: string, error: any, context: any): void {
    logger.error(`Redis ${operation} operation failed`, {
      component: 'RedisCacheClient',
      operation,
      error: error instanceof Error ? error.message : String(error),
      context
    });
    
    this.emit('operationError', { operation, error, context });
  }
  
  private queueOperation(operation: CacheOperation): void {
    if (this.operationQueue.length < 10000) { // Limit queue size
      this.operationQueue.push(operation);
    }
  }
  
  private startBatchProcessor(): void {
    this.batchProcessor = setInterval(async () => {
      if (this.operationQueue.length > 0 && this.isConnected && !this.circuitBreakerOpen) {
        await this.processQueuedOperations();
      }
    }, 1000); // Process every second
  }
  
  private stopBatchProcessor(): void {
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
      this.batchProcessor = undefined;
    }
  }
  
  private async processQueuedOperations(): Promise<void> {
    const operations = this.operationQueue.splice(0, 100); // Process in batches
    
    try {
      const pipeline = this.client.pipeline();
      
      for (const op of operations) {
        switch (op.operation) {
          case 'set':
            if (op.ttl && op.ttl > 0) {
              pipeline.setex(this.prefixKey(op.key), op.ttl, this.serialize(op.value));
            } else {
              pipeline.set(this.prefixKey(op.key), this.serialize(op.value));
            }
            break;
          case 'delete':
            pipeline.del(this.prefixKey(op.key));
            break;
        }
      }
      
      await pipeline.exec();
      
      logger.debug('Processed queued cache operations', {
        component: 'RedisCacheClient',
        operationsProcessed: operations.length,
        remainingInQueue: this.operationQueue.length
      });
      
    } catch (error) {
      // Re-queue failed operations
      this.operationQueue.unshift(...operations);
      
      logger.error('Failed to process queued operations', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private serialize<T>(value: T): string {
    try {
      let serialized = JSON.stringify(value);
      
      if (this.config.serialization.compress) {
        // Compression would be implemented here
      }
      
      return serialized;
    } catch (error) {
      logger.error('Serialization failed', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
      return '';
    }
  }
  
  private deserialize<T>(value: string): T | null {
    try {
      if (this.config.serialization.compress) {
        // Decompression would be implemented here
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Deserialization failed', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  private prefixKey(key: string): string {
    return `sightedit:${key}`;
  }
  
  private getTagIndexKey(tag: string): string {
    return `sightedit:tag:${tag}`;
  }
  
  private async addToTagIndex(key: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    
    try {
      const pipeline = this.client.pipeline();
      
      for (const tag of tags) {
        pipeline.sadd(this.getTagIndexKey(tag), key);
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.warn('Failed to update tag index', {
        component: 'RedisCacheClient',
        key,
        tags,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private async removeFromTagIndex(key: string): Promise<void> {
    // This would require tracking which tags a key belongs to
    // For now, we'll skip this optimization
  }
  
  private generateVersion(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate in bytes
    } catch {
      return 1000; // Default estimate
    }
  }
  
  private recordHit(responseTime: number): void {
    this.metrics.totalCommands++;
    this.updateHitRate(true);
    this.updateAverageResponseTime(responseTime);
  }
  
  private recordMiss(): void {
    this.metrics.totalCommands++;
    this.updateHitRate(false);
  }
  
  private updateHitRate(hit: boolean): void {
    const currentHits = this.metrics.hitRate * (this.metrics.totalCommands - 1);
    const newHits = hit ? currentHits + 1 : currentHits;
    this.metrics.hitRate = newHits / this.metrics.totalCommands;
  }
  
  private updateAverageResponseTime(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const count = this.metrics.totalCommands;
    this.metrics.averageResponseTime = ((currentAvg * (count - 1)) + responseTime) / count;
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      totalCommands: 0,
      commandsPerSecond: 0,
      hitRate: 0,
      memoryUsed: 0,
      keysExpired: 0,
      keysEvicted: 0,
      slowQueries: 0,
      averageResponseTime: 0,
      replicationLag: 0,
      uptime: 0,
      lastUpdated: Date.now()
    };
  }
  
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        await this.updateMetrics();
      } catch (error) {
        logger.error('Metrics collection failed', {
          component: 'RedisCacheClient',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.monitoring.metricsInterval);
  }
  
  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }
  
  private async updateMetrics(): Promise<void> {
    try {
      const currentTime = Date.now();
      const timeDiff = (currentTime - this.metrics.lastUpdated) / 1000;
      
      const stats = await this.getStats();
      
      // Update commands per second
      const commandsDiff = (stats.total_commands_processed || 0) - this.metrics.totalCommands;
      this.metrics.commandsPerSecond = commandsDiff / timeDiff;
      
      this.metrics.totalConnections = stats.total_connections_received || 0;
      this.metrics.activeConnections = stats.connected_clients || 0;
      this.metrics.slowQueries = stats.slowlog_len || 0;
      this.metrics.lastUpdated = currentTime;
      
    } catch (error) {
      logger.debug('Failed to update Redis metrics', {
        component: 'RedisCacheClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private parseRedisInfo(infoData: any): any {
    // Parse Redis INFO command output
    // Simplified implementation
    return {
      used_memory: 0,
      total_connections_received: 0,
      connected_clients: 0,
      total_commands_processed: 0,
      expired_keys: 0,
      evicted_keys: 0,
      uptime_in_seconds: 0,
      slowlog_len: 0
    };
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMetricsCollection();
    this.stopBatchProcessor();
    this.removeAllListeners();
    
    if (this.isConnected) {
      this.disconnect().catch(() => {
        // Ignore cleanup errors
      });
    }
    
    logger.info('Redis cache client destroyed', {
      component: 'RedisCacheClient'
    });
  }
}

export { RedisCacheClient };