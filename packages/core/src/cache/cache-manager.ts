/**
 * Comprehensive Multi-Layer Cache Manager for SightEdit
 * Handles browser-side caching, service workers, memory caching, and cache invalidation
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface CacheConfig {
  // Browser cache settings
  browserCache: {
    enabled: boolean;
    maxSize: number; // MB
    ttl: number; // seconds
    strategies: ('cache-first' | 'network-first' | 'stale-while-revalidate')[];
  };
  
  // Memory cache settings
  memoryCache: {
    enabled: boolean;
    maxEntries: number;
    ttl: number; // seconds
    maxSize: number; // MB
  };
  
  // Service worker settings
  serviceWorker: {
    enabled: boolean;
    swPath: string;
    cacheName: string;
    precacheAssets: string[];
  };
  
  // CDN settings
  cdn: {
    enabled: boolean;
    baseUrl: string;
    edgeLocations: string[];
    cacheHeaders: Record<string, string>;
  };
  
  // Cache invalidation
  invalidation: {
    strategy: 'version-based' | 'timestamp-based' | 'manual';
    batchSize: number;
    propagationDelay: number;
  };
  
  // Performance monitoring
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    reportingEndpoint?: string;
  };
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  version: string;
  size: number;
  accessCount: number;
  lastAccessed: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalSize: number;
  memoryUsage: number;
  averageResponseTime: number;
  evictionCount: number;
  errorCount: number;
  lastUpdated: number;
}

export interface CacheLayer {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  size(): Promise<number>;
  getMetrics(): Promise<Partial<CacheMetrics>>;
}

export interface CacheSetOptions {
  ttl?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  version?: string;
}

export class CacheManager extends EventEmitter {
  private config: CacheConfig;
  private layers: Map<string, CacheLayer> = new Map();
  private metrics: CacheMetrics;
  private isInitialized = false;
  private metricsInterval?: NodeJS.Timeout;
  private versionManager: CacheVersionManager;
  private compressionEnabled = true;
  
  constructor(config: CacheConfig) {
    super();
    this.config = {
      browserCache: {
        enabled: true,
        maxSize: 100,
        ttl: 3600,
        strategies: ['stale-while-revalidate', 'cache-first'],
        ...config.browserCache
      },
      memoryCache: {
        enabled: true,
        maxEntries: 1000,
        ttl: 1800,
        maxSize: 50,
        ...config.memoryCache
      },
      serviceWorker: {
        enabled: true,
        swPath: '/sw-cache.js',
        cacheName: 'sightedit-cache-v1',
        precacheAssets: [],
        ...config.serviceWorker
      },
      cdn: {
        enabled: false,
        baseUrl: '',
        edgeLocations: [],
        cacheHeaders: {
          'Cache-Control': 'public, max-age=31536000',
          'ETag': ''
        },
        ...config.cdn
      },
      invalidation: {
        strategy: 'version-based',
        batchSize: 10,
        propagationDelay: 1000,
        ...config.invalidation
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000,
        ...config.monitoring
      }
    };
    
    this.versionManager = new CacheVersionManager();
    this.initializeMetrics();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing multi-layer cache system', {
        component: 'CacheManager',
        config: {
          browserCache: this.config.browserCache.enabled,
          memoryCache: this.config.memoryCache.enabled,
          serviceWorker: this.config.serviceWorker.enabled,
          cdn: this.config.cdn.enabled
        }
      });
      
      // Initialize cache layers
      if (this.config.memoryCache.enabled) {
        const memoryLayer = new MemoryCacheLayer(this.config.memoryCache);
        this.layers.set('memory', memoryLayer);
      }
      
      if (this.config.browserCache.enabled && typeof window !== 'undefined') {
        const browserLayer = new BrowserCacheLayer(this.config.browserCache);
        await browserLayer.initialize();
        this.layers.set('browser', browserLayer);
      }
      
      if (this.config.serviceWorker.enabled && 'serviceWorker' in navigator) {
        const swLayer = new ServiceWorkerCacheLayer(this.config.serviceWorker);
        await swLayer.initialize();
        this.layers.set('serviceworker', swLayer);
      }
      
      if (this.config.cdn.enabled) {
        const cdnLayer = new CDNCacheLayer(this.config.cdn);
        this.layers.set('cdn', cdnLayer);
      }
      
      // Start monitoring
      if (this.config.monitoring.enabled) {
        this.startMetricsCollection();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Cache system initialized successfully', {
        component: 'CacheManager',
        layersCount: this.layers.size,
        enabledLayers: Array.from(this.layers.keys())
      });
      
    } catch (error) {
      logger.error('Failed to initialize cache system', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get item from cache using cache hierarchy (memory -> browser -> service worker -> network)
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    try {
      // Try each layer in order of speed
      const layerOrder = ['memory', 'browser', 'serviceworker', 'cdn'];
      
      for (const layerName of layerOrder) {
        const layer = this.layers.get(layerName);
        if (!layer) continue;
        
        try {
          const value = await layer.get<T>(key);
          if (value !== null) {
            this.metrics.totalRequests++;
            this.recordHit(layerName, Date.now() - startTime);
            
            // Warm upper layers
            await this.warmUpperLayers(key, value, layerName);
            
            return value;
          }
        } catch (error) {
          logger.warn(`Cache layer ${layerName} failed`, {
            component: 'CacheManager',
            layer: layerName,
            key,
            error: error instanceof Error ? error.message : String(error)
          });
          this.metrics.errorCount++;
        }
      }
      
      this.recordMiss(Date.now() - startTime);
      return null;
      
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Cache get operation failed', {
        component: 'CacheManager',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Set item in all appropriate cache layers
   */
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const version = options.version || this.versionManager.generateVersion();
      const enrichedOptions = {
        ...options,
        version,
        ttl: options.ttl || this.config.memoryCache.ttl
      };
      
      // Set in all layers (except CDN which is read-only)
      const setPromises: Promise<void>[] = [];
      
      for (const [layerName, layer] of this.layers) {
        if (layerName === 'cdn') continue; // CDN is read-only
        
        setPromises.push(
          layer.set(key, value, enrichedOptions).catch(error => {
            logger.warn(`Failed to set in ${layerName} layer`, {
              component: 'CacheManager',
              layer: layerName,
              key,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
      }
      
      await Promise.allSettled(setPromises);
      
      this.emit('set', { key, value, options: enrichedOptions });
      
    } catch (error) {
      logger.error('Cache set operation failed', {
        component: 'CacheManager',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Delete item from all cache layers
   */
  async delete(key: string): Promise<boolean> {
    try {
      const deletePromises: Promise<boolean>[] = [];
      
      for (const layer of this.layers.values()) {
        deletePromises.push(
          layer.delete(key).catch(error => {
            logger.warn('Failed to delete from cache layer', {
              component: 'CacheManager',
              key,
              error: error instanceof Error ? error.message : String(error)
            });
            return false;
          })
        );
      }
      
      const results = await Promise.allSettled(deletePromises);
      const success = results.some(result => result.status === 'fulfilled' && result.value);
      
      if (success) {
        this.emit('delete', { key });
      }
      
      return success;
      
    } catch (error) {
      logger.error('Cache delete operation failed', {
        component: 'CacheManager',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      logger.info('Invalidating cache by tags', {
        component: 'CacheManager',
        tags
      });
      
      const invalidationPromises: Promise<void>[] = [];
      
      for (const layer of this.layers.values()) {
        if ('invalidateByTags' in layer) {
          invalidationPromises.push(
            (layer as any).invalidateByTags(tags).catch((error: Error) => {
              logger.warn('Failed to invalidate by tags in cache layer', {
                component: 'CacheManager',
                tags,
                error: error.message
              });
            })
          );
        }
      }
      
      await Promise.allSettled(invalidationPromises);
      this.emit('invalidated', { tags });
      
    } catch (error) {
      logger.error('Cache invalidation failed', {
        component: 'CacheManager',
        tags,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    try {
      const clearPromises: Promise<void>[] = [];
      
      for (const layer of this.layers.values()) {
        clearPromises.push(
          layer.clear().catch(error => {
            logger.warn('Failed to clear cache layer', {
              component: 'CacheManager',
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
      }
      
      await Promise.allSettled(clearPromises);
      this.initializeMetrics();
      this.emit('cleared');
      
    } catch (error) {
      logger.error('Cache clear operation failed', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get comprehensive cache metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    try {
      // Collect metrics from all layers
      const layerMetrics: Record<string, Partial<CacheMetrics>> = {};
      
      for (const [name, layer] of this.layers) {
        try {
          layerMetrics[name] = await layer.getMetrics();
        } catch (error) {
          logger.warn(`Failed to get metrics from ${name} layer`, {
            component: 'CacheManager',
            layer: name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Aggregate metrics
      const totalSize = Object.values(layerMetrics).reduce(
        (sum, metrics) => sum + (metrics.totalSize || 0), 
        0
      );
      
      this.metrics.totalSize = totalSize;
      this.metrics.lastUpdated = Date.now();
      
      return {
        ...this.metrics,
        layers: layerMetrics
      } as CacheMetrics & { layers: Record<string, Partial<CacheMetrics>> };
      
    } catch (error) {
      logger.error('Failed to get cache metrics', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
      return this.metrics;
    }
  }
  
  /**
   * Preload critical data into cache
   */
  async warmup(entries: Array<{ key: string; fetcher: () => Promise<any>; options?: CacheSetOptions }>): Promise<void> {
    try {
      logger.info('Starting cache warmup', {
        component: 'CacheManager',
        entriesCount: entries.length
      });
      
      const warmupPromises = entries.map(async ({ key, fetcher, options = {} }) => {
        try {
          // Check if already cached
          const cached = await this.get(key);
          if (cached !== null) {
            return; // Already cached
          }
          
          // Fetch and cache
          const value = await fetcher();
          await this.set(key, value, {
            ...options,
            priority: options.priority || 'high'
          });
          
        } catch (error) {
          logger.warn('Cache warmup entry failed', {
            component: 'CacheManager',
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
      
      await Promise.allSettled(warmupPromises);
      
      logger.info('Cache warmup completed', {
        component: 'CacheManager',
        entriesCount: entries.length
      });
      
    } catch (error) {
      logger.error('Cache warmup failed', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Prefetch data based on usage patterns
   */
  async prefetch(keys: string[], fetcher: (key: string) => Promise<any>): Promise<void> {
    try {
      const prefetchPromises = keys.map(async (key) => {
        try {
          // Skip if already cached
          const cached = await this.get(key);
          if (cached !== null) return;
          
          // Fetch and cache with low priority
          const value = await fetcher(key);
          await this.set(key, value, { priority: 'low' });
          
        } catch (error) {
          logger.debug('Prefetch failed for key', {
            component: 'CacheManager',
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
      
      await Promise.allSettled(prefetchPromises);
      
    } catch (error) {
      logger.error('Cache prefetch failed', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private async warmUpperLayers(key: string, value: any, sourceLayer: string): Promise<void> {
    const layerHierarchy = ['memory', 'browser', 'serviceworker', 'cdn'];
    const sourceIndex = layerHierarchy.indexOf(sourceLayer);
    
    // Warm layers above the source layer
    for (let i = 0; i < sourceIndex; i++) {
      const layerName = layerHierarchy[i];
      const layer = this.layers.get(layerName);
      
      if (layer) {
        try {
          await layer.set(key, value);
        } catch (error) {
          logger.debug(`Failed to warm ${layerName} layer`, {
            component: 'CacheManager',
            layer: layerName,
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }
  
  private recordHit(layer: string, responseTime: number): void {
    this.metrics.totalRequests++;
    this.updateAverageResponseTime(responseTime);
    
    // Calculate hit rate
    const totalHits = this.metrics.totalRequests - (this.metrics.totalRequests * this.metrics.missRate);
    this.metrics.hitRate = totalHits / this.metrics.totalRequests;
    this.metrics.missRate = 1 - this.metrics.hitRate;
    
    this.emit('hit', { layer, responseTime });
  }
  
  private recordMiss(responseTime: number): void {
    this.updateAverageResponseTime(responseTime);
    
    // Calculate miss rate
    const totalMisses = this.metrics.totalRequests * this.metrics.missRate + 1;
    this.metrics.missRate = totalMisses / this.metrics.totalRequests;
    this.metrics.hitRate = 1 - this.metrics.missRate;
    
    this.emit('miss', { responseTime });
  }
  
  private updateAverageResponseTime(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const totalRequests = this.metrics.totalRequests;
    
    this.metrics.averageResponseTime = 
      ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      totalSize: 0,
      memoryUsage: 0,
      averageResponseTime: 0,
      evictionCount: 0,
      errorCount: 0,
      lastUpdated: Date.now()
    };
  }
  
  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.getMetrics();
        this.emit('metrics', metrics);
        
        // Report to external endpoint if configured
        if (this.config.monitoring.reportingEndpoint) {
          await this.reportMetrics(metrics);
        }
        
      } catch (error) {
        logger.error('Metrics collection failed', {
          component: 'CacheManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.monitoring.metricsInterval);
  }
  
  private async reportMetrics(metrics: CacheMetrics): Promise<void> {
    try {
      if (!this.config.monitoring.reportingEndpoint) return;
      
      await fetch(this.config.monitoring.reportingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'sightedit-cache',
          metrics,
          timestamp: Date.now()
        })
      });
      
    } catch (error) {
      logger.debug('Failed to report cache metrics', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Cleanup resources and stop background processes
   */
  destroy(): void {
    try {
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = undefined;
      }
      
      // Cleanup layers
      for (const layer of this.layers.values()) {
        if ('destroy' in layer && typeof layer.destroy === 'function') {
          try {
            (layer as any).destroy();
          } catch (error) {
            logger.warn('Failed to destroy cache layer', {
              component: 'CacheManager',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
      
      this.layers.clear();
      this.removeAllListeners();
      this.isInitialized = false;
      
      logger.info('Cache manager destroyed', {
        component: 'CacheManager'
      });
      
    } catch (error) {
      logger.error('Cache manager destruction failed', {
        component: 'CacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Cache version manager for handling cache invalidation
 */
class CacheVersionManager {
  private currentVersion: string;
  
  constructor() {
    this.currentVersion = this.generateVersion();
  }
  
  generateVersion(): string {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getCurrentVersion(): string {
    return this.currentVersion;
  }
  
  updateVersion(): string {
    this.currentVersion = this.generateVersion();
    return this.currentVersion;
  }
  
  isVersionValid(version: string, ttl: number): boolean {
    if (!version) return false;
    
    try {
      const timestamp = parseInt(version.split('-')[0].substring(1));
      return Date.now() - timestamp < ttl * 1000;
    } catch {
      return false;
    }
  }
}

/**
 * Memory cache layer implementation
 */
class MemoryCacheLayer implements CacheLayer {
  name = 'memory';
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig['memoryCache'];
  private metrics: Partial<CacheMetrics> = {};
  
  constructor(config: CacheConfig['memoryCache']) {
    this.config = config;
    this.startEvictionProcess();
  }
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access info
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    return entry.value as T;
  }
  
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    // Check size limits
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLeastRecentlyUsed();
    }
    
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: options.ttl || this.config.ttl,
      version: options.version || 'unknown',
      size: this.estimateSize(value),
      accessCount: 0,
      lastAccessed: Date.now(),
      priority: options.priority || 'medium',
      tags: options.tags || []
    };
    
    this.cache.set(key, entry);
  }
  
  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }
  
  async clear(): Promise<void> {
    this.cache.clear();
  }
  
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  async size(): Promise<number> {
    return this.cache.size;
  }
  
  async getMetrics(): Promise<Partial<CacheMetrics>> {
    const totalSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    return {
      totalSize,
      memoryUsage: totalSize,
      ...this.metrics
    };
  }
  
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate in bytes
    } catch {
      return 1000; // Default estimate
    }
  }
  
  private evictLeastRecentlyUsed(): void {
    let oldestEntry: { key: string; lastAccessed: number } | null = null;
    
    for (const [key, entry] of this.cache) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = { key, lastAccessed: entry.lastAccessed };
      }
    }
    
    if (oldestEntry) {
      this.cache.delete(oldestEntry.key);
    }
  }
  
  private startEvictionProcess(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > entry.ttl * 1000) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}

/**
 * Browser cache layer using Cache API
 */
class BrowserCacheLayer implements CacheLayer {
  name = 'browser';
  private cache?: Cache;
  private config: CacheConfig['browserCache'];
  private cacheName = 'sightedit-browser-cache';
  
  constructor(config: CacheConfig['browserCache']) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if ('caches' in window) {
      this.cache = await caches.open(this.cacheName);
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.cache) return null;
    
    try {
      const response = await this.cache.match(key);
      if (!response) return null;
      
      const data = await response.json();
      
      // Check TTL
      if (data.expires && Date.now() > data.expires) {
        await this.cache.delete(key);
        return null;
      }
      
      return data.value as T;
    } catch {
      return null;
    }
  }
  
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    if (!this.cache) return;
    
    try {
      const expires = Date.now() + ((options.ttl || this.config.ttl) * 1000);
      const data = {
        value,
        expires,
        version: options.version,
        tags: options.tags || []
      };
      
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      await this.cache.put(key, response);
    } catch (error) {
      logger.warn('Failed to set browser cache', {
        component: 'BrowserCacheLayer',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  async delete(key: string): Promise<boolean> {
    if (!this.cache) return false;
    return this.cache.delete(key);
  }
  
  async clear(): Promise<void> {
    if (this.cache) {
      const keys = await this.cache.keys();
      await Promise.all(keys.map(key => this.cache!.delete(key)));
    }
  }
  
  async has(key: string): Promise<boolean> {
    if (!this.cache) return false;
    
    const response = await this.cache.match(key);
    if (!response) return false;
    
    try {
      const data = await response.json();
      return !data.expires || Date.now() <= data.expires;
    } catch {
      return false;
    }
  }
  
  async size(): Promise<number> {
    if (!this.cache) return 0;
    const keys = await this.cache.keys();
    return keys.length;
  }
  
  async getMetrics(): Promise<Partial<CacheMetrics>> {
    if (!this.cache) return {};
    
    try {
      const keys = await this.cache.keys();
      let totalSize = 0;
      
      for (const key of keys.slice(0, 10)) { // Sample for performance
        try {
          const response = await this.cache.match(key);
          if (response) {
            const text = await response.text();
            totalSize += text.length;
          }
        } catch {
          // Skip failed entries
        }
      }
      
      return {
        totalSize: totalSize * (keys.length / Math.min(keys.length, 10)) // Extrapolate
      };
    } catch {
      return {};
    }
  }
}

/**
 * Service Worker cache layer
 */
class ServiceWorkerCacheLayer implements CacheLayer {
  name = 'serviceworker';
  private config: CacheConfig['serviceWorker'];
  private isRegistered = false;
  
  constructor(config: CacheConfig['serviceWorker']) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker not supported', {
        component: 'ServiceWorkerCacheLayer'
      });
      return;
    }
    
    try {
      await navigator.serviceWorker.register(this.config.swPath);
      this.isRegistered = true;
      
      logger.info('Service Worker registered for caching', {
        component: 'ServiceWorkerCacheLayer',
        path: this.config.swPath
      });
    } catch (error) {
      logger.error('Service Worker registration failed', {
        component: 'ServiceWorkerCacheLayer',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.isRegistered) return null;
    
    try {
      // Use message-based communication with service worker
      const response = await this.sendMessage({
        action: 'get',
        key
      });
      
      return response?.value || null;
    } catch {
      return null;
    }
  }
  
  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    if (!this.isRegistered) return;
    
    try {
      await this.sendMessage({
        action: 'set',
        key,
        value,
        options
      });
    } catch (error) {
      logger.warn('Failed to set service worker cache', {
        component: 'ServiceWorkerCacheLayer',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  async delete(key: string): Promise<boolean> {
    if (!this.isRegistered) return false;
    
    try {
      const response = await this.sendMessage({
        action: 'delete',
        key
      });
      
      return response?.success || false;
    } catch {
      return false;
    }
  }
  
  async clear(): Promise<void> {
    if (!this.isRegistered) return;
    
    await this.sendMessage({ action: 'clear' });
  }
  
  async has(key: string): Promise<boolean> {
    if (!this.isRegistered) return false;
    
    try {
      const response = await this.sendMessage({
        action: 'has',
        key
      });
      
      return response?.exists || false;
    } catch {
      return false;
    }
  }
  
  async size(): Promise<number> {
    if (!this.isRegistered) return 0;
    
    try {
      const response = await this.sendMessage({ action: 'size' });
      return response?.size || 0;
    } catch {
      return 0;
    }
  }
  
  async getMetrics(): Promise<Partial<CacheMetrics>> {
    if (!this.isRegistered) return {};
    
    try {
      const response = await this.sendMessage({ action: 'metrics' });
      return response?.metrics || {};
    } catch {
      return {};
    }
  }
  
  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker.controller) {
        reject(new Error('No service worker controller'));
        return;
      }
      
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };
      
      navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
    });
  }
}

/**
 * CDN cache layer (read-only)
 */
class CDNCacheLayer implements CacheLayer {
  name = 'cdn';
  private config: CacheConfig['cdn'];
  
  constructor(config: CacheConfig['cdn']) {
    this.config = config;
  }
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const url = `${this.config.baseUrl}/${key}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          ...this.config.cacheHeaders
        }
      });
      
      if (!response.ok) return null;
      
      return await response.json() as T;
    } catch {
      return null;
    }
  }
  
  async set<T>(_key: string, _value: T, _options?: CacheSetOptions): Promise<void> {
    // CDN is read-only, no-op
  }
  
  async delete(_key: string): Promise<boolean> {
    // CDN is read-only, no-op
    return false;
  }
  
  async clear(): Promise<void> {
    // CDN is read-only, no-op
  }
  
  async has(key: string): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/${key}`;
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async size(): Promise<number> {
    // Cannot determine CDN cache size
    return 0;
  }
  
  async getMetrics(): Promise<Partial<CacheMetrics>> {
    return {};
  }
}

export { CacheManager, MemoryCacheLayer, BrowserCacheLayer, ServiceWorkerCacheLayer, CDNCacheLayer };