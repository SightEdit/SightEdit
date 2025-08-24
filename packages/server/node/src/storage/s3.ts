import { StorageAdapter } from '../index';
import * as crypto from 'crypto';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string; // For S3-compatible services like MinIO
  prefix?: string; // Optional key prefix for all objects
}

export class S3StorageAdapter implements StorageAdapter {
  private config: S3Config;
  private cache: Map<string, { value: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 300000; // 5 minutes

  constructor(config: S3Config) {
    this.config = config;
    
    // Clean up cache periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.cache.entries()) {
        if (now - data.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Every minute
  }

  async get(key: string): Promise<any> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    try {
      const objectKey = this.buildKey(key);
      const response = await this.s3Request('GET', objectKey);
      
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get object: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update cache
      this.cache.set(key, { value: data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('S3 get error:', error);
      return null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    const objectKey = this.buildKey(key);
    const body = JSON.stringify(value);

    try {
      const response = await this.s3Request('PUT', objectKey, {
        body,
        headers: {
          'Content-Type': 'application/json',
          'x-amz-storage-class': 'STANDARD_IA' // Infrequent access for cost savings
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to put object: ${response.statusText}`);
      }

      // Update cache
      this.cache.set(key, { value, timestamp: Date.now() });
    } catch (error) {
      console.error('S3 set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const objectKey = this.buildKey(key);

    try {
      const response = await this.s3Request('DELETE', objectKey);

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete object: ${response.statusText}`);
      }

      // Remove from cache
      this.cache.delete(key);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw error;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const listPrefix = this.buildKey(prefix || '');
    
    try {
      const response = await this.s3Request('GET', '', {
        params: {
          'list-type': '2',
          prefix: listPrefix,
          'max-keys': '1000'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list objects: ${response.statusText}`);
      }

      const xml = await response.text();
      const keys = this.parseListResponse(xml);
      
      // Remove the base prefix from keys
      const basePrefix = this.config.prefix || '';
      return keys.map(k => k.replace(basePrefix, '').replace(/^\//, ''));
    } catch (error) {
      console.error('S3 list error:', error);
      return [];
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    filename: string, 
    buffer: Buffer, 
    contentType: string
  ): Promise<string> {
    const objectKey = this.buildKey(`uploads/${filename}`);
    
    try {
      const response = await this.s3Request('PUT', objectKey, {
        body: buffer,
        headers: {
          'Content-Type': contentType,
          'x-amz-acl': 'public-read', // Make files publicly accessible
          'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }

      // Return public URL
      return this.getPublicUrl(objectKey);
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }

  /**
   * Get pre-signed URL for direct upload
   */
  async getUploadUrl(
    filename: string, 
    contentType: string, 
    expiresIn: number = 3600
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const objectKey = this.buildKey(`uploads/${filename}`);
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    
    const params = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${this.getCredentialScope()}`,
      'X-Amz-Date': this.getAmzDate(),
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host'
    };

    const canonicalRequest = this.buildCanonicalRequest('PUT', objectKey, params);
    const signature = this.calculateSignature(canonicalRequest);
    
    const uploadUrl = `${this.getBaseUrl()}/${objectKey}?${new URLSearchParams({
      ...params,
      'X-Amz-Signature': signature
    })}`;

    return {
      uploadUrl,
      publicUrl: this.getPublicUrl(objectKey)
    };
  }

  /**
   * Build S3 key with prefix
   */
  private buildKey(key: string): string {
    const prefix = this.config.prefix || '';
    return prefix ? `${prefix}/${key}` : key;
  }

  /**
   * Get public URL for an object
   */
  private getPublicUrl(key: string): string {
    return `${this.getBaseUrl()}/${key}`;
  }

  /**
   * Get base URL for S3
   */
  private getBaseUrl(): string {
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  /**
   * Make authenticated S3 request
   */
  private async s3Request(
    method: string, 
    key: string, 
    options: {
      body?: string | Buffer;
      headers?: Record<string, string>;
      params?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    const url = new URL(`${this.getBaseUrl()}/${key}`);
    
    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        url.searchParams.append(k, v);
      });
    }

    const amzDate = this.getAmzDate();
    const headers = {
      ...options.headers,
      'Host': url.hostname,
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': this.hash(options.body || '')
    };

    // Calculate signature
    const canonicalRequest = this.buildCanonicalRequest(
      method,
      url.pathname,
      Object.fromEntries(url.searchParams),
      headers,
      options.body
    );
    
    const signature = this.calculateSignature(canonicalRequest);
    
    headers['Authorization'] = this.buildAuthorizationHeader(signature);

    return fetch(url.toString(), {
      method,
      headers,
      body: options.body
    });
  }

  /**
   * Build canonical request for signing
   */
  private buildCanonicalRequest(
    method: string,
    path: string,
    params: Record<string, string>,
    headers?: Record<string, string>,
    body?: string | Buffer
  ): string {
    const canonicalParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalHeaders = headers
      ? Object.entries(headers)
          .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
          .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
          .join('\n')
      : '';

    const signedHeaders = headers
      ? Object.keys(headers)
          .map(k => k.toLowerCase())
          .sort()
          .join(';')
      : '';

    return [
      method,
      path,
      canonicalParams,
      canonicalHeaders,
      '',
      signedHeaders,
      this.hash(body || '')
    ].join('\n');
  }

  /**
   * Calculate AWS signature v4
   */
  private calculateSignature(canonicalRequest: string): string {
    const date = this.getAmzDate().substring(0, 8);
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      this.getAmzDate(),
      `${date}/${this.config.region}/s3/aws4_request`,
      this.hash(canonicalRequest)
    ].join('\n');

    const signingKey = this.getSigningKey(date);
    return this.hmac(signingKey, stringToSign, 'hex');
  }

  /**
   * Get signing key
   */
  private getSigningKey(date: string): Buffer {
    const kDate = this.hmac(`AWS4${this.config.secretAccessKey}`, date);
    const kRegion = this.hmac(kDate, this.config.region);
    const kService = this.hmac(kRegion, 's3');
    return this.hmac(kService, 'aws4_request');
  }

  /**
   * Build authorization header
   */
  private buildAuthorizationHeader(signature: string): string {
    return `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${this.getCredentialScope()}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
  }

  /**
   * Get credential scope
   */
  private getCredentialScope(): string {
    const date = this.getAmzDate().substring(0, 8);
    return `${date}/${this.config.region}/s3/aws4_request`;
  }

  /**
   * Get AMZ date string
   */
  private getAmzDate(): string {
    const now = new Date();
    return now.toISOString().replace(/[:-]|\.\d{3}/g, '').substring(0, 15) + 'Z';
  }

  /**
   * Calculate SHA256 hash
   */
  private hash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Calculate HMAC
   */
  private hmac(key: string | Buffer, data: string, encoding?: 'hex'): any {
    const h = crypto.createHmac('sha256', key).update(data);
    return encoding ? h.digest(encoding) : h.digest();
  }

  /**
   * Parse S3 list response XML
   */
  private parseListResponse(xml: string): string[] {
    const keys: string[] = [];
    const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    
    for (const match of keyMatches) {
      keys.push(match[1]);
    }
    
    return keys;
  }
}