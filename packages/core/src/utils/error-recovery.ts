import { EventEmitter } from './event-emitter';
import { SafeJSONParser } from './safe-json';

export interface RecoveryStrategy {
  name: string;
  canHandle: (error: Error, context: RecoveryContext) => boolean;
  recover: (error: Error, context: RecoveryContext) => Promise<RecoveryResult>;
}

export interface RecoveryContext {
  operation: string;
  data?: any;
  attempt: number;
  maxAttempts: number;
  element?: HTMLElement;
  sight?: string;
}

export interface RecoveryResult {
  success: boolean;
  data?: any;
  message?: string;
  shouldRetry?: boolean;
  retryDelay?: number;
}

export class ErrorRecoveryManager extends EventEmitter {
  private strategies: RecoveryStrategy[] = [];
  private activeRecoveries = new Map<string, number>();
  private recoveryHistory: RecoveryAttempt[] = [];
  private maxHistorySize = 100;

  constructor() {
    super();
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    this.registerStrategy(new NetworkErrorRecovery());
    this.registerStrategy(new ValidationErrorRecovery());
    this.registerStrategy(new StorageErrorRecovery());
    this.registerStrategy(new DOMErrorRecovery());
    this.registerStrategy(new AuthErrorRecovery());
  }

  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
    this.emit('strategyRegistered', strategy.name);
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    const recoveryId = this.generateRecoveryId(context);
    
    // Prevent infinite recovery loops
    const activeAttempts = this.activeRecoveries.get(recoveryId) || 0;
    if (activeAttempts >= context.maxAttempts) {
      return this.createFailureResult('Max recovery attempts reached');
    }

    this.activeRecoveries.set(recoveryId, activeAttempts + 1);
    
    try {
      // Find suitable strategy
      const strategy = this.findStrategy(error, context);
      if (!strategy) {
        return this.createFailureResult('No recovery strategy found');
      }

      this.emit('recoveryStarted', { error, context, strategy: strategy.name });

      // Attempt recovery
      const result = await strategy.recover(error, context);
      
      // Record attempt
      this.recordRecoveryAttempt({
        id: recoveryId,
        error: error.message,
        strategy: strategy.name,
        context,
        result,
        timestamp: Date.now()
      });

      if (result.success) {
        this.activeRecoveries.delete(recoveryId);
        this.emit('recoverySucceeded', { context, result });
      } else if (result.shouldRetry && context.attempt < context.maxAttempts) {
        this.emit('recoveryRetrying', { context, result });
        
        if (result.retryDelay) {
          await this.delay(result.retryDelay);
        }
      } else {
        this.activeRecoveries.delete(recoveryId);
        this.emit('recoveryFailed', { context, result });
      }

      return result;
    } catch (recoveryError) {
      this.activeRecoveries.delete(recoveryId);
      this.emit('recoveryError', { error: recoveryError, context });
      return this.createFailureResult(`Recovery strategy failed: ${recoveryError.message}`);
    }
  }

  private findStrategy(error: Error, context: RecoveryContext): RecoveryStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(error, context)) || null;
  }

  private generateRecoveryId(context: RecoveryContext): string {
    return `${context.operation}:${context.sight || 'unknown'}`;
  }

  private createFailureResult(message: string): RecoveryResult {
    return {
      success: false,
      message,
      shouldRetry: false
    };
  }

  private recordRecoveryAttempt(attempt: RecoveryAttempt): void {
    this.recoveryHistory.push(attempt);
    
    // Maintain history size limit
    if (this.recoveryHistory.length > this.maxHistorySize) {
      this.recoveryHistory.shift();
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRecoveryHistory(): RecoveryAttempt[] {
    return [...this.recoveryHistory];
  }

  getActiveRecoveries(): Map<string, number> {
    return new Map(this.activeRecoveries);
  }

  clearHistory(): void {
    this.recoveryHistory = [];
    this.emit('historyClearned');
  }
}

interface RecoveryAttempt {
  id: string;
  error: string;
  strategy: string;
  context: RecoveryContext;
  result: RecoveryResult;
  timestamp: number;
}

// Network Error Recovery Strategy
class NetworkErrorRecovery implements RecoveryStrategy {
  name = 'NetworkErrorRecovery';

  canHandle(error: Error, context: RecoveryContext): boolean {
    return error.name === 'NetworkError' || 
           error.name === 'TypeError' && error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    // Check network connectivity
    if (!navigator.onLine) {
      return {
        success: false,
        message: 'No network connection available',
        shouldRetry: true,
        retryDelay: 5000
      };
    }

    // For API operations, try alternative endpoint or retry with backoff
    if (context.operation.includes('save') || context.operation.includes('api')) {
      const retryDelay = this.calculateBackoffDelay(context.attempt);
      
      return {
        success: false,
        message: `Network error, retrying in ${retryDelay}ms`,
        shouldRetry: true,
        retryDelay
      };
    }

    return {
      success: false,
      message: 'Network error cannot be recovered automatically'
    };
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000;
    const backoff = Math.min(baseDelay * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 0.1 * backoff;
    return Math.floor(backoff + jitter);
  }
}

// Validation Error Recovery Strategy
class ValidationErrorRecovery implements RecoveryStrategy {
  name = 'ValidationErrorRecovery';

  canHandle(error: Error, context: RecoveryContext): boolean {
    return error.message.includes('validation') ||
           error.message.includes('invalid') ||
           error.name === 'ValidationError';
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    // Try to sanitize and fix common validation issues
    if (context.data) {
      const fixedData = this.attemptDataFix(context.data, error.message);
      if (fixedData !== context.data) {
        return {
          success: true,
          data: fixedData,
          message: 'Data automatically corrected'
        };
      }
    }

    // If we can't fix the data, provide user-friendly error
    return {
      success: false,
      message: this.createUserFriendlyMessage(error.message),
      shouldRetry: false
    };
  }

  private attemptDataFix(data: any, errorMessage: string): any {
    if (typeof data === 'string') {
      // Fix common string issues
      if (errorMessage.includes('maxLength')) {
        const maxLength = this.extractMaxLength(errorMessage);
        if (maxLength && data.length > maxLength) {
          return data.substring(0, maxLength);
        }
      }
      
      if (errorMessage.includes('email')) {
        // Basic email fix attempts
        return data.trim().toLowerCase();
      }
      
      if (errorMessage.includes('url')) {
        // Basic URL fix attempts
        if (!data.startsWith('http://') && !data.startsWith('https://')) {
          return 'https://' + data;
        }
      }
    }

    if (typeof data === 'number') {
      // Fix number range issues
      if (errorMessage.includes('min:')) {
        const min = this.extractNumber(errorMessage, 'min:');
        if (min !== null && data < min) {
          return min;
        }
      }
      
      if (errorMessage.includes('max:')) {
        const max = this.extractNumber(errorMessage, 'max:');
        if (max !== null && data > max) {
          return max;
        }
      }
    }

    return data;
  }

  private extractMaxLength(message: string): number | null {
    const match = message.match(/maxLength[:\s](\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  private extractNumber(message: string, prefix: string): number | null {
    const regex = new RegExp(`${prefix}\\s*(\\d+)`, 'i');
    const match = message.match(regex);
    return match ? parseInt(match[1], 10) : null;
  }

  private createUserFriendlyMessage(technicalMessage: string): string {
    const friendlyMessages: Record<string, string> = {
      'required': 'This field is required',
      'maxLength': 'Text is too long',
      'minLength': 'Text is too short',
      'email': 'Please enter a valid email address',
      'url': 'Please enter a valid URL',
      'number': 'Please enter a valid number'
    };

    for (const [key, friendly] of Object.entries(friendlyMessages)) {
      if (technicalMessage.toLowerCase().includes(key)) {
        return friendly;
      }
    }

    return 'Please check your input and try again';
  }
}

// Storage Error Recovery Strategy
class StorageErrorRecovery implements RecoveryStrategy {
  name = 'StorageErrorRecovery';

  canHandle(error: Error, context: RecoveryContext): boolean {
    return error.name === 'QuotaExceededError' ||
           error.message.includes('localStorage') ||
           error.message.includes('sessionStorage') ||
           error.message.includes('storage quota');
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    if (error.name === 'QuotaExceededError') {
      // Try to free up storage space
      const freed = this.cleanupStorage();
      
      if (freed) {
        return {
          success: true,
          message: `Cleaned up storage, freed ${freed} items`,
          shouldRetry: true
        };
      }
    }

    // Fallback to memory-only storage
    return {
      success: true,
      message: 'Switched to temporary memory storage',
      data: { useMemoryStorage: true }
    };
  }

  private cleanupStorage(): number {
    let itemsRemoved = 0;
    
    try {
      // Clean up old SightEdit data
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('sightedit_') || key?.startsWith('se_temp_')) {
          const item = localStorage.getItem(key);
          if (item) {
            const data = SafeJSONParser.tryParse(item);
            if (data && data.timestamp) {
              // Remove items older than 1 day
              const age = Date.now() - data.timestamp;
              if (age > 24 * 60 * 60 * 1000) {
                keysToRemove.push(key);
              }
            }
          }
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        itemsRemoved++;
      });
      
    } catch (error) {
      // Storage cleanup failed, but don't throw
      console.warn('Storage cleanup failed:', error);
    }
    
    return itemsRemoved;
  }
}

// DOM Error Recovery Strategy
class DOMErrorRecovery implements RecoveryStrategy {
  name = 'DOMErrorRecovery';

  canHandle(error: Error, context: RecoveryContext): boolean {
    return error.name === 'NotFoundError' ||
           error.message.includes('element not found') ||
           error.message.includes('DOM') ||
           (context.element && !document.contains(context.element));
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    if (context.sight) {
      // Try to find element by sight attribute
      const element = this.findElementBySight(context.sight);
      if (element) {
        return {
          success: true,
          data: { element },
          message: 'Found element using alternative selector'
        };
      }
    }

    // If element was removed, create a placeholder
    if (context.element && context.data) {
      const placeholder = this.createPlaceholder(context);
      return {
        success: true,
        data: { element: placeholder },
        message: 'Created placeholder element'
      };
    }

    return {
      success: false,
      message: 'Element could not be recovered or recreated'
    };
  }

  private findElementBySight(sight: string): HTMLElement | null {
    // Try multiple selector patterns
    const selectors = [
      `[data-sightedit*="${sight}"]`,
      `[data-sight="${sight}"]`,
      `[data-sightedit-id="${sight}"]`,
      `#${sight}`,
      `.${sight}`
    ];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) return element;
      } catch (e) {
        // Invalid selector, continue
      }
    }

    return null;
  }

  private createPlaceholder(context: RecoveryContext): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'sightedit-placeholder';
    placeholder.setAttribute('data-sightedit', context.sight || 'text');
    placeholder.textContent = context.data || 'Content placeholder';
    placeholder.style.cssText = `
      border: 2px dashed #ccc;
      padding: 8px;
      margin: 4px 0;
      background: #f9f9f9;
      color: #666;
      font-style: italic;
    `;

    // Try to insert in a reasonable location
    const container = document.querySelector('main, .content, body');
    if (container) {
      container.appendChild(placeholder);
    }

    return placeholder;
  }
}

// Authentication Error Recovery Strategy
class AuthErrorRecovery implements RecoveryStrategy {
  name = 'AuthErrorRecovery';

  canHandle(error: Error, context: RecoveryContext): boolean {
    return error.message.includes('401') ||
           error.message.includes('unauthorized') ||
           error.message.includes('authentication') ||
           error.message.includes('token expired');
  }

  async recover(error: Error, context: RecoveryContext): Promise<RecoveryResult> {
    // Try to refresh authentication token
    const newToken = await this.attemptTokenRefresh();
    
    if (newToken) {
      return {
        success: true,
        data: { token: newToken },
        message: 'Authentication token refreshed',
        shouldRetry: true
      };
    }

    // Fallback to queuing operations for later
    this.queueOperation(context);
    
    return {
      success: true,
      message: 'Operation queued until authentication is restored',
      data: { queued: true }
    };
  }

  private async attemptTokenRefresh(): Promise<string | null> {
    try {
      // Try to get new token from refresh endpoint
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return null;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.accessToken) {
          localStorage.setItem('access_token', data.accessToken);
          return data.accessToken;
        }
      }
    } catch (error) {
      // Token refresh failed
      console.warn('Token refresh failed:', error);
    }

    return null;
  }

  private queueOperation(context: RecoveryContext): void {
    const queue = SafeJSONParser.tryParse(
      localStorage.getItem('sightedit_auth_queue') || '[]'
    ) || [];

    queue.push({
      operation: context.operation,
      data: context.data,
      sight: context.sight,
      timestamp: Date.now()
    });

    localStorage.setItem('sightedit_auth_queue', JSON.stringify(queue));
  }
}

// Global error recovery instance
export const errorRecovery = new ErrorRecoveryManager();