# @sightedit/admin

Visual Builder and Admin Panel for SightEdit CMS.

## Features

- **Schema Configuration Builder** - Visual editor for creating and managing element schemas
- **Data Attribute Generator** - Generate ready-to-use code snippets (HTML, React, Vue)
- **Theme Builder** - Visual theme editor with live preview (coming soon)
- **Live Preview** - Real-time preview of your editable elements (coming soon)
- **Project Management** - Save and load projects with LocalStorage or API backend
- **Export/Import** - Export schemas and themes as JSON

## Installation

```bash
npm install @sightedit/admin @sightedit/core react react-dom
```

## Usage

### Standalone Mode

Run the admin panel as a standalone application:

```bash
npx @sightedit/admin
```

Or programmatically:

```tsx
import React from 'react';
import { AdminPanel } from '@sightedit/admin';

function App() {
  return <AdminPanel mode="standalone" />;
}
```

### Embedded Mode

Embed the admin panel in your application:

```tsx
import React, { useState } from 'react';
import { AdminPanel } from '@sightedit/admin';

function MyApp() {
  const [showAdmin, setShowAdmin] = useState(false);

  return (
    <>
      <button onClick={() => setShowAdmin(true)}>
        Open Admin Panel
      </button>

      {showAdmin && (
        <AdminPanel
          mode="embedded"
          onClose={() => setShowAdmin(false)}
        />
      )}
    </>
  );
}
```

### Using Individual Components

```tsx
import { SchemaBuilder, AttributeGenerator } from '@sightedit/admin';

function MyBuilder() {
  return (
    <div>
      <SchemaBuilder
        onSchemaCreated={(sight, schema) => {
          console.log('Schema created:', sight, schema);
        }}
      />

      <AttributeGenerator sight="product.title" />
    </div>
  );
}
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run type-check
```

## Storage Adapters

### LocalStorage (Default)

Stores projects in browser's localStorage:

```tsx
import { LocalStorageAdapter, StorageManager } from '@sightedit/admin';

const storage = new StorageManager(new LocalStorageAdapter());
```

### API Backend

Store projects on a server:

```tsx
import { APIStorageAdapter, StorageManager } from '@sightedit/admin';

const storage = new StorageManager(
  new APIStorageAdapter('https://api.example.com', 'your-api-key')
);
```

### FileSystem (Node.js)

Store projects in the file system:

```tsx
import { FileSystemAdapter, StorageManager } from '@sightedit/admin';

const storage = new StorageManager(
  new FileSystemAdapter('./projects')
);
```

## API Reference

### SchemaBuilder

Visual schema configuration builder.

**Props:**
- `onSchemaCreated?: (sight: string, schema: ElementSchema) => void` - Called when schema is created
- `onSchemaUpdated?: (sight: string, schema: ElementSchema) => void` - Called when schema is updated

### AttributeGenerator

Code snippet generator for schemas.

**Props:**
- `sight?: string` - Pre-select a schema
- `schema?: ElementSchema` - Use a specific schema

### useSchemaStore

Zustand store for schema management.

```tsx
import { useSchemaStore } from '@sightedit/admin';

const {
  schemas,
  addSchema,
  updateSchema,
  deleteSchema,
  exportSchemas,
  importSchemas
} = useSchemaStore();
```

### useThemeStore

Zustand store for theme management.

```tsx
import { useThemeStore } from '@sightedit/admin';

const {
  themes,
  currentTheme,
  addTheme,
  updateTheme,
  setCurrentTheme
} = useThemeStore();
```

## License

MIT © SightEdit
