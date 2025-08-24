/**
 * SightEdit Service Worker for Advanced Caching
 * Handles cache strategies, offline support, and background sync
 */

declare const self: ServiceWorkerGlobalScope;

interface CacheStrategy {
  name: string;
  handler: (event: FetchEvent) => Promise<Response>;
}

interface CacheConfig {
  cacheName: string;
  version: string;
  strategies: Record<string, string>;
  precacheAssets: string[];
  backgroundSyncQueue: string;
  offlinePagePath: string;
  cachePatterns: Array<{
    pattern: string | RegExp;
    strategy: string;
    ttl?: number;
    priority?: number;
  }>;
  networkTimeoutMs: number;
  maxCacheAge: number;
  maxCacheSize: number;
}

class SightEditServiceWorker {
  private config: CacheConfig;
  private cacheStrategies: Map<string, CacheStrategy> = new Map();
  private backgroundSyncQueue: any[] = [];
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    networkRequests: 0,
    backgroundSyncs: 0,
    errors: 0
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      cacheName: 'sightedit-sw-cache-v1',
      version: '1.0.0',
      strategies: {
        'cache-first': 'cacheFirst',
        'network-first': 'networkFirst',
        'stale-while-revalidate': 'staleWhileRevalidate',
        'network-only': 'networkOnly',
        'cache-only': 'cacheOnly'
      },
      precacheAssets: [
        '/assets/css/editor.css',
        '/assets/js/editor.js',
        '/assets/icons/editor-icons.svg'
      ],
      backgroundSyncQueue: 'sightedit-bg-sync',
      offlinePagePath: '/offline.html',
      cachePatterns: [
        {
          pattern: /\/api\/editor\//,
          strategy: 'network-first',
          ttl: 300 // 5 minutes
        },
        {
          pattern: /\/api\/schema\//,
          strategy: 'stale-while-revalidate',
          ttl: 3600 // 1 hour
        },
        {
          pattern: /\.(css|js|woff2?|png|jpg|svg)$/,
          strategy: 'cache-first',
          ttl: 86400 // 24 hours
        },
        {
          pattern: /\/api\/save/,
          strategy: 'network-first',
          priority: 1
        }
      ],
      networkTimeoutMs: 5000,
      maxCacheAge: 86400 * 7, // 7 days
      maxCacheSize: 50 * 1024 * 1024, // 50MB
      ...config
    };

    this.initializeCacheStrategies();
  }

  /**
   * Initialize cache strategies
   */
  private initializeCacheStrategies(): void {
    // Cache First Strategy
    this.cacheStrategies.set('cacheFirst', {
      name: 'cache-first',
      handler: async (event: FetchEvent): Promise<Response> => {
        try {
          const cache = await caches.open(this.config.cacheName);
          const cachedResponse = await cache.match(event.request);
          
          if (cachedResponse) {
            this.metrics.cacheHits++;
            
            // Background update for dynamic content
            if (this.shouldBackgroundUpdate(event.request)) {
              this.backgroundUpdate(event.request);
            }
            
            return cachedResponse;
          }
          
          const networkResponse = await this.fetchWithTimeout(event.request);
          
          if (networkResponse.ok) {
            await this.cacheResponse(cache, event.request, networkResponse.clone());
          }
          
          this.metrics.networkRequests++;
          return networkResponse;
          
        } catch (error) {
          this.metrics.errors++;
          return this.handleCacheError(event.request, error);
        }
      }
    });

    // Network First Strategy
    this.cacheStrategies.set('networkFirst', {
      name: 'network-first',
      handler: async (event: FetchEvent): Promise<Response> => {
        try {
          const networkResponse = await this.fetchWithTimeout(event.request);
          
          if (networkResponse.ok) {
            const cache = await caches.open(this.config.cacheName);
            await this.cacheResponse(cache, event.request, networkResponse.clone());
          }
          
          this.metrics.networkRequests++;
          return networkResponse;
          
        } catch (error) {
          this.metrics.errors++;
          
          // Fallback to cache
          const cache = await caches.open(this.config.cacheName);
          const cachedResponse = await cache.match(event.request);
          
          if (cachedResponse) {
            this.metrics.cacheHits++;
            return cachedResponse;
          }
          
          return this.handleNetworkError(event.request, error);
        }
      }
    });

    // Stale While Revalidate Strategy
    this.cacheStrategies.set('staleWhileRevalidate', {
      name: 'stale-while-revalidate',
      handler: async (event: FetchEvent): Promise<Response> => {
        const cache = await caches.open(this.config.cacheName);
        const cachedResponse = await cache.match(event.request);
        
        // Always try to update in background
        const networkUpdate = this.fetchWithTimeout(event.request)
          .then(response => {
            if (response.ok) {
              this.cacheResponse(cache, event.request, response.clone());
              this.metrics.networkRequests++;
            }
            return response;
          })
          .catch(error => {
            this.metrics.errors++;
            console.warn('Background update failed:', error);
          });
        
        if (cachedResponse) {
          this.metrics.cacheHits++;
          // Don't await the network update
          networkUpdate.catch(() => {}); // Prevent unhandled rejection
          return cachedResponse;
        }
        
        // No cached version, wait for network
        try {
          const networkResponse = await networkUpdate;
          return networkResponse || this.createErrorResponse('Network unavailable', 503);
        } catch (error) {
          return this.createErrorResponse('Service unavailable', 503);
        }
      }
    });

    // Network Only Strategy
    this.cacheStrategies.set('networkOnly', {
      name: 'network-only',
      handler: async (event: FetchEvent): Promise<Response> => {
        try {
          const response = await this.fetchWithTimeout(event.request);
          this.metrics.networkRequests++;
          return response;
        } catch (error) {
          this.metrics.errors++;
          return this.handleNetworkError(event.request, error);
        }
      }
    });

    // Cache Only Strategy
    this.cacheStrategies.set('cacheOnly', {
      name: 'cache-only',
      handler: async (event: FetchEvent): Promise<Response> => {
        const cache = await caches.open(this.config.cacheName);
        const cachedResponse = await cache.match(event.request);
        
        if (cachedResponse) {
          this.metrics.cacheHits++;
          return cachedResponse;
        }
        
        this.metrics.cacheMisses++;
        return this.createErrorResponse('Resource not cached', 404);
      }
    });
  }

  /**
   * Install event handler
   */
  async handleInstall(event: ExtendableEvent): Promise<void> {
    console.log('SightEdit Service Worker installing...');
    
    event.waitUntil(
      this.precacheAssets()
        .then(() => {
          console.log('SightEdit Service Worker installed successfully');
          return self.skipWaiting();
        })
        .catch(error => {
          console.error('SightEdit Service Worker installation failed:', error);
          throw error;
        })
    );
  }

  /**
   * Activate event handler
   */
  async handleActivate(event: ExtendableEvent): Promise<void> {
    console.log('SightEdit Service Worker activating...');
    
    event.waitUntil(
      Promise.all([
        this.cleanupOldCaches(),
        self.clients.claim()
      ]).then(() => {
        console.log('SightEdit Service Worker activated successfully');
      })
    );
  }

  /**
   * Fetch event handler
   */
  async handleFetch(event: FetchEvent): Promise<void> {
    // Skip non-GET requests and chrome-extension requests
    if (event.request.method !== 'GET' || 
        event.request.url.startsWith('chrome-extension://') ||
        event.request.url.startsWith('moz-extension://')) {
      return;
    }

    // Skip requests with no-cache header
    if (event.request.headers.get('Cache-Control')?.includes('no-cache')) {
      return;
    }

    const strategy = this.determineStrategy(event.request);
    if (!strategy) return;

    event.respondWith(strategy.handler(event));
  }

  /**
   * Message event handler for cache operations
   */
  async handleMessage(event: ExtendableMessageEvent): Promise<void> {
    const { action, key, value, options } = event.data;
    let response: any;

    try {
      switch (action) {
        case 'get':
          response = await this.getMessage(key);
          break;
        case 'set':
          await this.setMessage(key, value, options);
          response = { success: true };
          break;
        case 'delete':
          const deleted = await this.deleteMessage(key);
          response = { success: deleted };
          break;
        case 'clear':
          await this.clearMessages();
          response = { success: true };
          break;
        case 'has':
          const exists = await this.hasMessage(key);
          response = { exists };
          break;
        case 'size':
          const size = await this.getCacheSize();
          response = { size };
          break;
        case 'metrics':
          response = { metrics: await this.getMetrics() };
          break;
        default:
          response = { error: 'Unknown action' };
      }
    } catch (error) {
      response = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    event.ports[0].postMessage(response);
  }

  /**
   * Background sync handler
   */
  async handleBackgroundSync(event: any): Promise<void> {
    if (event.tag === this.config.backgroundSyncQueue) {
      event.waitUntil(this.processBackgroundSync());
    }
  }

  /**
   * Precache critical assets
   */
  private async precacheAssets(): Promise<void> {
    const cache = await caches.open(this.config.cacheName);
    
    const precachePromises = this.config.precacheAssets.map(async (asset) => {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch (error) {
        console.warn(`Failed to precache ${asset}:`, error);
      }
    });
    
    await Promise.allSettled(precachePromises);
  }

  /**
   * Cleanup old cache versions
   */
  private async cleanupOldCaches(): Promise<void> {
    const cacheNames = await caches.keys();
    const currentCache = this.config.cacheName;
    
    const cleanupPromises = cacheNames
      .filter(name => name.startsWith('sightedit-') && name !== currentCache)
      .map(name => caches.delete(name));
    
    await Promise.all(cleanupPromises);
  }

  /**
   * Determine caching strategy for request
   */
  private determineStrategy(request: Request): CacheStrategy | null {
    for (const pattern of this.config.cachePatterns) {
      const matches = typeof pattern.pattern === 'string' 
        ? request.url.includes(pattern.pattern)
        : pattern.pattern.test(request.url);
      
      if (matches) {
        return this.cacheStrategies.get(pattern.strategy) || null;
      }
    }
    
    // Default strategy
    return this.cacheStrategies.get('networkFirst') || null;
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(request: Request, timeout = this.config.networkTimeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(request, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Cache response with metadata
   */
  private async cacheResponse(cache: Cache, request: Request, response: Response): Promise<void> {
    // Don't cache error responses
    if (!response.ok) return;
    
    // Add cache metadata
    const headers = new Headers(response.headers);
    headers.set('sw-cached-at', new Date().toISOString());
    headers.set('sw-cache-version', this.config.version);
    
    const modifiedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    
    await cache.put(request, modifiedResponse);
    
    // Cleanup cache if it's getting too large
    this.cleanupCacheIfNeeded();
  }

  /**
   * Background update for cached resources
   */
  private async backgroundUpdate(request: Request): Promise<void> {
    try {
      const response = await this.fetchWithTimeout(request);
      if (response.ok) {
        const cache = await caches.open(this.config.cacheName);
        await this.cacheResponse(cache, request, response);
      }
    } catch (error) {
      console.debug('Background update failed:', error);
    }
  }

  /**
   * Check if request should get background update
   */
  private shouldBackgroundUpdate(request: Request): boolean {
    // Update API responses in background
    return request.url.includes('/api/') && !request.url.includes('/save');
  }

  /**
   * Handle cache errors
   */
  private async handleCacheError(request: Request, error: any): Promise<Response> {
    console.error('Cache error:', error);
    
    // Try network as fallback
    try {
      return await this.fetchWithTimeout(request);
    } catch (networkError) {
      return this.createErrorResponse('Service unavailable', 503);
    }
  }

  /**
   * Handle network errors
   */
  private async handleNetworkError(request: Request, error: any): Promise<Response> {
    console.error('Network error:', error);
    
    // For navigation requests, serve offline page
    if (request.mode === 'navigate') {
      const cache = await caches.open(this.config.cacheName);
      const offlinePage = await cache.match(this.config.offlinePagePath);
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    return this.createErrorResponse('Network unavailable', 503);
  }

  /**
   * Create error response
   */
  private createErrorResponse(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Process background sync queue
   */
  private async processBackgroundSync(): Promise<void> {
    while (this.backgroundSyncQueue.length > 0) {
      const request = this.backgroundSyncQueue.shift();
      
      try {
        await fetch(request.url, request.options);
        this.metrics.backgroundSyncs++;
      } catch (error) {
        // Re-queue for retry
        this.backgroundSyncQueue.push(request);
        break;
      }
    }
  }

  /**
   * Message-based cache operations
   */
  private async getMessage(key: string): Promise<any> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    const response = await cache.match(key);
    
    if (!response) return null;
    
    try {
      const data = await response.json();
      
      // Check TTL
      if (data.expires && Date.now() > data.expires) {
        await cache.delete(key);
        return null;
      }
      
      return data.value;
    } catch {
      return null;
    }
  }

  private async setMessage(key: string, value: any, options: any = {}): Promise<void> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    
    const expires = options.ttl ? Date.now() + (options.ttl * 1000) : null;
    const data = {
      value,
      expires,
      version: options.version,
      tags: options.tags || []
    };
    
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put(key, response);
  }

  private async deleteMessage(key: string): Promise<boolean> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    return await cache.delete(key);
  }

  private async clearMessages(): Promise<void> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
  }

  private async hasMessage(key: string): Promise<boolean> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    const response = await cache.match(key);
    
    if (!response) return false;
    
    try {
      const data = await response.json();
      return !data.expires || Date.now() <= data.expires;
    } catch {
      return false;
    }
  }

  private async getCacheSize(): Promise<number> {
    const cache = await caches.open(`${this.config.cacheName}-messages`);
    const keys = await cache.keys();
    return keys.length;
  }

  private async getMetrics(): Promise<any> {
    return {
      ...this.metrics,
      cacheSize: await this.getCacheSize(),
      timestamp: Date.now()
    };
  }

  /**
   * Cleanup cache if it exceeds size limits
   */
  private async cleanupCacheIfNeeded(): Promise<void> {
    try {
      const cache = await caches.open(this.config.cacheName);
      
      // Estimate cache size (rough approximation)
      if (await this.estimateCacheSize(cache) > this.config.maxCacheSize) {
        await this.evictOldEntries(cache);
      }
    } catch (error) {
      console.warn('Cache cleanup failed:', error);
    }
  }

  /**
   * Estimate cache size
   */
  private async estimateCacheSize(cache: Cache): Promise<number> {
    const keys = await cache.keys();
    let totalSize = 0;
    
    // Sample a few entries to estimate
    const sampleSize = Math.min(10, keys.length);
    for (let i = 0; i < sampleSize; i++) {
      try {
        const response = await cache.match(keys[i]);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      } catch {
        // Skip failed entries
      }
    }
    
    // Extrapolate total size
    return (totalSize / sampleSize) * keys.length;
  }

  /**
   * Evict old cache entries
   */
  private async evictOldEntries(cache: Cache): Promise<void> {
    const keys = await cache.keys();
    const entries: Array<{ key: Request; cachedAt: number }> = [];
    
    // Get cache timestamps
    for (const key of keys) {
      try {
        const response = await cache.match(key);
        if (response) {
          const cachedAt = response.headers.get('sw-cached-at');
          if (cachedAt) {
            entries.push({
              key,
              cachedAt: new Date(cachedAt).getTime()
            });
          }
        }
      } catch {
        // Skip problematic entries
      }
    }
    
    // Sort by age and evict oldest 20%
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    const evictCount = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < evictCount; i++) {
      await cache.delete(entries[i].key);
    }
  }
}

// Initialize service worker
const swInstance = new SightEditServiceWorker();

// Event listeners
self.addEventListener('install', (event) => {
  swInstance.handleInstall(event);
});

self.addEventListener('activate', (event) => {
  swInstance.handleActivate(event);
});

self.addEventListener('fetch', (event) => {
  swInstance.handleFetch(event);
});

self.addEventListener('message', (event) => {
  swInstance.handleMessage(event);
});

if ('serviceWorker' in self && 'sync' in window) {
  self.addEventListener('sync' as any, (event) => {
    swInstance.handleBackgroundSync(event);
  });
}

// Export for external access
declare const globalThis: any;
globalThis.SightEditServiceWorker = SightEditServiceWorker;