# SightEdit - Universal Visual Editor for Any Website

[![npm version](https://img.shields.io/npm/v/@sightedit/core.svg)](https://www.npmjs.com/package/@sightedit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@sightedit/core)](https://bundlephobia.com/package/@sightedit/core)
[![Build Status](https://github.com/sightedit/sightedit/workflows/CI/badge.svg)](https://github.com/sightedit/sightedit/actions)

Transform any website into a visual editor with a single line of code. No backend changes required.

## ✨ Features

- **🚀 Instant Setup** - Add one script tag and you're ready
- **🎯 Smart Detection** - Automatically identifies editable content
- **📝 12 Editor Types** - Text, RichText, Image, File, JSON, Color, Date, Number, Select, Link, Collection, Multi-Select
- **🎨 Beautiful Modal UIs** - Professional modal interfaces for each editor type
- **💾 Batch Updates** - All changes saved together with "Save All" button
- **📦 Change Tracking** - Local storage persistence, full undo/discard capability
- **🔒 Enterprise Security** - XSS protection, CSP compliance, input sanitization
- **⚡ Blazing Fast** - ~280KB bundle, <50ms initialization
- **🌍 Framework Agnostic** - Works with React, Vue, Angular, or vanilla JS
- **📱 Mobile Ready** - Touch-optimized with responsive design
- **🎭 Edit Mode Toolbar** - Save All / Discard All / Exit controls
- **✨ Visual Indicators** - Changed items highlighted, hover tooltips

## 🚀 Quick Start

### 1. Install via NPM

```bash
npm install @sightedit/core
```

### 2. Initialize in Your App

```javascript
import SightEdit from '@sightedit/core';

// Initialize with your backend endpoint
const sightEdit = SightEdit.init({
  endpoint: 'https://your-api.com/sightedit',
  auth: {
    headers: async () => ({
      'Authorization': `Bearer ${await getToken()}`
    })
  }
});
```

### 3. Mark Editable Content

Use the powerful `data-sightedit` attribute with multiple format options:

```html
<!-- Simple format -->
<h1 data-sightedit="text">Edit this heading</h1>

<!-- With ID -->
<p data-sightedit="text#description">Product description</p>

<!-- With validation -->
<span data-sightedit="number#price[min:0,max:9999,step:0.01]">$99.99</span>

<!-- JSON format for complex configs -->
<div data-sightedit='{"type":"richtext","id":"content","toolbar":["bold","italic","link"]}'>
  <p>Rich text content here</p>
</div>
```

### 4. Toggle Edit Mode

Press `Ctrl/Cmd + E` to enter edit mode. In edit mode:
- **Toolbar appears** at the top with Save All / Discard All buttons
- **Editable elements** get blue dashed outlines
- **Click any element** to open its editor
- **Modified elements** turn yellow
- **All changes tracked locally** until you click "Save All"
- **No backend calls** until explicit save

## 📖 Data Attribute Format

SightEdit supports three flexible formats:

### Simple Format
```html
<div data-sightedit="text">Simple text</div>
<img data-sightedit="image" src="photo.jpg">
```

### Short Syntax
```html
<h1 data-sightedit="text#title[required,maxLength:100]">Title</h1>
<input data-sightedit="date#eventDate[min:2024-01-01,max:2024-12-31]">
```

### JSON Format
```html
<div data-sightedit='{
  "type": "select",
  "id": "status",
  "options": ["Draft", "Published", "Archived"],
  "required": true
}'>Published</div>
```

## 🎯 Editor Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | Single-line text | Headings, labels |
| `richtext` | Formatted text with toolbar | Articles, descriptions |
| `number` | Numeric input with validation | Prices, quantities |
| `date` | Date/time picker | Events, deadlines |
| `color` | Color picker | Themes, backgrounds |
| `image` | Image upload with preview | Photos, avatars |
| `file` | File upload | Documents, PDFs |
| `link` | URL input with validation | Links, CTAs |
| `select` | Dropdown selection | Categories, status |
| `collection` | Repeatable items | Lists, galleries |
| `json` | JSON editor with syntax highlighting | Configs, data |

## 🎨 Editor Modes

### Inline Mode
Edit directly in place - perfect for text and numbers
```html
<h1 data-sightedit="text#title">Click to edit</h1>
```

### Modal Mode
Full-screen editor for rich content
```html
<div data-sightedit='{"type":"richtext","mode":"modal"}'>
  Long article content...
</div>
```

### Sidebar Mode
Side panel for complex editors
```html
<img data-sightedit='{"type":"image","mode":"sidebar"}' src="photo.jpg">
```

### Tooltip Mode
Compact floating editor
```html
<span data-sightedit="color#theme">#667eea</span>
```

## ⚙️ Configuration

```javascript
SightEdit.init({
  // Required
  endpoint: 'https://api.example.com/sightedit',
  
  // Authentication
  auth: {
    headers: async () => ({ 'Authorization': 'Bearer token' }),
    credentials: 'include'
  },
  
  // Features
  features: {
    richText: true,
    imageUpload: true,
    collaboration: false,
    autoSave: true,
    versionHistory: true
  },
  
  // Performance
  performance: {
    lazyLoad: true,
    debounceMs: 500,
    batchSize: 50,
    cacheEnabled: true
  },
  
  // UI Customization
  ui: {
    theme: 'light',
    position: 'bottom-right',
    hotkey: 'ctrl+e',
    animations: true
  },
  
  // Advanced
  debug: false,
  sanitization: {
    enabled: true,
    allowedTags: ['p', 'strong', 'em', 'a'],
    allowedAttributes: ['href', 'title']
  }
});
```

## 🔄 Backend Integration

SightEdit sends standardized requests to your backend:

### Save Endpoint
```http
POST /sightedit/save
Content-Type: application/json

{
  "sight": "hero-title",
  "value": "New Title",
  "type": "text",
  "context": {
    "url": "https://example.com/page",
    "selector": "[data-sightedit='text#hero-title']"
  }
}
```

### Batch Operations
```http
POST /sightedit/batch
Content-Type: application/json

{
  "operations": [
    { "sight": "title", "value": "New Title", "type": "text" },
    { "sight": "price", "value": 99.99, "type": "number" }
  ]
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "sight": "hero-title",
    "value": "New Title",
    "version": 2,
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

## 🛡️ Security Features

- **XSS Protection**: All content sanitized with DOMPurify
- **CSRF Tokens**: Automatic token management
- **CSP Compliant**: Works with strict Content Security Policies
- **Input Validation**: Client and server-side validation
- **Rate Limiting**: Built-in throttling and debouncing
- **Audit Logging**: Track all changes with user attribution

## 🚀 Performance Optimizations

- **Smart Batching**: Groups changes for fewer requests
- **Local Queue**: Changes saved locally until synced
- **Offline Support**: Full functionality without internet
- **Lazy Loading**: Editors loaded on-demand
- **Virtual Scrolling**: Handles thousands of editable elements
- **Service Worker**: Optional caching layer
- **CDN Ready**: Static assets can be served from CDN

## 📦 Framework Integrations

### React
```jsx
import { SightEditProvider, useEditable } from '@sightedit/react';

function App() {
  return (
    <SightEditProvider config={config}>
      <EditableHeading />
    </SightEditProvider>
  );
}

function EditableHeading() {
  const { ref, isEditing } = useEditable({
    type: 'text',
    sight: 'main-heading'
  });
  
  return <h1 ref={ref}>Editable Content</h1>;
}
```

### Vue
```vue
<template>
  <div v-sightedit="{ type: 'text', id: 'title' }">
    {{ title }}
  </div>
</template>

<script>
import { sightEditDirective } from '@sightedit/vue';

export default {
  directives: {
    sightedit: sightEditDirective
  }
};
</script>
```

### Angular
```typescript
import { SightEditModule } from '@sightedit/angular';

@Component({
  template: `
    <h1 [sightEdit]="{ type: 'text', id: 'title' }">
      {{ title }}
    </h1>
  `
})
export class AppComponent { }
```

## 🔧 Advanced Features

### Custom Editors
```javascript
SightEdit.registerEditor('custom-type', {
  render: (element, value) => {
    // Custom render logic
  },
  getValue: (element) => {
    // Extract value
  },
  validate: (value) => {
    // Validation logic
  }
});
```

### Hooks & Events
```javascript
sightEdit.on('content:changed', ({ sight, value, previous }) => {
  console.log(`${sight} changed from ${previous} to ${value}`);
});

sightEdit.on('save:success', ({ response }) => {
  showNotification('Changes saved!');
});

sightEdit.on('save:error', ({ error }) => {
  handleError(error);
});
```

### Programmatic Control
```javascript
// Enter/exit edit mode
sightEdit.enterEditMode();
sightEdit.exitEditMode();

// Save all changes
await sightEdit.saveAll();

// Get all editable elements
const elements = sightEdit.getEditableElements();

// Update content programmatically
sightEdit.updateContent('sight-id', 'new value');
```

## 🌍 Internationalization

```javascript
SightEdit.init({
  i18n: {
    locale: 'en',
    translations: {
      'edit.button': 'Edit',
      'save.button': 'Save',
      'cancel.button': 'Cancel'
    }
  }
});
```

## 📊 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari 14+, Chrome Android 90+)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repo
git clone https://github.com/sightedit/sightedit.git

# Install dependencies
npm install

# Run development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## 📄 License

MIT © SightEdit

## 🔗 Links

- [Documentation](docs/)
- [API Reference](docs/API.md)
- [Quick Start Guide](docs/QUICK-START.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Examples](examples/)
- [NPM Package](https://www.npmjs.com/package/@sightedit/core)

## 💡 Why SightEdit?

- **No Backend Changes**: Works with your existing API
- **Progressive Enhancement**: Enhance your site without rebuilding
- **Developer Friendly**: Clean API, TypeScript support, great DX
- **Production Ready**: Used by enterprises processing millions of edits
- **Future Proof**: Regular updates and active community

---

Built with ❤️ by developers, for developers.