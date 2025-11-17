import { 
  SightEditConfig, 
  SaveData, 
  SaveResponse, 
  BatchOperation, 
  BatchResponse,
  ElementSchema
} from './types';
import { ErrorHandler } from "./utils/error-handler";
import { HTMLSanitizer } from './utils/sanitizer';

interface APIConfig {
  endpoint: string;
  apiKey?: string;
  auth?: SightEditConfig['auth'];
  debug?: boolean;
}

interface RequestOptions extends RequestInit {
  timeout?: number;
  retry?: number;
}

export class SightEditAPI {
  private config: APIConfig;
  private queue: SaveData[] = [];
  private get isOffline(): boolean {
    return !navigator.onLine;
  }
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(config: SightEditConfig) {
    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      auth: config.auth,
      debug: config.debug
    };
    
    this.setupOfflineHandling();
  }

  private setupOfflineHandling(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processQueue();
      });
      
      window.addEventListener('offline', () => {
        // Just setup the listener, isOffline getter will check navigator.onLine
      });
    }
  }

  async save(data: SaveData): Promise<SaveResponse> {
    // Create a request key for deduplication
    const requestKey = this.createRequestKey('save', data);
    
    // Check if there's already a pending request for the same data
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }
    
    // Create the request promise
    const requestPromise = this.performSave(data);
    
    // Store it in pending requests
    this.pendingRequests.set(requestKey, requestPromise);
    
    // Clean up after completion
    requestPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    
    return requestPromise;
  }

  private async performSave(data: SaveData): Promise<SaveResponse> {
    // Validate input data
    try {
      this.validateSaveData(data);
    } catch (error) {
      // Re-throw to ensure it's properly handled as a promise rejection
      throw error;
    }
    
    // Sanitize the data before sending
    const sanitizedData = this.sanitizeData(data);
    
    // Validate request size (10MB limit)
    const requestSize = this.calculateRequestSize(sanitizedData);
    if (requestSize > 10 * 1024 * 1024) {
      throw new Error('Request size exceeds maximum limit');
    }

    if (this.isOffline) {
      const MAX_QUEUE_SIZE = 1000;
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        console.warn('Offline queue full. Discarding oldest items.');
        this.queue.shift(); // Remove oldest item
      }
      this.queue.push(sanitizedData);
      return {
        success: true,
        data: sanitizedData.value,
        version: Date.now(),
        queued: true
      };
    }

    try {
      const response = await this.request<SaveResponse>('/save', {
        method: 'POST',
        body: JSON.stringify(sanitizedData)
      });

      if (this.config.debug) {
        console.log('Save operation completed:', { sight: data.sight });
      }

      return response;
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Save operation failed:', error);
      }
      throw error;
    }
  }

  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new Error('Batch operations must be a non-empty array');
    }

    // Validate batch size limit
    const MAX_BATCH_SIZE = 100;
    if (operations.length > MAX_BATCH_SIZE) {
      throw new Error('Batch size exceeds maximum limit');
    }

    // Validate each operation
    for (const operation of operations) {
      this.validateBatchOperation(operation);
    }

    // Sanitize data in operations
    const sanitizedOperations = operations.map(op => ({
      ...op,
      data: op.data ? {
        ...op.data,
        value: typeof op.data.value === 'string' ? HTMLSanitizer.sanitize(op.data.value) : op.data.value
      } : op.data
    }));

    try {
      const response = await this.request<BatchResponse>('/batch', {
        method: 'POST',
        body: JSON.stringify({ operations: sanitizedOperations })
      });

      if (this.config.debug) {
        console.log('Batch operation completed:', { operationCount: operations.length });
      }

      return response;
    } catch (error) {
      console.error('Batch operation failed:', error);
      throw error;
    }
  }

  private validateBatchOperation(operation: BatchOperation): void {
    const validOperationTypes = ['create', 'update', 'delete'];
    
    if (!operation.type || !validOperationTypes.includes(operation.type)) {
      throw new Error('Invalid batch operation');
    }
    
    if (operation.type !== 'delete' && (!operation.data || !operation.data.sight)) {
      throw new Error('Invalid batch operation');
    }
  }

  async fetchSchema(sight: string): Promise<ElementSchema> {
    if (!sight || typeof sight !== 'string') {
      throw new Error('Invalid sight identifier');
    }

    // Check for invalid characters and path traversal
    if (sight.includes('..') || sight.includes('/') || sight.includes('\\')) {
      throw new Error('Sight identifier contains invalid characters');
    }

    // Create a request key for deduplication
    const requestKey = this.createRequestKey('fetchSchema', { sight });
    
    // Check if there's already a pending request for the same schema
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    const schemaPromise = this.performFetchSchema(sight);
    
    // Store it in pending requests
    this.pendingRequests.set(requestKey, schemaPromise);
    
    // Clean up after completion
    schemaPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    
    return schemaPromise;
  }

  private async performFetchSchema(sight: string): Promise<ElementSchema> {
    try {
      const response = await this.request<ElementSchema>(`/schema/${encodeURIComponent(sight)}`, {
        method: 'GET'
      });

      if (this.config.debug) {
        console.log('Schema fetched successfully:', { sight });
      }

      return response;
    } catch (error) {
      console.error('Schema fetch failed:', error);
      throw error;
    }
  }

  async upload(file: File, sight: string): Promise<{ url: string }> {
    if (!file || !(file instanceof File)) {
      throw new Error('Invalid file provided');
    }

    if (!sight || typeof sight !== 'string') {
      throw new Error('Invalid sight identifier');
    }

    // Validate file for security and constraints
    if (this.isFileUnsafe(file)) {
      throw new Error('File validation failed');
    }

    // Create a request key for deduplication - use file name and sight as key
    const requestKey = this.createRequestKey('upload', { fileName: file.name, sight, size: file.size });
    
    // Check if there's already a pending request for the same upload
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    // Create the request promise
    const uploadPromise = this.performUpload(file, sight);
    
    // Store it in pending requests
    this.pendingRequests.set(requestKey, uploadPromise);
    
    // Clean up after completion
    uploadPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    
    return uploadPromise;
  }

  private async performUpload(file: File, sight: string): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sight', sight);

    try {
      const response = await this.request<{ url: string }>('/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        timeout: 120000 // 2 minutes for file uploads
      });

      if (this.config.debug) {
        console.log('File upload completed:', { fileName: file.name, sight });
      }

      return response;
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid request path');
    }

    const url = this.buildUrl(path);
    const headers = await this.buildHeaders(options.headers);
    
    const requestOptions: RequestInit = {
      ...options,
      headers: Object.fromEntries(headers.entries()),
      credentials: 'include'
    };

    if (this.config.debug) {
      console.log('SightEdit API Request', {
        method: options.method || 'GET',
        path,
        hasBody: !!options.body
      });
    }

    // Retry logic for failed requests
    const maxRetries = 3;
    let lastError: Error = new Error('Request failed after all retry attempts');
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, requestOptions, options.timeout);
        
        if (!response.ok) {
          const errorData = await this.parseError(response);
          const error = new Error(ErrorHandler.sanitizeErrorMessage(errorData.message || 'Request failed: ' + response.status));
          
          // Only retry on server errors (5xx) and specific network errors
          if (response.status >= 500 && attempt < maxRetries) {
            if (this.config.debug) {
              console.log('Retrying request', `Attempt ${attempt + 1} failed with status ${response.status}, retrying...`);
            }
            lastError = error;
            // Wait before retrying (exponential backoff) - shorter delays for tests
            const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw error;
        }
        
        const responseData = await response.json();
        
        if (this.config.debug) {
          console.log('SightEdit API Response', responseData);
        }
        
        return responseData;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // For network errors (including timeout), retry if attempts remain
        const isNetworkError = (error as Error).name === 'TypeError' || 
                               (error as Error).message.includes('fetch') || 
                               (error as Error).message.includes('timeout') ||
                               (error as Error).message.includes('Request timeout');
        
        if (isNetworkError && attempt < maxRetries) {
          if (this.config.debug) {
            console.log('Retrying request', `Network error on attempt ${attempt + 1}: ${(error as Error).message}, retrying...`);
          }
          // Wait before retrying - shorter delays for tests
          const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If this is the last attempt or not a network error, throw immediately
        throw error;
      }
    }
    
    throw lastError;
  }

  private async buildHeaders(customHeaders?: HeadersInit): Promise<Headers> {
    const headers = new Headers(customHeaders);
    
    if (!headers.has('Content-Type') && !customHeaders) {
      headers.set('Content-Type', 'application/json');
    }

    headers.set('X-SightEdit-Version', '1.0.0');

    if (this.config.apiKey) {
      headers.set('X-API-Key', this.config.apiKey);
    }

    if (this.config.auth) {
      if (this.config.auth.type === 'bearer' && this.config.auth.token) {
        headers.set('Authorization', `Bearer ${this.config.auth.token}`);
      } else if (this.config.auth.getToken) {
        const token = await this.config.auth.getToken();
        headers.set('Authorization', `Bearer ${token}`);
      }
      
      if (this.config.auth.headers) {
        Object.entries(this.config.auth.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }
    }

    return headers;
  }

  private async fetchWithTimeout(
    url: string, 
    options: RequestInit, 
    timeout: number = this.REQUEST_TIMEOUT
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async parseError(response: Response): Promise<{ message: string; code?: string }> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      return { message: await response.text() };
    } catch {
      return { message: 'Unknown error' };
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    try {
      const operations = this.queue.map(data => ({
        type: 'update' as const,
        data
      }));

      await this.batch(operations);
      this.queue = []; // Clear the queue

      if (this.config.debug) {
        console.log('Offline queue processed successfully');
      }
    } catch (error) {
      console.error('Failed to process offline queue:', error);
    }
  }

  private buildUrl(path: string): string {
    try {
      const baseUrl = new URL(this.config.endpoint);
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const baseUrlStr = baseUrl.toString();
      const separator = baseUrlStr.endsWith('/') ? '' : '/';
      return new URL(cleanPath, baseUrlStr + separator).toString();
    } catch (error) {
      throw new Error('Invalid endpoint configuration');
    }
  }

  destroy(): void {
    // Clean up any resources
    this.queue = [];
    
    if (this.config.debug) {
      console.log('SightEditAPI destroyed');
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  async forceProcessQueue(): Promise<void> {
    await this.processQueue();
  }

  clearQueue(): void {
    this.queue = [];
  }

  private isFileUnsafe(file: File): boolean {
    // Check filename security
    if (this.isFilenameUnsafe(file.name)) {
      return true;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return true;
    }

    // Check file type - only allow common web-safe file types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'text/plain', 'text/csv', 
      'application/pdf',
      'application/json',
      'video/mp4', 'video/webm',
      'audio/mp3', 'audio/wav', 'audio/ogg'
    ];

    if (!allowedTypes.includes(file.type)) {
      return true;
    }

    // Check file extension matches type
    const extension = file.name.toLowerCase().split('.').pop() || '';
    const dangerousExtensions = [
      'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'vbe', 'js', 'jar', 
      'msi', 'dll', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'sh', 'bash'
    ];

    if (dangerousExtensions.includes(extension)) {
      return true;
    }

    return false;
  }

  private isFilenameUnsafe(filename: string): boolean {
    if (!filename || typeof filename !== 'string') {
      return true;
    }

    // Check for path traversal patterns
    const pathTraversalPatterns = [
      '../', '.\\', '..\\', './',
      '%2e%2e%2f', '%2e%2e/', '%2e%2e%5c',
      '..%2f', '..%5c', '%252e%252e%252f'
    ];

    const normalizedFilename = filename.toLowerCase();
    
    // Check for path traversal
    for (const pattern of pathTraversalPatterns) {
      if (normalizedFilename.includes(pattern)) {
        return true;
      }
    }

    // Check for absolute paths
    if (filename.startsWith('/') || /^[a-zA-Z]:\\/.test(filename)) {
      return true;
    }

    // Check for null bytes
    if (filename.includes('\0')) {
      return true;
    }

    // Check for invalid characters
    const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
    for (const char of invalidChars) {
      if (filename.includes(char)) {
        return true;
      }
    }

    // Filename too long
    if (filename.length > 255) {
      return true;
    }

    return false;
  }

  private calculateRequestSize(data: any): number {
    try {
      return new TextEncoder().encode(JSON.stringify(data)).length;
    } catch (error) {
      // Fallback to string length approximation
      return JSON.stringify(data).length * 2; // Assume UTF-16 encoding
    }
  }

  private validateSaveData(data: SaveData): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid save data: data must be an object');
    }
    
    if (!data.sight || typeof data.sight !== 'string' || data.sight.trim() === '') {
      throw new Error('Invalid save data: sight identifier is required');
    }
    
    // Type is optional - if not provided, default to 'text'
    if (data.type && typeof data.type !== 'string') {
      throw new Error('Invalid save data: type must be a string');
    }
    
    // Allow empty strings but not null/undefined
    if (data.value === null || data.value === undefined) {
      console.warn('Save data value is null/undefined, defaulting to empty string');
      data.value = '';
    }
    
    // Check for path traversal attacks in sight identifier
    if (data.sight.includes('..') || data.sight.includes('//')) {
      throw new Error('Invalid save data provided');
    }
    
    // Check for valid type
    const validTypes = ['text', 'richtext', 'image', 'number', 'boolean', 'array', 'object'];
    if (!validTypes.includes(data.type)) {
      throw new Error('Invalid save data provided');
    }
  }

  private sanitizeData(data: SaveData): SaveData {
    // Create a copy of the data to avoid mutating the original
    const sanitized: SaveData = { ...data };
    
    // Sanitize the value based on type
    if (typeof sanitized.value === 'string') {
      if (sanitized.type === 'richtext') {
        // For rich text/HTML, use full HTML sanitization
        sanitized.value = HTMLSanitizer.sanitize(sanitized.value);
      } else {
        // For plain text, first sanitize to remove dangerous elements, then extract text
        const cleaned = HTMLSanitizer.sanitize(sanitized.value);
        sanitized.value = HTMLSanitizer.extractTextContent(cleaned);
      }
    }
    
    return sanitized;
  }

  private createRequestKey(method: string, data: any): string {
    // Create a key based on method and data to identify duplicate requests
    const dataString = JSON.stringify(data);
    return `${method}:${dataString}`;
  }
}