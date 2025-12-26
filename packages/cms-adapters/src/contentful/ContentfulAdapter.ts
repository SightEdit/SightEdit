/**
 * Contentful CMS Adapter
 *
 * Adapter for Contentful headless CMS
 * https://www.contentful.com/
 */

import * as contentful from 'contentful';
import * as contentfulManagement from 'contentful-management';
import { CMSAdapter, type CMSConfig, type FetchQuery, type FetchResponse, type UpdateSchemaOptions, type AssetUploadOptions, type AssetUploadResponse } from '../base/Adapter';
import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface ContentfulConfig extends CMSConfig {
  space: string;
  accessToken: string;
  environment?: string;
  managementToken?: string; // Required for write operations
  host?: string;
}

export class ContentfulAdapter extends CMSAdapter {
  private client: contentful.ContentfulClientApi | null = null;
  private managementClient: contentfulManagement.ClientAPI | null = null;
  private environmentContext: contentfulManagement.Environment | null = null;

  constructor(config: ContentfulConfig) {
    super(config);
    this.validateConfig(['space', 'accessToken']);
  }

  async connect(): Promise<void> {
    try {
      const config = this.config as ContentfulConfig;

      // Create delivery API client (read-only)
      this.client = contentful.createClient({
        space: config.space,
        accessToken: config.accessToken,
        environment: config.environment || 'master',
        host: config.host
      });

      // Test connection
      await this.client.getSpace();

      // Create management API client if token provided (for write operations)
      if (config.managementToken) {
        this.managementClient = contentfulManagement.createClient({
          accessToken: config.managementToken
        });

        const space = await this.managementClient.getSpace(config.space);
        this.environmentContext = await space.getEnvironment(config.environment || 'master');
      }

      this.connected = true;
    } catch (error) {
      this.handleError(error, 'Failed to connect to Contentful');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.managementClient = null;
    this.environmentContext = null;
    this.connected = false;
  }

  async save(data: SaveData): Promise<SaveResponse> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized. Provide managementToken for write operations.');
    }

    try {
      const contentfulData = this.mapToExternal(data);

      // Check if entry exists
      let entry: contentfulManagement.Entry;

      if (data.id) {
        // Update existing entry
        try {
          entry = await this.environmentContext.getEntry(data.id);
          entry.fields = contentfulData.fields;
          entry = await entry.update();
        } catch (error) {
          // Entry doesn't exist, create new one
          entry = await this.environmentContext.createEntry(contentfulData.contentType, {
            fields: contentfulData.fields
          });
        }
      } else {
        // Create new entry
        entry = await this.environmentContext.createEntry(contentfulData.contentType, {
          fields: contentfulData.fields
        });
      }

      // Publish if required
      if (contentfulData.publish) {
        entry = await entry.publish();
      }

      return {
        success: true,
        id: entry.sys.id,
        message: 'Content saved successfully',
        data: this.mapToInternal(entry)
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
      const contentfulQuery: any = {
        content_type: query.contentType,
        limit: query.limit || 100,
        skip: query.offset || 0,
        order: query.orderBy,
        locale: query.locale || this.config.locale
      };

      // Add filters
      if (query.filters) {
        Object.assign(contentfulQuery, query.filters);
      }

      // Add field selection
      if (query.fields && query.fields.length > 0) {
        contentfulQuery.select = query.fields.join(',');
      }

      const response = await this.client.getEntries(contentfulQuery);

      return {
        data: response.items.map(item => this.mapToInternal(item)),
        total: response.total,
        offset: response.skip,
        limit: response.limit,
        metadata: {
          includes: response.includes,
          stringifySafe: response.stringifySafe
        }
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
      const entry = await this.client.getEntry(id, {
        locale: this.config.locale
      });
      return this.mapToInternal(entry);
    } catch (error) {
      this.handleError(error, `Failed to fetch entry ${id}`);
    }
  }

  async update(id: string, data: Partial<SaveData>): Promise<SaveResponse> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      const entry = await this.environmentContext.getEntry(id);
      const contentfulData = this.mapToExternal(data as SaveData);

      // Update fields
      Object.assign(entry.fields, contentfulData.fields);

      const updated = await entry.update();

      return {
        success: true,
        id: updated.sys.id,
        message: 'Content updated successfully',
        data: this.mapToInternal(updated)
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
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      const entry = await this.environmentContext.getEntry(id);

      // Unpublish if published
      if (entry.isPublished()) {
        await entry.unpublish();
      }

      await entry.delete();
    } catch (error) {
      this.handleError(error, `Failed to delete entry ${id}`);
    }
  }

  async updateSchema(schema: ElementSchema, options?: UpdateSchemaOptions): Promise<void> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      const contentTypeId = schema.sight.replace(/\./g, '_');

      let contentType: contentfulManagement.ContentType;

      try {
        // Try to get existing content type
        contentType = await this.environmentContext.getContentType(contentTypeId);
      } catch (error) {
        // Create new content type
        if (options?.createIfNotExists) {
          contentType = await this.environmentContext.createContentTypeWithId(contentTypeId, {
            name: schema.sight,
            description: `Content type for ${schema.sight}`,
            fields: []
          });
        } else {
          throw new Error(`Content type ${contentTypeId} not found`);
        }
      }

      // Map SightEdit schema to Contentful field
      const field = this.mapSchemaToContentfulField(schema);

      // Check if field exists
      const existingFieldIndex = contentType.fields.findIndex(f => f.id === field.id);

      if (existingFieldIndex >= 0) {
        // Update existing field
        contentType.fields[existingFieldIndex] = field;
      } else {
        // Add new field
        contentType.fields.push(field);
      }

      // Update content type
      contentType = await contentType.update();

      // Publish if required
      if (options?.publish) {
        await contentType.publish();
      }
    } catch (error) {
      this.handleError(error, 'Failed to update schema');
    }
  }

  async fetchSchema(contentTypeId: string): Promise<ElementSchema> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const contentType = await this.client.getContentType(contentTypeId);

      // Map first field as example (in reality, you'd map all fields)
      const field = contentType.fields[0];

      return this.mapContentfulFieldToSchema(field, contentTypeId);
    } catch (error) {
      this.handleError(error, `Failed to fetch schema ${contentTypeId}`);
    }
  }

  async listContentTypes(): Promise<Array<{ id: string; name: string; description?: string }>> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const contentTypes = await this.client.getContentTypes();

      return contentTypes.items.map(ct => ({
        id: ct.sys.id,
        name: ct.name,
        description: ct.description
      }));
    } catch (error) {
      this.handleError(error, 'Failed to list content types');
    }
  }

  async uploadAsset(file: File | Buffer, options?: AssetUploadOptions): Promise<AssetUploadResponse> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      // Create asset
      const asset = await this.environmentContext.createAsset({
        fields: {
          title: {
            'en-US': options?.title || 'Untitled'
          },
          description: {
            'en-US': options?.description || ''
          },
          file: {
            'en-US': {
              contentType: file instanceof File ? file.type : 'application/octet-stream',
              fileName: file instanceof File ? file.name : 'file',
              upload: file instanceof File ? await file.arrayBuffer() : file
            }
          }
        }
      });

      // Process asset
      const processed = await asset.processForAllLocales();

      // Publish asset
      const published = await processed.publish();

      return {
        id: published.sys.id,
        url: `https:${published.fields.file['en-US'].url}`,
        title: published.fields.title['en-US'],
        description: published.fields.description?.['en-US'],
        mimeType: published.fields.file['en-US'].contentType,
        size: published.fields.file['en-US'].details?.size,
        metadata: options?.metadata
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
      const response = await this.client.getEntries({
        query,
        ...options
      });

      return {
        data: response.items.map(item => this.mapToInternal(item)),
        total: response.total,
        offset: response.skip,
        limit: response.limit
      };
    } catch (error) {
      this.handleError(error, 'Search failed');
    }
  }

  async publish(id: string): Promise<void> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      const entry = await this.environmentContext.getEntry(id);
      await entry.publish();
    } catch (error) {
      this.handleError(error, `Failed to publish entry ${id}`);
    }
  }

  async unpublish(id: string): Promise<void> {
    if (!this.environmentContext) {
      throw new Error('Management client not initialized');
    }

    try {
      const entry = await this.environmentContext.getEntry(id);
      await entry.unpublish();
    } catch (error) {
      this.handleError(error, `Failed to unpublish entry ${id}`);
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
    const locale = this.config.locale || 'en-US';

    return {
      contentType: data.sight.split('.')[0], // First part of sight as content type
      fields: {
        [data.sight.split('.').pop()!]: {
          [locale]: data.value
        }
      },
      publish: false
    };
  }

  protected mapToInternal(cmsData: any): any {
    const locale = this.config.locale || 'en-US';

    return {
      id: cmsData.sys.id,
      contentType: cmsData.sys.contentType?.sys.id,
      fields: Object.entries(cmsData.fields).reduce((acc, [key, value]: [string, any]) => {
        acc[key] = value[locale];
        return acc;
      }, {} as Record<string, any>),
      metadata: {
        createdAt: cmsData.sys.createdAt,
        updatedAt: cmsData.sys.updatedAt,
        version: cmsData.sys.version,
        publishedVersion: cmsData.sys.publishedVersion
      }
    };
  }

  private mapSchemaToContentfulField(schema: ElementSchema): any {
    const typeMap: Record<string, string> = {
      text: 'Symbol',
      richtext: 'RichText',
      number: 'Integer',
      date: 'Date',
      image: 'Link',
      select: 'Symbol',
      checkbox: 'Boolean'
    };

    return {
      id: schema.sight.split('.').pop(),
      name: schema.sight,
      type: typeMap[schema.type] || 'Symbol',
      required: schema.properties?.required || false,
      localized: true,
      validations: this.mapValidations(schema)
    };
  }

  private mapContentfulFieldToSchema(field: any, contentTypeId: string): ElementSchema {
    const typeMap: Record<string, any> = {
      Symbol: 'text',
      Text: 'text',
      RichText: 'richtext',
      Integer: 'number',
      Number: 'number',
      Date: 'date',
      Boolean: 'checkbox',
      Link: 'image'
    };

    return {
      sight: `${contentTypeId}.${field.id}`,
      type: typeMap[field.type] || 'text',
      properties: {
        required: field.required,
        ...this.mapValidationsToProperties(field.validations)
      }
    };
  }

  private mapValidations(schema: ElementSchema): any[] {
    const validations: any[] = [];

    if (schema.properties?.minLength) {
      validations.push({ size: { min: schema.properties.minLength } });
    }

    if (schema.properties?.maxLength) {
      validations.push({ size: { max: schema.properties.maxLength } });
    }

    if (schema.properties?.pattern) {
      validations.push({ regexp: { pattern: schema.properties.pattern } });
    }

    return validations;
  }

  private mapValidationsToProperties(validations?: any[]): Record<string, any> {
    if (!validations) return {};

    const props: Record<string, any> = {};

    validations.forEach(validation => {
      if (validation.size) {
        if (validation.size.min) props.minLength = validation.size.min;
        if (validation.size.max) props.maxLength = validation.size.max;
      }
      if (validation.regexp) {
        props.pattern = validation.regexp.pattern;
      }
    });

    return props;
  }
}
