/**
 * Comprehensive Multi-Layer Cache System for SightEdit
 * Main integration module that orchestrates all caching components
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';
import { CacheManager, CacheConfig, CacheSetOptions } from './cache-manager';
import { RedisCacheClient, RedisConfig } from './redis-cache';
import { DBQueryCache, DBCacheConfig, QueryCacheKey } from './db-cache';
import { CacheInvalidationManager, InvalidationConfig, InvalidationEvent } from './cache-invalidation';
import { CacheWarmingManager, WarmingConfig, WarmingTarget } from './cache-warming';
import { CacheMonitor, MonitoringConfig } from './cache-monitoring';
import { CacheFallbackManager, FallbackConfig } from './cache-fallback';
import { CDNCacheManager, CDNConfig } from './cdn-config';

export interface SightEditCacheConfig {
  // Multi-layer cache configuration
  layers: {
    memory: boolean;
    browser: boolean;
    serviceWorker: boolean;
    redis: boolean;
    cdn: boolean;
  };
  
  // Individual layer configurations
  redis?: RedisConfig;
  cdn?: CDNConfig;
  database?: DBCacheConfig;
  
  // Cache management features
  invalidation?: InvalidationConfig;
  warming?: WarmingConfig;
  monitoring?: MonitoringConfig;
  fallback?: FallbackConfig;
  
  // Global settings
  defaultTtl: number;
  maxCacheSize: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  debugMode: boolean;
}

export interface CacheOperation {
  key: string;
  operation: 'get' | 'set' | 'delete' | 'clear';
  layer?: string;
  value?: any;
  options?: CacheSetOptions;
  timestamp: number;
  duration?: number;
  success: boolean;
  error?: string;
}

export interface CacheStats {
  overall: {
    hitRate: number;
    missRate: number;
    totalRequests: number;
    totalSize: number;
    healthScore: number;
  };
  layers: {
    [layerName: string]: {
      hitRate: number;
      responseTime: number;
      size: number;
      isHealthy: boolean;
    };
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
  };
  invalidation: {
    totalInvalidations: number;
    cascadeDepth: number;
    avgPropagationTime: number;
  };
  warming: {
    totalSessions: number;
    hitRateImprovement: number;
    bandwidthSaved: number;
  };
}

/**
 * Main SightEdit Cache System
 * Orchestrates all cache layers and provides unified interface
 */
export class SightEditCache extends EventEmitter {
  private config: SightEditCacheConfig;
  private cacheManager: CacheManager;
  private redisClient?: RedisCacheClient;
  private dbCache?: DBQueryCache;
  private cdnManager?: CDNCacheManager;
  private invalidationManager: CacheInvalidationManager;
  private warmingManager: CacheWarmingManager;
  private monitor: CacheMonitor;
  private fallbackManager: CacheFallbackManager;
  private operationHistory: CacheOperation[] = [];
  private isInitialized = false;
  
  constructor(config: SightEditCacheConfig) {
    super();
    
    this.config = {
      layers: {
        memory: true,
        browser: true,
        serviceWorker: true,
        redis: false,
        cdn: false
      },
      defaultTtl: 3600,
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      compressionEnabled: true,
      encryptionEnabled: false,
      debugMode: false,
      ...config
    };
    
    this.initializeComponents();
  }
  
  /**
   * Initialize the complete cache system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing SightEdit cache system', {
        component: 'SightEditCache',
        layers: Object.keys(this.config.layers).filter(layer => 
          this.config.layers[layer as keyof typeof this.config.layers]
        )
      });
      
      // Initialize components in dependency order
      await this.initializeInOrder();
      
      // Set up inter-component communication
      this.setupEventHandlers();
      
      // Register cache layers with fallback manager
      this.registerCacheLayersWithFallback();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('SightEdit cache system initialized successfully', {
        component: 'SightEditCache'
      });
      
    } catch (error) {
      logger.error('Failed to initialize SightEdit cache system', {
        component: 'SightEditCache',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get item from cache with intelligent fallback
   */
  async get<T>(key: string, options: { layer?: string; bypassFallback?: boolean } = {}): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      let result: T | null;
      
      if (options.layer) {
        // Get from specific layer
        result = await this.getFromSpecificLayer<T>(key, options.layer);
      } else if (options.bypassFallback) {
        // Use cache manager directly
        result = await this.cacheManager.get<T>(key);
      } else {
        // Use fallback manager for resilience
        result = await this.fallbackManager.executeWithFallback<T>('get', key);
      }
      
      // Record access for warming
      this.warmingManager.recordAccess(key, { timestamp: Date.now() });
      
      // Record operation
      this.recordOperation({
        key,
        operation: 'get',
        layer: options.layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: result !== null
      });
      
      return result;
      
    } catch (error) {
      this.recordOperation({
        key,
        operation: 'get',
        layer: options.layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      logger.error('Cache get operation failed', {
        component: 'SightEditCache',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return null;
    }
  }
  
  /**
   * Set item in cache with versioning and invalidation
   */
  async set<T>(
    key: string, 
    value: T, 
    options: CacheSetOptions & { layer?: string; skipInvalidation?: boolean } = {}
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create version if not provided
      if (!options.version && this.invalidationManager) {
        const version = this.invalidationManager.createVersion(value, options.tags || []);
        options = { ...options, version: version.version };
      }
      
      if (options.layer) {
        // Set in specific layer
        await this.setInSpecificLayer(key, value, options.layer, options);
      } else {
        // Use fallback manager for resilience
        await this.fallbackManager.executeWithFallback('set', key, value, options);
      }
      
      // Trigger invalidation if not skipped
      if (!options.skipInvalidation && this.invalidationManager) {
        const invalidationEvent: InvalidationEvent = {
          type: 'content_change',
          source: 'cache_set',
          target: key,
          scope: 'key',
          priority: 'medium',
          propagate: true,
          metadata: { tags: options.tags, version: options.version }
        };
        
        await this.invalidationManager.invalidate(invalidationEvent);
      }
      
      // Record operation
      this.recordOperation({
        key,
        operation: 'set',
        layer: options.layer,
        value,
        options,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: true
      });
      
    } catch (error) {
      this.recordOperation({
        key,
        operation: 'set',
        layer: options.layer,
        value,
        options,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      logger.error('Cache set operation failed', {
        component: 'SightEditCache',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Delete item from cache
   */
  async delete(key: string, options: { layer?: string } = {}): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      let result: boolean;
      
      if (options.layer) {
        result = await this.deleteFromSpecificLayer(key, options.layer);
      } else {
        result = await this.fallbackManager.executeWithFallback<boolean>('delete', key) || false;
      }
      
      // Record operation
      this.recordOperation({
        key,
        operation: 'delete',
        layer: options.layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: result
      });
      
      return result;
      
    } catch (error) {
      this.recordOperation({
        key,
        operation: 'delete',
        layer: options.layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      logger.error('Cache delete operation failed', {
        component: 'SightEditCache',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return false;
    }
  }
  
  /**
   * Clear cache (optionally by layer)
   */
  async clear(layer?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (layer) {
        await this.clearSpecificLayer(layer);
      } else {
        await this.fallbackManager.executeWithFallback('clear', 'all');
      }
      
      this.recordOperation({
        key: 'all',
        operation: 'clear',
        layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: true
      });
      
    } catch (error) {
      this.recordOperation({
        key: 'all',
        operation: 'clear',
        layer,
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Cache database query result
   */
  async cacheQuery<T>(queryKey: QueryCacheKey, fetcher: () => Promise<T>, options: { ttl?: number; tags?: string[] } = {}): Promise<T> {
    if (!this.dbCache) {
      throw new Error('Database cache not configured');
    }
    
    // Try to get from cache first
    const cached = await this.dbCache.get<T>(queryKey);
    if (cached !== null) {
      return cached;
    }
    
    // Execute query and cache result
    const startTime = Date.now();
    const result = await fetcher();
    const executionTime = Date.now() - startTime;
    
    await this.dbCache.set(queryKey, result, executionTime, options);
    return result;
  }
  
  /**
   * Add warming target
   */
  addWarmingTarget(target: WarmingTarget): void {
    if (!this.warmingManager) {
      throw new Error('Cache warming not configured');
    }
    
    this.warmingManager.addTarget(target);
  }
  
  /**
   * Warm critical cache paths
   */
  async warmCriticalPath(userContext?: any): Promise<void> {
    if (!this.warmingManager) return;
    
    await this.warmingManager.warmCriticalPath(userContext);
  }
  
  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    if (!this.invalidationManager) return;
    
    const event: InvalidationEvent = {
      type: 'manual',
      source: 'api_call',
      target: tags,
      scope: 'tag',
      priority: 'high',
      propagate: true
    };
    
    await this.invalidationManager.invalidate(event);
  }
  
  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const cacheMetrics = await this.cacheManager.getMetrics();
    const monitorMetrics = await this.monitor.getMetricsSnapshot(new Map());
    const warmingMetrics = this.warmingManager.getMetrics();
    const invalidationMetrics = this.invalidationManager.getMetrics();
    const fallbackMetrics = this.fallbackManager.getMetrics();
    
    return {
      overall: {
        hitRate: cacheMetrics.hitRate,
        missRate: cacheMetrics.missRate,
        totalRequests: cacheMetrics.totalRequests,
        totalSize: cacheMetrics.totalSize,
        healthScore: monitorMetrics.overall.healthScore
      },
      layers: Object.entries(monitorMetrics.layers).reduce((acc, [name, metrics]) => {
        acc[name] = {
          hitRate: metrics.hitRate,
          responseTime: metrics.averageResponseTime,
          size: metrics.currentSize,
          isHealthy: this.fallbackManager.getHealthStatus().layers.find(l => l.layerName === name)?.isHealthy || false
        };
        return acc;
      }, {} as any),
      performance: {
        averageResponseTime: cacheMetrics.averageResponseTime,
        p95ResponseTime: monitorMetrics.layers.memory?.p95ResponseTime || 0,
        p99ResponseTime: monitorMetrics.layers.memory?.p99ResponseTime || 0,
        errorRate: cacheMetrics.errorCount / Math.max(cacheMetrics.totalRequests, 1)
      },
      invalidation: {
        totalInvalidations: invalidationMetrics.totalInvalidations,
        cascadeDepth: invalidationMetrics.cascadeDepth,
        avgPropagationTime: invalidationMetrics.avgPropagationTime
      },
      warming: {
        totalSessions: warmingMetrics.totalSessions,
        hitRateImprovement: warmingMetrics.hitRateImprovement,
        bandwidthSaved: warmingMetrics.bandwidthUsed
      }
    };
  }
  
  /**
   * Get cache health status
   */
  getHealthStatus(): any {
    return this.fallbackManager.getHealthStatus();
  }
  
  /**
   * Generate performance report
   */
  async generateReport(timeRange: { start: number; end: number }): Promise<any> {
    return await this.monitor.generatePerformanceReport(timeRange);
  }
  
  private initializeComponents(): void {
    // Initialize cache manager
    const cacheConfig: CacheConfig = {
      browserCache: {
        enabled: this.config.layers.browser,
        maxSize: 50,
        ttl: this.config.defaultTtl,
        strategies: ['stale-while-revalidate']
      },
      memoryCache: {
        enabled: this.config.layers.memory,
        maxEntries: 1000,
        ttl: this.config.defaultTtl,
        maxSize: Math.floor(this.config.maxCacheSize / (1024 * 1024))
      },
      serviceWorker: {
        enabled: this.config.layers.serviceWorker,
        swPath: '/sw-cache.js',
        cacheName: 'sightedit-cache-v1',
        precacheAssets: []
      },
      cdn: {
        enabled: this.config.layers.cdn,
        baseUrl: '',
        edgeLocations: [],
        cacheHeaders: {}
      },
      invalidation: {
        strategy: 'version-based',
        batchSize: 10,
        propagationDelay: 1000
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000
      }
    };
    
    this.cacheManager = new CacheManager(cacheConfig);
    
    // Initialize Redis client if enabled
    if (this.config.layers.redis && this.config.redis) {
      this.redisClient = new RedisCacheClient(this.config.redis);
    }
    
    // Initialize database cache if configured
    if (this.config.database) {
      this.dbCache = new DBQueryCache(this.config.database);
    }
    
    // Initialize CDN manager if enabled
    if (this.config.layers.cdn && this.config.cdn) {
      this.cdnManager = new CDNCacheManager(this.config.cdn);
    }
    
    // Initialize invalidation manager
    const invalidationConfig: InvalidationConfig = {
      versioningStrategy: 'hybrid',
      methods: { push: true, pull: true, ttl: true, event: true },
      propagation: { enabled: true, maxDepth: 5, batchSize: 50, delayMs: 100 },
      consistency: 'eventual',
      compression: this.config.compressionEnabled,
      delta: true,
      monitoring: { enabled: true, trackInvalidations: true, reportMetrics: true },
      ...this.config.invalidation
    };
    
    this.invalidationManager = new CacheInvalidationManager(invalidationConfig);
    
    // Initialize warming manager
    const warmingConfig: WarmingConfig = {
      strategies: { critical: true, popular: true, predictive: false, geographic: false, temporal: true },
      timing: { startupWarming: true, scheduleWarming: ['0 2 * * *'], idleWarming: true, beforeExpiry: 300 },
      limits: { maxConcurrentRequests: 5, maxWarmingTime: 30000, maxMemoryUsage: 100 * 1024 * 1024, rateLimitPerSecond: 10 },
      intelligence: { learningEnabled: true, predictionHorizon: 24, patternDetection: true, userBehaviorTracking: true },
      priority: { levels: 5, algorithm: 'weighted', decay: 0.1 },
      ...this.config.warming
    };
    
    this.warmingManager = new CacheWarmingManager(warmingConfig);
    
    // Initialize monitoring
    const monitoringConfig: MonitoringConfig = {
      collection: { enabled: true, interval: 10000, retention: 86400 * 7, batchSize: 100 },
      metrics: { enableRealtime: true, enableHistorical: true, enablePredictive: false, aggregationWindows: [60, 300, 3600, 86400] },
      alerts: {
        enabled: true,
        thresholds: { hitRateLow: 0.8, responseTimeHigh: 1000, errorRateHigh: 0.05, memoryUsageHigh: 0.9, evictionRateHigh: 100 },
        channels: {}
      },
      baselines: { enabled: true, learningPeriod: 86400, adaptiveThresholds: true, confidenceInterval: 0.95 },
      export: { enabled: false, format: 'json', interval: 300000 },
      ...this.config.monitoring
    };
    
    this.monitor = new CacheMonitor(monitoringConfig);
    
    // Initialize fallback manager
    const fallbackConfig: FallbackConfig = {
      strategies: { layerFailover: true, gracefulDegradation: true, circuitBreaker: true, retryWithBackoff: true, cacheBypass: false },
      healthCheck: { enabled: true, interval: 30000, timeout: 5000, consecutiveFailures: 3, recoveryThreshold: 2 },
      circuitBreaker: { failureThreshold: 5, recoveryTimeout: 60000, successThreshold: 3, halfOpenMaxCalls: 3 },
      retry: { maxAttempts: 3, initialDelay: 1000, maxDelay: 30000, backoffMultiplier: 2, jitterEnabled: true },
      performance: { responseTimeThreshold: 1000, errorRateThreshold: 0.1, memoryPressureThreshold: 0.8, cpuUsageThreshold: 0.8 },
      layerPriority: ['memory', 'redis', 'browser', 'serviceworker', 'cdn'],
      ...this.config.fallback
    };
    
    this.fallbackManager = new CacheFallbackManager(fallbackConfig);
  }
  
  private async initializeInOrder(): Promise<void> {
    // Initialize in dependency order
    await this.invalidationManager.initialize();
    await this.warmingManager.initialize();
    await this.monitor.initialize();
    await this.fallbackManager.initialize();
    
    if (this.redisClient) {
      await this.redisClient.connect();
    }
    
    if (this.dbCache) {
      await this.dbCache.initialize();
    }
    
    if (this.cdnManager) {
      await this.cdnManager.initialize();
    }
    
    await this.cacheManager.initialize();
  }
  
  private setupEventHandlers(): void {
    // Connect invalidation events to cache manager
    this.invalidationManager.on('invalidateKey', ({ key }) => {
      this.cacheManager.delete(key);
    });
    
    this.invalidationManager.on('invalidateByTags', ({ tags }) => {
      this.cacheManager.invalidateByTags(tags);
    });
    
    // Connect warming events to cache manager
    this.warmingManager.on('warmingData', ({ key, data }) => {
      this.cacheManager.set(key, data);
    });
    
    // Connect monitoring events
    this.monitor.on('alert', (alert) => {
      this.emit('alert', alert);
    });
    
    // Connect fallback events
    this.fallbackManager.on('layerHealthChanged', (event) => {
      this.emit('layerHealthChanged', event);
    });
    
    this.fallbackManager.on('degradationLevelChanged', (event) => {
      this.emit('degradationLevelChanged', event);
    });
  }
  
  private registerCacheLayersWithFallback(): void {
    // Register cache manager as the main cache layer
    this.fallbackManager.registerCacheLayer('memory', this.cacheManager);
    
    if (this.redisClient) {
      this.fallbackManager.registerCacheLayer('redis', this.redisClient);
    }
    
    if (this.cdnManager) {
      this.fallbackManager.registerCacheLayer('cdn', this.cdnManager);
    }
  }
  
  private async getFromSpecificLayer<T>(key: string, layer: string): Promise<T | null> {
    switch (layer) {
      case 'memory':
      case 'browser':
      case 'serviceworker':
        return await this.cacheManager.get<T>(key);
      
      case 'redis':
        if (!this.redisClient) throw new Error('Redis not configured');
        return await this.redisClient.get<T>(key);
      
      case 'cdn':
        if (!this.cdnManager) throw new Error('CDN not configured');
        // CDN would be read-only
        return null;
      
      default:
        throw new Error(`Unknown cache layer: ${layer}`);
    }
  }
  
  private async setInSpecificLayer<T>(key: string, value: T, layer: string, options: CacheSetOptions): Promise<void> {
    switch (layer) {
      case 'memory':
      case 'browser':
      case 'serviceworker':
        await this.cacheManager.set(key, value, options);
        break;
      
      case 'redis':
        if (!this.redisClient) throw new Error('Redis not configured');
        await this.redisClient.set(key, value, options.ttl, options.tags);
        break;
      
      case 'cdn':
        throw new Error('CDN is read-only');
      
      default:
        throw new Error(`Unknown cache layer: ${layer}`);
    }
  }
  
  private async deleteFromSpecificLayer(key: string, layer: string): Promise<boolean> {
    switch (layer) {
      case 'memory':
      case 'browser':
      case 'serviceworker':
        return await this.cacheManager.delete(key);
      
      case 'redis':
        if (!this.redisClient) throw new Error('Redis not configured');
        return await this.redisClient.delete(key);
      
      case 'cdn':
        throw new Error('CDN does not support delete');
      
      default:
        throw new Error(`Unknown cache layer: ${layer}`);
    }
  }
  
  private async clearSpecificLayer(layer: string): Promise<void> {
    switch (layer) {
      case 'memory':
      case 'browser':
      case 'serviceworker':
        await this.cacheManager.clear();
        break;
      
      case 'redis':
        if (!this.redisClient) throw new Error('Redis not configured');
        await this.redisClient.clear();
        break;
      
      case 'cdn':
        throw new Error('CDN does not support clear');
      
      default:
        throw new Error(`Unknown cache layer: ${layer}`);
    }
  }
  
  private recordOperation(operation: CacheOperation): void {
    this.operationHistory.push(operation);
    
    // Keep history size manageable
    if (this.operationHistory.length > 1000) {
      this.operationHistory.shift();
    }
    
    // Record with monitor
    this.monitor.recordOperation(
      operation.layer || 'multi-layer',
      operation.success ? 'hit' : 'miss',
      operation.duration
    );
    
    if (this.config.debugMode) {
      logger.debug('Cache operation recorded', {
        component: 'SightEditCache',
        operation: operation.operation,
        key: operation.key,
        success: operation.success,
        duration: operation.duration
      });
    }
  }
  
  /**
   * Cleanup all cache components
   */
  async destroy(): Promise<void> {
    try {
      logger.info('Destroying SightEdit cache system', {
        component: 'SightEditCache'
      });
      
      // Destroy components in reverse order
      this.cacheManager.destroy();
      
      if (this.cdnManager) {
        this.cdnManager.destroy();
      }
      
      if (this.dbCache) {
        this.dbCache.destroy();
      }
      
      if (this.redisClient) {
        await this.redisClient.disconnect();
        this.redisClient.destroy();
      }
      
      this.fallbackManager.destroy();
      this.monitor.destroy();
      this.warmingManager.destroy();
      this.invalidationManager.destroy();
      
      this.operationHistory = [];
      this.removeAllListeners();
      this.isInitialized = false;
      
      logger.info('SightEdit cache system destroyed', {
        component: 'SightEditCache'
      });
      
    } catch (error) {
      logger.error('Error destroying SightEdit cache system', {
        component: 'SightEditCache',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export all cache-related types and classes
export {
  // Individual components (SightEditCache already exported as class above)
  CacheManager,
  RedisCacheClient,
  DBQueryCache,
  CacheInvalidationManager,
  CacheWarmingManager,
  CacheMonitor,
  CacheFallbackManager,
  CDNCacheManager,
  
  // Types (interfaces exported normally for Rollup compatibility)
  CacheConfig,
  RedisConfig,
  DBCacheConfig,
  InvalidationConfig,
  WarmingConfig,
  MonitoringConfig,
  FallbackConfig,
  CDNConfig,
  CacheSetOptions,
  QueryCacheKey,
  WarmingTarget,
  InvalidationEvent,
  CacheOperation,
  CacheStats
};

// Create default cache instance factory
export function createSightEditCache(config: Partial<SightEditCacheConfig> = {}): SightEditCache {
  const defaultConfig: SightEditCacheConfig = {
    layers: {
      memory: true,
      browser: true,
      serviceWorker: false,
      redis: false,
      cdn: false
    },
    defaultTtl: 3600,
    maxCacheSize: 50 * 1024 * 1024,
    compressionEnabled: true,
    encryptionEnabled: false,
    debugMode: false,
    ...config
  };
  
  return new SightEditCache(defaultConfig);
}