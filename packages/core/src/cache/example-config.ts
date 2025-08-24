/**
 * Example configurations for SightEdit Advanced Caching System
 * Demonstrates various configuration scenarios and best practices
 */

import { SightEditCacheConfig } from './index';

/**
 * Development configuration
 * Optimized for development with debugging enabled
 */
export const developmentCacheConfig: SightEditCacheConfig = {
  layers: {
    memory: true,
    browser: true,
    serviceWorker: false, // Disable SW for easier debugging
    redis: false,
    cdn: false
  },
  defaultTtl: 300, // 5 minutes for rapid development
  maxCacheSize: 10 * 1024 * 1024, // 10MB
  compressionEnabled: false, // Disable for debugging
  encryptionEnabled: false,
  debugMode: true,
  
  monitoring: {
    collection: {
      enabled: true,
      interval: 5000, // More frequent in development
      retention: 3600, // 1 hour retention
      batchSize: 10
    },
    metrics: {
      enableRealtime: true,
      enableHistorical: false,
      enablePredictive: false,
      aggregationWindows: [60, 300] // Short windows for dev
    },
    alerts: {
      enabled: false // Disable alerts in development
    }
  }
};

/**
 * Production configuration
 * Optimized for high performance and reliability
 */
export const productionCacheConfig: SightEditCacheConfig = {
  layers: {
    memory: true,
    browser: true,
    serviceWorker: true,
    redis: true,
    cdn: true
  },
  defaultTtl: 3600, // 1 hour
  maxCacheSize: 200 * 1024 * 1024, // 200MB
  compressionEnabled: true,
  encryptionEnabled: true,
  debugMode: false,
  
  redis: {
    host: process.env.REDIS_HOST || 'redis-cluster.internal',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    database: 0,
    maxConnections: 20,
    minConnections: 5,
    connectionTimeout: 5000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetries: 3,
    cluster: {
      enabled: true,
      nodes: [
        { host: 'redis1.internal', port: 6379 },
        { host: 'redis2.internal', port: 6379 },
        { host: 'redis3.internal', port: 6379 }
      ],
      failoverTimeout: 5000
    },
    sentinel: {
      enabled: false,
      hosts: [],
      masterName: 'mymaster'
    },
    defaultTtl: 3600,
    maxMemory: '2gb',
    evictionPolicy: 'allkeys-lru',
    serialization: {
      compress: true,
      compressionLevel: 6,
      encoding: 'json'
    },
    ssl: {
      enabled: process.env.NODE_ENV === 'production',
      cert: process.env.REDIS_SSL_CERT,
      key: process.env.REDIS_SSL_KEY,
      ca: process.env.REDIS_SSL_CA
    },
    monitoring: {
      enabled: true,
      metricsInterval: 60000,
      slowLogEnabled: true,
      slowLogThreshold: 1000
    }
  },
  
  cdn: {
    provider: 'cloudflare',
    apiKey: process.env.CLOUDFLARE_API_KEY,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    domain: 'cdn.example.com',
    originUrl: 'https://api.example.com',
    defaultTtl: 86400,
    maxTtl: 86400 * 30,
    edgeTtl: 86400 * 7,
    browserTtl: 86400,
    compressionEnabled: true,
    minifyEnabled: true,
    imageOptimization: true,
    http2PushEnabled: true,
    securityHeaders: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    },
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 1000,
      burstSize: 100
    },
    cacheRules: [
      {
        pattern: /\.(css|js|woff2?|png|jpg|jpeg|gif|svg|ico)$/,
        ttl: 86400 * 365,
        edgeTtl: 86400 * 30,
        browserTtl: 86400 * 7,
        compressionLevel: 6,
        customHeaders: {
          'Cache-Control': 'public, max-age=604800, immutable',
          'Vary': 'Accept-Encoding'
        },
        priority: 1
      }
    ],
    monitoring: {
      enabled: true,
      alertsEnabled: true,
      webhookUrl: process.env.MONITORING_WEBHOOK_URL
    }
  },
  
  database: {
    backend: 'redis',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      database: 1 // Different database for query cache
    },
    defaultTtl: 3600,
    maxQuerySize: 1024 * 10,
    maxResultSize: 1024 * 1024,
    enableQueryAnalysis: true,
    slowQueryThreshold: 1000,
    frequentQueryThreshold: 10,
    invalidation: {
      strategy: 'table-based',
      autoInvalidate: true,
      cascadeDeletes: true
    },
    compression: {
      enabled: true,
      threshold: 1024,
      algorithm: 'gzip'
    },
    monitoring: {
      enabled: true,
      logSlowQueries: true,
      logMisses: false
    }
  },
  
  invalidation: {
    versioningStrategy: 'hybrid',
    methods: {
      push: true,
      pull: true,
      ttl: true,
      event: true
    },
    propagation: {
      enabled: true,
      maxDepth: 5,
      batchSize: 50,
      delayMs: 100
    },
    consistency: 'eventual',
    compression: true,
    delta: true,
    monitoring: {
      enabled: true,
      trackInvalidations: true,
      reportMetrics: true
    }
  },
  
  warming: {
    strategies: {
      critical: true,
      popular: true,
      predictive: true,
      geographic: true,
      temporal: true
    },
    timing: {
      startupWarming: true,
      scheduleWarming: [
        '0 2 * * *',    // Daily at 2 AM
        '0 14 * * 1-5', // Weekdays at 2 PM
        '0 20 * * 0'    // Sundays at 8 PM
      ],
      idleWarming: true,
      beforeExpiry: 300
    },
    limits: {
      maxConcurrentRequests: 10,
      maxWarmingTime: 60000,
      maxMemoryUsage: 200 * 1024 * 1024,
      rateLimitPerSecond: 20
    },
    intelligence: {
      learningEnabled: true,
      predictionHorizon: 24,
      patternDetection: true,
      userBehaviorTracking: true
    },
    priority: {
      levels: 5,
      algorithm: 'weighted',
      decay: 0.1
    }
  },
  
  monitoring: {
    collection: {
      enabled: true,
      interval: 30000, // 30 seconds
      retention: 86400 * 7, // 7 days
      batchSize: 100
    },
    metrics: {
      enableRealtime: true,
      enableHistorical: true,
      enablePredictive: true,
      aggregationWindows: [60, 300, 3600, 86400]
    },
    alerts: {
      enabled: true,
      thresholds: {
        hitRateLow: 0.85,
        responseTimeHigh: 500,
        errorRateHigh: 0.02,
        memoryUsageHigh: 0.85,
        evictionRateHigh: 50
      },
      channels: {
        webhook: process.env.SLACK_WEBHOOK_URL,
        email: ['admin@example.com', 'ops@example.com']
      }
    },
    baselines: {
      enabled: true,
      learningPeriod: 86400 * 7, // 7 days
      adaptiveThresholds: true,
      confidenceInterval: 0.95
    },
    export: {
      enabled: true,
      format: 'prometheus',
      endpoint: process.env.PROMETHEUS_GATEWAY_URL,
      interval: 60000
    }
  },
  
  fallback: {
    strategies: {
      layerFailover: true,
      gracefulDegradation: true,
      circuitBreaker: true,
      retryWithBackoff: true,
      cacheBypass: true
    },
    healthCheck: {
      enabled: true,
      interval: 30000,
      timeout: 5000,
      consecutiveFailures: 3,
      recoveryThreshold: 3
    },
    circuitBreaker: {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      successThreshold: 3,
      halfOpenMaxCalls: 3
    },
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true
    },
    performance: {
      responseTimeThreshold: 1000,
      errorRateThreshold: 0.05,
      memoryPressureThreshold: 0.8,
      cpuUsageThreshold: 0.8
    },
    layerPriority: ['memory', 'redis', 'browser', 'serviceworker', 'cdn']
  }
};

/**
 * High-traffic configuration
 * Optimized for very high load scenarios
 */
export const highTrafficCacheConfig: SightEditCacheConfig = {
  ...productionCacheConfig,
  
  defaultTtl: 7200, // 2 hours for better cache retention
  maxCacheSize: 500 * 1024 * 1024, // 500MB
  
  redis: {
    ...productionCacheConfig.redis!,
    maxConnections: 50,
    minConnections: 20,
    defaultTtl: 7200,
    maxMemory: '8gb'
  },
  
  warming: {
    ...productionCacheConfig.warming!,
    limits: {
      maxConcurrentRequests: 20,
      maxWarmingTime: 120000,
      maxMemoryUsage: 500 * 1024 * 1024,
      rateLimitPerSecond: 50
    }
  },
  
  monitoring: {
    ...productionCacheConfig.monitoring!,
    collection: {
      enabled: true,
      interval: 10000, // More frequent monitoring
      retention: 86400 * 30, // 30 days retention
      batchSize: 200
    },
    alerts: {
      enabled: true,
      thresholds: {
        hitRateLow: 0.9, // Higher expectations
        responseTimeHigh: 200, // Stricter response times
        errorRateHigh: 0.01,
        memoryUsageHigh: 0.8,
        evictionRateHigh: 25
      },
      channels: {
        webhook: process.env.SLACK_WEBHOOK_URL,
        email: ['sre@example.com', 'oncall@example.com']
      }
    }
  }
};

/**
 * Edge computing configuration
 * Optimized for edge deployments with CDN integration
 */
export const edgeCacheConfig: SightEditCacheConfig = {
  layers: {
    memory: true,
    browser: true,
    serviceWorker: true,
    redis: false, // No Redis at edge
    cdn: true
  },
  defaultTtl: 1800, // 30 minutes
  maxCacheSize: 50 * 1024 * 1024, // 50MB at edge
  compressionEnabled: true,
  encryptionEnabled: true,
  debugMode: false,
  
  cdn: {
    provider: 'cloudflare',
    apiKey: process.env.CLOUDFLARE_API_KEY,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    domain: 'edge.example.com',
    originUrl: 'https://api.example.com',
    defaultTtl: 3600,
    maxTtl: 86400,
    edgeTtl: 3600,
    browserTtl: 1800,
    compressionEnabled: true,
    monitoring: {
      enabled: true,
      alertsEnabled: true
    }
  },
  
  warming: {
    strategies: {
      critical: true,
      popular: false,
      predictive: false,
      geographic: true, // Important for edge
      temporal: true
    },
    timing: {
      startupWarming: true,
      scheduleWarming: [],
      idleWarming: false,
      beforeExpiry: 600
    }
  },
  
  fallback: {
    strategies: {
      layerFailover: true,
      gracefulDegradation: true,
      circuitBreaker: true,
      retryWithBackoff: true,
      cacheBypass: true
    },
    layerPriority: ['memory', 'browser', 'serviceworker', 'cdn']
  }
};

/**
 * Security-focused configuration
 * Enhanced security for sensitive applications
 */
export const securityCacheConfig: SightEditCacheConfig = {
  ...productionCacheConfig,
  
  encryptionEnabled: true,
  defaultTtl: 900, // Shorter TTL for security
  
  redis: {
    ...productionCacheConfig.redis!,
    ssl: {
      enabled: true,
      cert: process.env.REDIS_SSL_CERT,
      key: process.env.REDIS_SSL_KEY,
      ca: process.env.REDIS_SSL_CA
    }
  },
  
  cdn: {
    ...productionCacheConfig.cdn!,
    securityHeaders: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    },
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 100, // Stricter rate limiting
      burstSize: 20
    }
  },
  
  monitoring: {
    ...productionCacheConfig.monitoring!,
    alerts: {
      enabled: true,
      thresholds: {
        hitRateLow: 0.8,
        responseTimeHigh: 1000,
        errorRateHigh: 0.01, // Very low tolerance for errors
        memoryUsageHigh: 0.7,
        evictionRateHigh: 10
      },
      channels: {
        webhook: process.env.SECURITY_WEBHOOK_URL,
        email: ['security@example.com', 'admin@example.com']
      }
    }
  }
};

export {
  developmentCacheConfig as development,
  productionCacheConfig as production,
  highTrafficCacheConfig as highTraffic,
  edgeCacheConfig as edge,
  securityCacheConfig as security
};