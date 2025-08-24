# SightEdit Advanced Multi-Layer Caching System

This comprehensive caching system provides intelligent, multi-layer caching with automatic failover, cache warming, invalidation, and monitoring for the SightEdit visual editor.

## Features

- **Multi-Layer Cache Architecture**: Memory, Browser (Cache API), Service Worker, Redis, and CDN layers
- **Intelligent Fallback**: Automatic failover between cache layers with circuit breaker pattern
- **Cache Warming**: Predictive and scheduled cache warming based on usage patterns
- **Smart Invalidation**: Version-based and event-driven cache invalidation with dependency tracking
- **Real-time Monitoring**: Comprehensive metrics, alerting, and performance monitoring
- **Database Query Caching**: Intelligent caching of database queries with automatic invalidation
- **Edge-side Caching**: CDN integration with Cloudflare, CloudFront, and other providers

## Quick Start

```typescript
import { SightEdit, createSightEditCache } from '@sightedit/core';

// Initialize SightEdit with caching
const sightEdit = SightEdit.init({
  endpoint: 'https://api.example.com',
  caching: {
    layers: {
      memory: true,
      browser: true,
      serviceWorker: true,
      redis: false,
      cdn: false
    },
    defaultTtl: 3600, // 1 hour
    maxCacheSize: 50 * 1024 * 1024, // 50MB
    compressionEnabled: true,
    debugMode: false,
    
    // Redis configuration (if enabled)
    redis: {
      host: 'localhost',
      port: 6379,
      database: 0
    },
    
    // CDN configuration (if enabled)
    cdn: {
      provider: 'cloudflare',
      domain: 'assets.example.com',
      apiKey: 'your-api-key',
      zoneId: 'your-zone-id'
    },
    
    // Cache warming configuration
    warming: {
      strategies: {
        critical: true,
        popular: true,
        predictive: true,
        temporal: true
      },
      timing: {
        startupWarming: true,
        scheduleWarming: ['0 2 * * *'], // Daily at 2 AM
        idleWarming: true
      }
    },
    
    // Monitoring and alerting
    monitoring: {
      alerts: {
        enabled: true,
        thresholds: {
          hitRateLow: 0.8,
          responseTimeHigh: 1000,
          errorRateHigh: 0.05
        },
        channels: {
          webhook: 'https://hooks.slack.com/your-webhook'
        }
      },
      export: {
        enabled: true,
        format: 'prometheus',
        endpoint: 'https://metrics.example.com/push'
      }
    }
  }
});

// Get cache statistics
const stats = await sightEdit.getCacheStats();
console.log('Cache hit rate:', stats.overall.hitRate);

// Warm critical cache paths
await sightEdit.warmCriticalCache({ userId: 'user123', segment: 'premium' });
```

## Cache Layer Architecture

### 1. Memory Cache Layer
- **Purpose**: Fastest access for frequently used data
- **Storage**: JavaScript Map/WeakMap in memory
- **TTL**: Short-lived (5-30 minutes)
- **Size**: Limited to prevent memory leaks
- **Use Case**: Editor state, user preferences, frequently accessed schemas

### 2. Browser Cache Layer (Cache API)
- **Purpose**: Persistent client-side storage
- **Storage**: Browser Cache API with service worker integration
- **TTL**: Medium-lived (1-24 hours)
- **Size**: ~50MB typical limit
- **Use Case**: Editor configurations, templates, static assets

### 3. Service Worker Cache Layer
- **Purpose**: Offline-first caching with advanced strategies
- **Storage**: Service Worker caches
- **Strategies**: Cache-first, Network-first, Stale-while-revalidate
- **TTL**: Configurable per resource type
- **Use Case**: Offline editing, background updates, asset caching

### 4. Redis Cache Layer
- **Purpose**: Distributed, persistent application cache
- **Storage**: Redis server with clustering support
- **TTL**: Long-lived (hours to days)
- **Features**: Pub/Sub for invalidation, persistence, clustering
- **Use Case**: Session data, computed results, cross-instance caching

### 5. CDN Cache Layer
- **Purpose**: Global edge caching for static assets
- **Storage**: CDN edge locations (Cloudflare, CloudFront, etc.)
- **TTL**: Very long-lived (days to months)
- **Features**: Geographic distribution, high availability
- **Use Case**: Static assets, public content, API responses

## Cache Warming Strategies

### Critical Path Warming
Automatically identifies and preloads critical user paths based on:
- User role and permissions
- Historical access patterns
- Business logic priorities

```typescript
// Add custom warming target
sightEdit.getCacheSystem()?.addWarmingTarget({
  id: 'user-dashboard',
  type: 'content',
  key: 'dashboard-data-{{userId}}',
  priority: 5,
  estimatedLoadTime: 500,
  dependencies: ['user-profile', 'user-permissions'],
  conditions: [
    { type: 'user', operator: 'equals', value: 'premium' }
  ],
  fetcher: async () => {
    return await fetchUserDashboard(userId);
  }
});
```

### Predictive Warming
Uses machine learning to predict future cache needs:
- Access pattern analysis
- Time-based predictions
- User behavior modeling
- Correlation analysis

### Scheduled Warming
Configurable warming schedules:
```typescript
warming: {
  timing: {
    scheduleWarming: [
      '0 2 * * *',    // Daily at 2 AM
      '0 14 * * 1-5'  // Weekdays at 2 PM
    ]
  }
}
```

## Cache Invalidation

### Version-based Invalidation
Automatic versioning with content changes:
```typescript
// Set with version
await cache.set('content-123', data, {
  version: 'v1.2.3',
  tags: ['content', 'user-123']
});

// Version mismatch triggers refresh
const cached = await cache.get('content-123'); // Checks version automatically
```

### Event-driven Invalidation
Responds to system events:
```typescript
// Content change triggers invalidation
await cache.invalidateByTags(['content', 'schema']);

// Database change handler
cache.getCacheSystem()?.on('databaseChange', ({ table }) => {
  if (table === 'users') {
    cache.invalidateByTags(['user-data']);
  }
});
```

### Dependency-based Invalidation
Cascading invalidation based on dependencies:
```typescript
// When user-profile changes, invalidate dependent caches
invalidationManager.addDependency('user-dashboard', 'user-profile');
invalidationManager.addDependency('user-permissions', 'user-profile');
```

## Database Query Caching

Intelligent caching of database queries with automatic invalidation:

```typescript
// Cache query results
const users = await cache.cacheQuery(
  {
    sql: 'SELECT * FROM users WHERE role = ?',
    params: ['admin'],
    database: 'main'
  },
  async () => {
    return await db.query('SELECT * FROM users WHERE role = ?', ['admin']);
  },
  {
    ttl: 3600,
    tags: ['users', 'admin-users']
  }
);

// Automatic invalidation on table changes
dbCache.handleDatabaseChange({
  type: 'update',
  table: 'users',
  data: { id: 123, role: 'admin' }
});
```

## Monitoring and Alerting

### Real-time Metrics
- Hit rates and miss rates per layer
- Response times (average, P95, P99)
- Error rates and types
- Memory and CPU usage
- Cache size and utilization

### Performance Baselines
- Automatic learning of normal performance patterns
- Adaptive thresholds based on historical data
- Anomaly detection for performance degradation

### Alerting
```typescript
monitoring: {
  alerts: {
    enabled: true,
    thresholds: {
      hitRateLow: 0.8,        // Alert if hit rate < 80%
      responseTimeHigh: 1000,  // Alert if response > 1s
      errorRateHigh: 0.05,    // Alert if error rate > 5%
      memoryUsageHigh: 0.9    // Alert if memory > 90%
    },
    channels: {
      webhook: 'https://hooks.slack.com/webhook',
      email: ['admin@example.com'],
      slack: '#alerts'
    }
  }
}
```

### Metrics Export
Support for various monitoring systems:
```typescript
export: {
  enabled: true,
  format: 'prometheus', // or 'json', 'csv'
  endpoint: 'https://prometheus-gateway.example.com',
  interval: 60000 // 1 minute
}
```

## Graceful Degradation

### Circuit Breaker Pattern
Automatically isolates failing cache layers:
```typescript
fallback: {
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    recoveryTimeout: 60000,   // Try again after 1 minute
    successThreshold: 3       // Close after 3 successes
  }
}
```

### Layer Failover
Automatic failover between cache layers:
```typescript
// Priority order for failover
layerPriority: ['memory', 'redis', 'browser', 'serviceworker', 'cdn']
```

### Performance-based Routing
Routes requests based on layer performance:
- Response time thresholds
- Error rate monitoring
- Health check results
- Load balancing

## Security Considerations

### Data Encryption
- At-rest encryption for sensitive data
- In-transit encryption for Redis connections
- Key-based access control

### Cache Security
- XSS protection for cached content
- CSRF tokens in cache keys
- Origin validation for CDN requests

### Compliance
- GDPR-compliant data retention
- Automatic PII detection and handling
- Audit logging for cache operations

## Performance Benefits

### Expected Improvements
- **90%+ reduction** in API response times for cached content
- **70%+ reduction** in database query load
- **60%+ reduction** in bandwidth usage
- **99.9% availability** with multi-layer redundancy

### Cost Savings
- Reduced server compute costs
- Lower database connection usage
- Decreased CDN bandwidth charges
- Improved user experience metrics

### Carbon Footprint Reduction
- Reduced server energy consumption
- Fewer network round trips
- Optimized resource utilization
- Green computing benefits

## Configuration Examples

### Development Configuration
```typescript
caching: {
  layers: {
    memory: true,
    browser: true,
    serviceWorker: false,
    redis: false,
    cdn: false
  },
  debugMode: true,
  defaultTtl: 300 // 5 minutes for development
}
```

### Production Configuration
```typescript
caching: {
  layers: {
    memory: true,
    browser: true,
    serviceWorker: true,
    redis: true,
    cdn: true
  },
  redis: {
    host: 'redis-cluster.internal',
    port: 6379,
    cluster: {
      enabled: true,
      nodes: [
        { host: 'redis1.internal', port: 6379 },
        { host: 'redis2.internal', port: 6379 },
        { host: 'redis3.internal', port: 6379 }
      ]
    }
  },
  cdn: {
    provider: 'cloudflare',
    domain: 'cdn.example.com',
    apiKey: process.env.CLOUDFLARE_API_KEY,
    zoneId: process.env.CLOUDFLARE_ZONE_ID
  },
  monitoring: {
    enabled: true,
    alerts: {
      enabled: true,
      channels: {
        webhook: process.env.SLACK_WEBHOOK_URL
      }
    },
    export: {
      enabled: true,
      format: 'prometheus',
      endpoint: process.env.METRICS_ENDPOINT
    }
  }
}
```

## Integration with Existing Code

The caching system integrates seamlessly with existing SightEdit functionality:

### Editor Operations
```typescript
// Automatic caching of editor schemas
const schema = await sightEdit.fetchSchema('content-123'); // Cached automatically

// Cached save operations with invalidation
await sightEdit.save({
  sight: 'content-123',
  value: newContent
}); // Triggers automatic cache invalidation
```

### Plugin Integration
```typescript
// Plugins can access the cache system
const plugin = {
  init(sightEdit) {
    const cache = sightEdit.getCacheSystem();
    
    // Custom caching logic
    cache?.addWarmingTarget({
      id: 'plugin-data',
      fetcher: () => this.fetchPluginData()
    });
  }
};
```

## Best Practices

### Cache Key Design
- Use hierarchical namespacing: `user:123:profile`
- Include version information: `schema:v2:content-type`
- Avoid dynamic keys that can't be invalidated

### TTL Strategy
- Short TTL for dynamic content (5-15 minutes)
- Medium TTL for semi-static content (1-6 hours)
- Long TTL for static assets (days to weeks)

### Memory Management
- Set appropriate size limits
- Use LRU eviction policies
- Monitor memory usage regularly

### Error Handling
- Always provide fallbacks
- Log cache misses and errors
- Implement graceful degradation

This advanced caching system provides SightEdit with enterprise-grade performance, reliability, and scalability while maintaining simplicity for developers.