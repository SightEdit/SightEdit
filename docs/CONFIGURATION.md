# SightEdit Configuration Guide

This guide covers all configuration options for SightEdit in production environments.

## Table of Contents

- [Basic Configuration](#basic-configuration)
- [Security Configuration](#security-configuration)
- [Performance Configuration](#performance-configuration)  
- [Caching Configuration](#caching-configuration)
- [Monitoring Configuration](#monitoring-configuration)
- [Server Configuration](#server-configuration)
- [Environment Variables](#environment-variables)
- [Framework-Specific Configuration](#framework-specific-configuration)

## Basic Configuration

### Client Configuration

```javascript
const sightEdit = SightEdit.init({
  // Required
  endpoint: '/api/sightedit',
  
  // Authentication
  apiKey: 'your-api-key',
  
  // UI preferences
  theme: 'auto', // 'light' | 'dark' | 'auto'
  locale: 'en',
  editModeKey: 'e', // Keyboard shortcut
  
  // Debug mode
  debug: process.env.NODE_ENV === 'development'
});
```

### Configuration Schema

```typescript
interface SightEditConfig {
  // Core settings
  endpoint: string;
  apiKey?: string;
  theme?: 'light' | 'dark' | 'auto';
  locale?: string;
  editModeKey?: string;
  debug?: boolean;
  
  // Feature flags
  features?: {
    collaboration?: boolean;
    history?: boolean;
    validation?: boolean;
    plugins?: boolean;
  };
  
  // Advanced configurations
  security?: SecurityConfig;
  performance?: PerformanceConfig;
  caching?: CacheConfig;
  monitoring?: MonitoringConfig;
  plugins?: PluginConfig[];
  
  // Event callbacks
  onSave?: (data: SaveData) => void;
  onError?: (error: SightEditError) => void;
  onEditModeToggled?: (isEditMode: boolean) => void;
}
```

## Security Configuration

### CSRF Protection

```javascript
const config = {
  security: {
    csrf: {
      enabled: true,
      tokenName: 'csrf-token',
      cookieName: 'sightedit-csrf',
      secret: process.env.CSRF_SECRET,
      maxAge: 3600,
      sameSite: 'strict',
      secure: true,
      httpOnly: true
    }
  }
};
```

### Content Security Policy

```javascript
const config = {
  security: {
    csp: {
      enabled: true,
      enforceMode: true,
      useNonces: true,
      
      directives: {
        'default-src': ["'none'"],
        'script-src': ["'self'", "'nonce-{nonce}'"],
        'style-src': ["'self'", "'nonce-{nonce}'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", 'https://api.sightedit.com'],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"]
      },
      
      reportUri: '/api/csp-report',
      reportOnly: false
    }
  }
};
```

### XSS Prevention

```javascript
const config = {
  security: {
    xss: {
      enabled: true,
      mode: 'strict', // 'strict' | 'moderate' | 'permissive'
      
      // Allowed HTML tags for rich text editors
      allowedTags: [
        'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'h1', 'h2', 'h3', 
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre'
      ],
      
      // Allowed HTML attributes
      allowedAttributes: {
        'a': ['href', 'target', 'rel'],
        '*': ['class', 'id']
      },
      
      // URL schemes allowed in href attributes
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      
      // Custom sanitization rules
      customRules: {
        // Remove tracking parameters from links
        sanitizeLinks: true,
        // Convert relative URLs to absolute
        normalizeUrls: false
      }
    }
  }
};
```

### Rate Limiting

```javascript
const config = {
  security: {
    rateLimit: {
      enabled: true,
      
      // Global limits
      global: {
        maxRequests: 1000,
        windowMs: 15 * 60 * 1000, // 15 minutes
        skipSuccessfulRequests: false
      },
      
      // Per-user limits
      perUser: {
        maxRequests: 100,
        windowMs: 15 * 60 * 1000,
        keyGenerator: (req) => req.user?.id || req.ip
      },
      
      // Per-endpoint limits
      endpoints: {
        '/save': { maxRequests: 50, windowMs: 60 * 1000 },
        '/upload': { maxRequests: 10, windowMs: 60 * 1000 }
      },
      
      // Response headers
      headers: true,
      
      // Custom handler for rate limit exceeded
      onLimitReached: (req, res) => {
        console.warn(`Rate limit exceeded for ${req.ip}`);
      }
    }
  }
};
```

## Performance Configuration

### Bundle Optimization

```javascript
const config = {
  performance: {
    // Code splitting and lazy loading
    bundling: {
      lazyLoading: true,
      codesplitting: true,
      prefetch: ['text', 'richtext'], // Prefetch common editors
      preload: ['base'], // Preload critical modules
      
      // Tree shaking
      treeShaking: true,
      sideEffects: false
    },
    
    // Runtime optimization
    runtime: {
      debounceMs: 300,
      throttleMs: 100,
      batchSize: 10,
      maxConcurrentRequests: 5
    },
    
    // Memory management
    memory: {
      maxHistorySize: 100,
      garbageCollection: true,
      memoryThreshold: 50 * 1024 * 1024 // 50MB
    }
  }
};
```

### Virtual Scrolling

```javascript
const config = {
  performance: {
    virtualScrolling: {
      enabled: true,
      itemHeight: 50,
      bufferSize: 10,
      overscan: 5,
      
      // For collections with variable heights
      estimateSize: (index) => {
        // Return estimated height for item at index
        return 50;
      }
    }
  }
};
```

## Caching Configuration

### Multi-Layer Caching

```javascript
const config = {
  caching: {
    enabled: true,
    
    // Browser cache
    browser: {
      enabled: true,
      ttl: 300, // 5 minutes
      cacheControl: 'public, max-age=300',
      etag: true,
      lastModified: true
    },
    
    // Memory cache (client-side)
    memory: {
      enabled: true,
      ttl: 600, // 10 minutes
      maxSize: 100, // Max items
      maxMemory: '50MB',
      strategy: 'lru' // 'lru' | 'lfu' | 'fifo'
    },
    
    // Redis cache (server-side)
    redis: {
      enabled: true,
      ttl: 3600, // 1 hour
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'sightedit:',
      
      // Redis cluster support
      cluster: {
        enabled: false,
        nodes: []
      }
    },
    
    // CDN configuration
    cdn: {
      enabled: true,
      provider: 'cloudflare', // 'cloudflare' | 'aws' | 'azure' | 'custom'
      endpoint: 'https://cdn.sightedit.com',
      ttl: 86400, // 24 hours
      
      // Cache warming
      warmup: {
        enabled: true,
        routes: ['/api/schema', '/api/config']
      }
    }
  }
};
```

### Cache Strategies

```javascript
const config = {
  caching: {
    strategies: {
      // Static content (images, fonts, etc.)
      static: {
        ttl: 31536000, // 1 year
        immutable: true
      },
      
      // API responses
      api: {
        ttl: 300, // 5 minutes
        staleWhileRevalidate: 600 // 10 minutes
      },
      
      // User-specific data
      user: {
        ttl: 60, // 1 minute
        private: true
      },
      
      // Dynamic content
      dynamic: {
        ttl: 0, // No cache
        revalidate: true
      }
    }
  }
};
```

## Monitoring Configuration

### Metrics Collection

```javascript
const config = {
  monitoring: {
    enabled: true,
    endpoint: '/api/metrics',
    interval: 30000, // 30 seconds
    
    // Metric categories
    metrics: {
      performance: {
        enabled: true,
        metrics: [
          'page-load-time',
          'editor-render-time',
          'api-response-time',
          'bundle-size',
          'memory-usage'
        ]
      },
      
      usage: {
        enabled: true,
        metrics: [
          'active-users',
          'editor-usage',
          'content-changes',
          'feature-adoption'
        ]
      },
      
      errors: {
        enabled: true,
        includeStackTrace: true,
        metrics: [
          'error-rate',
          'error-types',
          'failed-requests'
        ]
      },
      
      security: {
        enabled: true,
        metrics: [
          'threats-detected',
          'csp-violations',
          'failed-auth-attempts',
          'rate-limit-hits'
        ]
      }
    },
    
    // Sampling
    sampling: {
      performance: 0.1, // 10% sampling
      errors: 1.0,      // 100% error tracking
      usage: 0.05       // 5% usage tracking
    }
  }
};
```

### Custom Metrics

```javascript
// Track custom events
sightEdit.metrics.track('custom.event', {
  value: 123,
  tags: { component: 'text-editor', action: 'save' }
});

// Time operations
const timer = sightEdit.metrics.startTimer('operation.duration');
// ... perform operation
timer.end({ status: 'success' });

// Count events
sightEdit.metrics.increment('editor.renders', 1, {
  editor_type: 'richtext'
});

// Gauge metrics
sightEdit.metrics.gauge('active.editors', activeEditorCount);
```

## Server Configuration

### Node.js Server

```javascript
const { createSightEditHandler } = require('@sightedit/server-node');

const handler = createSightEditHandler({
  // Storage configuration
  storage: {
    type: 'postgresql', // 'memory' | 'file' | 'mongodb' | 'postgresql' | 'redis'
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production'
    },
    
    // Connection pooling
    pool: {
      min: 2,
      max: 20,
      idle: 10000,
      acquire: 60000
    }
  },
  
  // Authentication
  auth: {
    required: true,
    validateToken: async (token) => {
      // Validate JWT token and return user info
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { id: decoded.sub, role: decoded.role };
    },
    
    // Role-based access control
    permissions: {
      editor: ['read', 'write'],
      admin: ['read', 'write', 'delete', 'manage']
    }
  },
  
  // File upload handling
  upload: {
    enabled: true,
    destination: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    
    // Cloud storage integration
    cloud: {
      provider: 'aws-s3', // 'aws-s3' | 'azure' | 'gcp'
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    }
  }
});
```

## Environment Variables

### Production Environment

```bash
# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sightedit
DB_USER=sightedit_user
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# Security
JWT_SECRET=your-jwt-secret-key
CSRF_SECRET=your-csrf-secret-key
ENCRYPTION_KEY=your-encryption-key

# File Storage
UPLOAD_DIR=/app/uploads
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
S3_BUCKET=sightedit-uploads
S3_REGION=us-east-1

# Monitoring
METRICS_ENDPOINT=https://metrics.example.com
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info

# CDN
CDN_ENDPOINT=https://cdn.example.com
```

### Development Environment

```bash
NODE_ENV=development
PORT=3001
DEBUG=sightedit:*

# Local database
DB_HOST=localhost
DB_NAME=sightedit_dev

# Disable some features in development
CSRF_ENABLED=false
RATE_LIMIT_ENABLED=false
METRICS_ENABLED=false
```

## Framework-Specific Configuration

### React Configuration

```tsx
import { SightEditProvider } from '@sightedit/react';

function App() {
  return (
    <SightEditProvider
      config={{
        endpoint: '/api/sightedit',
        theme: 'auto',
        
        // React-specific options
        strictMode: true,
        suspenseFallback: <div>Loading editor...</div>,
        errorBoundary: ErrorFallback
      }}
      onError={(error) => {
        console.error('SightEdit error:', error);
        // Send to error tracking service
      }}
    >
      <YourApp />
    </SightEditProvider>
  );
}
```

### Vue Configuration

```javascript
import { createApp } from 'vue';
import SightEditPlugin from '@sightedit/vue';

const app = createApp(App);

app.use(SightEditPlugin, {
  endpoint: '/api/sightedit',
  theme: 'auto',
  
  // Vue-specific options
  globalProperties: true,
  devtools: process.env.NODE_ENV === 'development'
});
```

### Next.js Configuration

```javascript
// next.config.js
module.exports = {
  // Webpack configuration for SightEdit
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false
    };
    
    return config;
  },
  
  // API routes configuration
  async rewrites() {
    return [
      {
        source: '/api/sightedit/:path*',
        destination: '/api/sightedit/:path*'
      }
    ];
  }
};
```

This configuration guide provides comprehensive options for deploying SightEdit in production environments with proper security, performance, and monitoring configurations.