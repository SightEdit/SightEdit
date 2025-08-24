# SightEdit Installation Guide

This guide covers all installation methods for SightEdit in different environments and frameworks.

## Table of Contents

- [Quick Start](#quick-start)
- [CDN Installation](#cdn-installation)
- [NPM Installation](#npm-installation)
- [Framework Integration](#framework-integration)
- [Backend Setup](#backend-setup)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Development Setup](#development-setup)

## Quick Start

The fastest way to get started with SightEdit is using the CDN:

```html
<!DOCTYPE html>
<html>
<head>
    <title>SightEdit Demo</title>
</head>
<body>
    <!-- New concise format -->
    <h1 data-sightedit="text">Click to edit this heading</h1>
    <p data-sightedit="richtext">This paragraph supports <strong>rich text</strong> editing.</p>
    
    <!-- With properties -->
    <img data-sightedit="image[maxSize:5MB]" src="photo.jpg" alt="Photo">
    
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

## CDN Installation

### Latest Version

```html
<!-- Production (minified) -->
<script src="https://cdn.sightedit.com/v1/sightedit.min.js"></script>

<!-- Development (unminified with source maps) -->
<script src="https://cdn.sightedit.com/v1/sightedit.js"></script>
```

### Specific Version

```html
<!-- Lock to specific version for production -->
<script src="https://cdn.sightedit.com/v1.2.0/sightedit.min.js"></script>
```

### Integrity Check

```html
<!-- With Subresource Integrity (SRI) for security -->
<script 
    src="https://cdn.sightedit.com/v1/sightedit.min.js"
    integrity="sha384-..."
    crossorigin="anonymous">
</script>
```

### ES Module

```html
<!-- ES Module for modern browsers -->
<script type="module">
    import SightEdit from 'https://cdn.sightedit.com/v1/sightedit.esm.js';
    
    SightEdit.init({
        endpoint: '/api/sightedit'
    });
</script>
```

## NPM Installation

### Core Package

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

### With TypeScript Support

```bash
npm install @sightedit/core
npm install -D @types/node
```

```typescript
import SightEdit, { SightEditConfig } from '@sightedit/core';

const config: SightEditConfig = {
    endpoint: '/api/sightedit',
    theme: 'auto',
    debug: process.env.NODE_ENV === 'development'
};

const sightEdit = SightEdit.init(config);
```

### Plugin Installation

```bash
# Markdown editor plugin
npm install @sightedit/plugin-markdown

# Image cropping plugin
npm install @sightedit/plugin-image-crop

# Code editor plugin
npm install @sightedit/plugin-code-editor
```

## Framework Integration

### React

#### Installation

```bash
npm install @sightedit/react
```

#### Basic Setup

```tsx
import { SightEditProvider, Editable } from '@sightedit/react';

function App() {
    return (
        <SightEditProvider config={{
            endpoint: '/api/sightedit'
        }}>
            <Editable sight="hero-title" type="text">
                <h1>Editable Title</h1>
            </Editable>
        </SightEditProvider>
    );
}

export default App;
```

#### Advanced React Setup

```tsx
import { SightEditProvider, useSightEdit } from '@sightedit/react';
import { ErrorBoundary } from 'react-error-boundary';

function App() {
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <SightEditProvider 
                config={{
                    endpoint: '/api/sightedit',
                    theme: 'auto',
                    security: {
                        csrf: { enabled: true },
                        xss: { mode: 'strict' }
                    },
                    performance: {
                        lazyLoading: true,
                        debounceMs: 300
                    }
                }}
                onError={(error) => {
                    console.error('SightEdit error:', error);
                    // Send to error tracking service
                }}
            >
                <MainApp />
            </SightEditProvider>
        </ErrorBoundary>
    );
}
```

#### React Hooks

```tsx
import { useSightEdit, useEditor } from '@sightedit/react';

function EditableComponent() {
    const { isEditMode, toggleEditMode } = useSightEdit();
    
    const {
        value,
        setValue,
        isValid,
        save,
        isDirty
    } = useEditor({
        sight: 'product-title',
        type: 'text',
        initialValue: 'Product Name',
        autoSave: true
    });

    return (
        <div>
            <input 
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!isEditMode}
            />
            {isDirty && <button onClick={save}>Save</button>}
        </div>
    );
}
```

### Vue 3

#### Installation

```bash
npm install @sightedit/vue
```

#### Plugin Registration

```javascript
import { createApp } from 'vue';
import SightEditPlugin from '@sightedit/vue';
import App from './App.vue';

const app = createApp(App);

app.use(SightEditPlugin, {
    endpoint: '/api/sightedit',
    theme: 'auto'
});

app.mount('#app');
```

#### Component Usage

```vue
<template>
    <div>
        <!-- Directive-based editing -->
        <h1 v-sight="'page-title'">{{ title }}</h1>
        
        <!-- Component-based editing -->
        <SightEditable 
            sight="page-content"
            type="richtext"
            :default-value="content"
            @save="handleSave"
        >
            <div v-html="content"></div>
        </SightEditable>
        
        <!-- Advanced configuration -->
        <div v-editable="{
            sight: 'product-description',
            type: 'richtext',
            required: true,
            validation: { maxLength: 500 },
            placeholder: 'Enter description...'
        }">
            {{ description }}
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSightEdit } from '@sightedit/vue';

const { isEditMode, toggleEditMode } = useSightEdit();

const title = ref('Page Title');
const content = ref('<p>Page content here...</p>');
const description = ref('Product description');

const handleSave = (value) => {
    console.log('Content saved:', value);
};
</script>
```

#### Vue Composables

```vue
<script setup>
import { useEditorState, useSightEdit } from '@sightedit/vue';

const { sightEdit, isInitialized } = useSightEdit();

const {
    value,
    setValue,
    isValid,
    errors,
    save,
    canUndo,
    undo
} = useEditorState({
    sight: 'article-content',
    type: 'richtext',
    initialValue: '<p>Article content...</p>',
    autoSave: true,
    debounceMs: 500
});
</script>
```

### Angular

#### Installation

```bash
npm install @sightedit/angular
```

#### Module Setup

```typescript
import { NgModule } from '@angular/core';
import { SightEditModule } from '@sightedit/angular';

@NgModule({
    imports: [
        SightEditModule.forRoot({
            endpoint: '/api/sightedit',
            theme: 'auto'
        })
    ]
})
export class AppModule {}
```

#### Component Usage

```typescript
import { Component } from '@angular/core';
import { SightEditService } from '@sightedit/angular';

@Component({
    selector: 'app-editable',
    template: `
        <div sightEditable="page-title" type="text">
            <h1>{{ title }}</h1>
        </div>
        
        <button (click)="toggleEditMode()">
            {{ isEditMode ? 'Exit Edit' : 'Enter Edit' }}
        </button>
    `
})
export class EditableComponent {
    title = 'Page Title';
    
    constructor(private sightEdit: SightEditService) {}
    
    get isEditMode() {
        return this.sightEdit.isEditMode();
    }
    
    toggleEditMode() {
        this.sightEdit.toggleEditMode();
    }
}
```

### Next.js

#### Installation

```bash
npm install @sightedit/react
```

#### Configuration

```javascript
// next.config.js
module.exports = {
    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false
        };
        return config;
    }
};
```

#### Pages Setup

```tsx
// pages/_app.tsx
import { SightEditProvider } from '@sightedit/react';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <SightEditProvider config={{
            endpoint: '/api/sightedit'
        }}>
            <Component {...pageProps} />
        </SightEditProvider>
    );
}

export default MyApp;
```

#### API Routes

```typescript
// pages/api/sightedit/[...slug].ts
import { createSightEditHandler } from '@sightedit/server-node';

const handler = createSightEditHandler({
    storage: {
        type: 'file',
        path: './content'
    }
});

export default handler;
```

## Backend Setup

### Node.js / Express

#### Installation

```bash
npm install @sightedit/server-node
```

#### Basic Setup

```javascript
const express = require('express');
const { createSightEditHandler } = require('@sightedit/server-node');

const app = express();

app.use('/api/sightedit', createSightEditHandler({
    storage: {
        type: 'file',
        path: './content'
    }
}));

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

#### Advanced Configuration

```javascript
const handler = createSightEditHandler({
    // Storage configuration
    storage: {
        type: 'postgresql',
        connection: {
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        }
    },
    
    // Security
    security: {
        csrf: {
            enabled: true,
            cookieName: 'sightedit-csrf'
        },
        rateLimit: {
            enabled: true,
            maxRequests: 100,
            windowMs: 15 * 60 * 1000
        }
    },
    
    // Authentication
    auth: {
        required: true,
        validateUser: async (req) => {
            const token = req.headers.authorization?.replace('Bearer ', '');
            return await validateJwtToken(token);
        }
    },
    
    // File uploads
    upload: {
        enabled: true,
        destination: './uploads',
        maxFileSize: 10 * 1024 * 1024 // 10MB
    }
});
```

### PHP

#### Installation

```bash
composer require sightedit/server-php
```

#### Basic Setup

```php
<?php
require_once 'vendor/autoload.php';

use SightEdit\Server\Handler;

$handler = new Handler([
    'storage' => [
        'type' => 'file',
        'path' => './content'
    ]
]);

$handler->handle();
```

### Python / Django

#### Installation

```bash
pip install sightedit-server-python
```

#### Django Setup

```python
# settings.py
INSTALLED_APPS = [
    # ... other apps
    'sightedit',
]

SIGHTEDIT_CONFIG = {
    'storage': {
        'type': 'django_orm'
    },
    'auth': {
        'required': True
    }
}

# urls.py
from django.urls import path, include

urlpatterns = [
    # ... other URLs
    path('api/sightedit/', include('sightedit.urls')),
]
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=sightedit
      - POSTGRES_USER=sightedit
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## Kubernetes Deployment

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sightedit
  labels:
    app: sightedit
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
        image: sightedit/app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          value: postgres-service
        - name: REDIS_HOST
          value: redis-service
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Service and Ingress

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: sightedit-service
spec:
  selector:
    app: sightedit
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sightedit-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.sightedit.com
    secretName: sightedit-tls
  rules:
  - host: api.sightedit.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sightedit-service
            port:
              number: 80
```

## Development Setup

### Prerequisites

- Node.js 16+
- npm 8+
- Git

### Clone and Setup

```bash
git clone https://github.com/sightedit/sightedit.git
cd sightedit

# Install dependencies
npm install

# Bootstrap monorepo
npm run bootstrap

# Build all packages
npm run build

# Start development mode
npm run dev
```

### Project Structure

```
sightedit/
├── packages/
│   ├── core/              # Core library
│   ├── react/             # React integration
│   ├── vue/               # Vue integration
│   ├── server/
│   │   ├── node/          # Node.js server
│   │   └── php/           # PHP server
│   └── plugin-*/          # Official plugins
├── examples/              # Example applications
├── docs/                  # Documentation
└── docker/                # Docker configurations
```

### Running Examples

```bash
# Vanilla HTML example
cd examples/vanilla-html
npm install
npm start

# React example
cd examples/react
npm install
npm run dev

# Vue example
cd examples/vue
npm install
npm run dev
```

### Testing

```bash
# Run all tests
npm run test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Building for Production

```bash
# Build all packages
npm run build

# Build specific package
cd packages/core
npm run build
```

This installation guide provides comprehensive instructions for setting up SightEdit in any environment, from quick prototypes to production deployments.