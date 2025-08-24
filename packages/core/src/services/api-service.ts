import { SaveData, SaveResponse, BatchOperation, BatchResponse, UploadResponse } from '../types';
import { HTTPClient } from './http-client';
import { EventBus } from './event-bus';

export interface APIService {
  save(data: SaveData): Promise<SaveResponse>;
  batch(operations: BatchOperation[]): Promise<BatchResponse>;
  upload(files: FileList): Promise<UploadResponse>;
  get(sight: string): Promise<any>;
}

export class APIServiceImpl implements APIService {
  private readonly client: HTTPClient;
  private readonly requestQueue = new Map<string, Promise<any>>();

  constructor(
    private readonly baseURL: string,
    private readonly eventBus: EventBus,
    private readonly getAuthHeaders: () => Promise<Record<string, string>> = async () => ({})
  ) {
    this.client = new HTTPClient(baseURL);
  }

  async save(data: SaveData): Promise<SaveResponse> {
    const requestKey = `save:${data.sight}`;
    
    // Prevent duplicate requests
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    const request = this.performSave(data);
    this.requestQueue.set(requestKey, request);

    try {
      const response = await request;
      this.eventBus.emit('api:save:success', { data, response });
      return response;
    } catch (error) {
      this.eventBus.emit('api:save:error', { data, error: error as Error });
      throw error;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  private async performSave(data: SaveData): Promise<SaveResponse> {
    const headers = await this.getAuthHeaders();
    
    return this.client.request<SaveResponse>('/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: data,
      retries: 3,
      retryDelay: 1000
    });
  }

  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    if (operations.length === 0) {
      return { success: true, results: [] };
    }

    const requestKey = `batch:${operations.map(op => op.sight).join(',')}`;
    
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    const request = this.performBatch(operations);
    this.requestQueue.set(requestKey, request);

    try {
      const response = await request;
      this.eventBus.emit('api:batch:success', { operations, response });
      return response;
    } catch (error) {
      this.eventBus.emit('api:batch:error', { operations, error: error as Error });
      throw error;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  private async performBatch(operations: BatchOperation[]): Promise<BatchResponse> {
    const headers = await this.getAuthHeaders();
    
    return this.client.request<BatchResponse>('/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: { operations },
      retries: 3,
      retryDelay: 1000
    });
  }

  async upload(files: FileList): Promise<UploadResponse> {
    const formData = new FormData();
    Array.from(files).forEach((file, index) => {
      formData.append(`files`, file);
    });

    const headers = await this.getAuthHeaders();

    try {
      const response = await this.client.request<UploadResponse>('/upload', {
        method: 'POST',
        headers,
        body: formData,
        timeout: 60000, // 1 minute for file uploads
        retries: 2
      });

      this.eventBus.emit('api:upload:success', { files, response });
      return response;
    } catch (error) {
      this.eventBus.emit('api:upload:error', { files, error: error as Error });
      throw error;
    }
  }

  async get(sight: string): Promise<any> {
    const requestKey = `get:${sight}`;
    
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    const headers = await this.getAuthHeaders();
    const request = this.client.request<any>(`/content/${encodeURIComponent(sight)}`, {
      method: 'GET',
      headers,
      retries: 2
    });

    this.requestQueue.set(requestKey, request);

    try {
      const response = await request;
      this.eventBus.emit('api:get:success', { sight, response });
      return response;
    } catch (error) {
      this.eventBus.emit('api:get:error', { sight, error: error as Error });
      throw error;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  // Clear all pending requests
  clearPendingRequests(): void {
    this.requestQueue.clear();
  }
}