# @sightedit/core

> Universal Visual Editing System - Core Library

[![npm version](https://badge.fury.io/js/@sightedit%2Fcore.svg)](https://www.npmjs.com/package/@sightedit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

## Overview

The core library that powers SightEdit's universal visual editing system. Transform any HTML element into an editable component with advanced backend-driven schemas.

## Features

### 🎯 Advanced Schema System
- Backend-driven editor configuration
- Minimal HTML markup required
- Context-aware editor selection
- Dynamic loading based on user roles

### 🚀 Specialized Editors
- **Product Selector**: Database-driven product selection with filtering
- **HTML Designer**: Visual editor for entire HTML sections  
- **12+ Built-in Types**: Text, RichText, Image, Collection, Color, Date, Number, Select, JSON, Link

### ⚡ Performance Optimized
- <20KB gzipped with advanced features
- Schema caching with TTL
- Lazy loading of advanced editors
- Offline-first architecture

## Installation

```bash
npm install @sightedit/core
```

## Quick Start

### Basic Usage
```html
<script src="https://unpkg.com/@sightedit/core/dist/sightedit.min.js"></script>
<script>
  SightEdit.init({
    endpoint: '/api/sightedit'
  });
</script>

<h1 data-sight="hero.title">Editable Title</h1>
```

### Advanced Schema-Driven Usage
```javascript
import SightEdit from '@sightedit/core';

const sightEdit = new SightEdit({
  endpoint: '/api/sightedit',
  schemaRegistry: {
    endpoint: '/api/schema',
    cache: true,
    ttl: 300000 // 5 minutes
  }
});
```

```html
<!-- Clean HTML - Configuration from backend -->
<section data-sight="products.featured">Product Grid</section>
<div data-sight="hero.main">Hero Section</div>
```

## Advanced Editors

### Product Selector

Replace products from your database with rich filtering:

```html
<section data-sight="products.featured">
  <!-- Current products -->
</section>
```

Backend schema:
```json
{
  "sight": "products.featured",
  "editor": { "type": "product-selector" },
  "productConfig": {
    "source": { "endpoint": "/api/products" },
    "selection": { "mode": "replacement", "min": 3, "max": 3 },
    "filters": [
      { "field": "category", "type": "select" }
    ]
  }
}
```

### HTML Designer

Visual editor for entire sections:

```html
<section data-sight="hero.main">
  <div class="hero-content">
    <h1>Title</h1>
    <p>Description</p>
  </div>
</section>
```

Features:
- 🎨 Visual WYSIWYG editing
- 🧩 Drag & drop components  
- 📱 Responsive preview
- 🎭 Template library
- 🎨 Property panel

## Editor Types

| Type | Description | Use Case |
|------|-------------|----------|
| `text` | Simple text editing | Headings, labels |
| `richtext` | WYSIWYG editor | Content blocks |
| `image` | Image upload/URL | Hero images, photos |
| `collection` | List management | Menus, galleries |
| `color` | Color picker | Brand colors |
| `date` | Date picker | Event dates |
| `number` | Numeric input | Prices, quantities |
| `select` | Dropdown menu | Categories, options |
| `json` | Structured data | Settings, metadata |
| `link` | URL editing | Navigation, CTAs |
| `product-selector` | Database products | E-commerce |
| `html-designer` | Section editor | Landing pages |

## Configuration

### Basic Config
```javascript
{
  endpoint: '/api/sightedit',
  debug: false,
  theme: {
    primaryColor: '#667eea',
    borderRadius: '6px'
  }
}
```

### Schema Registry Config  
```javascript
{
  endpoint: '/api/sightedit',
  schemaRegistry: {
    endpoint: '/api/schema',
    cache: true,
    ttl: 300000, // 5 minutes
  },
  editors: {
    'custom-editor': CustomEditorClass
  }
}
```

## Schema API

Your backend should implement:

```javascript
// POST /api/schema/:sight
app.post('/api/schema/:sight', (req, res) => {
  const { sight } = req.params;
  const { context } = req.body;
  
  const schema = {
    sight,
    editor: {
      type: 'product-selector',
      position: 'modal'
    },
    dataSource: {
      endpoint: '/api/products'
    },
    // ... configuration
  };
  
  res.json(schema);
});
```

## Events

```javascript
sightEdit.on('editModeEntered', () => {
  console.log('Edit mode enabled');
});

sightEdit.on('elementSaved', (data) => {
  console.log('Element saved:', data);
});

sightEdit.on('schemaLoaded', (schema) => {
  console.log('Schema loaded:', schema);
});
```

## Custom Editors

```javascript
import { BaseEditor } from '@sightedit/core';

class CustomEditor extends BaseEditor {
  render() {
    // Create your editor UI
  }
  
  extractValue() {
    // Return current value
  }
  
  applyValue(value) {
    // Apply new value
  }
}

// Register the editor
sightEdit.registerEditor('custom', CustomEditor);
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import SightEdit, { 
  SightEditConfig,
  AdvancedSchema,
  ProductSelectorSchema,
  HTMLDesignerSchema
} from '@sightedit/core';

const config: SightEditConfig = {
  endpoint: '/api/sightedit',
  schemaRegistry: {
    endpoint: '/api/schema'
  }
};
```

## Browser Support

- Chrome 60+
- Firefox 60+  
- Safari 12+
- Edge 79+

## Bundle Sizes

- Core library: ~18KB gzipped
- With all advanced editors: ~25KB gzipped
- Individual editors loaded on-demand

## Examples

See `examples/` directory for:
- Vanilla HTML implementation
- E-commerce product management
- Advanced schema usage
- Custom editor development

## Migration Guide

### From v1.x to v2.x

```javascript
// Before
<div data-sight="collection" 
     data-sight-min="3"
     data-sight-max="3"
     data-sight-label="Products">

// After  
<div data-sight="products.featured">
```

Backend schema now controls all configuration.

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## License

MIT © SightEdit Team