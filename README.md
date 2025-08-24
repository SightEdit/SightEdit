# SightEdit

**Universal Visual Editing System** - Transform any website into a visual editor with a single JavaScript file and data attributes.

[![Build Status](https://github.com/sightedit/sightedit/workflows/CI/badge.svg)](https://github.com/sightedit/sightedit/actions)
[![Security Scan](https://github.com/sightedit/sightedit/workflows/Security/badge.svg)](https://github.com/sightedit/sightedit/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40sightedit%2Fcore.svg)](https://badge.fury.io/js/%40sightedit%2Fcore)

## Overview

SightEdit is an enterprise-grade visual editing platform that enables in-place content editing for any website. It's framework-agnostic, secure, and production-ready with comprehensive monitoring, caching, and deployment automation.

### ✨ Key Features

- **🎯 Framework Agnostic** - Works with React, Vue, Angular, vanilla HTML, or any web framework
- **⚡ Easy Integration** - Add data attributes to any element and initialize SightEdit
- **🎨 Rich Editor Types** - Text, rich text, images, collections, dates, colors, and more
- **🔌 Plugin System** - Extend functionality with plugins for markdown, image cropping, custom editors
- **💾 Auto Save** - Automatic saving with offline support, retry logic, and conflict resolution
- **🔒 Enterprise Security** - Built-in validation, sanitization, CSRF protection, and CSP compliance
- **📊 Production Monitoring** - Prometheus metrics, Grafana dashboards, error tracking
- **🚀 Deployment Ready** - Docker containers, Kubernetes manifests, CI/CD pipelines

## Quick Start

### CDN (Fastest)

```html
<!DOCTYPE html>
<html>
<head>
  <title>SightEdit Demo</title>
</head>
<body>
  <h1 data-sight="text">Click to edit this heading</h1>
  <p data-sight="richtext">This paragraph supports <strong>rich text</strong> editing.</p>
  <img data-sight="image" src="https://via.placeholder.com/400x200" alt="Editable image">
  
  <script src="https://cdn.sightedit.com/v1/sightedit.min.js"></script>
  <script>
    SightEdit.init({
      endpoint: '/api/sightedit'
    });
  </script>
</body>
</html>
```

Press **Ctrl/Cmd + E** to toggle edit mode!

### NPM Installation

```bash
npm install @sightedit/core
```

```javascript
import SightEdit from '@sightedit/core';

SightEdit.init({
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key'
});
```

## Framework Integration

### React

```bash
npm install @sightedit/react
```

```jsx
import { SightEditProvider, Editable } from '@sightedit/react';

function App() {
  return (
    <SightEditProvider config={{
      endpoint: '/api/sightedit'
    }}>
      <Editable type="text" defaultValue="Edit me!">
        <h1>Edit me!</h1>
      </Editable>
    </SightEditProvider>
  );
}
```

### Vue

```bash
npm install @sightedit/vue
```

```vue
<template>
  <SightEditable type="text" default-value="Edit me!">
    <h1>{{ content }}</h1>
  </SightEditable>
</template>

<script>
import { createApp } from 'vue';
import SightEditPlugin from '@sightedit/vue';

const app = createApp(App);
app.use(SightEditPlugin, {
  endpoint: '/api/sightedit'
});
</script>
```

## Backend Setup

SightEdit requires a backend endpoint to save changes. Choose from our server packages or implement your own.

### Node.js / Express

```bash
npm install @sightedit/server-node
```

```javascript
const { SightEditHandler } = require('@sightedit/server-node');

app.use('/api/sightedit', SightEditHandler({
  storage: 'file', // or 'memory', 'mongodb', etc.
  path: './content',
  
  // Security options
  csrf: {
    enabled: true,
    cookieName: 'sightedit-csrf'
  },
  
  // Rate limiting
  rateLimit: {
    enabled: true,
    maxRequests: 100,
    windowMs: 15 * 60 * 1000
  },
  
  // Authentication
  auth: {
    required: true,
    validateUser: (req) => req.user?.id
  }
}));
```

### PHP

```bash
composer require sightedit/server-php
```

```php
<?php
require_once 'vendor/autoload.php';

use SightEdit\Server\Handler;

$handler = new Handler([
    'storage' => 'file',
    'path' => './content'
]);

$handler->handle();
```

## Editor Types

SightEdit supports various editor types with specialized interfaces:

| Type | Description | Data Attributes |
|------|-------------|-----------------|
| `text` | Plain text editor | `data-sight="text"` |
| `richtext` | Rich text with formatting | `data-sight="richtext"` |
| `image` | Image upload and editing | `data-sight="image"` |
| `file` | File upload | `data-sight="file"` |
| `link` | URL editor with preview | `data-sight="link"` |
| `color` | Color picker | `data-sight="color"` |
| `date` | Date picker | `data-sight="date"` |
| `number` | Number input with validation | `data-sight="number"` |
| `select` | Dropdown selection | `data-sight="select"` |
| `collection` | Repeatable content blocks | `data-sight="collection"` |
| `json` | JSON editor with validation | `data-sight="json"` |

### Advanced Configuration

```html
<div data-sight="text" 
     data-sight-id="hero-title"
     data-sight-required="true"
     data-sight-max-length="100"
     data-sight-placeholder="Enter title...">
  Editable Title
</div>
```

## Plugins

Extend SightEdit with powerful plugins:

### Markdown Plugin

```bash
npm install @sightedit/plugin-markdown
```

```html
<div data-sight="markdown">
# Markdown Content
- Live preview
- Syntax highlighting  
- Export capabilities
</div>
```

### Image Crop Plugin

```bash
npm install @sightedit/plugin-image-crop
```

```html
<img data-sight="image-crop" 
     data-crop-aspect-ratio="16:9"
     data-crop-filters="true"
     src="image.jpg">
```

## Production Configuration

### Security Hardening

```javascript
SightEdit.init({
  endpoint: '/api/sightedit',
  
  // Security configuration
  security: {
    csrf: {
      enabled: true,
      tokenName: 'csrf-token'
    },
    
    csp: {
      enabled: true,
      enforceMode: true,
      directives: {
        'script-src': ["'self'", "'nonce-{nonce}'"],
        'style-src': ["'self'", "'unsafe-inline'"]
      }
    },
    
    xss: {
      enabled: true,
      mode: 'strict',
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br']
    }
  },
  
  // Performance options
  caching: {
    enabled: true,
    layers: {
      browser: { ttl: 300 },
      memory: { ttl: 600, maxSize: 50 },
      redis: { ttl: 3600, host: 'redis-server' }
    }
  },
  
  // Monitoring
  monitoring: {
    enabled: true,
    metrics: ['performance', 'errors', 'usage'],
    dashboardUrl: '/monitoring/dashboard'
  },
  
  // Error handling
  errorHandling: {
    retryAttempts: 3,
    circuitBreaker: true,
    userFriendlyMessages: true
  }
});
```

### Performance Optimization

```javascript
// Bundle optimization
SightEdit.init({
  performance: {
    lazyLoading: true,
    bundleSplitting: true,
    prefetch: ['text', 'richtext'], // Prefetch common editors
    debounceMs: 300,
    
    // Virtual scrolling for large collections
    virtualScrolling: {
      enabled: true,
      itemHeight: 50,
      bufferSize: 10
    }
  }
});
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t sightedit-app .
docker run -p 3000:3000 sightedit-app
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sightedit-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sightedit
  template:
    metadata:
      labels:
        app: sightedit
    spec:
      containers:
      - name: sightedit
        image: sightedit-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e
      - run: npm run security:scan
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          docker build -t sightedit:${{ github.sha }} .
          docker push registry/sightedit:${{ github.sha }}
          kubectl set image deployment/sightedit sightedit=registry/sightedit:${{ github.sha }}
```

## Monitoring & Observability

### Metrics Collection

```javascript
// Built-in metrics
SightEdit.init({
  telemetry: {
    enabled: true,
    endpoint: '/api/metrics',
    metrics: {
      performance: true,    // Load times, render performance
      usage: true,         // Editor usage, popular content
      errors: true,        // Error rates, failure patterns
      security: true       // Security events, threats detected
    }
  }
});
```

### Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'sightedit'
    static_configs:
      - targets: ['sightedit-service:3000']
    metrics_path: /metrics
    scrape_interval: 30s
```

### Grafana Dashboard

Pre-built dashboards available for:
- Application performance metrics
- Error rates and patterns
- User engagement analytics
- Security threat monitoring
- Cache performance
- Database query performance

## Development

### Building from Source

```bash
git clone https://github.com/sightedit/sightedit.git
cd sightedit
npm install
npm run bootstrap  # Setup monorepo
npm run build      # Build all packages
npm run dev        # Development mode
```

### Project Structure

```
sightedit/
├── packages/
│   ├── core/              # Core SightEdit library
│   ├── react/             # React integration
│   ├── vue/               # Vue integration
│   ├── server/
│   │   ├── node/          # Node.js server
│   │   └── php/           # PHP server
│   └── plugin-*/          # Official plugins
├── examples/              # Example applications
├── docs/                  # Documentation
├── monitoring/            # Monitoring configurations
├── k8s/                   # Kubernetes manifests
└── docker/                # Docker configurations
```

### Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Security tests
npm run test:security

# Performance tests
npm run test:performance

# All tests
npm run test:all
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run test:all`
5. Run security scan: `npm run security:scan`
6. Submit a pull request

## API Reference

### Core API

```javascript
// Initialize SightEdit
const sightEdit = SightEdit.init(config);

// Control edit mode
sightEdit.enterEditMode();
sightEdit.exitEditMode();
sightEdit.toggleEditMode();
sightEdit.isEditMode(); // boolean

// Save operations
await sightEdit.save({
  sight: 'element-id',
  value: 'new content',
  type: 'text'
});

// Batch operations
await sightEdit.batch([
  { type: 'update', data: { sight: 'title', value: 'New Title' } },
  { type: 'update', data: { sight: 'content', value: 'New Content' } }
]);

// Event handling
sightEdit.on('editModeEntered', () => console.log('Edit mode activated'));
sightEdit.on('contentSaved', (data) => console.log('Content saved:', data));
sightEdit.on('error', (error) => console.error('Error:', error));

// Cleanup
sightEdit.destroy();
```

### Configuration Options

```typescript
interface SightEditConfig {
  endpoint: string;                    // Backend endpoint URL
  apiKey?: string;                     // API authentication key
  editModeKey?: string;                // Keyboard shortcut key (default: 'e')
  theme?: 'light' | 'dark' | 'auto';   // UI theme
  locale?: string;                     // Localization
  debug?: boolean;                     // Debug mode
  
  // Security settings
  security?: {
    csrf?: CSRFConfig;
    csp?: CSPConfig;
    xss?: XSSConfig;
    rateLimit?: RateLimitConfig;
  };
  
  // Performance settings
  performance?: {
    lazyLoading?: boolean;
    debounceMs?: number;
    caching?: CacheConfig;
  };
  
  // Monitoring settings
  monitoring?: {
    enabled?: boolean;
    endpoint?: string;
    metrics?: string[];
  };
  
  // Plugin configuration
  plugins?: Plugin[];
  
  // Event callbacks
  onSave?: (data: SaveData) => void;
  onError?: (error: Error) => void;
}
```

## Security

SightEdit takes security seriously and includes multiple layers of protection:

- **CSRF Protection** - Token-based CSRF validation
- **XSS Prevention** - Input sanitization and output encoding
- **Content Security Policy** - Strict CSP headers and nonce-based scripts
- **Input Validation** - Server-side validation with threat detection
- **Rate Limiting** - API rate limiting and abuse prevention
- **Authentication** - Flexible authentication integration
- **Audit Logging** - Comprehensive security event logging

### Security Best Practices

1. Always use HTTPS in production
2. Enable CSRF protection
3. Configure strict CSP headers
4. Implement proper authentication
5. Regular security updates
6. Monitor security events
7. Use secure session management

## Performance

SightEdit is optimized for production performance:

- **Multi-layer Caching** - Browser, memory, Redis, and CDN caching
- **Bundle Optimization** - Code splitting and tree shaking
- **Lazy Loading** - Load editors on demand
- **Virtual Scrolling** - Handle large collections efficiently
- **Database Optimization** - Query optimization and connection pooling
- **CDN Integration** - Global content delivery

### Performance Monitoring

Built-in performance tracking includes:
- Core Web Vitals (LCP, FID, CLS)
- Bundle size monitoring
- API response times
- Cache hit rates
- Database query performance

## Support

- **Documentation**: [docs.sightedit.com](https://docs.sightedit.com)
- **GitHub Issues**: [github.com/sightedit/sightedit/issues](https://github.com/sightedit/sightedit/issues)
- **Discord Community**: [discord.gg/sightedit](https://discord.gg/sightedit)
- **Enterprise Support**: enterprise@sightedit.com

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

**Built with ❤️ by the SightEdit team**