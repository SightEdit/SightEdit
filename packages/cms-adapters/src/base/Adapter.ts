/**
 * Base CMS Adapter
 *
 * Abstract base class for all CMS adapters.
 * Provides a consistent interface for interacting with different headless CMS platforms.
 */

import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface CMSConfig {
  // Common config
  apiKey?: string;
  apiToken?: string;
  spaceId?: string;
  projectId?: string;
  environment?: string;
  baseUrl?: string;

  // Authentication
  username?: string;
  password?: string;
  bearerToken?: string;

  // Options
  timeout?: number;
  retryAttempts?: number;
  locale?: string;
  preview?: boolean;

  // Custom config per CMS
  [key: string]: any;
}

export interface FetchQuery {
  contentType?: string;
  entryId?: string;
  filters?: Record<string, any>;
  fields?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  locale?: string;
}

export interface FetchResponse<T = any> {
  data: T;
  total?: number;
  offset?: number;
  limit?: number;
  metadata?: Record<string, any>;
}

export interface UpdateSchemaOptions {
  validate?: boolean;
  publish?: boolean;
  createIfNotExists?: boolean;
}

export interface AssetUploadOptions {
  title?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface AssetUploadResponse {
  id: string;
  url: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  metadata?: Record<string, any>;
}

/**
 * Abstract base adapter class
 */
export abstract class CMSAdapter {
  protected config: CMSConfig;
  protected connected: boolean = false;

  constructor(config: CMSConfig) {
    this.config = config;
  }

  /**
   * Connect to the CMS
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the CMS
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Save content to CMS
   */
  abstract save(data: SaveData): Promise<SaveResponse>;

  /**
   * Fetch content from CMS
   */
  abstract fetch(query: FetchQuery): Promise<FetchResponse>;

  /**
   * Fetch a single entry by ID
   */
  abstract fetchById(id: string): Promise<any>;

  /**
   * Update an existing entry
   */
  abstract update(id: string, data: Partial<SaveData>): Promise<SaveResponse>;

  /**
   * Delete an entry
   */
  abstract delete(id: string): Promise<void>;

  /**
   * Update or create content type schema
   */
  abstract updateSchema(schema: ElementSchema, options?: UpdateSchemaOptions): Promise<void>;

  /**
   * Fetch content type schema
   */
  abstract fetchSchema(contentTypeId: string): Promise<ElementSchema>;

  /**
   * List all content types
   */
  abstract listContentTypes(): Promise<Array<{ id: string; name: string; description?: string }>>;

  /**
   * Upload an asset (image, file, etc.)
   */
  abstract uploadAsset(file: File | Buffer, options?: AssetUploadOptions): Promise<AssetUploadResponse>;

  /**
   * Search content
   */
  abstract search(query: string, options?: Record<string, any>): Promise<FetchResponse>;

  /**
   * Publish an entry (if CMS supports draft/publish workflow)
   */
  async publish?(id: string): Promise<void>;

  /**
   * Unpublish an entry
   */
  async unpublish?(id: string): Promise<void>;

  /**
   * Get entry versions/history
   */
  async getVersions?(id: string): Promise<Array<{ version: number; createdAt: string; createdBy?: string }>>;

  /**
   * Restore a specific version
   */
  async restoreVersion?(id: string, version: number): Promise<void>;

  /**
   * Batch operations
   */
  async batchSave?(items: SaveData[]): Promise<SaveResponse[]> {
    // Default implementation: sequential saves
    const results: SaveResponse[] = [];
    for (const item of items) {
      const result = await this.save(item);
      results.push(result);
    }
    return results;
  }

  /**
   * Map internal SightEdit data to CMS-specific format
   */
  protected abstract mapToExternal(data: SaveData): any;

  /**
   * Map CMS-specific data to internal SightEdit format
   */
  protected abstract mapToInternal(cmsData: any): any;

  /**
   * Validate connection configuration
   */
  protected validateConfig(requiredFields: string[]): void {
    const missing = requiredFields.filter(field => !this.config[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: any, context: string): never {
    const message = error?.message || error?.toString() || 'Unknown error';
    throw new Error(`[${this.constructor.name}] ${context}: ${message}`);
  }

  /**
   * Get adapter name
   */
  getName(): string {
    return this.constructor.name;
  }

  /**
   * Get adapter version
   */
  getVersion(): string {
    return '2.0.0-alpha.1';
  }

  /**
   * Get supported features
   */
  abstract getSupportedFeatures(): {
    drafts: boolean;
    versions: boolean;
    assets: boolean;
    search: boolean;
    batch: boolean;
    webhooks: boolean;
    localization: boolean;
  };
}

/**
 * Adapter registry for managing multiple CMS adapters
 */
export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<string, CMSAdapter> = new Map();

  private constructor() {}

  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  /**
   * Register an adapter
   */
  register(name: string, adapter: CMSAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * Get an adapter by name
   */
  get(name: string): CMSAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Remove an adapter
   */
  unregister(name: string): void {
    this.adapters.delete(name);
  }

  /**
   * Get all registered adapters
   */
  getAll(): Map<string, CMSAdapter> {
    return new Map(this.adapters);
  }

  /**
   * Clear all adapters
   */
  clear(): void {
    this.adapters.clear();
  }
}

export const adapterRegistry = AdapterRegistry.getInstance();
