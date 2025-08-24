/**
 * Database Query Result Caching for SightEdit
 * Intelligent caching of database queries with automatic invalidation
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';
import { RedisCacheClient } from './redis-cache';

export interface DBCacheConfig {
  // Cache backend configuration
  backend: 'redis' | 'memory' | 'hybrid';
  redis?: {
    host: string;
    port: number;
    database: number;
  };
  
  // Cache behavior
  defaultTtl: number;
  maxQuerySize: number;
  maxResultSize: number;
  
  // Query analysis
  enableQueryAnalysis: boolean;
  slowQueryThreshold: number;
  frequentQueryThreshold: number;
  
  // Invalidation strategies
  invalidation: {
    strategy: 'table-based' | 'pattern-based' | 'tag-based';
    autoInvalidate: boolean;
    cascadeDeletes: boolean;
  };
  
  // Performance optimization
  compression: {
    enabled: boolean;
    threshold: number; // bytes
    algorithm: 'gzip' | 'lz4' | 'snappy';
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    logSlowQueries: boolean;
    logMisses: boolean;
  };
}

export interface QueryCacheKey {
  sql: string;
  params: any[];
  database?: string;
  schema?: string;
}

export interface CachedQuery {
  key: string;
  sql: string;
  params: any[];
  result: any;
  resultSize: number;
  executionTime: number;
  cacheTime: number;
  ttl: number;
  hitCount: number;
  lastAccessed: number;
  tables: string[];
  tags: string[];
  compressed: boolean;
}

export interface QueryStats {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  avgExecutionTime: number;
  avgCacheTime: number;
  totalCacheSize: number;
  slowQueries: number;
  frequentQueries: Map<string, number>;
}

export interface InvalidationRule {
  pattern: RegExp;
  tables: string[];
  action: 'delete' | 'refresh';
  cascadePatterns?: RegExp[];
}

/**
 * Database query cache manager
 */
export class DBQueryCache extends EventEmitter {
  private config: DBCacheConfig;
  private cacheBackend: RedisCacheClient | Map<string, CachedQuery>;
  private queryStats: QueryStats;
  private invalidationRules: InvalidationRule[] = [];
  private queryAnalyzer: QueryAnalyzer;
  private compressionHandler: CompressionHandler;
  private isInitialized = false;
  
  constructor(config: DBCacheConfig) {
    super();
    this.config = {
      backend: 'memory',
      defaultTtl: 3600,
      maxQuerySize: 1024 * 10, // 10KB
      maxResultSize: 1024 * 1024, // 1MB
      enableQueryAnalysis: true,
      slowQueryThreshold: 1000, // 1 second
      frequentQueryThreshold: 10,
      invalidation: {
        strategy: 'table-based',
        autoInvalidate: true,
        cascadeDeletes: true
      },
      compression: {
        enabled: true,
        threshold: 1024, // 1KB
        algorithm: 'gzip'
      },
      monitoring: {
        enabled: true,
        logSlowQueries: true,
        logMisses: false
      },
      ...config
    };
    
    this.initializeStats();
    this.queryAnalyzer = new QueryAnalyzer();
    this.compressionHandler = new CompressionHandler(this.config.compression);
    this.setupInvalidationRules();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing database query cache', {
        component: 'DBQueryCache',
        backend: this.config.backend
      });
      
      // Initialize cache backend
      if (this.config.backend === 'redis' && this.config.redis) {
        this.cacheBackend = new RedisCacheClient({
          host: this.config.redis.host,
          port: this.config.redis.port,
          database: this.config.redis.database,
          defaultTtl: this.config.defaultTtl,
          maxConnections: 5,
          minConnections: 1,
          connectionTimeout: 5000,
          commandTimeout: 5000,
          retryDelayOnFailover: 100,
          maxRetries: 3,
          cluster: { enabled: false, nodes: [], failoverTimeout: 5000 },
          sentinel: { enabled: false, hosts: [], masterName: 'mymaster' },
          maxMemory: '256mb',
          evictionPolicy: 'allkeys-lru',
          serialization: { compress: true, compressionLevel: 6, encoding: 'json' },
          ssl: { enabled: false },
          monitoring: { enabled: true, metricsInterval: 60000, slowLogEnabled: true, slowLogThreshold: 1000 }
        });
        
        await (this.cacheBackend as RedisCacheClient).connect();
      } else {
        // Use in-memory cache
        this.cacheBackend = new Map<string, CachedQuery>();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Database query cache initialized', {
        component: 'DBQueryCache',
        backend: this.config.backend
      });
      
    } catch (error) {
      logger.error('Failed to initialize database query cache', {
        component: 'DBQueryCache',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get cached query result
   */
  async get(queryKey: QueryCacheKey): Promise<any | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(queryKey);
      
      // Check query size limits
      if (!this.isQueryCacheable(queryKey)) {
        return null;
      }
      
      let cachedQuery: CachedQuery | null = null;
      
      if (this.cacheBackend instanceof Map) {
        cachedQuery = this.cacheBackend.get(cacheKey) || null;
      } else {
        cachedQuery = await this.cacheBackend.get<CachedQuery>(cacheKey);
      }
      
      if (!cachedQuery) {
        this.recordCacheMiss(queryKey);
        return null;
      }
      
      // Check TTL
      if (Date.now() > cachedQuery.cacheTime + (cachedQuery.ttl * 1000)) {
        await this.delete(cacheKey);
        this.recordCacheMiss(queryKey);
        return null;
      }
      
      // Update access info
      cachedQuery.hitCount++;
      cachedQuery.lastAccessed = Date.now();
      
      // Decompress result if needed
      let result = cachedQuery.result;
      if (cachedQuery.compressed) {
        result = await this.compressionHandler.decompress(result);
      }
      
      this.recordCacheHit(queryKey, Date.now() - startTime);
      
      // Update cache with new access info
      await this.updateCacheEntry(cacheKey, cachedQuery);
      
      return result;
      
    } catch (error) {
      logger.error('Failed to get cached query', {
        component: 'DBQueryCache',
        sql: queryKey.sql.substring(0, 100),
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Cache query result
   */
  async set(
    queryKey: QueryCacheKey, 
    result: any, 
    executionTime: number,
    options: { ttl?: number; tags?: string[] } = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // Check if query and result are cacheable
      if (!this.isQueryCacheable(queryKey) || !this.isResultCacheable(result)) {
        return;
      }
      
      const cacheKey = this.generateCacheKey(queryKey);
      const resultSize = this.estimateSize(result);
      const tables = this.queryAnalyzer.extractTables(queryKey.sql);
      
      // Compress result if needed
      let finalResult = result;
      let compressed = false;
      
      if (this.config.compression.enabled && resultSize > this.config.compression.threshold) {
        finalResult = await this.compressionHandler.compress(result);
        compressed = true;
      }
      
      const cachedQuery: CachedQuery = {
        key: cacheKey,
        sql: queryKey.sql,
        params: queryKey.params,
        result: finalResult,
        resultSize,
        executionTime,
        cacheTime: Date.now(),
        ttl: options.ttl || this.config.defaultTtl,
        hitCount: 0,
        lastAccessed: Date.now(),
        tables,
        tags: options.tags || [],
        compressed
      };
      
      // Store in cache
      if (this.cacheBackend instanceof Map) {
        this.cacheBackend.set(cacheKey, cachedQuery);
      } else {
        const tags = [...tables, ...(options.tags || [])];
        await this.cacheBackend.set(cacheKey, cachedQuery, cachedQuery.ttl, tags);
      }
      
      // Update statistics
      this.updateQueryStats(queryKey, executionTime, resultSize);
      
      // Emit cache set event
      this.emit('set', {
        key: cacheKey,
        sql: queryKey.sql,
        executionTime,
        resultSize,
        tables,
        compressed
      });
      
    } catch (error) {
      logger.error('Failed to cache query result', {
        component: 'DBQueryCache',
        sql: queryKey.sql.substring(0, 100),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Delete cached query
   */
  async delete(key: string): Promise<boolean> {
    try {
      if (this.cacheBackend instanceof Map) {
        return this.cacheBackend.delete(key);
      } else {
        return await this.cacheBackend.delete(key);
      }
    } catch (error) {
      logger.error('Failed to delete cached query', {
        component: 'DBQueryCache',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Invalidate cache by table names
   */
  async invalidateByTables(tables: string[]): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      logger.info('Invalidating cache by tables', {
        component: 'DBQueryCache',
        tables
      });
      
      if (this.cacheBackend instanceof Map) {
        // Memory cache invalidation
        const keysToDelete: string[] = [];
        
        for (const [key, cachedQuery] of this.cacheBackend) {
          if (cachedQuery.tables.some(table => tables.includes(table))) {
            keysToDelete.push(key);
          }
        }
        
        keysToDelete.forEach(key => this.cacheBackend.delete(key));
        
        logger.info('Memory cache invalidated', {
          component: 'DBQueryCache',
          keysDeleted: keysToDelete.length
        });
        
      } else {
        // Redis cache invalidation by tags
        await this.cacheBackend.invalidateByTags(tables);
        
        logger.info('Redis cache invalidated by tags', {
          component: 'DBQueryCache',
          tables
        });
      }
      
      this.emit('invalidated', { tables });
      
    } catch (error) {
      logger.error('Failed to invalidate cache by tables', {
        component: 'DBQueryCache',
        tables,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Invalidate cache by patterns
   */
  async invalidateByPatterns(patterns: RegExp[]): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      if (this.cacheBackend instanceof Map) {
        const keysToDelete: string[] = [];
        
        for (const [key, cachedQuery] of this.cacheBackend) {
          if (patterns.some(pattern => pattern.test(cachedQuery.sql))) {
            keysToDelete.push(key);
          }
        }
        
        keysToDelete.forEach(key => this.cacheBackend.delete(key));
        
        logger.info('Cache invalidated by patterns', {
          component: 'DBQueryCache',
          patternsCount: patterns.length,
          keysDeleted: keysToDelete.length
        });
      }
      
      this.emit('invalidated', { patterns });
      
    } catch (error) {
      logger.error('Failed to invalidate cache by patterns', {
        component: 'DBQueryCache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Clear all cached queries
   */
  async clear(): Promise<void> {
    try {
      if (this.cacheBackend instanceof Map) {
        this.cacheBackend.clear();
      } else {
        await this.cacheBackend.clear();
      }
      
      this.initializeStats();
      this.emit('cleared');
      
      logger.info('Database query cache cleared', {
        component: 'DBQueryCache'
      });
      
    } catch (error) {
      logger.error('Failed to clear query cache', {
        component: 'DBQueryCache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): QueryStats {
    return { ...this.queryStats };
  }
  
  /**
   * Get detailed cache info
   */
  async getCacheInfo(): Promise<any> {
    const stats = this.getStats();
    const cacheSize = this.cacheBackend instanceof Map 
      ? this.cacheBackend.size 
      : await this.cacheBackend.size?.() || 0;
    
    return {
      ...stats,
      cacheSize,
      backend: this.config.backend,
      isInitialized: this.isInitialized
    };
  }
  
  /**
   * Add invalidation rule
   */
  addInvalidationRule(rule: InvalidationRule): void {
    this.invalidationRules.push(rule);
  }
  
  /**
   * Process database change event
   */
  async handleDatabaseChange(event: {
    type: 'insert' | 'update' | 'delete';
    table: string;
    data?: any;
  }): Promise<void> {
    if (!this.config.invalidation.autoInvalidate) return;
    
    try {
      // Find matching invalidation rules
      const matchingRules = this.invalidationRules.filter(rule => 
        rule.tables.includes(event.table)
      );
      
      for (const rule of matchingRules) {
        if (rule.action === 'delete') {
          await this.invalidateByPatterns([rule.pattern]);
          
          // Cascade to related patterns
          if (rule.cascadePatterns && this.config.invalidation.cascadeDeletes) {
            await this.invalidateByPatterns(rule.cascadePatterns);
          }
        }
      }
      
      // Also invalidate by table name
      await this.invalidateByTables([event.table]);
      
    } catch (error) {
      logger.error('Failed to handle database change', {
        component: 'DBQueryCache',
        event,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private generateCacheKey(queryKey: QueryCacheKey): string {
    const keyData = {
      sql: queryKey.sql.replace(/\s+/g, ' ').trim(),
      params: queryKey.params,
      db: queryKey.database,
      schema: queryKey.schema
    };
    
    // Create hash of the key data
    const keyString = JSON.stringify(keyData);
    return this.createHash(keyString);
  }
  
  private createHash(input: string): string {
    // Simple hash function for demo - in production use a proper hash like SHA-256
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  private isQueryCacheable(queryKey: QueryCacheKey): boolean {
    // Don't cache if query is too large
    if (queryKey.sql.length > this.config.maxQuerySize) {
      return false;
    }
    
    // Don't cache non-SELECT queries
    const sqlUpper = queryKey.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
      return false;
    }
    
    // Don't cache queries with non-deterministic functions
    const nonDeterministic = ['NOW()', 'CURRENT_TIMESTAMP', 'RAND()', 'RANDOM()'];
    if (nonDeterministic.some(func => sqlUpper.includes(func))) {
      return false;
    }
    
    return true;
  }
  
  private isResultCacheable(result: any): boolean {
    const resultSize = this.estimateSize(result);
    return resultSize <= this.config.maxResultSize;
  }
  
  private estimateSize(obj: any): number {
    try {
      return JSON.stringify(obj).length * 2; // Rough estimate in bytes
    } catch {
      return 0;
    }
  }
  
  private async updateCacheEntry(key: string, cachedQuery: CachedQuery): Promise<void> {
    try {
      if (this.cacheBackend instanceof Map) {
        this.cacheBackend.set(key, cachedQuery);
      } else {
        await this.cacheBackend.set(key, cachedQuery, cachedQuery.ttl);
      }
    } catch (error) {
      logger.debug('Failed to update cache entry access info', {
        component: 'DBQueryCache',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private recordCacheHit(queryKey: QueryCacheKey, responseTime: number): void {
    this.queryStats.totalQueries++;
    this.queryStats.cacheHits++;
    this.queryStats.hitRatio = this.queryStats.cacheHits / this.queryStats.totalQueries;
    
    // Update average cache time
    const totalCacheTime = this.queryStats.avgCacheTime * (this.queryStats.cacheHits - 1);
    this.queryStats.avgCacheTime = (totalCacheTime + responseTime) / this.queryStats.cacheHits;
    
    if (this.config.monitoring.enabled) {
      logger.debug('Query cache hit', {
        component: 'DBQueryCache',
        sql: queryKey.sql.substring(0, 100),
        responseTime
      });
    }
  }
  
  private recordCacheMiss(queryKey: QueryCacheKey): void {
    this.queryStats.totalQueries++;
    this.queryStats.cacheMisses++;
    this.queryStats.hitRatio = this.queryStats.cacheHits / this.queryStats.totalQueries;
    
    if (this.config.monitoring.logMisses) {
      logger.debug('Query cache miss', {
        component: 'DBQueryCache',
        sql: queryKey.sql.substring(0, 100)
      });
    }
  }
  
  private updateQueryStats(queryKey: QueryCacheKey, executionTime: number, resultSize: number): void {
    // Update execution time average
    const totalExecTime = this.queryStats.avgExecutionTime * (this.queryStats.totalQueries - 1);
    this.queryStats.avgExecutionTime = (totalExecTime + executionTime) / this.queryStats.totalQueries;
    
    // Update total cache size
    this.queryStats.totalCacheSize += resultSize;
    
    // Track slow queries
    if (executionTime > this.config.slowQueryThreshold) {
      this.queryStats.slowQueries++;
      
      if (this.config.monitoring.logSlowQueries) {
        logger.warn('Slow query cached', {
          component: 'DBQueryCache',
          sql: queryKey.sql.substring(0, 200),
          executionTime
        });
      }
    }
    
    // Track frequent queries
    if (this.config.enableQueryAnalysis) {
      const normalizedSql = this.queryAnalyzer.normalizeQuery(queryKey.sql);
      const currentCount = this.queryStats.frequentQueries.get(normalizedSql) || 0;
      this.queryStats.frequentQueries.set(normalizedSql, currentCount + 1);
    }
  }
  
  private initializeStats(): void {
    this.queryStats = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatio: 0,
      avgExecutionTime: 0,
      avgCacheTime: 0,
      totalCacheSize: 0,
      slowQueries: 0,
      frequentQueries: new Map()
    };
  }
  
  private setupInvalidationRules(): void {
    // Default invalidation rules
    this.invalidationRules = [
      {
        pattern: /SELECT.*FROM\s+users/i,
        tables: ['users'],
        action: 'delete'
      },
      {
        pattern: /SELECT.*FROM\s+products/i,
        tables: ['products'],
        action: 'delete',
        cascadePatterns: [/SELECT.*FROM\s+categories/i]
      },
      {
        pattern: /SELECT.*FROM\s+orders/i,
        tables: ['orders'],
        action: 'delete',
        cascadePatterns: [/SELECT.*FROM\s+order_items/i]
      }
    ];
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cacheBackend instanceof RedisCacheClient) {
      this.cacheBackend.destroy();
    }
    
    this.removeAllListeners();
    this.isInitialized = false;
    
    logger.info('Database query cache destroyed', {
      component: 'DBQueryCache'
    });
  }
}

/**
 * Query analyzer for extracting metadata from SQL queries
 */
class QueryAnalyzer {
  /**
   * Extract table names from SQL query
   */
  extractTables(sql: string): string[] {
    const tables = new Set<string>();
    const sqlUpper = sql.toUpperCase();
    
    // Simple regex patterns for table extraction
    const patterns = [
      /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        tables.add(match[1].toLowerCase());
      }
    }
    
    return Array.from(tables);
  }
  
  /**
   * Normalize query for pattern matching
   */
  normalizeQuery(sql: string): string {
    return sql
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\b\d+\b/g, '?') // Replace numbers with placeholders
      .replace(/'[^']*'/g, '?') // Replace string literals
      .trim()
      .toUpperCase();
  }
  
  /**
   * Analyze query complexity
   */
  analyzeComplexity(sql: string): number {
    let complexity = 1;
    const sqlUpper = sql.toUpperCase();
    
    // Add complexity for joins
    const joinCount = (sqlUpper.match(/JOIN/g) || []).length;
    complexity += joinCount * 2;
    
    // Add complexity for subqueries
    const subqueryCount = (sqlUpper.match(/\(/g) || []).length;
    complexity += subqueryCount;
    
    // Add complexity for aggregations
    const aggCount = (sqlUpper.match(/(GROUP BY|ORDER BY|HAVING)/g) || []).length;
    complexity += aggCount;
    
    return complexity;
  }
}

/**
 * Compression handler for large query results
 */
class CompressionHandler {
  private config: DBCacheConfig['compression'];
  
  constructor(config: DBCacheConfig['compression']) {
    this.config = config;
  }
  
  async compress(data: any): Promise<any> {
    if (!this.config.enabled) {
      return data;
    }
    
    try {
      const serialized = JSON.stringify(data);
      
      switch (this.config.algorithm) {
        case 'gzip':
          // In a real implementation, use zlib or similar
          return { __compressed: 'gzip', data: serialized };
        case 'lz4':
          return { __compressed: 'lz4', data: serialized };
        case 'snappy':
          return { __compressed: 'snappy', data: serialized };
        default:
          return data;
      }
    } catch (error) {
      logger.error('Compression failed', {
        component: 'CompressionHandler',
        error: error instanceof Error ? error.message : String(error)
      });
      return data;
    }
  }
  
  async decompress(data: any): Promise<any> {
    if (!data || typeof data !== 'object' || !data.__compressed) {
      return data;
    }
    
    try {
      switch (data.__compressed) {
        case 'gzip':
        case 'lz4':
        case 'snappy':
          // In a real implementation, use appropriate decompression
          return JSON.parse(data.data);
        default:
          return data;
      }
    } catch (error) {
      logger.error('Decompression failed', {
        component: 'CompressionHandler',
        error: error instanceof Error ? error.message : String(error)
      });
      return data;
    }
  }
}

export {
  DBQueryCache,
  QueryAnalyzer,
  CompressionHandler
};