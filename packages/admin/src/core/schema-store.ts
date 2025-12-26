import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Element Schema (imported from core types)
 */
export interface ElementSchema {
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
  validation?: string; // Serialized validation function
  maxSize?: string;
  aspectRatio?: string;
  step?: number;
  format?: string;
  currency?: string;
  toolbar?: string[];
  crop?: boolean;
  multiple?: boolean;
  itemType?: string;
  minItems?: number;
  maxItems?: number;
  includeTime?: boolean;
}

/**
 * Schema with metadata
 */
export interface SchemaEntry {
  sight: string;
  schema: ElementSchema;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  description?: string;
}

/**
 * Schema Store State
 */
interface SchemaStoreState {
  schemas: Map<string, SchemaEntry>;
  selectedSight: string | null;
  searchQuery: string;
  filterType: string | null;

  // Actions
  addSchema: (sight: string, schema: ElementSchema, metadata?: Partial<SchemaEntry>) => void;
  updateSchema: (sight: string, schema: Partial<ElementSchema>) => void;
  deleteSchema: (sight: string) => void;
  getSchema: (sight: string) => SchemaEntry | undefined;
  getAllSchemas: () => SchemaEntry[];
  setSelectedSight: (sight: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: string | null) => void;
  exportSchemas: () => string;
  importSchemas: (json: string) => void;
  clearSchemas: () => void;
}

/**
 * Schema Store
 * Manages element schemas for the visual builder
 */
export const useSchemaStore = create<SchemaStoreState>()(
  persist(
    (set, get) => ({
      schemas: new Map(),
      selectedSight: null,
      searchQuery: '',
      filterType: null,

      addSchema: (sight, schema, metadata) => {
        set((state) => {
          const newSchemas = new Map(state.schemas);
          const now = Date.now();

          newSchemas.set(sight, {
            sight,
            schema,
            createdAt: metadata?.createdAt || now,
            updatedAt: now,
            tags: metadata?.tags,
            description: metadata?.description
          });

          return { schemas: newSchemas };
        });
      },

      updateSchema: (sight, schemaUpdate) => {
        set((state) => {
          const existing = state.schemas.get(sight);
          if (!existing) return state;

          const newSchemas = new Map(state.schemas);
          newSchemas.set(sight, {
            ...existing,
            schema: { ...existing.schema, ...schemaUpdate },
            updatedAt: Date.now()
          });

          return { schemas: newSchemas };
        });
      },

      deleteSchema: (sight) => {
        set((state) => {
          const newSchemas = new Map(state.schemas);
          newSchemas.delete(sight);

          return {
            schemas: newSchemas,
            selectedSight: state.selectedSight === sight ? null : state.selectedSight
          };
        });
      },

      getSchema: (sight) => {
        return get().schemas.get(sight);
      },

      getAllSchemas: () => {
        const { schemas, searchQuery, filterType } = get();
        let results = Array.from(schemas.values());

        // Filter by search query
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          results = results.filter(entry =>
            entry.sight.toLowerCase().includes(query) ||
            entry.schema.label?.toLowerCase().includes(query) ||
            entry.description?.toLowerCase().includes(query)
          );
        }

        // Filter by type
        if (filterType) {
          results = results.filter(entry => entry.schema.type === filterType);
        }

        return results.sort((a, b) => b.updatedAt - a.updatedAt);
      },

      setSelectedSight: (sight) => {
        set({ selectedSight: sight });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setFilterType: (type) => {
        set({ filterType: type });
      },

      exportSchemas: () => {
        const schemas = Array.from(get().schemas.values());
        return JSON.stringify(schemas, null, 2);
      },

      importSchemas: (json) => {
        try {
          const imported = JSON.parse(json) as SchemaEntry[];
          const newSchemas = new Map<string, SchemaEntry>();

          imported.forEach(entry => {
            newSchemas.set(entry.sight, entry);
          });

          set({ schemas: newSchemas });
        } catch (error) {
          console.error('[Schema Store] Import error:', error);
          throw new Error('Invalid schema JSON');
        }
      },

      clearSchemas: () => {
        set({ schemas: new Map(), selectedSight: null });
      }
    }),
    {
      name: 'sightedit-schemas',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;

          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              schemas: new Map(Object.entries(state.schemas || {}))
            }
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          const serialized = {
            state: {
              ...state,
              schemas: Object.fromEntries(state.schemas)
            }
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
);

/**
 * Schema validation helper
 */
export function validateSchema(schema: ElementSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema.type) {
    errors.push('Schema type is required');
  }

  if (schema.type === 'number') {
    if (schema.min !== undefined && schema.max !== undefined && schema.min > schema.max) {
      errors.push('Minimum value cannot be greater than maximum value');
    }
  }

  if (schema.type === 'text' || schema.type === 'richtext') {
    if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) {
      errors.push('Minimum length cannot be greater than maximum length');
    }
  }

  if (schema.type === 'select' && (!schema.options || schema.options.length === 0)) {
    errors.push('Select editor requires at least one option');
  }

  if (schema.type === 'collection') {
    if (!schema.itemType) {
      errors.push('Collection requires itemType');
    }
    if (schema.minItems !== undefined && schema.maxItems !== undefined && schema.minItems > schema.maxItems) {
      errors.push('Minimum items cannot be greater than maximum items');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
