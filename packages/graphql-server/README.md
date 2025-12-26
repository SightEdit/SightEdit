# @sightedit/graphql-server

**GraphQL API Server for SightEdit** - Real-time content editing with GraphQL subscriptions.

## Features

✅ **Complete GraphQL Schema**
- 13 Queries (fetch, list, validate, search, stats)
- 11 Mutations (save, update, delete, batch, publish)
- 6 Subscriptions (real-time updates via WebSocket)

✅ **Real-time Collaboration**
- WebSocket-based subscriptions
- Live content updates
- Schema and theme change notifications
- User activity tracking

✅ **Apollo Server Integration**
- Express.js middleware
- GraphQL Playground
- Type-safe resolvers
- Custom context injection

✅ **Production Ready**
- Error handling
- Request validation
- Performance optimized
- CORS support

---

## Installation

```bash
npm install @sightedit/graphql-server
```

**Peer Dependencies:**
```bash
npm install graphql apollo-server-express express graphql-subscriptions graphql-ws ws
```

---

## Quick Start

### 1. Basic Server Setup

```typescript
import { createSightEditServer } from '@sightedit/graphql-server';

const server = await createSightEditServer({
  port: 4000,
  endpoint: '/graphql',
  storage: {
    type: 'memory' // or 'database', 'file'
  }
});

await server.start();

console.log(`🚀 GraphQL Server ready at http://localhost:4000/graphql`);
console.log(`🔌 WebSocket ready at ws://localhost:4000/graphql`);
```

### 2. With Custom Storage

```typescript
import { createSightEditServer } from '@sightedit/graphql-server';
import { ContentfulAdapter } from '@sightedit/cms-adapters';

const cmsAdapter = new ContentfulAdapter({
  space: 'your-space-id',
  accessToken: 'your-token',
  managementToken: 'your-mgmt-token'
});

await cmsAdapter.connect();

const server = await createSightEditServer({
  port: 4000,
  storage: {
    type: 'custom',
    adapter: cmsAdapter
  }
});

await server.start();
```

### 3. Standalone Server

```bash
# Clone the repository
cd packages/graphql-server

# Install dependencies
npm install

# Start server
npm start

# Server runs at:
# HTTP: http://localhost:4000/graphql
# WebSocket: ws://localhost:4000/graphql
```

---

## GraphQL Schema

### Queries

#### Fetch Content
```graphql
query {
  fetchContent(sight: "product.title") {
    ... on TextValue { value }
    ... on RichTextValue { html }
    ... on ImageValue { url alt }
  }
}
```

#### List Schemas
```graphql
query {
  listSchemas {
    sight
    type
    properties
  }
}
```

#### Search Content
```graphql
query {
  searchContent(query: "laptop", types: [TEXT, RICHTEXT], limit: 10) {
    sight
    value
    type
  }
}
```

#### Get Statistics
```graphql
query {
  getStatistics {
    totalEdits
    totalSchemas
    activeEditors
    lastUpdate
  }
}
```

### Mutations

#### Save Content
```graphql
mutation {
  saveContent(input: {
    sight: "product.title"
    value: "New Gaming Laptop"
    type: TEXT
  }) {
    success
    id
    message
    data
  }
}
```

#### Batch Save
```graphql
mutation {
  batchSave(operations: [
    {
      sight: "product.title"
      value: "Gaming Laptop"
      type: TEXT
    }
    {
      sight: "product.price"
      value: "1299.99"
      type: NUMBER
    }
  ]) {
    success
    results {
      id
      success
      message
    }
  }
}
```

#### Update Schema
```graphql
mutation {
  updateSchema(
    sight: "product.title"
    schema: {
      type: TEXT
      properties: {
        required: true
        maxLength: 100
        placeholder: "Enter product title"
      }
    }
  ) {
    sight
    type
    properties
  }
}
```

#### Update Theme
```graphql
mutation {
  updateTheme(theme: {
    mode: DARK
    colors: {
      primary: "#8b5cf6"
      secondary: "#ec4899"
    }
  }) {
    mode
    colors {
      primary
      secondary
    }
  }
}
```

### Subscriptions

#### Content Updates
```graphql
subscription {
  contentChanged {
    sight
    value
    type
    timestamp
    userId
  }
}
```

#### Schema Updates
```graphql
subscription {
  schemaUpdated(sight: "product.title") {
    sight
    schema {
      type
      properties
    }
    timestamp
  }
}
```

#### Theme Changes
```graphql
subscription {
  themeUpdated {
    theme {
      mode
      colors {
        primary
      }
    }
    timestamp
  }
}
```

---

## Client Usage

### JavaScript/TypeScript Client

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

// HTTP connection for queries and mutations
const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql'
});

// WebSocket connection for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: 'ws://localhost:4000/graphql'
  })
);

// Split traffic between HTTP and WebSocket
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache()
});

// Query example
const { data } = await client.query({
  query: gql`
    query {
      fetchContent(sight: "product.title") {
        ... on TextValue { value }
      }
    }
  `
});

// Mutation example
const { data } = await client.mutate({
  mutation: gql`
    mutation SaveContent($input: SaveInput!) {
      saveContent(input: $input) {
        success
        message
      }
    }
  `,
  variables: {
    input: {
      sight: 'product.title',
      value: 'New Title',
      type: 'TEXT'
    }
  }
});

// Subscription example
client.subscribe({
  query: gql`
    subscription {
      contentChanged {
        sight
        value
        timestamp
      }
    }
  `
}).subscribe({
  next: ({ data }) => {
    console.log('Content updated:', data.contentChanged);
  }
});
```

### React Integration

```tsx
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { gql } from '@apollo/client';

const FETCH_CONTENT = gql`
  query FetchContent($sight: String!) {
    fetchContent(sight: $sight) {
      ... on TextValue { value }
    }
  }
`;

const SAVE_CONTENT = gql`
  mutation SaveContent($input: SaveInput!) {
    saveContent(input: $input) {
      success
      message
    }
  }
`;

const CONTENT_CHANGED = gql`
  subscription {
    contentChanged {
      sight
      value
      timestamp
    }
  }
`;

function ProductEditor() {
  const { data, loading } = useQuery(FETCH_CONTENT, {
    variables: { sight: 'product.title' }
  });

  const [saveContent] = useMutation(SAVE_CONTENT);

  useSubscription(CONTENT_CHANGED, {
    onData: ({ data }) => {
      console.log('Real-time update:', data.data.contentChanged);
    }
  });

  const handleSave = async (value: string) => {
    await saveContent({
      variables: {
        input: {
          sight: 'product.title',
          value,
          type: 'TEXT'
        }
      }
    });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{data.fetchContent.value}</h1>
      <button onClick={() => handleSave('New Title')}>Save</button>
    </div>
  );
}
```

---

## Advanced Configuration

### Custom Context

```typescript
import { createSightEditServer } from '@sightedit/graphql-server';

const server = await createSightEditServer({
  port: 4000,
  context: async ({ req }) => {
    // Add authentication
    const token = req.headers.authorization;
    const user = await authenticateUser(token);

    return {
      user,
      permissions: user.permissions
    };
  }
});
```

### Custom Resolvers

```typescript
import { createSightEditServer } from '@sightedit/graphql-server';

const server = await createSightEditServer({
  port: 4000,
  resolvers: {
    Query: {
      customQuery: async (parent, args, context) => {
        // Your custom logic
        return { data: 'custom data' };
      }
    },
    Mutation: {
      customMutation: async (parent, args, context) => {
        // Your custom logic
        return { success: true };
      }
    }
  }
});
```

### Storage Adapters

```typescript
import { createSightEditServer } from '@sightedit/graphql-server';

// File-based storage
const server = await createSightEditServer({
  storage: {
    type: 'file',
    path: './data/sightedit.json'
  }
});

// Database storage
const server = await createSightEditServer({
  storage: {
    type: 'database',
    connection: {
      host: 'localhost',
      port: 5432,
      database: 'sightedit',
      user: 'admin',
      password: 'password'
    }
  }
});

// Custom adapter
const server = await createSightEditServer({
  storage: {
    type: 'custom',
    adapter: myCustomAdapter
  }
});
```

---

## API Reference

### Types

#### ContentValue (Union Type)
```graphql
union ContentValue =
  TextValue |
  RichTextValue |
  NumberValue |
  DateValue |
  ImageValue |
  ColorValue |
  SelectValue |
  CheckboxValue |
  LinkValue |
  FileValue |
  JSONValue |
  CollectionValue
```

#### SaveInput
```graphql
input SaveInput {
  sight: String!
  value: JSON!
  type: ElementType!
  id: String
  metadata: JSON
}
```

#### ElementSchema
```graphql
type ElementSchema {
  sight: String!
  type: ElementType!
  properties: JSON
}
```

#### ThemeConfig
```graphql
type ThemeConfig {
  mode: ThemeMode!
  colors: ColorPalette!
  typography: Typography
  spacing: Spacing
  borderRadius: BorderRadius
  shadows: Shadows
  zIndex: ZIndex
}
```

---

## Performance

### Caching
- Uses Apollo Server's built-in caching
- In-memory cache for frequently accessed data
- Configurable cache TTL

### Rate Limiting
```typescript
import { createSightEditServer } from '@sightedit/graphql-server';

const server = await createSightEditServer({
  rateLimit: {
    max: 100, // requests per window
    windowMs: 60000 // 1 minute
  }
});
```

### Query Complexity
```typescript
const server = await createSightEditServer({
  queryComplexity: {
    maximumComplexity: 1000,
    variables: {},
    onComplete: (complexity) => {
      console.log('Query complexity:', complexity);
    }
  }
});
```

---

## Security

### Authentication
```typescript
const server = await createSightEditServer({
  context: async ({ req }) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new Error('Unauthorized');
    }

    const user = await verifyToken(token);
    return { user };
  }
});
```

### CORS Configuration
```typescript
const server = await createSightEditServer({
  cors: {
    origin: ['https://yourdomain.com'],
    credentials: true
  }
});
```

### Input Validation
```typescript
const server = await createSightEditServer({
  validation: {
    enabled: true,
    maxDepth: 10,
    maxComplexity: 1000
  }
});
```

---

## Monitoring

### Logging
```typescript
const server = await createSightEditServer({
  logging: {
    level: 'info', // 'debug', 'info', 'warn', 'error'
    format: 'json',
    onLog: (log) => {
      // Send to your logging service
      console.log(log);
    }
  }
});
```

### Metrics
```typescript
const server = await createSightEditServer({
  metrics: {
    enabled: true,
    interval: 5000, // collect every 5 seconds
    onMetrics: (metrics) => {
      console.log('Server metrics:', metrics);
    }
  }
});
```

---

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 4000

CMD ["node", "dist/index.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  graphql-server:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
      - STORAGE_TYPE=database
      - DB_HOST=postgres
      - DB_PORT=5432
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=sightedit
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## Examples

See the [examples](./examples) directory for:
- Basic server setup
- Custom resolvers
- Authentication integration
- Database storage
- Real-time collaboration
- Performance monitoring

---

## TypeScript Support

Fully typed with TypeScript 5.3+:

```typescript
import type {
  SaveData,
  SaveResponse,
  ElementSchema,
  ThemeConfig
} from '@sightedit/graphql-server';

const saveData: SaveData = {
  sight: 'product.title',
  value: 'Gaming Laptop',
  type: 'text'
};
```

---

## Troubleshooting

### WebSocket Connection Issues
```typescript
// Enable debug logging
const server = await createSightEditServer({
  subscriptions: {
    debug: true
  }
});
```

### Memory Leaks
```typescript
// Configure subscription cleanup
const server = await createSightEditServer({
  subscriptions: {
    keepAlive: 30000,
    maxSubscriptions: 1000
  }
});
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

---

## License

MIT © SightEdit

---

## Links

- [Main Documentation](../../README.md)
- [Core Package](../core/README.md)
- [CMS Adapters](../cms-adapters/README_UPDATED.md)
- [Admin Panel](../admin/README.md)
- [Server SDK](../server-sdk/README.md)

---

**Built with ❤️ for developers who need powerful, real-time content editing.**
