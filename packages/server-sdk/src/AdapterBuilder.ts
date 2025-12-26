/**
 * Adapter Builder
 *
 * Helper utilities for building custom backend adapters
 */

import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface AdapterConfig {
  name: string;
  version?: string;
  baseUrl?: string;
  authentication?: {
    type: 'bearer' | 'basic' | 'apiKey' | 'custom';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    headerName?: string;
    customAuth?: (headers: Record<string, string>) => Record<string, string>;
  };
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  [key: string]: any;
}

export interface AdapterHooks {
  beforeSave?: (data: SaveData) => Promise<SaveData> | SaveData;
  afterSave?: (response: SaveResponse) => Promise<SaveResponse> | SaveResponse;
  beforeFetch?: (query: any) => Promise<any> | any;
  afterFetch?: (data: any) => Promise<any> | any;
  onError?: (error: Error, context: string) => void;
}

export interface AdapterMethods {
  save: (data: SaveData) => Promise<SaveResponse>;
  fetch?: (query: any) => Promise<any>;
  fetchById?: (id: string) => Promise<any>;
  update?: (id: string, data: Partial<SaveData>) => Promise<SaveResponse>;
  delete?: (id: string) => Promise<void>;
  search?: (query: string) => Promise<any>;
}

export interface AdapterMappers {
  toExternal: (data: SaveData) => any;
  toInternal: (externalData: any) => any;
  schemaToExternal?: (schema: ElementSchema) => any;
  schemaToInternal?: (externalSchema: any) => ElementSchema;
}

export class AdapterBuilder {
  private config: AdapterConfig;
  private hooks: AdapterHooks = {};
  private methods: Partial<AdapterMethods> = {};
  private mappers: Partial<AdapterMappers> = {};

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Configure hooks
   */
  withHooks(hooks: AdapterHooks): this {
    this.hooks = { ...this.hooks, ...hooks };
    return this;
  }

  /**
   * Configure methods
   */
  withMethods(methods: Partial<AdapterMethods>): this {
    this.methods = { ...this.methods, ...methods };
    return this;
  }

  /**
   * Configure mappers
   */
  withMappers(mappers: Partial<AdapterMappers>): this {
    this.mappers = { ...this.mappers, ...mappers };
    return this;
  }

  /**
   * Build the adapter
   */
  build(): CustomAdapter {
    if (!this.methods.save) {
      throw new Error('Save method is required');
    }

    if (!this.mappers.toExternal || !this.mappers.toInternal) {
      throw new Error('toExternal and toInternal mappers are required');
    }

    return new CustomAdapter(
      this.config,
      this.hooks,
      this.methods as AdapterMethods,
      this.mappers as AdapterMappers
    );
  }
}

/**
 * Custom Adapter Implementation
 */
export class CustomAdapter {
  private config: AdapterConfig;
  private hooks: AdapterHooks;
  private methods: AdapterMethods;
  private mappers: AdapterMappers;

  constructor(
    config: AdapterConfig,
    hooks: AdapterHooks,
    methods: AdapterMethods,
    mappers: AdapterMappers
  ) {
    this.config = config;
    this.hooks = hooks;
    this.methods = methods;
    this.mappers = mappers;
  }

  async save(data: SaveData): Promise<SaveResponse> {
    try {
      // Before save hook
      let processedData = data;
      if (this.hooks.beforeSave) {
        processedData = await this.hooks.beforeSave(data);
      }

      // Map to external format
      const externalData = this.mappers.toExternal(processedData);

      // Call save method
      let response = await this.methods.save(processedData);

      // After save hook
      if (this.hooks.afterSave) {
        response = await this.hooks.afterSave(response);
      }

      return response;
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'save');
      }
      throw error;
    }
  }

  async fetch(query: any): Promise<any> {
    if (!this.methods.fetch) {
      throw new Error('Fetch method not implemented');
    }

    try {
      // Before fetch hook
      let processedQuery = query;
      if (this.hooks.beforeFetch) {
        processedQuery = await this.hooks.beforeFetch(query);
      }

      // Call fetch method
      let data = await this.methods.fetch(processedQuery);

      // Map to internal format
      data = this.mappers.toInternal(data);

      // After fetch hook
      if (this.hooks.afterFetch) {
        data = await this.hooks.afterFetch(data);
      }

      return data;
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'fetch');
      }
      throw error;
    }
  }

  async fetchById(id: string): Promise<any> {
    if (!this.methods.fetchById) {
      throw new Error('FetchById method not implemented');
    }

    try {
      const data = await this.methods.fetchById(id);
      return this.mappers.toInternal(data);
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'fetchById');
      }
      throw error;
    }
  }

  async update(id: string, data: Partial<SaveData>): Promise<SaveResponse> {
    if (!this.methods.update) {
      throw new Error('Update method not implemented');
    }

    try {
      return await this.methods.update(id, data);
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'update');
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.methods.delete) {
      throw new Error('Delete method not implemented');
    }

    try {
      await this.methods.delete(id);
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'delete');
      }
      throw error;
    }
  }

  async search(query: string): Promise<any> {
    if (!this.methods.search) {
      throw new Error('Search method not implemented');
    }

    try {
      const data = await this.methods.search(query);
      return this.mappers.toInternal(data);
    } catch (error) {
      if (this.hooks.onError) {
        this.hooks.onError(error as Error, 'search');
      }
      throw error;
    }
  }

  getName(): string {
    return this.config.name;
  }

  getVersion(): string {
    return this.config.version || '1.0.0';
  }

  getConfig(): AdapterConfig {
    return { ...this.config };
  }
}

/**
 * Factory function for quick adapter creation
 */
export function createAdapter(config: AdapterConfig): AdapterBuilder {
  return new AdapterBuilder(config);
}

/**
 * REST API Adapter Helper
 */
export class RESTAdapterHelper {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(baseUrl: string, auth?: AdapterConfig['authentication'], timeout: number = 10000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
    this.headers = {
      'Content-Type': 'application/json'
    };

    if (auth) {
      this.applyAuthentication(auth);
    }
  }

  private applyAuthentication(auth: AdapterConfig['authentication']): void {
    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          this.headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;

      case 'basic':
        if (auth.username && auth.password) {
          const credentials = btoa(`${auth.username}:${auth.password}`);
          this.headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'apiKey':
        if (auth.apiKey && auth.headerName) {
          this.headers[auth.headerName] = auth.apiKey;
        }
        break;

      case 'custom':
        if (auth.customAuth) {
          this.headers = auth.customAuth(this.headers);
        }
        break;
    }
  }

  async get(path: string, params?: Record<string, any>): Promise<any> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async post(path: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async put(path: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async delete(path: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }
}

/**
 * Validation Helper
 */
export class ValidationHelper {
  static validateSaveData(data: SaveData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.sight) {
      errors.push('sight is required');
    }

    if (data.value === undefined || data.value === null) {
      errors.push('value is required');
    }

    if (!data.type) {
      errors.push('type is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateConfig(config: AdapterConfig, requiredFields: string[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    requiredFields.forEach(field => {
      if (!config[field]) {
        errors.push(`${field} is required in config`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Error Handler Helper
 */
export class ErrorHelper {
  static handleError(error: any, context: string): never {
    const message = error?.message || error?.toString() || 'Unknown error';
    const errorObj = new Error(`[${context}] ${message}`);

    // Preserve original stack if available
    if (error?.stack) {
      errorObj.stack = error.stack;
    }

    throw errorObj;
  }

  static wrapAsync<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T> {
    return fn().catch(error => {
      this.handleError(error, context);
    });
  }
}
