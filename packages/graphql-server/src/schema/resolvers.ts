/**
 * GraphQL Resolvers
 *
 * Resolvers for SightEdit GraphQL API
 */

import { PubSub } from 'graphql-subscriptions';
import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

// Create PubSub instance for subscriptions
const pubsub = new PubSub();

// Subscription topics
const TOPICS = {
  CONTENT_UPDATED: 'CONTENT_UPDATED',
  CONTENT_CHANGED: 'CONTENT_CHANGED',
  SCHEMA_UPDATED: 'SCHEMA_UPDATED',
  THEME_UPDATED: 'THEME_UPDATED',
  ACTIVE_EDITORS_CHANGED: 'ACTIVE_EDITORS_CHANGED',
  USER_ACTION: 'USER_ACTION'
};

// In-memory storage (in production, use a database)
const storage = {
  contents: new Map<string, any>(),
  schemas: new Map<string, ElementSchema>(),
  theme: null as any,
  activeEditors: new Map<string, any>(),
  history: [] as any[]
};

export const resolvers = {
  Query: {
    // Fetch content by sight ID
    fetchContent: (_: any, { sight }: { sight: string }) => {
      return storage.contents.get(sight) || null;
    },

    // Fetch multiple contents
    fetchContents: (_: any, { sights }: { sights: string[] }) => {
      return sights.map(sight => ({
        id: sight,
        sight,
        value: storage.contents.get(sight),
        type: storage.schemas.get(sight)?.type || 'TEXT',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));
    },

    // Fetch schema
    fetchSchema: (_: any, { sight }: { sight: string }) => {
      return storage.schemas.get(sight) || null;
    },

    // List all schemas
    listSchemas: () => {
      return Array.from(storage.schemas.values());
    },

    // Fetch current theme
    fetchTheme: () => {
      return storage.theme || null;
    },

    // List theme presets
    listThemePresets: () => {
      return ['light', 'dark', 'ocean', 'forest', 'sunset'];
    },

    // Validate content
    validateContent: (_: any, { sight, value }: { sight: string; value: any }) => {
      const schema = storage.schemas.get(sight);

      if (!schema) {
        return {
          valid: false,
          errors: [{
            field: sight,
            message: 'Schema not found',
            code: 'SCHEMA_NOT_FOUND'
          }]
        };
      }

      const errors: any[] = [];

      // Basic validation
      if (schema.properties?.required && !value) {
        errors.push({
          field: sight,
          message: 'This field is required',
          code: 'REQUIRED'
        });
      }

      if (schema.properties?.minLength && String(value).length < schema.properties.minLength) {
        errors.push({
          field: sight,
          message: `Minimum length is ${schema.properties.minLength}`,
          code: 'MIN_LENGTH'
        });
      }

      if (schema.properties?.maxLength && String(value).length > schema.properties.maxLength) {
        errors.push({
          field: sight,
          message: `Maximum length is ${schema.properties.maxLength}`,
          code: 'MAX_LENGTH'
        });
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },

    // Get active editors
    getActiveEditors: () => {
      return Array.from(storage.activeEditors.values());
    },

    // Get history
    getHistory: (_: any, { sight, limit = 50, offset = 0, userId }: any) => {
      let history = storage.history;

      if (sight) {
        history = history.filter(h => h.sight === sight);
      }

      if (userId) {
        history = history.filter(h => h.userId === userId);
      }

      return history.slice(offset, offset + limit);
    },

    // Get statistics
    getStatistics: () => {
      return {
        totalEdits: storage.history.length,
        totalUsers: new Set(storage.history.map(h => h.userId)).size,
        activeEditors: storage.activeEditors.size,
        lastUpdate: storage.history.length > 0
          ? storage.history[storage.history.length - 1].timestamp
          : null
      };
    },

    // Search content
    searchContent: (_: any, { query, types, limit = 20 }: any) => {
      const results: any[] = [];

      storage.contents.forEach((value, sight) => {
        const schema = storage.schemas.get(sight);

        if (types && schema && !types.includes(schema.type)) {
          return;
        }

        const valueStr = String(value).toLowerCase();
        const queryStr = query.toLowerCase();

        if (valueStr.includes(queryStr) || sight.toLowerCase().includes(queryStr)) {
          results.push({
            id: sight,
            sight,
            value,
            type: schema?.type || 'TEXT',
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      });

      return results.slice(0, limit);
    }
  },

  Mutation: {
    // Save content
    saveContent: async (_: any, { input }: { input: SaveData }, context: any) => {
      try {
        const { sight, value, type, id, context: saveContext } = input;

        // Store previous value for history
        const previousValue = storage.contents.get(sight);

        // Save content
        storage.contents.set(sight, value);

        // Add to history
        storage.history.push({
          id: `history-${Date.now()}`,
          sight,
          value,
          previousValue,
          type: type || 'TEXT',
          userId: context?.userId || 'anonymous',
          timestamp: new Date(),
          action: previousValue ? 'UPDATE' : 'CREATE'
        });

        // Publish subscription event
        pubsub.publish(TOPICS.CONTENT_UPDATED, {
          contentUpdated: {
            sight,
            value,
            type,
            userId: context?.userId,
            timestamp: new Date()
          }
        });

        pubsub.publish(TOPICS.CONTENT_CHANGED, {
          contentChanged: {
            sight,
            value,
            type,
            userId: context?.userId,
            timestamp: new Date()
          }
        });

        return {
          success: true,
          id: id || sight,
          message: 'Content saved successfully',
          data: { sight, value }
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to save content',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },

    // Batch save
    batchSave: async (_: any, { operations }: { operations: any[] }, context: any) => {
      const results: any[] = [];

      for (const operation of operations) {
        const result = await resolvers.Mutation.saveContent(_, { input: operation.data }, context);
        results.push({
          success: result.success,
          data: result,
          error: result.error
        });
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      return {
        success: failed === 0,
        results,
        total: results.length,
        successful,
        failed
      };
    },

    // Update schema
    updateSchema: (_: any, { sight, schema }: { sight: string; schema: ElementSchema }) => {
      const fullSchema = { ...schema, sight };
      storage.schemas.set(sight, fullSchema);

      // Publish subscription event
      pubsub.publish(TOPICS.SCHEMA_UPDATED, {
        schemaUpdated: {
          sight,
          schema: fullSchema,
          timestamp: new Date()
        }
      });

      return fullSchema;
    },

    // Delete schema
    deleteSchema: (_: any, { sight }: { sight: string }) => {
      return storage.schemas.delete(sight);
    },

    // Update theme
    updateTheme: (_: any, { theme }: { theme: any }) => {
      storage.theme = theme;

      // Publish subscription event
      pubsub.publish(TOPICS.THEME_UPDATED, {
        themeUpdated: {
          theme,
          timestamp: new Date()
        }
      });

      return theme;
    },

    // Reset theme
    resetTheme: (_: any, { preset }: { preset: string }) => {
      // In production, load preset from theme presets
      const theme = { mode: preset, colors: {}, typography: {} };
      storage.theme = theme;

      pubsub.publish(TOPICS.THEME_UPDATED, {
        themeUpdated: {
          theme,
          timestamp: new Date()
        }
      });

      return theme;
    },

    // Start editing
    startEditing: (_: any, { sight, userId }: { sight: string; userId: string }) => {
      const key = `${sight}:${userId}`;

      storage.activeEditors.set(key, {
        userId,
        sight,
        startedAt: new Date(),
        user: {
          id: userId,
          name: `User ${userId}`,
          status: 'active'
        }
      });

      pubsub.publish(TOPICS.ACTIVE_EDITORS_CHANGED, {
        activeEditorsChanged: Array.from(storage.activeEditors.values())
      });

      return true;
    },

    // Stop editing
    stopEditing: (_: any, { sight, userId }: { sight: string; userId: string }) => {
      const key = `${sight}:${userId}`;
      storage.activeEditors.delete(key);

      pubsub.publish(TOPICS.ACTIVE_EDITORS_CHANGED, {
        activeEditorsChanged: Array.from(storage.activeEditors.values())
      });

      return true;
    },

    // Revert to history
    revertToHistory: (_: any, { historyId }: { historyId: string }) => {
      const historyEntry = storage.history.find(h => h.id === historyId);

      if (!historyEntry) {
        return {
          success: false,
          message: 'History entry not found',
          error: 'NOT_FOUND'
        };
      }

      // Restore previous value
      storage.contents.set(historyEntry.sight, historyEntry.previousValue);

      return {
        success: true,
        message: 'Reverted to previous version',
        data: { sight: historyEntry.sight, value: historyEntry.previousValue }
      };
    },

    // Clear history
    clearHistory: (_: any, { sight }: { sight?: string }) => {
      if (sight) {
        storage.history = storage.history.filter(h => h.sight !== sight);
      } else {
        storage.history = [];
      }

      return true;
    }
  },

  Subscription: {
    // Content updated (specific sight)
    contentUpdated: {
      subscribe: (_: any, { sight }: { sight?: string }) => {
        if (sight) {
          return pubsub.asyncIterator([`${TOPICS.CONTENT_UPDATED}:${sight}`]);
        }
        return pubsub.asyncIterator([TOPICS.CONTENT_UPDATED]);
      }
    },

    // Content changed (all sights)
    contentChanged: {
      subscribe: () => pubsub.asyncIterator([TOPICS.CONTENT_CHANGED])
    },

    // Schema updated
    schemaUpdated: {
      subscribe: (_: any, { sight }: { sight?: string }) => {
        if (sight) {
          return pubsub.asyncIterator([`${TOPICS.SCHEMA_UPDATED}:${sight}`]);
        }
        return pubsub.asyncIterator([TOPICS.SCHEMA_UPDATED]);
      }
    },

    // Theme updated
    themeUpdated: {
      subscribe: () => pubsub.asyncIterator([TOPICS.THEME_UPDATED])
    },

    // Active editors changed
    activeEditorsChanged: {
      subscribe: () => pubsub.asyncIterator([TOPICS.ACTIVE_EDITORS_CHANGED])
    },

    // User action
    userAction: {
      subscribe: (_: any, { userId }: { userId?: string }) => {
        if (userId) {
          return pubsub.asyncIterator([`${TOPICS.USER_ACTION}:${userId}`]);
        }
        return pubsub.asyncIterator([TOPICS.USER_ACTION]);
      }
    }
  }
};

// Export PubSub for external use
export { pubsub, TOPICS };
