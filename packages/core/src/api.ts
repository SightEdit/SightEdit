import { 
  SightEditConfig, 
  SaveData, 
  SaveResponse, 
  BatchOperation, 
  BatchResponse,
  ElementSchema
} from './types';
import { 
  ErrorHandler, 
  ErrorType, 
  NetworkError, 
  TimeoutError, 
  RateLimitError,
  ExternalServiceError,
  CircuitBreaker
} from './utils/error-handler';
import { log } from './utils/logger';
import { sentry } from './utils/sentry-integration';

interface APIConfig {
  endpoint: string;
  apiKey?: string;
  auth?: SightEditConfig['auth'];
  debug?: boolean;
  circuitBreakerOptions?: {
    failureThreshold?: number;
    timeoutMs?: number;
    monitoringPeriodMs?: number;
  };
}

interface RequestOptions extends RequestInit {
  timeout?: number;
  retry?: number;
}

export class SightEditAPI {
  private config: APIConfig;
  private queue: SaveData[] = [];
  private isOffline = !navigator.onLine;
  private retryDelay = 1000;
  private maxRetries = 3;
  
  // Race condition protection
  private pendingRequests = new Map<string, Promise<any>>();
  private queueLock = false;
  private requestIdCounter = 0;
  
  // Security and validation
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  
  // Enhanced error handling and monitoring
  private circuitBreaker: CircuitBreaker;
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    requestsPerSecond: 0,
    lastRequestTime: 0,
    queuedOperations: 0,
    retryAttempts: 0
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private backoffMultiplier = 2;
  private maxBackoffDelay = 30000; // 30 seconds
  private rateLimitResetTime = 0;
  private requestHistory: Array<{ timestamp: number; success: boolean; duration: number }> = [];
  private readonly HISTORY_WINDOW = 300000; // 5 minutes

  constructor(config: SightEditConfig) {
    this.config = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      auth: config.auth,
      debug: config.debug
    };
    
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerOptions?.failureThreshold || 5,
      config.circuitBreakerOptions?.timeoutMs || 60000,
      config.circuitBreakerOptions?.monitoringPeriodMs || 10000
    );
    
    this.setupOfflineHandling();
    this.startHealthCheck();
    this.initializeMetrics();
  }

  private setupOfflineHandling(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOffline = false;
        log.info('Network connection restored', { component: 'SightEditAPI' });
        this.processQueue();
      });
      
      window.addEventListener('offline', () => {
        this.isOffline = true;
        log.warn('Network connection lost, switching to offline mode', { component: 'SightEditAPI' });
      });
    }
  }
  
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
      this.updateMetrics();
      this.cleanupRequestHistory();
    }, 30000); // Check every 30 seconds
  }
  
  private async performHealthCheck(): Promise<void> {
    if (this.isOffline) return;
    
    try {
      const startTime = Date.now();
      const response = await this.fetchWithTimeout(
        this.buildSecureUrl('/health'), 
        { method: 'HEAD' }, 
        5000 // 5 second timeout for health check
      );
      
      const duration = Date.now() - startTime;
      const isHealthy = response.ok;
      
      log.debug('Health check completed', {
        component: 'SightEditAPI',
        healthy: isHealthy,
        duration,
        statusCode: response.status
      });
      
      if (!isHealthy) {
        log.warn('API health check failed', {
          component: 'SightEditAPI',
          statusCode: response.status,
          duration
        });
      }
    } catch (error) {
      log.warn('Health check failed', {
        component: 'SightEditAPI',
        error: (error as Error).message
      });
    }
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      lastRequestTime: 0,
      queuedOperations: this.queue.length,
      retryAttempts: 0
    };
  }
  
  private updateMetrics(): void {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(
      req => now - req.timestamp < 60000 // Last minute
    );
    
    this.metrics.requestsPerSecond = recentRequests.length / 60;
    
    if (recentRequests.length > 0) {
      const totalDuration = recentRequests.reduce((sum, req) => sum + req.duration, 0);
      this.metrics.averageResponseTime = totalDuration / recentRequests.length;
    }
    
    this.metrics.queuedOperations = this.queue.length;
    
    // Log metrics periodically
    if (this.config.debug) {
      log.debug('API metrics updated', {
        component: 'SightEditAPI',
        metrics: this.metrics
      });
    }
  }
  
  private cleanupRequestHistory(): void {
    const cutoff = Date.now() - this.HISTORY_WINDOW;
    this.requestHistory = this.requestHistory.filter(req => req.timestamp > cutoff);
  }
  
  private recordRequest(success: boolean, duration: number): void {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = Date.now();
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    this.requestHistory.push({
      timestamp: Date.now(),
      success,
      duration
    });
  }
  
  /**
   * Get current API metrics
   */
  getMetrics(): typeof this.metrics {
    this.updateMetrics();
    return { ...this.metrics };
  }
  
  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): any {
    return this.circuitBreaker.getState();
  }

  async save(data: SaveData): Promise<SaveResponse> {
    const startTime = Date.now();
    
    // Input validation
    if (!this.validateSaveData(data)) {
      const error = new Error('Invalid save data provided');
      this.recordRequest(false, Date.now() - startTime);
      throw error;
    }
    
    // Generate unique request ID for deduplication
    const requestId = `save_${data.sight}_${data.id || ''}_${++this.requestIdCounter}`;
    
    // Check for duplicate requests
    if (this.pendingRequests.has(requestId)) {
      return this.pendingRequests.get(requestId);
    }
    
    if (this.isOffline) {
      await this.addToQueue(data);
      return {
        success: true,
        data: data.value,
        version: Date.now(),
        queued: true
      };
    }

    const requestPromise = this.executeWithCircuitBreaker(async () => {
      return this.request<SaveResponse>('/save', {
        method: 'POST',
        body: JSON.stringify(this.sanitizeData(data))
      });
    });
    
    // Cache the request to prevent duplicates
    this.pendingRequests.set(requestId, requestPromise);
    
    try {
      const result = await requestPromise;
      this.recordRequest(true, Date.now() - startTime);
      
      log.info('Save operation completed', {
        component: 'SightEditAPI',
        sight: data.sight,
        duration: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      this.recordRequest(false, Date.now() - startTime);
      
      log.error('Save operation failed', {
        component: 'SightEditAPI',
        sight: data.sight,
        error: (error as Error).message,
        duration: Date.now() - startTime
      });
      
      throw error;
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    // Input validation
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new Error('Batch operations must be a non-empty array');
    }
    
    if (operations.length > 100) {
      throw new Error('Batch size exceeds maximum limit of 100 operations');
    }
    
    // Validate each operation
    const validatedOps = operations.map((op, index) => {
      if (!this.validateBatchOperation(op)) {
        throw new Error(`Invalid batch operation at index ${index}`);
      }
      return {
        ...op,
        data: this.sanitizeData(op.data)
      };
    });
    
    const requestId = `batch_${Date.now()}_${++this.requestIdCounter}`;
    
    // Check for duplicate batch requests
    if (this.pendingRequests.has(requestId)) {
      return this.pendingRequests.get(requestId);
    }
    
    const requestPromise = this.executeWithCircuitBreaker(async () => {
      return this.request<BatchResponse>('/batch', {
        method: 'POST',
        body: JSON.stringify({ operations: validatedOps })
      });
    });
    
    this.pendingRequests.set(requestId, requestPromise);
    
    try {
      const result = await requestPromise;
      
      log.info('Batch operation completed', {
        component: 'SightEditAPI',
        operationCount: operations.length,
        requestId
      });
      
      return result;
    } catch (error) {
      log.error('Batch operation failed', {
        component: 'SightEditAPI',
        operationCount: operations.length,
        error: (error as Error).message,
        requestId
      });
      
      throw error;
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  async fetchSchema(sight: string): Promise<ElementSchema> {
    // Input validation
    if (!sight || typeof sight !== 'string') {
      throw new Error('Invalid sight identifier');
    }
    
    // Validate sight format
    if (!this.isValidSightIdentifier(sight)) {
      throw new Error('Sight identifier contains invalid characters');
    }
    
    const requestId = `schema_${sight}`;
    
    // Cache schema requests to prevent duplicates
    if (this.pendingRequests.has(requestId)) {
      return this.pendingRequests.get(requestId);
    }
    
    const requestPromise = this.executeWithCircuitBreaker(async () => {
      return this.request<ElementSchema>(`/schema/${encodeURIComponent(sight)}`, {
        method: 'GET'
      });
    });
    
    this.pendingRequests.set(requestId, requestPromise);
    
    try {
      const result = await requestPromise;
      
      log.debug('Schema fetched successfully', {
        component: 'SightEditAPI',
        sight
      });
      
      return result;
    } catch (error) {
      log.error('Schema fetch failed', {
        component: 'SightEditAPI',
        sight,
        error: (error as Error).message
      });
      
      throw error;
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  async upload(file: File, sight: string): Promise<{ url: string }> {
    // Input validation
    if (!file || !(file instanceof File)) {
      throw new Error('Invalid file provided');
    }
    
    if (!sight || typeof sight !== 'string') {
      throw new Error('Invalid sight identifier');
    }
    
    // File validation
    if (!this.validateUploadFile(file)) {
      throw new Error('File validation failed');
    }
    
    const requestId = `upload_${sight}_${file.name}_${file.size}`;
    
    // Prevent duplicate uploads
    if (this.pendingRequests.has(requestId)) {
      return this.pendingRequests.get(requestId);
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sight', sight);
    
    const requestPromise = this.executeWithCircuitBreaker(async () => {
      return this.request<{ url: string }>('/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        timeout: 120000 // 2 minutes for file uploads
      });
    });
    
    this.pendingRequests.set(requestId, requestPromise);
    
    try {
      const result = await requestPromise;
      
      log.info('File upload completed', {
        component: 'SightEditAPI',
        fileName: file.name,
        fileSize: file.size,
        sight
      });
      
      return result;
    } catch (error) {
      log.error('File upload failed', {
        component: 'SightEditAPI',
        fileName: file.name,
        fileSize: file.size,
        sight,
        error: (error as Error).message
      });
      
      throw error;
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  private async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(operation);
  }
  
  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // Input validation
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid request path');
    }
    
    // Size validation for request body
    if (options.body && this.getRequestSize(options.body) > this.MAX_REQUEST_SIZE) {
      throw new Error('Request size exceeds maximum limit');
    }
    
    // Check rate limiting
    if (this.rateLimitResetTime && Date.now() < this.rateLimitResetTime) {
      const waitTime = this.rateLimitResetTime - Date.now();
      throw new RateLimitError(
        'Rate limit exceeded',
        Math.ceil(waitTime / 1000),
        { path, method: options.method || 'GET' }
      );
    }
    
    const url = this.buildSecureUrl(path);
    const headers = await this.buildHeaders(options.headers);
    
    const requestOptions: RequestInit = {
      ...options,
      headers,
      credentials: 'include'
    };

    log.debug('API request started', {
      component: 'SightEditAPI',
      method: options.method || 'GET',
      path,
      hasBody: !!options.body
    });

    return ErrorHandler.withRetry(async () => {
      const startTime = Date.now();
      
      try {
        const response = await this.fetchWithTimeout(url, requestOptions, options.timeout);
        const duration = Date.now() - startTime;
        
        // Handle different response statuses
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
          this.rateLimitResetTime = Date.now() + (retryAfterSeconds * 1000);
          
          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfterSeconds,
            { path, method: options.method || 'GET', statusCode: response.status }
          );
        }
        
        if (response.status >= 500) {
          throw new ExternalServiceError(
            `Server error: ${response.status}`,
            'api_server',
            { path, method: options.method || 'GET', statusCode: response.status }
          );
        }
        
        if (!response.ok) {
          const errorData = await this.parseError(response);
          
          if (response.status === 401 || response.status === 403) {
            throw ErrorHandler.handle(
              new Error(errorData.message || `Authentication failed: ${response.status}`),
              response.status === 401 ? ErrorType.AUTHENTICATION : ErrorType.AUTHORIZATION,
              { path, statusCode: response.status }
            );
          }
          
          throw new NetworkError(
            errorData.message || `Request failed: ${response.status}`,
            response.status,
            { path, method: options.method || 'GET' }
          );
        }
        
        const data = await response.json();
        
        log.debug('API request completed', {
          component: 'SightEditAPI',
          method: options.method || 'GET',
          path,
          statusCode: response.status,
          duration
        });
        
        return data;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Handle timeout errors
        if ((error as Error).name === 'AbortError') {
          throw new TimeoutError(
            'Request timeout',
            options.timeout || this.REQUEST_TIMEOUT,
            { path, method: options.method || 'GET', duration }
          );
        }
        
        // Handle network errors
        if ((error as Error).message.toLowerCase().includes('network')) {
          throw new NetworkError(
            'Network connection failed',
            undefined,
            { path, method: options.method || 'GET', duration, originalError: (error as Error).message }
          );
        }
        
        // Re-throw known custom errors
        if (error instanceof NetworkError || 
            error instanceof TimeoutError || 
            error instanceof RateLimitError ||
            error instanceof ExternalServiceError) {
          throw error;
        }
        
        // Handle unknown errors
        throw new NetworkError(
          `Request failed: ${(error as Error).message}`,
          undefined,
          { path, method: options.method || 'GET', duration, originalError: (error as Error).message }
        );
      }
    }, {
      maxRetries: options.retry ?? this.maxRetries,
      baseDelay: this.retryDelay,
      maxDelay: this.maxBackoffDelay,
      backoffFactor: this.backoffMultiplier
    });
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
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
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
    if (this.queue.length === 0 || this.queueLock) return;
    
    // Prevent concurrent queue processing (race condition fix)
    this.queueLock = true;
    
    try {
      log.info('Processing offline queue', {
        component: 'SightEditAPI',
        queueSize: this.queue.length
      });
      
      // Process queue in batches to avoid overwhelming the server
      const BATCH_SIZE = 10;
      const batches = [];
      
      for (let i = 0; i < this.queue.length; i += BATCH_SIZE) {
        batches.push(this.queue.slice(i, i + BATCH_SIZE));
      }
      
      let processedCount = 0;
      let failedCount = 0;
      
      for (const batch of batches) {
        try {
          const operations = batch.map(data => ({
            type: 'update' as const,
            data
          }));
          
          await this.batch(operations);
          processedCount += batch.length;
          
          // Remove processed items from queue
          this.queue.splice(0, batch.length);
        } catch (error) {
          failedCount += batch.length;
          
          log.warn('Failed to process queue batch', {
            component: 'SightEditAPI',
            batchSize: batch.length,
            error: (error as Error).message
          });
          
          // If batch fails, break to avoid further failures
          break;
        }
        
        // Add small delay between batches to prevent overwhelming
        if (batches.length > 1) {
          await this.sleep(100);
        }
      }
      
      log.info('Queue processing completed', {
        component: 'SightEditAPI',
        processed: processedCount,
        failed: failedCount,
        remaining: this.queue.length
      });
      
      // If queue processing fails repeatedly, limit queue size
      if (this.queue.length > this.MAX_QUEUE_SIZE) {
        const removed = this.queue.splice(0, this.queue.length - this.MAX_QUEUE_SIZE / 2);
        log.warn('Queue size exceeded limit, removed oldest entries', {
          component: 'SightEditAPI',
          removedCount: removed.length,
          remainingCount: this.queue.length
        });
      }
    } finally {
      this.queueLock = false;
    }
  }
  
  /**
   * Adds item to queue with size protection
   */
  private async addToQueue(data: SaveData): Promise<void> {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest item to make room
      this.queue.shift();
      console.warn('Offline queue full, removed oldest item');
    }
    
    this.queue.push(data);
  }
  
  /**
   * Validates save data structure
   */
  private validateSaveData(data: SaveData): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!data.sight || typeof data.sight !== 'string') return false;
    if (data.value === undefined) return false;
    if (data.sight.length > 100) return false;
    
    return this.isValidSightIdentifier(data.sight);
  }
  
  /**
   * Validates batch operation
   */
  private validateBatchOperation(op: BatchOperation): boolean {
    if (!op || typeof op !== 'object') return false;
    if (!['create', 'update', 'delete'].includes(op.type)) return false;
    if (!op.data || typeof op.data !== 'object') return false;
    
    return this.validateSaveData(op.data);
  }
  
  /**
   * Validates sight identifier format
   */
  private isValidSightIdentifier(sight: string): boolean {
    if (!sight || typeof sight !== 'string') return false;
    if (sight.length === 0 || sight.length > 100) return false;
    
    // Allow alphanumeric, underscore, hyphen, dot
    const validPattern = /^[a-zA-Z0-9_.-]+$/;
    if (!validPattern.test(sight)) return false;
    
    // No path traversal
    if (sight.includes('..') || sight.includes('/') || sight.includes('\\')) return false;
    
    return true;
  }
  
  /**
   * Validates upload file
   */
  private validateUploadFile(file: File): boolean {
    // Size limit (10MB)
    if (file.size > 10 * 1024 * 1024) return false;
    
    // File type validation (basic)
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'application/json', 'text/csv'
    ];
    
    if (file.type && !allowedTypes.includes(file.type)) return false;
    
    // File name validation
    if (file.name.length > 255) return false;
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) return false;
    
    return true;
  }
  
  /**
   * Sanitizes data to prevent injection
   */
  private sanitizeData(data: SaveData): SaveData {
    const sanitized: SaveData = {
      sight: data.sight.trim(),
      value: this.sanitizeValue(data.value),
      type: data.type || 'text',
      timestamp: data.timestamp
    };
    
    if (data.id) {
      sanitized.id = data.id.trim();
    }
    
    if (data.context && typeof data.context === 'object') {
      sanitized.context = this.sanitizeObject(data.context);
    }
    
    return sanitized;
  }
  
  /**
   * Sanitizes arbitrary values
   */
  private sanitizeValue(value: any): any {
    if (value === null || value === undefined) return value;
    
    if (typeof value === 'string') {
      return value
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '');
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }
    
    if (typeof value === 'object') {
      return this.sanitizeObject(value);
    }
    
    return value;
  }
  
  /**
   * Sanitizes object keys and values
   */
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, val] of Object.entries(obj)) {
      const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (cleanKey.length > 0 && cleanKey.length <= 50) {
        sanitized[cleanKey] = this.sanitizeValue(val);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Builds secure URL with validation
   */
  private buildSecureUrl(path: string): string {
    try {
      const baseUrl = new URL(this.config.endpoint);
      // Remove leading slash from path to ensure proper concatenation
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      // Ensure baseUrl ends with a slash
      const baseUrlStr = baseUrl.toString();
      const separator = baseUrlStr.endsWith('/') ? '' : '/';
      const fullUrl = new URL(cleanPath, baseUrlStr + separator);
      
      // Ensure we're not being redirected to a different host
      if (fullUrl.hostname !== baseUrl.hostname) {
        throw new Error('Invalid redirect detected');
      }
      
      return fullUrl.toString();
    } catch (error) {
      throw new Error('Invalid endpoint configuration');
    }
  }
  
  /**
   * Gets request size for validation
   */
  private getRequestSize(body: any): number {
    if (body instanceof FormData) {
      // Estimate FormData size (approximate)
      return 1024; // Basic estimation
    }
    
    if (typeof body === 'string') {
      return new Blob([body]).size;
    }
    
    if (body instanceof Blob) {
      return body.size;
    }
    
    return JSON.stringify(body).length;
  }
  
  /**
   * Sanitizes error messages to prevent information disclosure
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return 'An error occurred';
    }
    
    // Remove sensitive information patterns
    return message
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]') // IP addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Emails
      .replace(/\b(?:password|token|key|secret)\s*[=:]\s*\S+/gi, '[CREDENTIAL]') // Credentials
      .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[HASH]') // Hashes/tokens
      .substring(0, 200); // Limit message length
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Clear pending requests
    this.pendingRequests.clear();
    
    log.info('SightEditAPI destroyed', {
      component: 'SightEditAPI',
      queueSize: this.queue.length,
      metrics: this.metrics
    });
  }
  
  /**
   * Force process queue (for testing or manual triggering)
   */
  async forceProcessQueue(): Promise<void> {
    await this.processQueue();
  }
  
  /**
   * Clear offline queue
   */
  clearQueue(): void {
    const removedCount = this.queue.length;
    this.queue = [];
    
    log.info('Offline queue cleared', {
      component: 'SightEditAPI',
      removedCount
    });
  }
  
  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
  
  /**
   * Check if API is healthy
   */
  isHealthy(): boolean {
    const circuitState = this.circuitBreaker.getState();
    const recentErrorRate = this.metrics.failedRequests / Math.max(this.metrics.totalRequests, 1);
    
    return !this.isOffline && 
           circuitState.state !== 'open' && 
           recentErrorRate < 0.5; // Less than 50% error rate
  }
  
  /**
   * Sanitizes URL for logging (removes sensitive info)
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      // Remove query parameters that might contain sensitive data
      parsedUrl.search = '';
      return parsedUrl.toString();
    } catch {
      return '[INVALID_URL]';
    }
  }
}