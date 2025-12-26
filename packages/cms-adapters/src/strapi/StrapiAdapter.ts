/**
 * Strapi CMS Adapter
 *
 * Adapter for Strapi headless CMS
 * https://strapi.io/
 */

import axios, { type AxiosInstance } from 'axios';
import { CMSAdapter, type CMSConfig, type FetchQuery, type FetchResponse, type UpdateSchemaOptions, type AssetUploadOptions, type AssetUploadResponse } from '../base/Adapter';
import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface StrapiConfig extends CMSConfig {
  baseUrl: string;
  apiToken: string;
  version?: 'v4' | 'v5'; // Strapi version
}

export class StrapiAdapter extends CMSAdapter {
  private client: AxiosInstance | null = null;
  private version: 'v4' | 'v5';

  constructor(config: StrapiConfig) {
    super(config);
    this.validateConfig(['baseUrl', 'apiToken']);
    this.version = (config as StrapiConfig).version || 'v4';
  }

  async connect(): Promise<void> {
    try {
      const config = this.config as StrapiConfig;

      this.client = axios.create({
        baseURL: config.baseUrl,
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        timeout: config.timeout || 10000
      });

      // Test connection
      await this.client.get('/api/users/me');

      this.connected = true;
    } catch (error) {
      this.handleError(error, 'Failed to connect to Strapi');
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

    try {
      const strapiData = this.mapToExternal(data);
      const contentType = data.sight.split('.')[0];

      let response;

      if (data.id) {
        // Update existing entry
        response = await this.client.put(
          `/api/${contentType}/${data.id}`,
          { data: strapiData }
        );
      } else {
        // Create new entry
        response = await this.client.post(
          `/api/${contentType}`,
          { data: strapiData }
        );
      }

      const result = this.version === 'v4' ? response.data.data : response.data;

      return {
        success: true,
        id: result.id.toString(),
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
      const params: any = {
        'pagination[page]': Math.floor((query.offset || 0) / (query.limit || 25)) + 1,
        'pagination[pageSize]': query.limit || 25
      };

      // Add filters
      if (query.filters) {
        Object.entries(query.filters).forEach(([key, value]) => {
          params[`filters[${key}][$eq]`] = value;
        });
      }

      // Add field selection
      if (query.fields && query.fields.length > 0) {
        params['fields'] = query.fields;
      }

      // Add sorting
      if (query.orderBy) {
        params['sort'] = query.orderBy;
      }

      // Add locale
      if (query.locale) {
        params['locale'] = query.locale;
      }

      const response = await this.client.get(`/api/${query.contentType}`, { params });

      const data = this.version === 'v4' ? response.data.data : response.data;
      const meta = this.version === 'v4' ? response.data.meta : response.data.pagination;

      return {
        data: Array.isArray(data) ? data.map(item => this.mapToInternal(item)) : [],
        total: meta.pagination?.total || 0,
        offset: ((meta.pagination?.page || 1) - 1) * (meta.pagination?.pageSize || 25),
        limit: meta.pagination?.pageSize || 25,
        metadata: meta
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
      // Extract content type from ID or use provided
      const parts = id.split(':');
      const contentType = parts.length > 1 ? parts[0] : 'entries';
      const entryId = parts.length > 1 ? parts[1] : id;

      const response = await this.client.get(`/api/${contentType}/${entryId}`);
      const data = this.version === 'v4' ? response.data.data : response.data;

      return this.mapToInternal(data);
    } catch (error) {
      this.handleError(error, `Failed to fetch entry ${id}`);
    }
  }

  async update(id: string, data: Partial<SaveData>): Promise<SaveResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const strapiData = this.mapToExternal(data as SaveData);
      const contentType = data.sight?.split('.')[0] || 'entries';

      const response = await this.client.put(
        `/api/${contentType}/${id}`,
        { data: strapiData }
      );

      const result = this.version === 'v4' ? response.data.data : response.data;

      return {
        success: true,
        id: result.id.toString(),
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

    try {
      const parts = id.split(':');
      const contentType = parts.length > 1 ? parts[0] : 'entries';
      const entryId = parts.length > 1 ? parts[1] : id;

      await this.client.delete(`/api/${contentType}/${entryId}`);
    } catch (error) {
      this.handleError(error, `Failed to delete entry ${id}`);
    }
  }

  async updateSchema(schema: ElementSchema, options?: UpdateSchemaOptions): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const contentType = schema.sight.split('.')[0];
      const fieldName = schema.sight.split('.').pop()!;

      // Get existing content type
      const response = await this.client.get(`/content-type-builder/content-types/${contentType}`);
      const contentTypeData = response.data.data;

      // Add or update field
      const field = this.mapSchemaToStrapiField(schema);

      if (!contentTypeData.schema.attributes) {
        contentTypeData.schema.attributes = {};
      }

      contentTypeData.schema.attributes[fieldName] = field;

      // Update content type
      await this.client.put(
        `/content-type-builder/content-types/${contentType}`,
        { data: contentTypeData }
      );
    } catch (error) {
      this.handleError(error, 'Failed to update schema');
    }
  }

  async fetchSchema(contentTypeId: string): Promise<ElementSchema> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const response = await this.client.get(`/content-type-builder/content-types/${contentTypeId}`);
      const contentType = response.data.data;

      // Map first attribute as example
      const firstAttribute = Object.entries(contentType.schema.attributes)[0];
      const [fieldName, fieldData] = firstAttribute as [string, any];

      return this.mapStrapiFieldToSchema(fieldName, fieldData, contentTypeId);
    } catch (error) {
      this.handleError(error, `Failed to fetch schema ${contentTypeId}`);
    }
  }

  async listContentTypes(): Promise<Array<{ id: string; name: string; description?: string }>> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const response = await this.client.get('/content-type-builder/content-types');
      const contentTypes = response.data.data;

      return contentTypes.map((ct: any) => ({
        id: ct.uid,
        name: ct.schema.displayName || ct.schema.name,
        description: ct.schema.description
      }));
    } catch (error) {
      this.handleError(error, 'Failed to list content types');
    }
  }

  async uploadAsset(file: File | Buffer, options?: AssetUploadOptions): Promise<AssetUploadResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const formData = new FormData();

      if (file instanceof File) {
        formData.append('files', file);
      } else {
        const blob = new Blob([file]);
        formData.append('files', blob, options?.title || 'file');
      }

      if (options?.title) {
        formData.append('fileInfo', JSON.stringify({ name: options.title }));
      }

      const response = await this.client.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const uploadedFile = Array.isArray(response.data) ? response.data[0] : response.data;

      return {
        id: uploadedFile.id.toString(),
        url: `${this.config.baseUrl}${uploadedFile.url}`,
        title: uploadedFile.name,
        description: uploadedFile.caption,
        mimeType: uploadedFile.mime,
        size: uploadedFile.size,
        metadata: {
          width: uploadedFile.width,
          height: uploadedFile.height,
          formats: uploadedFile.formats
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
      const contentType = options?.contentType || 'entries';

      const response = await this.client.get(`/api/${contentType}`, {
        params: {
          '_q': query,
          ...options
        }
      });

      const data = this.version === 'v4' ? response.data.data : response.data;
      const meta = this.version === 'v4' ? response.data.meta : response.data.pagination;

      return {
        data: Array.isArray(data) ? data.map(item => this.mapToInternal(item)) : [],
        total: meta?.pagination?.total || data.length,
        metadata: meta
      };
    } catch (error) {
      this.handleError(error, 'Search failed');
    }
  }

  async publish(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const parts = id.split(':');
      const contentType = parts.length > 1 ? parts[0] : 'entries';
      const entryId = parts.length > 1 ? parts[1] : id;

      await this.client.post(`/api/${contentType}/${entryId}/actions/publish`);
    } catch (error) {
      this.handleError(error, `Failed to publish entry ${id}`);
    }
  }

  async unpublish(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const parts = id.split(':');
      const contentType = parts.length > 1 ? parts[0] : 'entries';
      const entryId = parts.length > 1 ? parts[1] : id;

      await this.client.post(`/api/${contentType}/${entryId}/actions/unpublish`);
    } catch (error) {
      this.handleError(error, `Failed to unpublish entry ${id}`);
    }
  }

  getSupportedFeatures() {
    return {
      drafts: true,
      versions: false, // Strapi v4/v5 doesn't have built-in versioning
      assets: true,
      search: true,
      batch: true,
      webhooks: true,
      localization: true
    };
  }

  protected mapToExternal(data: SaveData): any {
    const fieldName = data.sight.split('.').pop();

    return {
      [fieldName!]: data.value
    };
  }

  protected mapToInternal(cmsData: any): any {
    return {
      id: cmsData.id?.toString(),
      attributes: cmsData.attributes || cmsData,
      metadata: {
        createdAt: cmsData.createdAt,
        updatedAt: cmsData.updatedAt,
        publishedAt: cmsData.publishedAt,
        locale: cmsData.locale
      }
    };
  }

  private mapSchemaToStrapiField(schema: ElementSchema): any {
    const typeMap: Record<string, string> = {
      text: 'string',
      richtext: 'richtext',
      number: 'integer',
      date: 'datetime',
      image: 'media',
      select: 'enumeration',
      checkbox: 'boolean'
    };

    const field: any = {
      type: typeMap[schema.type] || 'string',
      required: schema.properties?.required || false
    };

    if (schema.properties?.minLength) {
      field.minLength = schema.properties.minLength;
    }

    if (schema.properties?.maxLength) {
      field.maxLength = schema.properties.maxLength;
    }

    if (schema.type === 'select' && schema.properties?.options) {
      field.enum = Array.isArray(schema.properties.options)
        ? schema.properties.options.map((o: any) => o.value || o)
        : schema.properties.options.split(',');
    }

    if (schema.type === 'image') {
      field.allowedTypes = ['images'];
      field.multiple = schema.properties?.multiple || false;
    }

    return field;
  }

  private mapStrapiFieldToSchema(fieldName: string, fieldData: any, contentTypeId: string): ElementSchema {
    const typeMap: Record<string, any> = {
      string: 'text',
      text: 'text',
      richtext: 'richtext',
      integer: 'number',
      decimal: 'number',
      float: 'number',
      datetime: 'date',
      date: 'date',
      boolean: 'checkbox',
      enumeration: 'select',
      media: 'image'
    };

    const properties: any = {
      required: fieldData.required || false
    };

    if (fieldData.minLength) properties.minLength = fieldData.minLength;
    if (fieldData.maxLength) properties.maxLength = fieldData.maxLength;
    if (fieldData.enum) properties.options = fieldData.enum;
    if (fieldData.multiple) properties.multiple = fieldData.multiple;

    return {
      sight: `${contentTypeId}.${fieldName}`,
      type: typeMap[fieldData.type] || 'text',
      properties
    };
  }
}
