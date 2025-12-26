# @sightedit/server-sdk

**Custom Backend SDK for SightEdit** - Build your own backend adapters with ease.

## Features

✅ **Fluent Adapter Builder**
- Type-safe builder pattern
- Minimal boilerplate
- Flexible configuration

✅ **Pre-built Helpers**
- REST API utilities
- Validation helpers
- Error handling
- Retry logic
- Rate limiting

✅ **5 Example Adapters**
- JSON API Adapter
- Firebase Realtime Database
- PostgreSQL Database
- GraphQL API
- localStorage (Offline Mode)

✅ **Full Feature Support**
- CRUD operations
- Schema management
- Asset uploads
- Search functionality
- Versioning
- Batch operations

---

## Installation

```bash
npm install @sightedit/server-sdk
```

---

## Quick Start

### 1. Basic Custom Adapter

```typescript
import { createAdapter, RESTAdapterHelper } from '@sightedit/server-sdk';

const myAdapter = createAdapter({
  name: 'MyAPIAdapter',
  baseUrl: 'https://api.mycompany.com',
  authentication: {
    type: 'bearer',
    token: 'your-api-token'
  }
})
  .withMappers({
    toExternal: (data) => ({
      field_name: data.sight.split('.').pop(),
      field_value: data.value,
      field_type: data.type
    }),
    toInternal: (apiData) => ({
      id: apiData.id,
      value: apiData.field_value,
      metadata: apiData.metadata
    })
  })
  .withMethods({
    save: async (data) => {
      const api = new RESTAdapterHelper(
        'https://api.mycompany.com',
        { type: 'bearer', token: 'your-token' }
      );

      const result = await api.post('/content', data);
      return {
        success: true,
        id: result.id,
        message: 'Content saved'
      };
    },
    fetch: async (sight) => {
      const api = new RESTAdapterHelper(
        'https://api.mycompany.com',
        { type: 'bearer', token: 'your-token' }
      );

      const result = await api.get(`/content/${sight}`);
      return result;
    }
  })
  .build();

// Use the adapter
await myAdapter.connect();

const response = await myAdapter.save({
  sight: 'product.title',
  value: 'Gaming Laptop',
  type: 'text'
});

console.log('Saved:', response);
```

### 2. Database Adapter Example

```typescript
import { createAdapter } from '@sightedit/server-sdk';
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  user: 'admin',
  password: 'password'
});

const dbAdapter = createAdapter({
  name: 'PostgreSQLAdapter',
  baseUrl: 'postgresql://localhost:5432/myapp'
})
  .withMappers({
    toExternal: (data) => ({
      sight_path: data.sight,
      content_value: data.value,
      content_type: data.type,
      updated_at: new Date()
    }),
    toInternal: (row) => ({
      id: row.id,
      sight: row.sight_path,
      value: row.content_value,
      type: row.content_type,
      updatedAt: row.updated_at
    })
  })
  .withMethods({
    save: async (data) => {
      const external = dbAdapter.mapToExternal(data);

      const result = await pool.query(
        `INSERT INTO sightedit_content (sight_path, content_value, content_type, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sight_path)
         DO UPDATE SET content_value = $2, content_type = $3, updated_at = $4
         RETURNING id`,
        [external.sight_path, external.content_value, external.content_type, external.updated_at]
      );

      return {
        success: true,
        id: result.rows[0].id.toString(),
        message: 'Content saved to database'
      };
    },
    fetch: async (sight) => {
      const result = await pool.query(
        'SELECT * FROM sightedit_content WHERE sight_path = $1',
        [sight]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return dbAdapter.mapToInternal(result.rows[0]);
    }
  })
  .build();
```

### 3. Firebase Adapter Example

```typescript
import { createAdapter } from '@sightedit/server-sdk';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, remove } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'your-api-key',
  databaseURL: 'https://your-app.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const firebaseAdapter = createAdapter({
  name: 'FirebaseAdapter',
  baseUrl: firebaseConfig.databaseURL
})
  .withMappers({
    toExternal: (data) => ({
      value: data.value,
      type: data.type,
      timestamp: Date.now()
    }),
    toInternal: (fbData) => ({
      value: fbData.value,
      type: fbData.type,
      updatedAt: new Date(fbData.timestamp)
    })
  })
  .withMethods({
    save: async (data) => {
      const path = `sightedit/${data.sight.replace(/\./g, '/')}`;
      const external = firebaseAdapter.mapToExternal(data);

      await set(ref(db, path), external);

      return {
        success: true,
        id: data.sight,
        message: 'Content saved to Firebase'
      };
    },
    fetch: async (sight) => {
      const path = `sightedit/${sight.replace(/\./g, '/')}`;
      const snapshot = await get(ref(db, path));

      if (!snapshot.exists()) {
        return null;
      }

      return firebaseAdapter.mapToInternal(snapshot.val());
    },
    delete: async (sight) => {
      const path = `sightedit/${sight.replace(/\./g, '/')}`;
      await remove(ref(db, path));
    }
  })
  .build();
```

---

## API Reference

### createAdapter(config)

Creates a new adapter builder instance.

**Parameters:**
- `config.name` (string) - Adapter name
- `config.baseUrl` (string) - Base URL for API
- `config.authentication` (object, optional) - Authentication configuration
  - `type`: `'none'` | `'basic'` | `'bearer'` | `'apiKey'` | `'custom'`
  - `username`: string (for basic auth)
  - `password`: string (for basic auth)
  - `token`: string (for bearer token)
  - `apiKey`: string (for API key auth)
  - `headerName`: string (for API key header name)
  - `custom`: (headers) => headers (for custom auth)
- `config.timeout` (number, optional) - Request timeout in ms
- `config.retries` (number, optional) - Number of retry attempts
- `config.rateLimit` (object, optional) - Rate limiting config

**Returns:** AdapterBuilder instance

### AdapterBuilder Methods

#### .withMappers(mappers)

Configure data mapping functions.

```typescript
.withMappers({
  toExternal: (data: SaveData) => any,
  toInternal: (apiData: any) => any
})
```

#### .withMethods(methods)

Define adapter methods.

```typescript
.withMethods({
  save: async (data: SaveData) => SaveResponse,
  fetch: async (sight: string) => any,
  update: async (id: string, data: Partial<SaveData>) => SaveResponse,
  delete: async (id: string) => void,
  // Optional methods:
  uploadAsset: async (file, options) => AssetUploadResponse,
  search: async (query, options) => FetchResponse,
  batch: async (operations) => BatchResponse
})
```

#### .withHooks(hooks)

Add lifecycle hooks.

```typescript
.withHooks({
  beforeConnect: async (config) => void,
  afterConnect: async () => void,
  beforeSave: async (data) => SaveData,
  afterSave: async (response) => void,
  onError: async (error) => void
})
```

#### .withValidation(rules)

Add validation rules.

```typescript
.withValidation({
  sight: (sight: string) => boolean,
  value: (value: any, type: string) => boolean,
  custom: (data: SaveData) => { valid: boolean; errors: string[] }
})
```

#### .build()

Build and return the adapter instance.

**Returns:** CustomAdapter

---

## Helper Classes

### RESTAdapterHelper

Utility for making REST API calls.

```typescript
import { RESTAdapterHelper } from '@sightedit/server-sdk';

const api = new RESTAdapterHelper(
  'https://api.example.com',
  {
    type: 'bearer',
    token: 'your-token'
  }
);

// GET request
const data = await api.get('/endpoint', { param1: 'value1' });

// POST request
const result = await api.post('/endpoint', { key: 'value' });

// PUT request
await api.put('/endpoint/123', { key: 'newValue' });

// DELETE request
await api.delete('/endpoint/123');

// With custom headers
const data = await api.get('/endpoint', {}, {
  'X-Custom-Header': 'value'
});
```

### ValidationHelper

Data validation utilities.

```typescript
import { ValidationHelper } from '@sightedit/server-sdk';

const validator = new ValidationHelper();

// Validate sight path
const isValid = validator.validateSight('product.title'); // true
const isInvalid = validator.validateSight('invalid path!'); // false

// Validate by type
validator.validateByType('Hello', 'text'); // true
validator.validateByType('not a number', 'number'); // false

// Custom validation
const result = validator.validate({
  sight: 'product.title',
  value: 'Valid Title',
  type: 'text'
}, {
  sight: (s) => s.includes('.'),
  value: (v, t) => typeof v === 'string' && v.length > 0
});

console.log(result.valid); // true
console.log(result.errors); // []
```

### ErrorHelper

Error handling and transformation.

```typescript
import { ErrorHelper } from '@sightedit/server-sdk';

try {
  // Your code
} catch (error) {
  const standardError = ErrorHelper.normalize(error);

  console.log(standardError.message);
  console.log(standardError.code);
  console.log(standardError.statusCode);

  // Check error type
  if (ErrorHelper.isNetworkError(error)) {
    // Handle network error
  }

  if (ErrorHelper.isValidationError(error)) {
    // Handle validation error
  }
}
```

---

## Complete Example Adapters

### 1. JSON API Adapter

```typescript
import { createAdapter, RESTAdapterHelper } from '@sightedit/server-sdk';

export const jsonApiAdapter = createAdapter({
  name: 'JSONAPIAdapter',
  baseUrl: 'https://jsonplaceholder.typicode.com',
  authentication: { type: 'none' }
})
  .withMappers({
    toExternal: (data) => ({
      title: data.sight.split('.').pop(),
      body: data.value,
      userId: 1
    }),
    toInternal: (post) => ({
      id: post.id.toString(),
      value: post.body,
      metadata: {
        title: post.title,
        userId: post.userId
      }
    })
  })
  .withMethods({
    save: async (data) => {
      const api = new RESTAdapterHelper('https://jsonplaceholder.typicode.com');
      const external = jsonApiAdapter.mapToExternal(data);

      if (data.id) {
        const result = await api.put(`/posts/${data.id}`, external);
        return {
          success: true,
          id: result.id.toString(),
          message: 'Post updated',
          data: jsonApiAdapter.mapToInternal(result)
        };
      } else {
        const result = await api.post('/posts', external);
        return {
          success: true,
          id: result.id.toString(),
          message: 'Post created',
          data: jsonApiAdapter.mapToInternal(result)
        };
      }
    },
    fetch: async (sight) => {
      const api = new RESTAdapterHelper('https://jsonplaceholder.typicode.com');
      const id = sight.split('.').pop();
      const result = await api.get(`/posts/${id}`);
      return jsonApiAdapter.mapToInternal(result);
    },
    delete: async (id) => {
      const api = new RESTAdapterHelper('https://jsonplaceholder.typicode.com');
      await api.delete(`/posts/${id}`);
    }
  })
  .build();
```

### 2. GraphQL API Adapter

```typescript
import { createAdapter } from '@sightedit/server-sdk';

const graphqlAdapter = createAdapter({
  name: 'GraphQLAdapter',
  baseUrl: 'https://api.example.com/graphql',
  authentication: {
    type: 'bearer',
    token: 'your-token'
  }
})
  .withMappers({
    toExternal: (data) => ({
      sight: data.sight,
      value: data.value,
      type: data.type
    }),
    toInternal: (gqlData) => ({
      id: gqlData.id,
      value: gqlData.value,
      type: gqlData.type
    })
  })
  .withMethods({
    save: async (data) => {
      const mutation = `
        mutation SaveContent($input: SaveInput!) {
          saveContent(input: $input) {
            id
            success
            message
          }
        }
      `;

      const response = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer your-token'
        },
        body: JSON.stringify({
          query: mutation,
          variables: { input: graphqlAdapter.mapToExternal(data) }
        })
      });

      const result = await response.json();
      return result.data.saveContent;
    },
    fetch: async (sight) => {
      const query = `
        query FetchContent($sight: String!) {
          fetchContent(sight: $sight) {
            id
            value
            type
          }
        }
      `;

      const response = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer your-token'
        },
        body: JSON.stringify({
          query,
          variables: { sight }
        })
      });

      const result = await response.json();
      return graphqlAdapter.mapToInternal(result.data.fetchContent);
    }
  })
  .build();
```

### 3. localStorage Adapter (Offline Mode)

```typescript
import { createAdapter } from '@sightedit/server-sdk';

const localStorageAdapter = createAdapter({
  name: 'LocalStorageAdapter',
  baseUrl: 'localStorage'
})
  .withMappers({
    toExternal: (data) => ({
      sight: data.sight,
      value: data.value,
      type: data.type,
      savedAt: Date.now()
    }),
    toInternal: (stored) => ({
      value: stored.value,
      type: stored.type,
      metadata: {
        savedAt: new Date(stored.savedAt)
      }
    })
  })
  .withMethods({
    save: async (data) => {
      const external = localStorageAdapter.mapToExternal(data);
      const key = `sightedit:${data.sight}`;

      localStorage.setItem(key, JSON.stringify(external));

      return {
        success: true,
        id: data.sight,
        message: 'Saved to localStorage'
      };
    },
    fetch: async (sight) => {
      const key = `sightedit:${sight}`;
      const stored = localStorage.getItem(key);

      if (!stored) {
        return null;
      }

      return localStorageAdapter.mapToInternal(JSON.parse(stored));
    },
    delete: async (sight) => {
      const key = `sightedit:${sight}`;
      localStorage.removeItem(key);
    },
    // List all stored items
    list: async () => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sightedit:'));
      return keys.map(key => {
        const sight = key.replace('sightedit:', '');
        const data = JSON.parse(localStorage.getItem(key)!);
        return localStorageAdapter.mapToInternal(data);
      });
    }
  })
  .withHooks({
    beforeSave: async (data) => {
      // Check quota
      const used = new Blob(Object.values(localStorage)).size;
      if (used > 5 * 1024 * 1024) { // 5MB limit
        throw new Error('localStorage quota exceeded');
      }
      return data;
    }
  })
  .build();
```

---

## Advanced Features

### Retry Logic

```typescript
const adapter = createAdapter({
  name: 'RetryAdapter',
  baseUrl: 'https://api.example.com',
  retries: 3,
  retryDelay: 1000, // 1 second
  retryOn: [500, 502, 503, 504] // Retry on these status codes
})
  .withMethods({
    save: async (data) => {
      // Automatically retries on failure
      return await api.post('/content', data);
    }
  })
  .build();
```

### Rate Limiting

```typescript
const adapter = createAdapter({
  name: 'RateLimitedAdapter',
  baseUrl: 'https://api.example.com',
  rateLimit: {
    maxRequests: 100,
    perMilliseconds: 60000 // 100 requests per minute
  }
})
  .build();
```

### Request Caching

```typescript
const adapter = createAdapter({
  name: 'CachedAdapter',
  baseUrl: 'https://api.example.com',
  cache: {
    enabled: true,
    ttl: 60000, // 1 minute
    maxSize: 100 // max cached items
  }
})
  .build();
```

### Batch Operations

```typescript
const adapter = createAdapter({
  name: 'BatchAdapter',
  baseUrl: 'https://api.example.com'
})
  .withMethods({
    batch: async (operations) => {
      const api = new RESTAdapterHelper('https://api.example.com');

      const results = await api.post('/batch', {
        operations: operations.map(op => ({
          sight: op.sight,
          value: op.value,
          type: op.type
        }))
      });

      return {
        success: true,
        results: results.map(r => ({
          id: r.id,
          success: r.success,
          message: r.message
        }))
      };
    }
  })
  .build();
```

---

## TypeScript Support

Full TypeScript support with type inference:

```typescript
import type {
  SaveData,
  SaveResponse,
  FetchResponse,
  AdapterConfig
} from '@sightedit/server-sdk';

const config: AdapterConfig = {
  name: 'MyAdapter',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'bearer',
    token: 'token'
  }
};

// Type-safe methods
const saveData: SaveData = {
  sight: 'product.title',
  value: 'Gaming Laptop',
  type: 'text'
};
```

---

## Testing

### Unit Tests

```typescript
import { createAdapter } from '@sightedit/server-sdk';

describe('Custom Adapter', () => {
  let adapter: any;

  beforeEach(() => {
    adapter = createAdapter({
      name: 'TestAdapter',
      baseUrl: 'https://test.com'
    })
      .withMappers({
        toExternal: (data) => data,
        toInternal: (data) => data
      })
      .withMethods({
        save: async (data) => ({
          success: true,
          id: '123',
          message: 'Saved'
        })
      })
      .build();
  });

  it('should save data', async () => {
    const response = await adapter.save({
      sight: 'test.field',
      value: 'test value',
      type: 'text'
    });

    expect(response.success).toBe(true);
    expect(response.id).toBe('123');
  });
});
```

---

## Examples Directory

See [examples](./examples) for complete working examples:
- `json-api-adapter.ts` - JSON API integration
- `firebase-adapter.ts` - Firebase Realtime Database
- `database-adapter.ts` - PostgreSQL integration
- `graphql-adapter.ts` - GraphQL API
- `localstorage-adapter.ts` - Offline mode

---

## Best Practices

1. **Always implement mappers** - Separate your internal data structure from external API
2. **Add error handling** - Use try/catch and ErrorHelper
3. **Validate input** - Use ValidationHelper or custom validation
4. **Use hooks** - Add lifecycle hooks for logging, metrics, etc.
5. **Type your data** - Use TypeScript for type safety
6. **Test thoroughly** - Write unit tests for your adapter
7. **Document your adapter** - Add JSDoc comments for better DX

---

## Troubleshooting

### Common Issues

**Authentication Errors:**
```typescript
// Check your authentication config
const adapter = createAdapter({
  authentication: {
    type: 'bearer',
    token: process.env.API_TOKEN // Use environment variables
  }
});
```

**Mapping Errors:**
```typescript
// Add validation in mappers
.withMappers({
  toExternal: (data) => {
    if (!data.sight || !data.value) {
      throw new Error('Invalid data structure');
    }
    return { /* ... */ };
  }
})
```

**Network Timeouts:**
```typescript
// Increase timeout
const adapter = createAdapter({
  timeout: 30000, // 30 seconds
  retries: 3
});
```

---

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## License

MIT © SightEdit

---

## Links

- [Main Documentation](../../README.md)
- [Core Package](../core/README.md)
- [CMS Adapters](../cms-adapters/README_UPDATED.md)
- [GraphQL Server](../graphql-server/README.md)
- [Admin Panel](../admin/README.md)

---

**Build your custom backend in minutes, not hours.**
