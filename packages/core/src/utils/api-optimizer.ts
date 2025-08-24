// API optimization utilities

/**
 * Request batching and deduplication
 */
export class RequestBatcher {
  private batches = new Map<string, {
    requests: Array<{
      data: any;
      resolve: (value: any) => void;
      reject: (error: any) => void;
    }>;
    timeout: NodeJS.Timeout;
  }>();
  
  private batchDelay: number;
  private maxBatchSize: number;
  
  constructor(batchDelay = 100, maxBatchSize = 10) {
    this.batchDelay = batchDelay;
    this.maxBatchSize = maxBatchSize;
  }
  
  add<T>(
    endpoint: string,
    data: any,
    processor: (batchData: any[]) => Promise<T[]>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.batches.has(endpoint)) {
        this.batches.set(endpoint, {
          requests: [],
          timeout: setTimeout(() => {
            this.processBatch(endpoint, processor);
          }, this.batchDelay)
        });
      }
      
      const batch = this.batches.get(endpoint)!;
      batch.requests.push({ data, resolve, reject });
      
      // Process batch if it reaches max size
      if (batch.requests.length >= this.maxBatchSize) {
        clearTimeout(batch.timeout);
        this.processBatch(endpoint, processor);
      }
    });
  }
  
  private async processBatch(endpoint: string, processor: Function): Promise<void> {
    const batch = this.batches.get(endpoint);
    if (!batch) return;
    
    this.batches.delete(endpoint);
    
    try {
      const batchData = batch.requests.map(req => req.data);
      const results = await processor(batchData);
      
      batch.requests.forEach((req, index) => {
        req.resolve(results[index]);
      });
    } catch (error) {
      batch.requests.forEach(req => {
        req.reject(error);
      });
    }
  }
}

/**
 * Request deduplication
 */
export class RequestDeduplicator {
  private pending = new Map<string, Promise<any>>();
  
  async dedupe<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }
    
    const promise = requestFn().finally(() => {
      this.pending.delete(key);
    });
    
    this.pending.set(key, promise);
    return promise;
  }
  
  clear(key?: string): void {
    if (key) {
      this.pending.delete(key);
    } else {
      this.pending.clear();
    }
  }
}

/**
 * Connection pool for HTTP requests
 */
export class ConnectionPool {
  private pool: XMLHttpRequest[] = [];
  private maxSize: number;
  private active = new Set<XMLHttpRequest>();
  
  constructor(maxSize = 6) {
    this.maxSize = maxSize;
  }
  
  acquire(): XMLHttpRequest {
    let xhr = this.pool.pop();
    
    if (!xhr) {
      xhr = new XMLHttpRequest();
    }
    
    this.active.add(xhr);
    return xhr;
  }
  
  release(xhr: XMLHttpRequest): void {
    this.active.delete(xhr);
    
    if (this.pool.length < this.maxSize) {
      // Reset the XMLHttpRequest for reuse
      xhr.onreadystatechange = null;
      xhr.onerror = null;
      xhr.onload = null;
      xhr.onprogress = null;
      xhr.ontimeout = null;
      xhr.onabort = null;
      
      this.pool.push(xhr);
    }
  }
  
  destroy(): void {
    // Abort all active requests
    for (const xhr of this.active) {
      xhr.abort();
    }
    
    this.pool.length = 0;
    this.active.clear();
  }
}

/**
 * Smart retry logic with exponential backoff
 */
export class RetryManager {
  private attempts = new Map<string, number>();
  
  async retry<T>(
    key: string,
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      factor?: number;
      jitter?: boolean;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      factor = 2,
      jitter = true
    } = options;
    
    let attempts = this.attempts.get(key) || 0;
    
    try {
      const result = await operation();
      this.attempts.delete(key); // Success, reset counter
      return result;
    } catch (error) {
      attempts++;
      this.attempts.set(key, attempts);
      
      if (attempts >= maxAttempts) {
        this.attempts.delete(key);
        throw error;
      }
      
      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelay * Math.pow(factor, attempts - 1), maxDelay);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delay *= (0.5 + Math.random() * 0.5);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry
      return this.retry(key, operation, options);
    }
  }
  
  reset(key?: string): void {
    if (key) {
      this.attempts.delete(key);
    } else {
      this.attempts.clear();
    }
  }
}

/**
 * Response compression handling
 */
export class CompressionHandler {
  private static supportsCompression = 'CompressionStream' in window;
  
  static async compress(data: string): Promise<ArrayBuffer> {
    if (!this.supportsCompression) {
      return new TextEncoder().encode(data).buffer;
    }
    
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(new TextEncoder().encode(data));
    writer.close();
    
    const chunks: Uint8Array[] = [];
    let done = false;
    
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result.buffer;
  }
  
  static async decompress(data: ArrayBuffer): Promise<string> {
    if (!this.supportsCompression) {
      return new TextDecoder().decode(data);
    }
    
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(data);
    writer.close();
    
    const chunks: Uint8Array[] = [];
    let done = false;
    
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    // Combine chunks and decode
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder().decode(result);
  }
}

/**
 * Intelligent caching with LRU eviction
 */
export class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; accessCount: number }>();
  private maxSize: number;
  private ttl: number;
  
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Check TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access info for LRU
    item.accessCount++;
    item.timestamp = Date.now();
    
    return item.value;
  }
  
  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 1
    });
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  private evictLRU(): void {
    let lruKey = '';
    let lruTimestamp = Date.now();
    let lruAccessCount = Infinity;
    
    for (const [key, item] of this.cache.entries()) {
      // Prefer items with lower access count and older timestamp
      if (item.accessCount < lruAccessCount || 
          (item.accessCount === lruAccessCount && item.timestamp < lruTimestamp)) {
        lruKey = key;
        lruTimestamp = item.timestamp;
        lruAccessCount = item.accessCount;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }
  
  size(): number {
    return this.cache.size;
  }
  
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}