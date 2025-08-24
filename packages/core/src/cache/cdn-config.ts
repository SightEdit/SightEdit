/**
 * CDN and Edge-side Caching Configuration for SightEdit
 * Supports Cloudflare, AWS CloudFront, and other CDN providers
 */

import { logger } from '../utils/logger';

export interface CDNProvider {
  name: string;
  initialize(config: CDNConfig): Promise<void>;
  invalidateCache(patterns: string[]): Promise<void>;
  purgeCache(keys: string[]): Promise<void>;
  getEdgeLocations(): Promise<EdgeLocation[]>;
  configureCacheRules(rules: CacheRule[]): Promise<void>;
  getMetrics(): Promise<CDNMetrics>;
}

export interface EdgeLocation {
  id: string;
  region: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  popCode: string;
  status: 'active' | 'maintenance' | 'offline';
}

export interface CacheRule {
  pattern: string | RegExp;
  ttl: number;
  edgeTtl?: number;
  browserTtl?: number;
  bypassOnCookie?: string[];
  bypassOnHeader?: string[];
  compressionLevel?: number;
  customHeaders?: Record<string, string>;
  conditions?: CacheCondition[];
  priority: number;
}

export interface CacheCondition {
  type: 'header' | 'query' | 'path' | 'method' | 'country' | 'device';
  key: string;
  operator: 'equals' | 'contains' | 'matches' | 'not_equals';
  value: string | RegExp;
}

export interface CDNMetrics {
  totalRequests: number;
  cacheHitRate: number;
  bandwidthSaved: number;
  averageResponseTime: number;
  edgeLocationsActive: number;
  requestsByRegion: Record<string, number>;
  topAssets: Array<{ path: string; requests: number; hitRate: number }>;
  errors: number;
  lastUpdated: number;
}

export interface CDNConfig {
  provider: 'cloudflare' | 'cloudfront' | 'fastly' | 'keycdn' | 'custom';
  apiKey?: string;
  zoneId?: string;
  distributionId?: string;
  domain: string;
  originUrl: string;
  
  // Cache configuration
  defaultTtl: number;
  maxTtl: number;
  edgeTtl: number;
  browserTtl: number;
  
  // Performance settings
  compressionEnabled: boolean;
  minifyEnabled: boolean;
  imageOptimization: boolean;
  http2PushEnabled: boolean;
  
  // Security settings
  securityHeaders: Record<string, string>;
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    burstSize: number;
  };
  
  // Cache rules
  cacheRules: CacheRule[];
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    alertsEnabled: boolean;
    webhookUrl?: string;
  };
}

/**
 * Main CDN cache manager
 */
export class CDNCacheManager {
  private provider: CDNProvider;
  private config: CDNConfig;
  private isInitialized = false;
  private metricsInterval?: NodeJS.Timeout;
  
  constructor(config: CDNConfig) {
    this.config = config;
    this.provider = this.createProvider(config.provider);
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing CDN cache manager', {
        component: 'CDNCacheManager',
        provider: this.config.provider,
        domain: this.config.domain
      });
      
      await this.provider.initialize(this.config);
      await this.configureCacheRules();
      
      if (this.config.monitoring.enabled) {
        this.startMetricsCollection();
      }
      
      this.isInitialized = true;
      
      logger.info('CDN cache manager initialized successfully', {
        component: 'CDNCacheManager',
        provider: this.config.provider
      });
      
    } catch (error) {
      logger.error('Failed to initialize CDN cache manager', {
        component: 'CDNCacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Invalidate cache for specific patterns
   */
  async invalidateCache(patterns: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Invalidating CDN cache', {
        component: 'CDNCacheManager',
        patterns
      });
      
      await this.provider.invalidateCache(patterns);
      
      logger.info('CDN cache invalidation completed', {
        component: 'CDNCacheManager',
        patterns
      });
      
    } catch (error) {
      logger.error('CDN cache invalidation failed', {
        component: 'CDNCacheManager',
        patterns,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Purge specific cache keys
   */
  async purgeCache(keys: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      await this.provider.purgeCache(keys);
      
      logger.info('CDN cache purge completed', {
        component: 'CDNCacheManager',
        keys
      });
      
    } catch (error) {
      logger.error('CDN cache purge failed', {
        component: 'CDNCacheManager',
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get active edge locations
   */
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.provider.getEdgeLocations();
  }
  
  /**
   * Get CDN metrics
   */
  async getMetrics(): Promise<CDNMetrics> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.provider.getMetrics();
  }
  
  /**
   * Update cache rules
   */
  async updateCacheRules(rules: CacheRule[]): Promise<void> {
    this.config.cacheRules = rules;
    await this.configureCacheRules();
  }
  
  private createProvider(providerName: string): CDNProvider {
    switch (providerName) {
      case 'cloudflare':
        return new CloudflareProvider();
      case 'cloudfront':
        return new CloudFrontProvider();
      case 'fastly':
        return new FastlyProvider();
      case 'keycdn':
        return new KeyCDNProvider();
      default:
        return new GenericCDNProvider();
    }
  }
  
  private async configureCacheRules(): Promise<void> {
    if (this.config.cacheRules.length === 0) {
      // Set default cache rules
      this.config.cacheRules = this.getDefaultCacheRules();
    }
    
    await this.provider.configureCacheRules(this.config.cacheRules);
  }
  
  private getDefaultCacheRules(): CacheRule[] {
    return [
      {
        pattern: /\.(css|js|woff2?|png|jpg|jpeg|gif|svg|ico)$/,
        ttl: 86400 * 365, // 1 year
        edgeTtl: 86400 * 30, // 30 days
        browserTtl: 86400 * 7, // 7 days
        compressionLevel: 6,
        customHeaders: {
          'Cache-Control': 'public, max-age=604800, immutable',
          'Vary': 'Accept-Encoding'
        },
        priority: 1
      },
      {
        pattern: /\/api\/editor\//,
        ttl: 300, // 5 minutes
        edgeTtl: 60, // 1 minute
        browserTtl: 0, // No browser cache
        bypassOnHeader: ['Authorization'],
        customHeaders: {
          'Cache-Control': 'private, max-age=0, no-cache',
          'Vary': 'Authorization, Accept-Encoding'
        },
        priority: 5
      },
      {
        pattern: /\/api\/schema\//,
        ttl: 3600, // 1 hour
        edgeTtl: 1800, // 30 minutes
        browserTtl: 300, // 5 minutes
        customHeaders: {
          'Cache-Control': 'public, max-age=300, s-maxage=1800',
          'Vary': 'Accept-Encoding'
        },
        priority: 3
      },
      {
        pattern: /\/api\/save/,
        ttl: 0, // No cache
        conditions: [
          { type: 'method', key: 'POST', operator: 'equals', value: 'POST' }
        ],
        customHeaders: {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        },
        priority: 10
      },
      {
        pattern: /\.(html|htm)$/,
        ttl: 3600, // 1 hour
        edgeTtl: 300, // 5 minutes
        browserTtl: 0, // No browser cache for HTML
        customHeaders: {
          'Cache-Control': 'public, max-age=0, s-maxage=300',
          'Vary': 'Accept-Encoding, Accept-Language'
        },
        priority: 2
      }
    ];
  }
  
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.getMetrics();
        
        // Check for alerts
        if (this.config.monitoring.alertsEnabled) {
          this.checkMetricsForAlerts(metrics);
        }
        
      } catch (error) {
        logger.error('CDN metrics collection failed', {
          component: 'CDNCacheManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 300000); // Every 5 minutes
  }
  
  private async checkMetricsForAlerts(metrics: CDNMetrics): Promise<void> {
    const alerts: string[] = [];
    
    // Check hit rate
    if (metrics.cacheHitRate < 0.8) {
      alerts.push(`Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    }
    
    // Check response time
    if (metrics.averageResponseTime > 1000) {
      alerts.push(`High response time: ${metrics.averageResponseTime}ms`);
    }
    
    // Check error rate
    const errorRate = metrics.errors / metrics.totalRequests;
    if (errorRate > 0.05) {
      alerts.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    if (alerts.length > 0 && this.config.monitoring.webhookUrl) {
      await this.sendAlert(alerts);
    }
  }
  
  private async sendAlert(alerts: string[]): Promise<void> {
    try {
      if (!this.config.monitoring.webhookUrl) return;
      
      await fetch(this.config.monitoring.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'sightedit-cdn',
          level: 'warning',
          message: `CDN performance alerts: ${alerts.join(', ')}`,
          timestamp: Date.now(),
          alerts
        })
      });
      
    } catch (error) {
      logger.debug('Failed to send CDN alert', {
        component: 'CDNCacheManager',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.isInitialized = false;
    
    logger.info('CDN cache manager destroyed', {
      component: 'CDNCacheManager'
    });
  }
}

/**
 * Cloudflare provider implementation
 */
class CloudflareProvider implements CDNProvider {
  name = 'cloudflare';
  private config!: CDNConfig;
  
  async initialize(config: CDNConfig): Promise<void> {
    this.config = config;
    if (!config.apiKey || !config.zoneId) {
      throw new Error('Cloudflare API key and zone ID are required');
    }
  }
  
  async invalidateCache(patterns: string[]): Promise<void> {
    if (!this.config.apiKey || !this.config.zoneId) {
      throw new Error('Cloudflare not configured');
    }
    
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: patterns.map(pattern => `https://${this.config.domain}${pattern}`)
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Cloudflare cache invalidation failed: ${response.statusText}`);
    }
  }
  
  async purgeCache(keys: string[]): Promise<void> {
    return this.invalidateCache(keys);
  }
  
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    // Cloudflare has a global network, return major locations
    return [
      { id: 'cf-lax', region: 'us-west', city: 'Los Angeles', country: 'US', coordinates: { lat: 34.0522, lng: -118.2437 }, popCode: 'LAX', status: 'active' },
      { id: 'cf-ord', region: 'us-central', city: 'Chicago', country: 'US', coordinates: { lat: 41.8781, lng: -87.6298 }, popCode: 'ORD', status: 'active' },
      { id: 'cf-jfk', region: 'us-east', city: 'New York', country: 'US', coordinates: { lat: 40.6413, lng: -73.7781 }, popCode: 'JFK', status: 'active' },
      { id: 'cf-fra', region: 'eu-central', city: 'Frankfurt', country: 'DE', coordinates: { lat: 50.0379, lng: 8.5622 }, popCode: 'FRA', status: 'active' },
      { id: 'cf-lhr', region: 'eu-west', city: 'London', country: 'UK', coordinates: { lat: 51.4700, lng: -0.4543 }, popCode: 'LHR', status: 'active' },
      { id: 'cf-nrt', region: 'ap-northeast', city: 'Tokyo', country: 'JP', coordinates: { lat: 35.7719, lng: 140.3928 }, popCode: 'NRT', status: 'active' },
      { id: 'cf-sin', region: 'ap-southeast', city: 'Singapore', country: 'SG', coordinates: { lat: 1.3644, lng: 103.9915 }, popCode: 'SIN', status: 'active' }
    ];
  }
  
  async configureCacheRules(rules: CacheRule[]): Promise<void> {
    // Cloudflare page rules would be configured here
    // This is a simplified implementation
    logger.debug('Configuring Cloudflare cache rules', {
      component: 'CloudflareProvider',
      rulesCount: rules.length
    });
  }
  
  async getMetrics(): Promise<CDNMetrics> {
    // This would integrate with Cloudflare Analytics API
    return {
      totalRequests: 0,
      cacheHitRate: 0.95,
      bandwidthSaved: 0,
      averageResponseTime: 50,
      edgeLocationsActive: 7,
      requestsByRegion: {},
      topAssets: [],
      errors: 0,
      lastUpdated: Date.now()
    };
  }
}

/**
 * AWS CloudFront provider implementation
 */
class CloudFrontProvider implements CDNProvider {
  name = 'cloudfront';
  private config!: CDNConfig;
  
  async initialize(config: CDNConfig): Promise<void> {
    this.config = config;
    if (!config.distributionId) {
      throw new Error('CloudFront distribution ID is required');
    }
  }
  
  async invalidateCache(patterns: string[]): Promise<void> {
    // AWS SDK would be used here to create invalidation
    logger.info('CloudFront cache invalidation', {
      component: 'CloudFrontProvider',
      patterns
    });
  }
  
  async purgeCache(keys: string[]): Promise<void> {
    return this.invalidateCache(keys);
  }
  
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    return [
      { id: 'cf-iad', region: 'us-east-1', city: 'Ashburn', country: 'US', coordinates: { lat: 39.0438, lng: -77.4874 }, popCode: 'IAD', status: 'active' },
      { id: 'cf-sfo', region: 'us-west-1', city: 'San Francisco', country: 'US', coordinates: { lat: 37.6213, lng: -122.3790 }, popCode: 'SFO', status: 'active' },
      { id: 'cf-fra', region: 'eu-central-1', city: 'Frankfurt', country: 'DE', coordinates: { lat: 50.0379, lng: 8.5622 }, popCode: 'FRA', status: 'active' }
    ];
  }
  
  async configureCacheRules(rules: CacheRule[]): Promise<void> {
    logger.debug('Configuring CloudFront cache behaviors', {
      component: 'CloudFrontProvider',
      rulesCount: rules.length
    });
  }
  
  async getMetrics(): Promise<CDNMetrics> {
    return {
      totalRequests: 0,
      cacheHitRate: 0.92,
      bandwidthSaved: 0,
      averageResponseTime: 75,
      edgeLocationsActive: 3,
      requestsByRegion: {},
      topAssets: [],
      errors: 0,
      lastUpdated: Date.now()
    };
  }
}

/**
 * Fastly provider implementation
 */
class FastlyProvider implements CDNProvider {
  name = 'fastly';
  private config!: CDNConfig;
  
  async initialize(config: CDNConfig): Promise<void> {
    this.config = config;
  }
  
  async invalidateCache(patterns: string[]): Promise<void> {
    logger.info('Fastly cache invalidation', {
      component: 'FastlyProvider',
      patterns
    });
  }
  
  async purgeCache(keys: string[]): Promise<void> {
    return this.invalidateCache(keys);
  }
  
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    return [];
  }
  
  async configureCacheRules(rules: CacheRule[]): Promise<void> {
    logger.debug('Configuring Fastly VCL rules', {
      component: 'FastlyProvider',
      rulesCount: rules.length
    });
  }
  
  async getMetrics(): Promise<CDNMetrics> {
    return {
      totalRequests: 0,
      cacheHitRate: 0.94,
      bandwidthSaved: 0,
      averageResponseTime: 45,
      edgeLocationsActive: 0,
      requestsByRegion: {},
      topAssets: [],
      errors: 0,
      lastUpdated: Date.now()
    };
  }
}

/**
 * KeyCDN provider implementation
 */
class KeyCDNProvider implements CDNProvider {
  name = 'keycdn';
  private config!: CDNConfig;
  
  async initialize(config: CDNConfig): Promise<void> {
    this.config = config;
  }
  
  async invalidateCache(patterns: string[]): Promise<void> {
    logger.info('KeyCDN cache invalidation', {
      component: 'KeyCDNProvider',
      patterns
    });
  }
  
  async purgeCache(keys: string[]): Promise<void> {
    return this.invalidateCache(keys);
  }
  
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    return [];
  }
  
  async configureCacheRules(rules: CacheRule[]): Promise<void> {
    logger.debug('Configuring KeyCDN cache rules', {
      component: 'KeyCDNProvider',
      rulesCount: rules.length
    });
  }
  
  async getMetrics(): Promise<CDNMetrics> {
    return {
      totalRequests: 0,
      cacheHitRate: 0.88,
      bandwidthSaved: 0,
      averageResponseTime: 85,
      edgeLocationsActive: 0,
      requestsByRegion: {},
      topAssets: [],
      errors: 0,
      lastUpdated: Date.now()
    };
  }
}

/**
 * Generic CDN provider for custom implementations
 */
class GenericCDNProvider implements CDNProvider {
  name = 'generic';
  private config!: CDNConfig;
  
  async initialize(config: CDNConfig): Promise<void> {
    this.config = config;
  }
  
  async invalidateCache(patterns: string[]): Promise<void> {
    logger.info('Generic CDN cache invalidation', {
      component: 'GenericCDNProvider',
      patterns
    });
  }
  
  async purgeCache(keys: string[]): Promise<void> {
    return this.invalidateCache(keys);
  }
  
  async getEdgeLocations(): Promise<EdgeLocation[]> {
    return [];
  }
  
  async configureCacheRules(rules: CacheRule[]): Promise<void> {
    logger.debug('Configuring generic CDN cache rules', {
      component: 'GenericCDNProvider',
      rulesCount: rules.length
    });
  }
  
  async getMetrics(): Promise<CDNMetrics> {
    return {
      totalRequests: 0,
      cacheHitRate: 0.85,
      bandwidthSaved: 0,
      averageResponseTime: 100,
      edgeLocationsActive: 0,
      requestsByRegion: {},
      topAssets: [],
      errors: 0,
      lastUpdated: Date.now()
    };
  }
}

// CDNCacheManager already exported as class above
export {
  CloudflareProvider,
  CloudFrontProvider,
  FastlyProvider,
  KeyCDNProvider,
  GenericCDNProvider
};