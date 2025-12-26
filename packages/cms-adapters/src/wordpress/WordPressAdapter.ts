/**
 * WordPress CMS Adapter
 *
 * Adapter for WordPress via REST API
 * https://developer.wordpress.org/rest-api/
 */

import axios, { type AxiosInstance } from 'axios';
import { CMSAdapter, type CMSConfig, type FetchQuery, type FetchResponse, type UpdateSchemaOptions, type AssetUploadOptions, type AssetUploadResponse } from '../base/Adapter';
import type { SaveData, SaveResponse, ElementSchema } from '@sightedit/core';

export interface WordPressConfig extends CMSConfig {
  siteUrl: string; // WordPress site URL
  username?: string; // For Basic Auth
  password?: string; // Application password
  token?: string; // JWT token (if using JWT plugin)
  authType?: 'basic' | 'jwt';
}

export class WordPressAdapter extends CMSAdapter {
  private client: AxiosInstance | null = null;

  constructor(config: WordPressConfig) {
    super(config);
    this.validateConfig(['siteUrl']);
  }

  async connect(): Promise<void> {
    try {
      const config = this.config as WordPressConfig;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Setup authentication
      if (config.authType === 'jwt' && config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      } else if (config.username && config.password) {
        const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      this.client = axios.create({
        baseURL: `${config.siteUrl}/wp-json/wp/v2`,
        headers,
        timeout: config.timeout || 10000
      });

      // Test connection
      await this.client.get('/users/me');

      this.connected = true;
    } catch (error) {
      this.handleError(error, 'Failed to connect to WordPress');
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
      const wpData = this.mapToExternal(data);
      const postType = data.sight.split('.')[0]; // e.g., 'posts', 'pages', 'products'

      let response;

      if (data.id) {
        // Update existing post
        response = await this.client.put(`/${postType}/${data.id}`, wpData);
      } else {
        // Create new post
        response = await this.client.post(`/${postType}`, wpData);
      }

      return {
        success: true,
        id: response.data.id.toString(),
        message: 'Content saved successfully',
        data: this.mapToInternal(response.data)
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
        per_page: query.limit || 10,
        page: query.offset ? Math.floor(query.offset / (query.limit || 10)) + 1 : 1
      };

      // Add filters
      if (query.filters) {
        Object.assign(params, query.filters);
      }

      // Add ordering
      if (query.orderBy) {
        params.orderby = query.orderBy;
      }

      const postType = query.contentType || 'posts';
      const response = await this.client.get(`/${postType}`, { params });

      const total = parseInt(response.headers['x-wp-total'] || '0', 10);
      const totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);

      return {
        data: response.data.map((item: any) => this.mapToInternal(item)),
        total,
        offset: query.offset || 0,
        limit: query.limit || 10,
        metadata: {
          totalPages
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
      // ID format: postType:id
      const parts = id.split(':');
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      const response = await this.client.get(`/${postType}/${postId}`);
      return this.mapToInternal(response.data);
    } catch (error) {
      this.handleError(error, `Failed to fetch post ${id}`);
    }
  }

  async update(id: string, data: Partial<SaveData>): Promise<SaveResponse> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const wpData = this.mapToExternal(data as SaveData);
      const postType = data.sight?.split('.')[0] || 'posts';

      const response = await this.client.put(`/${postType}/${id}`, wpData);

      return {
        success: true,
        id: response.data.id.toString(),
        message: 'Content updated successfully',
        data: this.mapToInternal(response.data)
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
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      await this.client.delete(`/${postType}/${postId}`, {
        params: { force: true } // Permanently delete (skip trash)
      });
    } catch (error) {
      this.handleError(error, `Failed to delete post ${id}`);
    }
  }

  async updateSchema(schema: ElementSchema, options?: UpdateSchemaOptions): Promise<void> {
    // WordPress custom fields can be added via REST API
    // However, custom post types and taxonomies require plugins or theme code
    throw new Error('WordPress schema updates require custom code or plugins. Use ACF or similar plugins for custom fields.');
  }

  async fetchSchema(contentTypeId: string): Promise<ElementSchema> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      // Fetch post type schema
      const response = await this.client.get(`/types/${contentTypeId}`);
      const postType = response.data;

      return {
        sight: `${contentTypeId}.title`,
        type: 'text',
        properties: {
          description: postType.description
        }
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
      const response = await this.client.get('/types');
      const types = response.data;

      return Object.values(types).map((type: any) => ({
        id: type.slug,
        name: type.name,
        description: type.description
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
        formData.append('file', file);
      } else {
        const blob = new Blob([file]);
        formData.append('file', blob, options?.title || 'file');
      }

      if (options?.title) {
        formData.append('title', options.title);
      }

      if (options?.description) {
        formData.append('caption', options.description);
      }

      const response = await this.client.post('/media', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const media = response.data;

      return {
        id: media.id.toString(),
        url: media.source_url,
        title: media.title?.rendered,
        description: media.caption?.rendered,
        mimeType: media.mime_type,
        size: media.media_details?.filesize,
        metadata: {
          width: media.media_details?.width,
          height: media.media_details?.height,
          altText: media.alt_text
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
      const postType = options?.contentType || 'posts';

      const response = await this.client.get(`/${postType}`, {
        params: {
          search: query,
          per_page: options?.limit || 20
        }
      });

      const total = parseInt(response.headers['x-wp-total'] || '0', 10);

      return {
        data: response.data.map((item: any) => this.mapToInternal(item)),
        total
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
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      await this.client.put(`/${postType}/${postId}`, {
        status: 'publish'
      });
    } catch (error) {
      this.handleError(error, `Failed to publish post ${id}`);
    }
  }

  async unpublish(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const parts = id.split(':');
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      await this.client.put(`/${postType}/${postId}`, {
        status: 'draft'
      });
    } catch (error) {
      this.handleError(error, `Failed to unpublish post ${id}`);
    }
  }

  async getVersions(id: string): Promise<Array<{ version: number; createdAt: string; createdBy?: string }>> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const parts = id.split(':');
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      const response = await this.client.get(`/${postType}/${postId}/revisions`);

      return response.data.map((revision: any, index: number) => ({
        version: index + 1,
        createdAt: revision.modified,
        createdBy: revision.author?.name
      }));
    } catch (error) {
      this.handleError(error, `Failed to get versions for post ${id}`);
    }
  }

  async restoreVersion(id: string, version: number): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    try {
      const parts = id.split(':');
      const postType = parts.length > 1 ? parts[0] : 'posts';
      const postId = parts.length > 1 ? parts[1] : id;

      // Get revisions
      const response = await this.client.get(`/${postType}/${postId}/revisions`);
      const revisions = response.data;

      if (version > 0 && version <= revisions.length) {
        const revision = revisions[version - 1];

        // Restore by updating post with revision content
        await this.client.put(`/${postType}/${postId}`, {
          title: revision.title,
          content: revision.content,
          excerpt: revision.excerpt
        });
      } else {
        throw new Error(`Invalid version number: ${version}`);
      }
    } catch (error) {
      this.handleError(error, `Failed to restore version for post ${id}`);
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
      localization: false // Requires WPML or Polylang plugin
    };
  }

  protected mapToExternal(data: SaveData): any {
    const fieldName = data.sight.split('.').pop();

    // Map common fields
    const wpData: any = {};

    switch (fieldName) {
      case 'title':
        wpData.title = data.value;
        break;
      case 'content':
        wpData.content = data.value;
        break;
      case 'excerpt':
        wpData.excerpt = data.value;
        break;
      default:
        // Custom field (requires ACF or similar)
        wpData.meta = {
          [fieldName!]: data.value
        };
    }

    return wpData;
  }

  protected mapToInternal(cmsData: any): any {
    return {
      id: cmsData.id?.toString(),
      title: cmsData.title?.rendered || cmsData.title,
      content: cmsData.content?.rendered || cmsData.content,
      excerpt: cmsData.excerpt?.rendered || cmsData.excerpt,
      slug: cmsData.slug,
      status: cmsData.status,
      link: cmsData.link,
      metadata: {
        type: cmsData.type,
        author: cmsData.author,
        createdAt: cmsData.date,
        modifiedAt: cmsData.modified,
        featured_media: cmsData.featured_media,
        categories: cmsData.categories,
        tags: cmsData.tags
      }
    };
  }
}
