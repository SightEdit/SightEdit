# SightEdit API Reference

Complete API documentation for SightEdit's core functionality, React/Vue integrations, and server-side handlers.

## Table of Contents

- [Core API](#core-api)
- [React Integration](#react-integration)
- [Vue Integration](#vue-integration)
- [Server API](#server-api)
- [Plugin System](#plugin-system)
- [Security Configuration](#security-configuration)
- [Performance Configuration](#performance-configuration)
- [Monitoring & Telemetry](#monitoring--telemetry)

## Core API

### SightEdit.init(config)

Initializes the SightEdit system with the provided configuration.

```typescript
interface SightEditConfig {
  endpoint: string;                    // Backend API endpoint
  apiKey?: string;                     // API authentication key
  editModeKey?: string;                // Keyboard shortcut (default: 'e')
  theme?: 'light' | 'dark' | 'auto';   // UI theme
  locale?: string;                     // Localization (e.g., 'en', 'es', 'fr')
  debug?: boolean;                     // Enable debug logging
  
  // Security configuration
  security?: SecurityConfig;
  
  // Performance settings
  performance?: PerformanceConfig;
  
  // Monitoring settings
  monitoring?: MonitoringConfig;
  
  // Caching configuration
  caching?: CacheConfig;
  
  // Plugin configuration
  plugins?: PluginConfig[];
  
  // Event callbacks
  onSave?: (data: SaveData) => void;
  onError?: (error: SightEditError) => void;
  onEditModeToggled?: (isEditMode: boolean) => void;
  onContentChanged?: (data: ContentChangeData) => void;
}
```

**Example:**

```javascript
const sightEdit = SightEdit.init({
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key',
  theme: 'auto',
  debug: process.env.NODE_ENV === 'development',
  
  security: {
    csrf: { enabled: true },
    xss: { mode: 'strict' }
  },
  
  caching: {
    enabled: true,
    layers: {
      memory: { ttl: 600, maxSize: 50 }
    }
  },
  
  onSave: (data) => console.log('Content saved:', data),
  onError: (error) => console.error('SightEdit error:', error)
});
```

### Instance Methods

#### sightEdit.enterEditMode()

Enables edit mode, making all editable elements interactive.

```javascript
sightEdit.enterEditMode();
```

#### sightEdit.exitEditMode()

Disables edit mode and saves any pending changes.

```javascript
await sightEdit.exitEditMode();
```

#### sightEdit.toggleEditMode()

Toggles between edit and view modes.

```javascript
sightEdit.toggleEditMode();
```

#### sightEdit.isEditMode()

Returns the current edit mode state.

```javascript
const isEditing = sightEdit.isEditMode(); // boolean
```

#### sightEdit.save(data)

Saves content for a specific element.

```typescript
interface SaveData {
  sight: string;           // Element identifier
  value: any;             // New content value
  type: ElementType;      // Editor type
  context?: ElementContext; // Additional context
  previous?: any;         // Previous value for undo
  skipHistory?: boolean;  // Skip history tracking
}

await sightEdit.save({
  sight: 'hero-title',
  value: 'New Title',
  type: 'text'
});
```

#### sightEdit.batch(operations)

Performs multiple save operations atomically.

```typescript
interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  data: SaveData;
}

await sightEdit.batch([
  { type: 'update', data: { sight: 'title', value: 'New Title', type: 'text' } },
  { type: 'update', data: { sight: 'content', value: 'New Content', type: 'richtext' } }
]);
```

#### sightEdit.getActiveEditors()

Returns all currently active editor instances.

```javascript
const editors = sightEdit.getActiveEditors(); // Editor[]
```

#### sightEdit.getEditor(sight)

Gets a specific editor by its sight identifier.

```javascript
const editor = sightEdit.getEditor('hero-title'); // Editor | null
```

#### sightEdit.on(event, callback)

Registers an event listener.

```javascript
// Edit mode events
sightEdit.on('editModeEntered', () => console.log('Edit mode activated'));
sightEdit.on('editModeExited', () => console.log('Edit mode deactivated'));

// Content events
sightEdit.on('contentSaved', (data) => console.log('Content saved:', data));
sightEdit.on('contentChanged', (data) => console.log('Content changed:', data));

// Error events
sightEdit.on('error', (error) => console.error('Error occurred:', error));

// Editor events
sightEdit.on('editorCreated', (editor) => console.log('Editor created:', editor));
sightEdit.on('editorDestroyed', (sight) => console.log('Editor destroyed:', sight));
```

#### sightEdit.off(event, callback)

Removes an event listener.

```javascript
const handler = (data) => console.log(data);
sightEdit.on('contentSaved', handler);
sightEdit.off('contentSaved', handler);
```

#### sightEdit.destroy()

Cleans up the SightEdit instance and removes all event listeners.

```javascript
await sightEdit.destroy();
```

### Static Methods

#### SightEdit.registerEditor(type, EditorClass)

Registers a custom editor type.

```javascript
import { BaseEditor } from '@sightedit/core';

class CustomEditor extends BaseEditor {
  getType() { return 'custom'; }
  render() { /* Custom rendering logic */ }
  extractValue() { /* Value extraction logic */ }
  applyValue(value) { /* Value application logic */ }
}

SightEdit.registerEditor('custom', CustomEditor);
```

#### SightEdit.getInstance()

Gets the current SightEdit instance (singleton pattern).

```javascript
const sightEdit = SightEdit.getInstance(); // SightEditCore | null
```

## React Integration

### SightEditProvider

Root provider component that initializes SightEdit for the React application.

```tsx
import { SightEditProvider } from '@sightedit/react';

interface SightEditProviderProps {
  config: SightEditConfig;
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error }>;
  onError?: (error: Error) => void;
}

function App() {
  return (
    <SightEditProvider 
      config={{
        endpoint: '/api/sightedit',
        theme: 'light'
      }}
      onError={(error) => console.error(error)}
    >
      <YourApp />
    </SightEditProvider>
  );
}
```

### Editable Component

Wrapper component that makes its children editable.

```tsx
import { Editable } from '@sightedit/react';

interface EditableProps {
  sight: string;                    // Unique identifier
  type?: ElementType;               // Editor type (auto-detected if not provided)
  defaultValue?: any;               // Default content value
  required?: boolean;               // Required field validation
  placeholder?: string;             // Placeholder text
  schema?: ValidationSchema;        // Validation schema
  onSave?: (value: any) => void;   // Save callback
  onChange?: (value: any) => void; // Change callback
  children: React.ReactNode;
}

<Editable 
  sight="hero-title" 
  type="text" 
  required
  placeholder="Enter title..."
  onSave={(value) => console.log('Saved:', value)}
>
  <h1>Editable Title</h1>
</Editable>
```

Or use the new data attribute format directly:

```tsx
<h1 data-sightedit="text#hero-title[required,placeholder:'Enter title...']">
  Editable Title
</h1>
```

### React Hooks

#### useSightEdit()

Main hook for accessing SightEdit functionality.

```tsx
import { useSightEdit } from '@sightedit/react';

function MyComponent() {
  const {
    isInitialized,
    isEditMode,
    activeEditors,
    error,
    initialize,
    destroy,
    toggleEditMode,
    setEditMode,
    sightEdit
  } = useSightEdit({
    config: { endpoint: '/api/sightedit' },
    autoInit: true
  });

  return (
    <div>
      <button onClick={toggleEditMode} disabled={!isInitialized}>
        {isEditMode ? 'Exit Edit' : 'Enter Edit'}
      </button>
      {error && <div className="error">Error: {error.message}</div>}
    </div>
  );
}
```

#### useEditor()

Hook for managing individual editor instances.

```tsx
import { useEditor } from '@sightedit/react';

function EditableComponent({ sight, type, initialValue }) {
  const {
    value,
    setValue,
    isValid,
    errors,
    isSaving,
    isDirty,
    save,
    reset,
    validate
  } = useEditor({
    sight,
    type,
    initialValue,
    autoSave: true,
    debounceMs: 1000
  });

  return (
    <div>
      <input 
        value={value} 
        onChange={(e) => setValue(e.target.value)}
        className={isValid ? '' : 'error'}
      />
      {!isValid && <div className="errors">{errors.join(', ')}</div>}
      {isSaving && <span>Saving...</span>}
      {isDirty && <button onClick={save}>Save Now</button>}
    </div>
  );
}
```

## Vue Integration

### SightEditPlugin

Vue plugin for registering SightEdit globally.

```typescript
import { createApp } from 'vue';
import SightEditPlugin from '@sightedit/vue';

const app = createApp(App);
app.use(SightEditPlugin, {
  endpoint: '/api/sightedit',
  theme: 'auto'
});
```

### Vue Directives

#### v-sight

Basic directive for making elements editable.

```vue
<template>
  <!-- New format (recommended) -->
  <h1 data-sightedit="text#page-title">Title</h1>
  
  <!-- Vue directive (also supported) -->
  <p v-sight="'page-subtitle'">Subtitle</p>
  
  <!-- With properties -->
  <div data-sightedit="richtext#content[required,maxLength:500]">Content</div>
</template>
```

#### v-editable

Advanced directive with configuration options.

```vue
<template>
  <!-- Vue directive format -->
  <div v-editable="{
    sight: 'page-content',
    type: 'richtext',
    required: true,
    placeholder: 'Enter content...',
    schema: { maxLength: 500 },
    onSave: handleSave
  }">
    Content here...
  </div>
  
  <!-- Or use data attribute (cleaner) -->
  <div data-sightedit='{"type":"richtext","id":"page-content","required":true,"maxLength":500}'>
    Content here...
  </div>
</template>

<script setup>
function handleSave(value) {
  console.log('Content saved:', value);
}
</script>
```

## Server API

### Request/Response Format

#### Save Content

**POST** `/api/sightedit/save`

**Request:**
```json
{
  "sight": "element-id",
  "value": "new content",
  "type": "text",
  "context": {
    "url": "/current-page",
    "user": "user-123"
  },
  "previous": "old content"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sight": "element-id",
    "value": "new content",
    "timestamp": 1640995200000,
    "version": 2
  }
}
```

#### Node.js Server Handler

```javascript
import { createSightEditHandler } from '@sightedit/server-node';

const handler = createSightEditHandler({
  // Storage configuration
  storage: {
    type: 'postgresql',
    connection: {
      host: 'localhost',
      database: 'sightedit',
      user: 'postgres',
      password: 'password'
    }
  },
  
  // Authentication
  auth: {
    required: true,
    validateToken: async (token) => {
      // Validate JWT token and return user info
      return { id: 'user-123', role: 'editor' };
    }
  },
  
  // Security settings
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
  }
});

app.use('/api/sightedit', handler);
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
      secret: 'your-csrf-secret',
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
        'style-src': ["'self'", "'nonce-{nonce}'"],
        'img-src': ["'self'", 'data:', 'https:']
      },
      
      reportUri: '/api/csp-report'
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
      mode: 'strict',
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      allowedAttributes: ['href', 'target', 'class']
    }
  }
};
```

## Performance Configuration

### Caching

```javascript
const config = {
  caching: {
    enabled: true,
    
    layers: {
      browser: {
        ttl: 300,
        cacheControl: 'public, max-age=300'
      },
      
      memory: {
        enabled: true,
        ttl: 600,
        maxSize: 100,
        maxMemory: '50MB'
      },
      
      redis: {
        enabled: true,
        ttl: 3600,
        host: 'localhost',
        port: 6379,
        keyPrefix: 'sightedit:'
      }
    }
  }
};
```

## Monitoring & Telemetry

### Metrics Configuration

```javascript
const config = {
  telemetry: {
    enabled: true,
    endpoint: '/api/metrics',
    
    metrics: {
      performance: {
        enabled: true,
        metrics: [
          'page-load-time',
          'editor-render-time',
          'save-response-time'
        ]
      },
      
      usage: {
        enabled: true,
        metrics: [
          'active-users',
          'editor-usage',
          'content-changes'
        ]
      },
      
      errors: {
        enabled: true,
        includeStackTrace: true,
        metrics: [
          'error-rate',
          'error-types'
        ]
      },
      
      security: {
        enabled: true,
        metrics: [
          'threats-detected',
          'csp-violations',
          'failed-auth-attempts'
        ]
      }
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
```

This API reference provides comprehensive documentation for integrating and customizing SightEdit in production applications.