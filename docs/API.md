# API Reference

Complete API documentation for SightEdit core library, integrations, and backend.

## 📚 Table of Contents

- [Core API](#core-api)
- [Data Attribute API](#data-attribute-api)
- [JavaScript API](#javascript-api)
- [Event System](#event-system)
- [Backend API](#backend-api)
- [Framework Integrations](#framework-integrations)
- [Plugin API](#plugin-api)
- [TypeScript Types](#typescript-types)

## Core API

### Initialization

#### `SightEdit.init(config)`

Initialize SightEdit with configuration.

```javascript
const sightEdit = SightEdit.init({
  endpoint: 'https://api.example.com/sightedit',
  auth: {
    headers: async () => ({
      'Authorization': `Bearer ${token}`
    })
  },
  debug: true
});
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | Yes | Backend API endpoint URL |
| `auth` | AuthConfig | No | Authentication configuration |
| `features` | Features | No | Enable/disable features |
| `performance` | Performance | No | Performance settings |
| `ui` | UIConfig | No | UI customization |
| `debug` | boolean | No | Enable debug logging |

**Returns:** `SightEditInstance`

### Instance Methods

#### `enterEditMode()`
Enable edit mode programmatically.

```javascript
sightEdit.enterEditMode();
```

#### `exitEditMode()`
Exit edit mode programmatically.

```javascript
sightEdit.exitEditMode();
```

#### `toggleEditMode()`
Toggle between edit and view modes.

```javascript
sightEdit.toggleEditMode();
```

#### `isEditMode()`
Check if currently in edit mode.

```javascript
const editing = sightEdit.isEditMode(); // boolean
```

#### `saveAll()`
Save all pending changes.

```javascript
await sightEdit.saveAll();
```

#### `getEditableElements()`
Get all editable elements on the page.

```javascript
const elements = sightEdit.getEditableElements();
// Returns: DetectedElement[]
```

#### `updateContent(sight, value)`
Programmatically update content.

```javascript
await sightEdit.updateContent('hero-title', 'New Title');
```

#### `refresh()`
Re-scan the DOM for editable elements.

```javascript
sightEdit.refresh();
```

#### `destroy()`
Clean up and remove SightEdit.

```javascript
sightEdit.destroy();
```

## Data Attribute API

### Attribute Formats

#### Simple Format
```html
<div data-sightedit="text">Content</div>
```

#### With ID
```html
<div data-sightedit="text#unique-id">Content</div>
```

#### With Properties
```html
<div data-sightedit="text#id[required,maxLength:100]">Content</div>
```

#### JSON Format
```html
<div data-sightedit='{"type":"text","id":"title","required":true}'>Content</div>
```

### Property Reference

| Property | Types | Description |
|----------|-------|-------------|
| `type` | all | Editor type (text, richtext, etc.) |
| `id` | all | Unique identifier |
| `required` | all | Field is required |
| `readonly` | all | Field is read-only |
| `placeholder` | text, richtext | Placeholder text |
| `maxLength` | text, richtext | Maximum character length |
| `minLength` | text, richtext | Minimum character length |
| `pattern` | text | Regex validation pattern |
| `min` | number, date | Minimum value |
| `max` | number, date | Maximum value |
| `step` | number | Increment step |
| `options` | select | Available options |
| `multiple` | select, image, file | Allow multiple selections |
| `accept` | image, file | Accepted file types |
| `maxSize` | image, file | Maximum file size |
| `toolbar` | richtext | Toolbar buttons |
| `mode` | all | Editor mode (inline, modal, sidebar, tooltip) |

## JavaScript API

### Editor Registration

#### `registerEditor(type, implementation)`
Register a custom editor type.

```javascript
SightEdit.registerEditor('custom', {
  defaultMode: 'inline',
  
  render(element, value, options) {
    // Render editor UI
  },
  
  getValue(element) {
    // Extract current value
    return element.textContent;
  },
  
  validate(value, options) {
    // Validate value
    if (!value && options.required) {
      return 'Value is required';
    }
    return true;
  },
  
  applyValue(element, value) {
    // Apply value to element
    element.textContent = value;
  }
});
```

### Batch Operations

#### `batchSave(operations)`
Save multiple changes at once.

```javascript
await sightEdit.batchSave([
  { sight: 'title', value: 'New Title', type: 'text' },
  { sight: 'price', value: 99.99, type: 'number' }
]);
```

### Queue Management

#### `getQueueSize()`
Get number of pending changes.

```javascript
const pending = sightEdit.getQueueSize(); // number
```

#### `clearQueue()`
Clear all pending changes.

```javascript
sightEdit.clearQueue();
```

#### `flushQueue()`
Force save all queued changes.

```javascript
await sightEdit.flushQueue();
```

## Event System

### Event Subscription

#### `on(event, handler)`
Subscribe to events.

```javascript
sightEdit.on('content:changed', ({ sight, value, previous }) => {
  console.log(`${sight} changed from ${previous} to ${value}`);
});
```

#### `once(event, handler)`
Subscribe to event once.

```javascript
sightEdit.once('save:success', () => {
  console.log('First save completed');
});
```

#### `off(event, handler)`
Unsubscribe from event.

```javascript
sightEdit.off('content:changed', handler);
```

### Available Events

| Event | Payload | Description |
|-------|---------|-------------|
| `init` | `{ config }` | SightEdit initialized |
| `destroy` | `{}` | SightEdit destroyed |
| `mode:changed` | `{ editMode }` | Edit mode toggled |
| `content:changed` | `{ sight, value, previous }` | Content edited |
| `save:start` | `{ data }` | Save started |
| `save:success` | `{ data, response }` | Save succeeded |
| `save:error` | `{ data, error }` | Save failed |
| `batch:start` | `{ operations }` | Batch save started |
| `batch:success` | `{ operations, response }` | Batch save succeeded |
| `batch:error` | `{ operations, error }` | Batch save failed |
| `queue:add` | `{ change }` | Change queued |
| `queue:flush` | `{ size }` | Queue flushed |
| `editor:open` | `{ type, element }` | Editor opened |
| `editor:close` | `{ type, element }` | Editor closed |
| `editor:save` | `{ type, value }` | Editor saved |
| `editor:cancel` | `{ type }` | Editor cancelled |
| `validation:error` | `{ field, error }` | Validation failed |
| `upload:progress` | `{ percent, file }` | Upload progress |
| `upload:complete` | `{ file, url }` | Upload completed |
| `error` | `{ error, context }` | General error |

## Backend API

### Endpoints

#### POST `/save`
Save a single change.

**Request:**
```json
{
  "sight": "hero-title",
  "value": "New Title",
  "type": "text",
  "context": {
    "url": "https://example.com/page",
    "selector": "[data-sightedit='text#hero-title']",
    "path": "/page",
    "metadata": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sight": "hero-title",
    "value": "New Title",
    "version": 2,
    "updatedAt": "2024-01-15T10:30:00Z",
    "updatedBy": "user-123"
  }
}
```

#### POST `/batch`
Save multiple changes.

**Request:**
```json
{
  "operations": [
    {
      "type": "save",
      "sight": "title",
      "value": "New Title",
      "elementType": "text"
    },
    {
      "type": "save",
      "sight": "price",
      "value": 99.99,
      "elementType": "number"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "sight": "title", "success": true, "version": 2 },
    { "sight": "price", "success": true, "version": 3 }
  ]
}
```

#### POST `/upload`
Upload files.

**Request:** `multipart/form-data`
- `files`: File(s) to upload
- `sight`: Element identifier
- `type`: File type (image, file, etc.)

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "name": "photo.jpg",
      "url": "https://cdn.example.com/uploads/photo.jpg",
      "size": 102400,
      "type": "image/jpeg"
    }
  ]
}
```

#### GET `/content/:sight`
Get current content value.

**Response:**
```json
{
  "sight": "hero-title",
  "value": "Current Title",
  "type": "text",
  "version": 1,
  "updatedAt": "2024-01-14T09:00:00Z"
}
```

#### GET `/schema/:sight`
Get element schema/validation rules.

**Response:**
```json
{
  "sight": "hero-title",
  "type": "text",
  "validation": {
    "required": true,
    "maxLength": 100,
    "minLength": 10
  },
  "metadata": {
    "description": "Main page title",
    "group": "header"
  }
}
```

#### GET `/history/:sight`
Get change history.

**Response:**
```json
{
  "sight": "hero-title",
  "history": [
    {
      "version": 3,
      "value": "Latest Title",
      "updatedAt": "2024-01-15T10:30:00Z",
      "updatedBy": "user-123"
    },
    {
      "version": 2,
      "value": "Previous Title",
      "updatedAt": "2024-01-14T15:00:00Z",
      "updatedBy": "user-456"
    }
  ]
}
```

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Value exceeds maximum length",
    "field": "title",
    "details": {
      "maxLength": 100,
      "actualLength": 150
    }
  }
}
```

Error Codes:
- `VALIDATION_ERROR` - Input validation failed
- `AUTH_ERROR` - Authentication failed
- `PERMISSION_ERROR` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT` - Rate limit exceeded
- `SERVER_ERROR` - Internal server error

## Framework Integrations

### React

#### Provider Component
```jsx
import { SightEditProvider } from '@sightedit/react';

function App() {
  return (
    <SightEditProvider 
      config={{
        endpoint: '/api/sightedit'
      }}
    >
      <YourApp />
    </SightEditProvider>
  );
}
```

#### useEditable Hook
```jsx
import { useEditable } from '@sightedit/react';

function EditableHeading() {
  const { ref, isEditing, value, save } = useEditable({
    type: 'text',
    sight: 'main-heading',
    defaultValue: 'Default Title'
  });
  
  return <h1 ref={ref}>{value}</h1>;
}
```

#### Editable Component
```jsx
import { Editable } from '@sightedit/react';

function Page() {
  return (
    <Editable 
      type="richtext" 
      sight="content"
      toolbar={['bold', 'italic', 'link']}
    >
      <p>Editable content here</p>
    </Editable>
  );
}
```

### Vue

#### Plugin Installation
```javascript
import { SightEditPlugin } from '@sightedit/vue';

app.use(SightEditPlugin, {
  endpoint: '/api/sightedit'
});
```

#### Directive Usage
```vue
<template>
  <h1 v-sightedit="{ type: 'text', id: 'title' }">
    {{ title }}
  </h1>
</template>
```

#### Composition API
```vue
<script setup>
import { useEditable } from '@sightedit/vue';

const { value, isEditing, save } = useEditable({
  type: 'text',
  sight: 'title'
});
</script>
```

### Angular

#### Module Import
```typescript
import { SightEditModule } from '@sightedit/angular';

@NgModule({
  imports: [
    SightEditModule.forRoot({
      endpoint: '/api/sightedit'
    })
  ]
})
export class AppModule { }
```

#### Directive Usage
```html
<h1 [sightEdit]="{ type: 'text', id: 'title' }">
  {{ title }}
</h1>
```

#### Service Usage
```typescript
import { SightEditService } from '@sightedit/angular';

export class Component {
  constructor(private sightEdit: SightEditService) {}
  
  toggleEdit() {
    this.sightEdit.toggleEditMode();
  }
}
```

## Plugin API

### Creating Plugins

```javascript
const myPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  install(sightEdit, options) {
    // Add custom editor
    sightEdit.registerEditor('custom', {
      // Editor implementation
    });
    
    // Add event listeners
    sightEdit.on('init', () => {
      console.log('Plugin initialized');
    });
    
    // Add custom methods
    sightEdit.myMethod = () => {
      // Custom functionality
    };
  }
};

// Register plugin
SightEdit.use(myPlugin, { /* options */ });
```

### Available Hooks

```javascript
const plugin = {
  // Lifecycle hooks
  beforeInit(config) {
    // Modify config before init
    return config;
  },
  
  afterInit(instance) {
    // After initialization
  },
  
  beforeSave(data) {
    // Modify data before save
    return data;
  },
  
  afterSave(response) {
    // After successful save
  },
  
  beforeRender(element, type) {
    // Before rendering editor
  },
  
  afterRender(element, editor) {
    // After rendering editor
  }
};
```

## TypeScript Types

### Core Types

```typescript
interface SightEditConfig {
  endpoint: string;
  auth?: AuthConfig;
  features?: Features;
  performance?: Performance;
  ui?: UIConfig;
  debug?: boolean;
}

interface AuthConfig {
  headers?: () => Promise<Record<string, string>>;
  credentials?: RequestCredentials;
  token?: string;
}

interface Features {
  richText?: boolean;
  imageUpload?: boolean;
  collaboration?: boolean;
  autoSave?: boolean;
  versionHistory?: boolean;
  offlineSupport?: boolean;
}

interface Performance {
  lazyLoad?: boolean;
  debounceMs?: number;
  batchSize?: number;
  cacheEnabled?: boolean;
  virtualScroll?: boolean;
}

interface UIConfig {
  theme?: 'light' | 'dark' | 'auto';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  hotkey?: string;
  animations?: boolean;
  customStyles?: string;
}
```

### Data Types

```typescript
interface SaveData {
  sight: string;
  value: any;
  type: ElementType;
  previous?: any;
  context?: Context;
}

interface Context {
  url: string;
  path: string;
  selector: string;
  metadata?: Record<string, any>;
}

interface BatchOperation {
  type: 'save' | 'delete';
  sight: string;
  value?: any;
  elementType?: ElementType;
}

type ElementType = 
  | 'text'
  | 'richtext'
  | 'number'
  | 'date'
  | 'color'
  | 'image'
  | 'file'
  | 'link'
  | 'select'
  | 'collection'
  | 'json';

type EditorMode = 
  | 'inline'
  | 'modal'
  | 'sidebar'
  | 'tooltip';
```

### Editor Types

```typescript
interface Editor {
  type: ElementType;
  defaultMode: EditorMode;
  render(element: HTMLElement, value: any, options: any): void;
  getValue(element: HTMLElement): any;
  validate(value: any, options: any): true | string;
  applyValue(element: HTMLElement, value: any): void;
  destroy?(): void;
}

interface DetectedElement {
  element: HTMLElement;
  type: ElementType;
  id?: string;
  mode?: EditorMode;
  validation?: ValidationSchema;
  options?: any;
}

interface ValidationSchema {
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string | RegExp;
  min?: number | Date;
  max?: number | Date;
  custom?: (value: any) => true | string;
}
```

## Rate Limiting

SightEdit includes built-in rate limiting:

```javascript
SightEdit.init({
  performance: {
    debounceMs: 500,      // Debounce edits (ms)
    throttleMs: 100,      // Throttle API calls (ms)
    maxRetries: 3,        // Max retry attempts
    retryDelay: 1000,     // Retry delay (ms)
    maxQueueSize: 100     // Max queued changes
  }
});
```

## Security

### Content Sanitization

```javascript
SightEdit.init({
  sanitization: {
    enabled: true,
    allowedTags: ['p', 'strong', 'em', 'a'],
    allowedAttributes: {
      'a': ['href', 'title'],
      '*': ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto']
  }
});
```

### CSRF Protection

```javascript
SightEdit.init({
  auth: {
    headers: async () => ({
      'X-CSRF-Token': await getCSRFToken()
    })
  }
});
```

## Debugging

Enable debug mode for detailed logging:

```javascript
SightEdit.init({
  debug: true,
  logLevel: 'verbose' // 'error' | 'warn' | 'info' | 'verbose'
});

// Or enable after init
sightEdit.setDebug(true);
```

Access debug information:

```javascript
const stats = sightEdit.getStats();
console.log(stats);
// {
//   editableElements: 42,
//   pendingChanges: 3,
//   failedSaves: 0,
//   sessionDuration: 300000,
//   editsMade: 15
// }
```