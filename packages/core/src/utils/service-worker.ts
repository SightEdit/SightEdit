/**
 * Service Worker integration for SightEdit
 * Provides aggressive caching for better performance
 */

export interface CacheStrategy {
  name: string;
  urls: string[];
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  maxAge?: number;
  maxEntries?: number;
}

export interface ServiceWorkerConfig {
  scope?: string;
  cacheStrategies: CacheStrategy[];
  offlineMode?: boolean;
  debug?: boolean;
}

export class ServiceWorkerManager {
  private config: ServiceWorkerConfig;
  private registration?: ServiceWorkerRegistration;
  private isSupported: boolean;
  
  constructor(config: ServiceWorkerConfig) {
    this.config = {
      scope: '/',
      offlineMode: true,
      debug: false,
      ...config
    };
    
    this.isSupported = 'serviceWorker' in navigator;
  }
  
  async register(scriptUrl: string = '/sw.js'): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Service Worker not supported');
      return false;
    }
    
    try {
      this.registration = await navigator.serviceWorker.register(scriptUrl, {
        scope: this.config.scope
      });
      
      if (this.config.debug) {
        console.log('Service Worker registered:', this.registration);
      }
      
      // Send configuration to service worker
      await this.sendConfig();
      
      // Setup update listeners
      this.setupUpdateHandlers();
      
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }
  
  private async sendConfig(): Promise<void> {
    if (this.registration?.active) {
      this.registration.active.postMessage({
        type: 'CONFIG',
        config: this.config
      });
    }
  }
  
  private setupUpdateHandlers(): void {
    if (!this.registration) return;
    
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration!.installing;
      
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            this.notifyUpdate();
          }
        });
      }
    });
  }
  
  private notifyUpdate(): void {
    if (this.config.debug) {
      console.log('SightEdit update available');
    }
    
    // Emit custom event for the main app to handle
    window.dispatchEvent(new CustomEvent('sightedit-update-available'));
  }
  
  async skipWaiting(): Promise<void> {
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }
  
  async clearCache(cacheName?: string): Promise<void> {
    if (!this.registration?.active) return;
    
    this.registration.active.postMessage({
      type: 'CLEAR_CACHE',
      cacheName
    });
  }
  
  async preloadResources(urls: string[]): Promise<void> {
    if (!this.registration?.active) return;
    
    this.registration.active.postMessage({
      type: 'PRELOAD',
      urls
    });
  }
  
  generateServiceWorkerScript(): string {
    return `
// SightEdit Service Worker
const CACHE_NAME = 'sightedit-v1';
const CACHE_STRATEGIES = new Map();
let CONFIG = null;

self.addEventListener('install', (event) => {
  console.log('SightEdit SW: Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SightEdit SW: Activate');
  event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, config, cacheName, urls } = event.data;
  
  switch (type) {
    case 'CONFIG':
      CONFIG = config;
      setupCacheStrategies(config.cacheStrategies);
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearCache(cacheName);
      break;
      
    case 'PRELOAD':
      preloadResources(urls);
      break;
  }
});

self.addEventListener('fetch', (event) => {
  if (!CONFIG) return;
  
  const request = event.request;
  const strategy = findStrategy(request.url);
  
  if (strategy) {
    event.respondWith(handleRequest(request, strategy));
  }
});

function setupCacheStrategies(strategies) {
  strategies.forEach(strategy => {
    strategy.urls.forEach(url => {
      CACHE_STRATEGIES.set(url, strategy);
    });
  });
}

function findStrategy(url) {
  for (const [pattern, strategy] of CACHE_STRATEGIES) {
    if (url.includes(pattern) || new RegExp(pattern).test(url)) {
      return strategy;
    }
  }
  return null;
}

async function handleRequest(request, strategy) {
  const cache = await caches.open(strategy.name);
  
  switch (strategy.strategy) {
    case 'cache-first':
      return cacheFirst(request, cache, strategy);
    case 'network-first':
      return networkFirst(request, cache, strategy);
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, cache, strategy);
    default:
      return fetch(request);
  }
}

async function cacheFirst(request, cache, strategy) {
  const cached = await cache.match(request);
  
  if (cached && !isExpired(cached, strategy.maxAge)) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await enforceMaxEntries(cache, strategy.maxEntries);
    }
    return response;
  } catch (error) {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cache, strategy) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await enforceMaxEntries(cache, strategy.maxEntries);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cache, strategy) {
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
      enforceMaxEntries(cache, strategy.maxEntries);
    }
    return response;
  }).catch(() => null);
  
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

function isExpired(response, maxAge) {
  if (!maxAge) return false;
  
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return false;
  
  const date = new Date(dateHeader);
  return (Date.now() - date.getTime()) > maxAge;
}

async function enforceMaxEntries(cache, maxEntries) {
  if (!maxEntries) return;
  
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const keysToDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
  } else {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
}

async function preloadResources(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(url => fetch(url).then(response => {
      if (response.ok) {
        return cache.put(url, response);
      }
    }).catch(() => {}))
  );
}
`;
  }
  
  async unregister(): Promise<boolean> {
    if (!this.registration) return false;
    
    try {
      const result = await this.registration.unregister();
      this.registration = undefined;
      return result;
    } catch (error) {
      console.error('Service Worker unregistration failed:', error);
      return false;
    }
  }
}

// Default cache strategies for SightEdit
export const defaultCacheStrategies: CacheStrategy[] = [
  {
    name: 'sightedit-core',
    urls: ['sightedit.min.js', 'sightedit.esm.js', 'core.esm.js'],
    strategy: 'cache-first',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: 10
  },
  {
    name: 'sightedit-editors',
    urls: ['editors/', 'editor-'],
    strategy: 'stale-while-revalidate',
    maxAge: 60 * 60 * 1000, // 1 hour
    maxEntries: 50
  },
  {
    name: 'sightedit-api',
    urls: ['/api/sightedit', '/sightedit/api'],
    strategy: 'network-first',
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxEntries: 100
  },
  {
    name: 'sightedit-assets',
    urls: ['.css', '.woff', '.woff2', '.svg'],
    strategy: 'cache-first',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxEntries: 100
  }
];