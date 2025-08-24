/**
 * Batch Manager for optimized save operations
 * Queues changes locally and syncs them in batches
 */

import { SaveData, BatchOperation } from './types';
import { EventEmitter } from './utils/event-emitter';

export interface BatchConfig {
  enabled: boolean;
  maxBatchSize: number;
  flushInterval: number; // ms
  storageKey: string;
  autoFlush: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
}

export interface QueuedChange {
  id: string;
  operation: BatchOperation;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

export class BatchManager extends EventEmitter {
  private config: BatchConfig;
  private queue: Map<string, QueuedChange> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private localStorage: Storage | null = null;

  constructor(config: Partial<BatchConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      maxBatchSize: 50,
      flushInterval: 5000, // 5 seconds
      storageKey: 'sightedit-batch-queue',
      autoFlush: true,
      retryOnFailure: true,
      maxRetries: 3,
      ...config
    };

    // Check if localStorage is available
    if (typeof window !== 'undefined' && window.localStorage) {
      this.localStorage = window.localStorage;
      this.loadQueueFromStorage();
    }

    // Setup auto-flush if enabled
    if (this.config.autoFlush) {
      this.startAutoFlush();
    }

    // Listen for page unload to save pending changes
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
      window.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
  }

  /**
   * Add a change to the queue
   */
  add(data: SaveData): string {
    const id = this.generateId(data);
    
    const operation: BatchOperation = {
      type: 'update',
      data
    };

    const queuedChange: QueuedChange = {
      id,
      operation,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    // If same sight already in queue, update it
    const existingKey = this.findExistingKey(data.sight);
    if (existingKey) {
      const existing = this.queue.get(existingKey)!;
      // Merge the changes
      queuedChange.operation.data = {
        ...existing.operation.data,
        ...data,
        // Preserve the original 'previous' value for undo
        previous: existing.operation.data.previous || data.previous
      };
      this.queue.delete(existingKey);
    }

    this.queue.set(id, queuedChange);
    this.saveQueueToStorage();
    
    this.emit('queued', queuedChange);

    // Check if we should flush
    if (this.queue.size >= this.config.maxBatchSize) {
      this.flush();
    }

    return id;
  }

  /**
   * Remove a change from the queue
   */
  remove(id: string): boolean {
    const removed = this.queue.delete(id);
    if (removed) {
      this.saveQueueToStorage();
      this.emit('removed', id);
    }
    return removed;
  }

  /**
   * Clear all pending changes
   */
  clear(): void {
    this.queue.clear();
    this.saveQueueToStorage();
    this.emit('cleared');
  }

  /**
   * Get all pending changes
   */
  getPending(): QueuedChange[] {
    return Array.from(this.queue.values()).filter(
      change => change.status === 'pending'
    );
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.size;
  }

  /**
   * Manually flush the queue
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    this.isProcessing = true;
    this.emit('flush:start', this.queue.size);

    const pending = this.getPending();
    const batch = pending.slice(0, this.config.maxBatchSize);

    // Mark as processing
    batch.forEach(change => {
      change.status = 'processing';
    });

    try {
      // Process the batch
      const operations = batch.map(c => c.operation);
      await this.processBatch(operations);

      // Mark as completed and remove from queue
      batch.forEach(change => {
        change.status = 'completed';
        this.queue.delete(change.id);
      });

      this.saveQueueToStorage();
      this.emit('flush:success', batch.length);

    } catch (error) {
      // Handle failure
      batch.forEach(change => {
        change.status = 'failed';
        change.retryCount++;

        if (change.retryCount >= this.config.maxRetries) {
          // Move to dead letter queue
          this.emit('flush:dead-letter', change);
          this.queue.delete(change.id);
        } else {
          // Reset status for retry
          change.status = 'pending';
        }
      });

      this.saveQueueToStorage();
      this.emit('flush:error', error);

      // Schedule retry if enabled
      if (this.config.retryOnFailure) {
        setTimeout(() => this.flush(), 5000); // Retry after 5 seconds
      }
    } finally {
      this.isProcessing = false;

      // Continue flushing if more items
      if (this.queue.size > 0) {
        setTimeout(() => this.flush(), 100);
      }
    }
  }

  /**
   * Process a batch of operations
   */
  private async processBatch(operations: BatchOperation[]): Promise<void> {
    // This will be overridden by the API implementation
    const event = new CustomEvent('sightedit:batch', {
      detail: { operations }
    });
    
    return new Promise((resolve, reject) => {
      // Listen for response
      const responseHandler = (e: Event) => {
        const response = (e as CustomEvent).detail;
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Batch processing failed'));
        }
        window.removeEventListener('sightedit:batch:response', responseHandler);
      };

      window.addEventListener('sightedit:batch:response', responseHandler);
      window.dispatchEvent(event);

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('sightedit:batch:response', responseHandler);
        reject(new Error('Batch processing timeout'));
      }, 30000);
    });
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.queue.size > 0 && !this.isProcessing) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop auto-flush timer
   */
  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadQueueFromStorage(): void {
    if (!this.localStorage) return;

    try {
      const stored = this.localStorage.getItem(this.config.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Restore queue
        data.forEach((item: any) => {
          // Reset processing status to pending
          if (item.status === 'processing') {
            item.status = 'pending';
          }
          this.queue.set(item.id, item);
        });

        if (this.queue.size > 0) {
          this.emit('restored', this.queue.size);
          
          // Auto-flush restored items
          if (this.config.autoFlush) {
            setTimeout(() => this.flush(), 1000);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error);
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueueToStorage(): void {
    if (!this.localStorage) return;

    try {
      const data = Array.from(this.queue.values());
      this.localStorage.setItem(this.config.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save queue to storage:', error);
      
      // If quota exceeded, clear old completed items
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.clearCompleted();
        
        // Try again
        try {
          const data = Array.from(this.queue.values());
          this.localStorage.setItem(this.config.storageKey, JSON.stringify(data));
        } catch (retryError) {
          console.error('Failed to save queue after clearing:', retryError);
        }
      }
    }
  }

  /**
   * Clear completed items from queue
   */
  private clearCompleted(): void {
    const completed = Array.from(this.queue.entries())
      .filter(([_, change]) => change.status === 'completed')
      .map(([id]) => id);

    completed.forEach(id => this.queue.delete(id));
  }

  /**
   * Generate unique ID for a change
   */
  private generateId(data: SaveData): string {
    return `${data.sight}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find existing queue key for a sight
   */
  private findExistingKey(sight: string): string | undefined {
    for (const [key, change] of this.queue.entries()) {
      if (change.operation.data.sight === sight && change.status === 'pending') {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Handle page unload
   */
  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.queue.size > 0) {
      // Save to storage
      this.saveQueueToStorage();
      
      // Try to flush synchronously (best effort)
      if (navigator.sendBeacon) {
        const data = Array.from(this.queue.values())
          .filter(c => c.status === 'pending')
          .map(c => c.operation);

        const blob = new Blob([JSON.stringify({ operations: data })], {
          type: 'application/json'
        });

        navigator.sendBeacon('/api/sightedit/batch', blob);
      }

      // Warn user about unsaved changes
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Page is hidden, save queue
      this.saveQueueToStorage();
    } else {
      // Page is visible, check for pending items
      if (this.queue.size > 0 && this.config.autoFlush) {
        setTimeout(() => this.flush(), 1000);
      }
    }
  }

  /**
   * Destroy the batch manager
   */
  destroy(): void {
    this.stopAutoFlush();
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
      window.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    // Final save
    this.saveQueueToStorage();
    
    this.removeAllListeners();
  }

  /**
   * Get statistics
   */
  getStats(): {
    pending: number;
    processing: number;
    failed: number;
    total: number;
  } {
    const items = Array.from(this.queue.values());
    
    return {
      pending: items.filter(i => i.status === 'pending').length,
      processing: items.filter(i => i.status === 'processing').length,
      failed: items.filter(i => i.status === 'failed').length,
      total: items.length
    };
  }
}