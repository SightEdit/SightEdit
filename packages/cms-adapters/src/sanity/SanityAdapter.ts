/**
 * Sanity CMS Adapter
 *
 * Adapter for Sanity headless CMS
 * https://www.sanity.io/
 */

import { createClient, type SanityClient } from '@sanity/client';
import { CMSAdapter, type CMSConfig, type FetchQuery, type FetchResponse, type UpdateSchemaOptions, type AssetUploadOptions, type AssetUploadResponse } from '../base/Adapter';
import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface SanityConfig extends CMSConfig {
  projectId: string;
  dataset: string;
  token?: string; // Required for write operations
  apiVersion?: string; // e.g., '2024-01-01'
  useCdn?: boolean;
}

export class SanityAdapter extends CMSAdapter {
  private client: SanityClient | null = null;

  constructor(config: SanityConfig) {
    super(config);
    this.validateConfig(['projectId', 'dataset']);
  }

  async connect(): Promise<void> {
    try {
      const config = this.config as SanityConfig;

      this.client = createClient({
        projectId: config.projectId,
        dataset: config.dataset,
        token: config.token,
        apiVersion: config.apiVersion || '2024-01-01',
        useCdn: config.useCdn !== undefined ? config.useCdn : true
      });

      // Test connection by fetching project info
      await this.client.config();

      this.connected = true;
    } catch (error) {
      this.handleError(error, 'Failed to connect to Sanity');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  async save(data: SaveData): Promise<SaveResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    if (!(this.config as SanityConfig).token) {
      throw new Error('Token required for write operations');
    }

    try {
      const sanityData = this.mapToExternal(data);

      let result;

      if (data.id) {
        // Update existing document
        result = await this.client
          .patch(data.id)
          .set(sanityData)
          .commit();
      } else {
        // Create new document
        result = await this.client.create({
          _type: sanityData._type,
          ...sanityData
        });
      }

      return {
        success: true,
        id: result._id,
        message: 'Content saved successfully',
        data: this.mapToInternal(result)
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Save failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async fetch(query: FetchQuery): Promise<FetchResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // Build GROQ query
      let groqQuery = `*[_type == "${query.contentType}"]`;

      // Add filters
      if (query.filters) {
        const filterConditions = Object.entries(query.filters)
          .map(([key, value]) => `${key} == "${value}"`)
          .join(' && ');

        if (filterConditions) {
          groqQuery = `*[_type == "${query.contentType}" && ${filterConditions}]`;
        }
      }

      // Add field selection
      if (query.fields && query.fields.length > 0) {
        groqQuery += ` {${query.fields.join(', ')}}`;
      }

      // Add ordering
      if (query.orderBy) {
        groqQuery += ` | order(${query.orderBy})`;
      }

      // Add pagination
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      groqQuery += ` [${offset}...${offset + limit}]`;

      const results = await this.client.fetch(groqQuery);

      return {
        data: results.map((item: any) => this.mapToInternal(item)),
        total: results.length,
        offset,
        limit
      };
    } catch (error) {
      this.handleError(error, 'Failed to fetch content');
    }
  }

  async fetchById(id: string): Promise<any> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const result = await this.client.getDocument(id);
      return this.mapToInternal(result);
    } catch (error) {
      this.handleError(error, `Failed to fetch document ${id}`);
    }
  }

  async update(id: string, data: Partial<SaveData>): Promise<SaveResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    if (!(this.config as SanityConfig).token) {
      throw new Error('Token required for write operations');
    }

    try {
      const sanityData = this.mapToExternal(data as SaveData);

      const result = await this.client
        .patch(id)
        .set(sanityData)
        .commit();

      return {
        success: true,
        id: result._id,
        message: 'Content updated successfully',
        data: this.mapToInternal(result)
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Update failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    if (!(this.config as SanityConfig).token) {
      throw new Error('Token required for write operations');
    }

    try {
      await this.client.delete(id);
    } catch (error) {
      this.handleError(error, `Failed to delete document ${id}`);
    }
  }

  async updateSchema(schema: ElementSchema, options?: UpdateSchemaOptions): Promise<void> {
    // Sanity schemas are typically managed via Studio
    // This is a placeholder for programmatic schema updates
    throw new Error('Sanity schemas are managed via Sanity Studio. Use the Studio UI to update schemas.');
  }

  async fetchSchema(contentTypeId: string): Promise<ElementSchema> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // Fetch a sample document to infer schema
      const sample = await this.client.fetch(`*[_type == "${contentTypeId}"][0]`);

      if (!sample) {
        throw new Error(`No documents found for type ${contentTypeId}`);
      }

      // Map first field as example
      const fields = Object.keys(sample).filter(k => !k.startsWith('_'));
      const firstField = fields[0];

      return {
        sight: `${contentTypeId}.${firstField}`,
        type: this.inferType(sample[firstField]),
        properties: {}
      };
    } catch (error) {
      this.handleError(error, `Failed to fetch schema ${contentTypeId}`);
    }
  }

  async listContentTypes(): Promise<Array<{ id: string; name: string; description?: string }>> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // Get all unique document types
      const types = await this.client.fetch(`
        array::unique(*[]._type)
      `);

      return types.map((type: string) => ({
        id: type,
        name: type,
        description: `Sanity document type: ${type}`
      }));
    } catch (error) {
      this.handleError(error, 'Failed to list content types');
    }
  }

  async uploadAsset(file: File | Buffer, options?: AssetUploadOptions): Promise<AssetUploadResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    if (!(this.config as SanityConfig).token) {
      throw new Error('Token required for write operations');
    }

    try {
      const uploadOptions: any = {};

      if (options?.title) {
        uploadOptions.filename = options.title;
      }

      const asset = await this.client.assets.upload('image', file, uploadOptions);

      return {
        id: asset._id,
        url: asset.url,
        title: options?.title,
        description: options?.description,
        mimeType: asset.mimeType,
        size: asset.size,
        metadata: {
          ...options?.metadata,
          dimensions: asset.metadata?.dimensions
        }
      };
    } catch (error) {
      this.handleError(error, 'Failed to upload asset');
    }
  }

  async search(query: string, options?: Record<string, any>): Promise<FetchResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const contentType = options?.contentType || '*';

      // Build search query using GROQ
      const groqQuery = `*[_type == "${contentType}" && [title, description, content] match "${query}*"]`;

      const results = await this.client.fetch(groqQuery);

      return {
        data: results.map((item: any) => this.mapToInternal(item)),
        total: results.length
      };
    } catch (error) {
      this.handleError(error, 'Search failed');
    }
  }

  async publish(id: string): Promise<void> {
    // Sanity publishes documents automatically in production
    // This is mainly for draft datasets
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // In Sanity, you typically work with draft._id and published._id
      const draftId = `drafts.${id}`;

      const draft = await this.client.getDocument(draftId);
      if (!draft) {
        throw new Error(`Draft not found: ${draftId}`);
      }

      // Publish by creating a document without 'drafts.' prefix
      await this.client.createOrReplace({
        ...draft,
        _id: id
      });
    } catch (error) {
      this.handleError(error, `Failed to publish document ${id}`);
    }
  }

  async unpublish(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // Delete the published version, keep draft
      await this.client.delete(id);
    } catch (error) {
      this.handleError(error, `Failed to unpublish document ${id}`);
    }
  }

  getSupportedFeatures() {
    return {
      drafts: true,
      versions: true,
      assets: true,
      search: true,
      batch: true,
      webhooks: true,
      localization: true
    };
  }

  protected mapToExternal(data: SaveData): any {
    const contentType = data.sight.split('.')[0];
    const fieldName = data.sight.split('.').pop();

    return {
      _type: contentType,
      [fieldName!]: data.value
    };
  }

  protected mapToInternal(cmsData: any): any {
    return {
      id: cmsData._id,
      type: cmsData._type,
      ...Object.entries(cmsData)
        .filter(([key]) => !key.startsWith('_'))
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, any>),
      metadata: {
        createdAt: cmsData._createdAt,
        updatedAt: cmsData._updatedAt,
        rev: cmsData._rev
      }
    };
  }

  private inferType(value: any): any {
    if (typeof value === 'string') return 'text';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'checkbox';
    if (Array.isArray(value)) return 'collection';
    if (value && typeof value === 'object' && value._type === 'image') return 'image';
    return 'text';
  }
}
