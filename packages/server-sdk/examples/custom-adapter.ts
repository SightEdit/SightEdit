/**
 * Custom Adapter Examples
 *
 * Examples of building custom backend adapters using the Server SDK
 */

import { createAdapter, RESTAdapterHelper, ValidationHelper } from '../src';
import type { SaveData, SaveResponse } from '@sightedit/core';

// Example 1: Simple JSON API Adapter
const jsonApiAdapter = createAdapter({
  name: 'JSONAPIAdapter',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'bearer',
    token: 'your-api-token'
  }
})
  .withMappers({
    toExternal: (data: SaveData) => ({
      data: {
        type: 'content',
        attributes: {
          sight: data.sight,
          value: data.value,
          content_type: data.type
        }
      }
    }),
    toInternal: (external: any) => ({
      id: external.data.id,
      sight: external.data.attributes.sight,
      value: external.data.attributes.value,
      type: external.data.attributes.content_type
    })
  })
  .withMethods({
    save: async (data: SaveData): Promise<SaveResponse> => {
      const api = new RESTAdapterHelper(
        'https://api.example.com',
        { type: 'bearer', token: 'your-api-token' }
      );

      try {
        const result = await api.post('/content', {
          sight: data.sight,
          value: data.value,
          type: data.type
        });

        return {
          success: true,
          id: result.id,
          message: 'Saved successfully',
          data: result
        };
      } catch (error) {
        return {
          success: false,
          message: 'Save failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    fetch: async (query: any) => {
      const api = new RESTAdapterHelper(
        'https://api.example.com',
        { type: 'bearer', token: 'your-api-token' }
      );

      return await api.get('/content', query);
    }
  })
  .withHooks({
    beforeSave: (data) => {
      // Validate before save
      const validation = ValidationHelper.validateSaveData(data);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      return data;
    },
    afterSave: (response) => {
      console.log('Content saved:', response.id);
      return response;
    },
    onError: (error, context) => {
      console.error(`Error in ${context}:`, error.message);
    }
  })
  .build();

// Example 2: Firebase Realtime Database Adapter
const firebaseAdapter = createAdapter({
  name: 'FirebaseAdapter',
  baseUrl: 'https://your-project.firebaseio.com',
  authentication: {
    type: 'custom',
    customAuth: (headers) => ({
      ...headers,
      'Authorization': `Bearer ${getFirebaseToken()}`
    })
  }
})
  .withMappers({
    toExternal: (data: SaveData) => ({
      [data.sight]: {
        value: data.value,
        type: data.type,
        timestamp: Date.now()
      }
    }),
    toInternal: (external: any) => {
      const sight = Object.keys(external)[0];
      return {
        sight,
        value: external[sight].value,
        type: external[sight].type,
        metadata: {
          timestamp: external[sight].timestamp
        }
      };
    }
  })
  .withMethods({
    save: async (data: SaveData): Promise<SaveResponse> => {
      const path = data.sight.replace(/\./g, '/');
      const api = new RESTAdapterHelper(
        'https://your-project.firebaseio.com',
        {
          type: 'custom',
          customAuth: (headers) => ({
            ...headers,
            'Authorization': `Bearer ${getFirebaseToken()}`
          })
        }
      );

      try {
        await api.put(`/${path}.json`, {
          value: data.value,
          type: data.type,
          timestamp: Date.now()
        });

        return {
          success: true,
          id: data.sight,
          message: 'Saved to Firebase'
        };
      } catch (error) {
        return {
          success: false,
          message: 'Firebase save failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    fetch: async (query: any) => {
      const sight = query.sight || '';
      const path = sight.replace(/\./g, '/');
      const api = new RESTAdapterHelper(
        'https://your-project.firebaseio.com',
        {
          type: 'custom',
          customAuth: (headers) => ({
            ...headers,
            'Authorization': `Bearer ${getFirebaseToken()}`
          })
        }
      );

      return await api.get(`/${path}.json`);
    }
  })
  .build();

// Example 3: Custom Database Adapter with Connection Pool
class DatabaseAdapter {
  private pool: any; // Your database connection pool

  constructor(connectionString: string) {
    // Initialize connection pool
    this.pool = createConnectionPool(connectionString);
  }

  async save(data: SaveData): Promise<SaveResponse> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'INSERT INTO content (sight, value, type) VALUES ($1, $2, $3) RETURNING id',
        [data.sight, data.value, data.type]
      );

      return {
        success: true,
        id: result.rows[0].id,
        message: 'Saved to database'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Database save failed',
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      client.release();
    }
  }

  async fetch(query: any) {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM content WHERE sight = $1',
        [query.sight]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}

const databaseAdapter = createAdapter({
  name: 'DatabaseAdapter',
  connectionString: 'postgresql://user:pass@localhost:5432/db'
})
  .withMappers({
    toExternal: (data: SaveData) => data,
    toInternal: (external: any) => external
  })
  .withMethods({
    save: async (data: SaveData) => {
      const db = new DatabaseAdapter('postgresql://user:pass@localhost:5432/db');
      return await db.save(data);
    },
    fetch: async (query: any) => {
      const db = new DatabaseAdapter('postgresql://user:pass@localhost:5432/db');
      return await db.fetch(query);
    }
  })
  .build();

// Example 4: GraphQL API Adapter
const graphqlAdapter = createAdapter({
  name: 'GraphQLAdapter',
  baseUrl: 'https://api.example.com/graphql',
  authentication: {
    type: 'bearer',
    token: 'your-graphql-token'
  }
})
  .withMappers({
    toExternal: (data: SaveData) => ({
      query: `
        mutation SaveContent($input: ContentInput!) {
          saveContent(input: $input) {
            id
            success
            message
          }
        }
      `,
      variables: {
        input: {
          sight: data.sight,
          value: data.value,
          type: data.type
        }
      }
    }),
    toInternal: (external: any) => external.data
  })
  .withMethods({
    save: async (data: SaveData): Promise<SaveResponse> => {
      const api = new RESTAdapterHelper(
        'https://api.example.com',
        { type: 'bearer', token: 'your-graphql-token' }
      );

      try {
        const result = await api.post('/graphql', {
          query: `
            mutation SaveContent($input: ContentInput!) {
              saveContent(input: $input) {
                id
                success
                message
              }
            }
          `,
          variables: {
            input: {
              sight: data.sight,
              value: data.value,
              type: data.type
            }
          }
        });

        return result.data.saveContent;
      } catch (error) {
        return {
          success: false,
          message: 'GraphQL mutation failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    fetch: async (query: any) => {
      const api = new RESTAdapterHelper(
        'https://api.example.com',
        { type: 'bearer', token: 'your-graphql-token' }
      );

      const result = await api.post('/graphql', {
        query: `
          query FetchContent($sight: String!) {
            content(sight: $sight) {
              sight
              value
              type
            }
          }
        `,
        variables: { sight: query.sight }
      });

      return result.data.content;
    }
  })
  .build();

// Example 5: localStorage Adapter (for offline/demo mode)
const localStorageAdapter = createAdapter({
  name: 'LocalStorageAdapter'
})
  .withMappers({
    toExternal: (data: SaveData) => JSON.stringify(data),
    toInternal: (external: string) => JSON.parse(external)
  })
  .withMethods({
    save: async (data: SaveData): Promise<SaveResponse> => {
      try {
        const key = `sightedit:${data.sight}`;
        localStorage.setItem(key, JSON.stringify({
          value: data.value,
          type: data.type,
          timestamp: Date.now()
        }));

        return {
          success: true,
          id: data.sight,
          message: 'Saved to localStorage'
        };
      } catch (error) {
        return {
          success: false,
          message: 'localStorage save failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    fetch: async (query: any) => {
      const key = `sightedit:${query.sight}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    },
    fetchById: async (id: string) => {
      const key = `sightedit:${id}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    },
    delete: async (id: string) => {
      const key = `sightedit:${id}`;
      localStorage.removeItem(key);
    }
  })
  .build();

// Usage example
async function exampleUsage() {
  // Use the adapter
  const response = await jsonApiAdapter.save({
    sight: 'product.title',
    value: 'My Product',
    type: 'text',
    timestamp: Date.now()
  });

  console.log('Save response:', response);

  // Fetch content
  const content = await jsonApiAdapter.fetch({ sight: 'product.title' });
  console.log('Fetched content:', content);
}

// Helper functions
function getFirebaseToken(): string {
  // Get Firebase auth token
  return 'firebase-auth-token';
}

function createConnectionPool(connectionString: string): any {
  // Create database connection pool
  return {
    connect: async () => ({
      query: async (sql: string, params: any[]) => ({ rows: [] }),
      release: () => {}
    })
  };
}

// Export adapters
export {
  jsonApiAdapter,
  firebaseAdapter,
  databaseAdapter,
  graphqlAdapter,
  localStorageAdapter
};
