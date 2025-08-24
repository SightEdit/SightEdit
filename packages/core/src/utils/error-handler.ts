/**
 * Error handling utilities for better debugging and user experience
 */

export enum ErrorType {
  VALIDATION = 'validation',
  NETWORK = 'network',
  PERMISSION = 'permission',
  RUNTIME = 'runtime',
  SECURITY = 'security',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  UNAVAILABLE = 'unavailable',
  CONFIGURATION = 'configuration',
  DATA_CORRUPTION = 'data_corruption',
  EXTERNAL_SERVICE = 'external_service'
}

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  code?: string;
  context?: Record<string, any>;
  timestamp: number;
  stack?: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  userAgent?: string;
  url?: string;
  retryable?: boolean;
  retryCount?: number;
  maxRetries?: number;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ErrorDetails[];
  errorRate: number;
  lastErrorTime?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: ErrorType[];
}

/**
 * Custom error classes for specific error types
 */
export abstract class SightEditError extends Error {
  abstract type: ErrorType;
  abstract severity: ErrorSeverity;
  abstract recoverable: boolean;
  abstract retryable: boolean;
  
  public correlationId: string;
  public timestamp: number;
  public context?: Record<string, any>;
  public userId?: string;
  public sessionId?: string;
  public userAgent?: string;
  public url?: string;
  
  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.correlationId = this.generateCorrelationId();
    this.timestamp = Date.now();
    this.context = context;
    
    // Capture Error.captureStackTrace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      recoverable: this.recoverable,
      retryable: this.retryable,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      context: this.context,
      userId: this.userId,
      sessionId: this.sessionId,
      stack: this.stack
    };
  }
}

export class ValidationError extends SightEditError {
  type = ErrorType.VALIDATION as const;
  severity = ErrorSeverity.MEDIUM as const;
  recoverable = true as const;
  retryable = false as const;
}

export class NetworkError extends SightEditError {
  type = ErrorType.NETWORK as const;
  severity = ErrorSeverity.HIGH as const;
  recoverable = true as const;
  retryable = true as const;
  
  constructor(message: string, public statusCode?: number, context?: Record<string, any>) {
    super(message, { ...context, statusCode });
  }
}

export class AuthenticationError extends SightEditError {
  type = ErrorType.AUTHENTICATION as const;
  severity = ErrorSeverity.HIGH as const;
  recoverable = true as const;
  retryable = false as const;
}

export class AuthorizationError extends SightEditError {
  type = ErrorType.AUTHORIZATION as const;
  severity = ErrorSeverity.HIGH as const;
  recoverable = false as const;
  retryable = false as const;
}

export class SecurityError extends SightEditError {
  type = ErrorType.SECURITY as const;
  severity = ErrorSeverity.CRITICAL as const;
  recoverable = false as const;
  retryable = false as const;
}

export class TimeoutError extends SightEditError {
  type = ErrorType.TIMEOUT as const;
  severity = ErrorSeverity.HIGH as const;
  recoverable = true as const;
  retryable = true as const;
  
  constructor(message: string, public timeoutMs: number, context?: Record<string, any>) {
    super(message, { ...context, timeoutMs });
  }
}

export class RateLimitError extends SightEditError {
  type = ErrorType.RATE_LIMIT as const;
  severity = ErrorSeverity.MEDIUM as const;
  recoverable = true as const;
  retryable = true as const;
  
  constructor(message: string, public retryAfterSeconds: number, context?: Record<string, any>) {
    super(message, { ...context, retryAfterSeconds });
  }
}

export class ExternalServiceError extends SightEditError {
  type = ErrorType.EXTERNAL_SERVICE as const;
  severity = ErrorSeverity.HIGH as const;
  recoverable = true as const;
  retryable = true as const;
  
  constructor(message: string, public serviceName: string, context?: Record<string, any>) {
    super(message, { ...context, serviceName });
  }
}

export class ConfigurationError extends SightEditError {
  type = ErrorType.CONFIGURATION as const;
  severity = ErrorSeverity.CRITICAL as const;
  recoverable = false as const;
  retryable = false as const;
}

export class DataCorruptionError extends SightEditError {
  type = ErrorType.DATA_CORRUPTION as const;
  severity = ErrorSeverity.CRITICAL as const;
  recoverable = false as const;
  retryable = false as const;
}

/**
 * Circuit breaker for external service calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private failureThreshold = 5,
    private timeoutMs = 60000,
    private monitoringPeriodMs = 10000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeoutMs) {
        throw new ExternalServiceError('Circuit breaker is open', 'unknown');
      }
      this.state = 'half-open';
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Enhanced error handling class
 */
export class ErrorHandler {
  private static errors: ErrorDetails[] = [];
  private static maxErrors = 100;
  private static listeners: ((error: ErrorDetails) => void)[] = [];
  private static isProduction = process.env.NODE_ENV === 'production';
  private static startTime = Date.now();
  private static circuitBreakers = new Map<string, CircuitBreaker>();
  private static retryConfigs = new Map<string, RetryConfig>();
  private static errorMetrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {} as Record<ErrorType, number>,
    errorsBySeverity: {} as Record<ErrorSeverity, number>,
    recentErrors: [],
    errorRate: 0,
    lastErrorTime: undefined
  };
  
  // Sensitive patterns to remove from error messages
  private static sensitivePatterns = [
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b(?:password|token|key|secret|api[_-]?key)\s*[=:]\s*\S+/gi, // Credentials
    /\b[A-Fa-f0-9]{32,}\b/g, // Hash/token patterns
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=]+/gi, // Auth headers
    /file:\/\/[^\s]+/g, // File paths
    /(?:C|D|E|F):\\[^\s]+/g // Windows paths
  ];

  /**
   * Handle and log an error with information disclosure protection
   */
  static handle(
    error: Error | SightEditError | string, 
    type: ErrorType = ErrorType.RUNTIME, 
    context?: Record<string, any>
  ): ErrorDetails {
    const rawMessage = typeof error === 'string' ? error : error.message;
    let severity = ErrorSeverity.MEDIUM;
    let recoverable = true;
    let retryable = false;
    let correlationId: string;
    let userId: string | undefined;
    let sessionId: string | undefined;
    let userAgent: string | undefined;
    let url: string | undefined;
    
    // Extract additional details from SightEditError
    if (error instanceof SightEditError) {
      severity = error.severity;
      recoverable = error.recoverable;
      retryable = error.retryable;
      correlationId = error.correlationId;
      userId = error.userId;
      sessionId = error.sessionId;
      userAgent = error.userAgent;
      url = error.url;
      type = error.type; // Override the passed type with error's type
      context = { ...context, ...error.context };
    } else {
      correlationId = this.generateCorrelationId();
      // Infer severity based on error type
      severity = this.getSeverityForType(type);
      recoverable = this.getRecoverabilityForType(type);
      retryable = this.getRetryabilityForType(type);
    }
    
    const errorDetails: ErrorDetails = {
      type,
      message: this.sanitizeErrorMessage(rawMessage),
      context: this.sanitizeContext(context),
      timestamp: Date.now(),
      stack: this.isProduction ? undefined : (typeof error === 'object' ? this.sanitizeStackTrace(error.stack) : undefined),
      severity,
      recoverable,
      correlationId,
      userId,
      sessionId,
      userAgent,
      url,
      retryable
    };

    // Add to error log
    this.errors.push(errorDetails);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
    
    // Update metrics
    this.updateMetrics(errorDetails);

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(errorDetails);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    });

    // Log to console in development only (with sanitized data)
    if (!this.isProduction || (typeof window !== 'undefined' && (window as any).DEBUG)) {
      console.error(`[SightEdit ${type.toUpperCase()}]`, errorDetails.message, {
        context: errorDetails.context,
        stack: errorDetails.stack
      });
    }

    return errorDetails;
  }

  /**
   * Handle network errors with retry logic
   */
  static async handleNetworkError<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (i === retries) {
          this.handle(lastError, ErrorType.NETWORK, {
            retries,
            finalAttempt: true
          });
          throw lastError;
        }

        // Exponential backoff
        const backoffDelay = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        this.handle(lastError, ErrorType.NETWORK, {
          attempt: i + 1,
          retryIn: backoffDelay
        });
      }
    }

    throw lastError!;
  }

  /**
   * Validate input and throw descriptive errors
   */
  static validate(condition: boolean, message: string, context?: Record<string, any>): void {
    if (!condition) {
      const error = new Error(message);
      this.handle(error, ErrorType.VALIDATION, context);
      throw error;
    }
  }

  /**
   * Wrap async functions with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    errorType: ErrorType = ErrorType.RUNTIME,
    context?: Record<string, any>
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      this.handle(error as Error, errorType, context);
      return null;
    }
  }

  /**
   * Add error listener
   */
  static onError(listener: (error: ErrorDetails) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get recent errors (sanitized for client consumption)
   */
  static getRecentErrors(count: number = 10): ErrorDetails[] {
    const recentErrors = this.errors.slice(-count);
    
    // In production, further sanitize errors for client consumption
    if (this.isProduction) {
      return recentErrors.map(error => ({
        ...error,
        message: this.getPublicErrorMessage(error.message, error.type),
        stack: undefined,
        context: this.sanitizeContextForPublic(error.context)
      }));
    }
    
    return recentErrors;
  }

  /**
   * Get errors by type (sanitized)
   */
  static getErrorsByType(type: ErrorType): ErrorDetails[] {
    const filteredErrors = this.errors.filter(error => error.type === type);
    
    // In production, sanitize error details
    if (this.isProduction) {
      return filteredErrors.map(error => ({
        ...error,
        message: this.getPublicErrorMessage(error.message, error.type),
        stack: undefined,
        context: this.sanitizeContextForPublic(error.context)
      }));
    }
    
    return filteredErrors;
  }

  /**
   * Clear error log
   */
  static clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get error statistics
   */
  static getStats(): Record<ErrorType, number> {
    const stats: Record<ErrorType, number> = {
      [ErrorType.VALIDATION]: 0,
      [ErrorType.NETWORK]: 0,
      [ErrorType.PERMISSION]: 0,
      [ErrorType.RUNTIME]: 0,
      [ErrorType.SECURITY]: 0
    };

    this.errors.forEach(error => {
      stats[error.type]++;
    });

    return stats;
  }
  
  /**
   * Get circuit breaker for a service
   */
  static getCircuitBreaker(serviceName: string, config?: Partial<CircuitBreaker>): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(
        config?.['failureThreshold'] || 5,
        config?.['timeoutMs'] || 60000,
        config?.['monitoringPeriodMs'] || 10000
      ));
    }
    return this.circuitBreakers.get(serviceName)!;
  }
  
  /**
   * Execute operation with circuit breaker
   */
  static async withCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreaker>
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceName, config);
    return circuitBreaker.execute(operation);
  }
  
  /**
   * Enhanced retry with exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig: RetryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
      retryableErrors: [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.EXTERNAL_SERVICE, ErrorType.RATE_LIMIT],
      ...config
    };
    
    let lastError: Error | SightEditError;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          this.handle(`Operation succeeded after ${attempt} retries`, ErrorType.RUNTIME, {
            attempt,
            totalRetries: retryConfig.maxRetries
          });
        }
        return result;
      } catch (error) {
        lastError = error as Error | SightEditError;
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError, retryConfig.retryableErrors);
        
        if (!isRetryable || attempt === retryConfig.maxRetries) {
          this.handle(lastError, this.getErrorType(lastError), {
            attempt: attempt + 1,
            totalRetries: retryConfig.maxRetries,
            finalAttempt: true,
            retryable: isRetryable
          });
          throw lastError;
        }
        
        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffFactor, attempt),
          retryConfig.maxDelay
        );
        const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
        const delay = baseDelay + jitter;
        
        this.handle(lastError, this.getErrorType(lastError), {
          attempt: attempt + 1,
          retryIn: delay,
          totalRetries: retryConfig.maxRetries
        });
        
        // Handle rate limiting with specific delay
        if (lastError instanceof RateLimitError) {
          await this.sleep(lastError.retryAfterSeconds * 1000);
        } else {
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Get error metrics
   */
  static getMetrics(): ErrorMetrics {
    const currentTime = Date.now();
    const timePeriod = currentTime - this.startTime;
    
    return {
      ...this.errorMetrics,
      errorRate: timePeriod > 0 ? (this.errorMetrics.totalErrors / timePeriod) * 1000 * 60 : 0 // errors per minute
    };
  }
  
  /**
   * Reset metrics
   */
  static resetMetrics(): void {
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: [],
      errorRate: 0,
      lastErrorTime: undefined
    };
    this.startTime = Date.now();
  }
  
  /**
   * Check system health based on error metrics
   */
  static getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, any> } {
    const metrics = this.getMetrics();
    const criticalErrors = metrics.errorsBySeverity[ErrorSeverity.CRITICAL] || 0;
    const highErrors = metrics.errorsBySeverity[ErrorSeverity.HIGH] || 0;
    const recentErrorCount = metrics.recentErrors.filter(e => 
      Date.now() - e.timestamp < 60000 // Last minute
    ).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    
    if (criticalErrors > 0 || recentErrorCount > 20) {
      status = 'unhealthy';
    } else if (highErrors > 5 || recentErrorCount > 10) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }
    
    return {
      status,
      details: {
        totalErrors: metrics.totalErrors,
        criticalErrors,
        highErrors,
        recentErrorCount,
        errorRate: metrics.errorRate,
        lastErrorTime: metrics.lastErrorTime
      }
    };
  }
  
  /**
   * Update error metrics
   */
  private static updateMetrics(error: ErrorDetails): void {
    this.errorMetrics.totalErrors++;
    this.errorMetrics.lastErrorTime = error.timestamp;
    
    // Update by type
    if (!this.errorMetrics.errorsByType[error.type]) {
      this.errorMetrics.errorsByType[error.type] = 0;
    }
    this.errorMetrics.errorsByType[error.type]++;
    
    // Update by severity
    if (!this.errorMetrics.errorsBySeverity[error.severity]) {
      this.errorMetrics.errorsBySeverity[error.severity] = 0;
    }
    this.errorMetrics.errorsBySeverity[error.severity]++;
    
    // Update recent errors (keep last 50)
    this.errorMetrics.recentErrors.push(error);
    if (this.errorMetrics.recentErrors.length > 50) {
      this.errorMetrics.recentErrors = this.errorMetrics.recentErrors.slice(-50);
    }
  }
  
  /**
   * Get error type from error instance
   */
  private static getErrorType(error: Error | SightEditError): ErrorType {
    if (error instanceof SightEditError) {
      return error.type;
    }
    
    // Infer type from error message/name
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    if (name.includes('timeout') || message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }
    if (name.includes('network') || message.includes('network') || message.includes('fetch')) {
      return ErrorType.NETWORK;
    }
    if (name.includes('validation') || message.includes('validation')) {
      return ErrorType.VALIDATION;
    }
    if (name.includes('permission') || message.includes('permission') || message.includes('forbidden')) {
      return ErrorType.PERMISSION;
    }
    if (name.includes('auth') || message.includes('unauthorized')) {
      return ErrorType.AUTHENTICATION;
    }
    
    return ErrorType.RUNTIME;
  }
  
  /**
   * Check if error is retryable
   */
  private static isRetryableError(error: Error | SightEditError, retryableErrors: ErrorType[]): boolean {
    if (error instanceof SightEditError) {
      return error.retryable && retryableErrors.includes(error.type);
    }
    
    const errorType = this.getErrorType(error);
    return retryableErrors.includes(errorType);
  }
  
  /**
   * Get severity for error type
   */
  private static getSeverityForType(type: ErrorType): ErrorSeverity {
    switch (type) {
      case ErrorType.SECURITY:
      case ErrorType.DATA_CORRUPTION:
      case ErrorType.CONFIGURATION:
        return ErrorSeverity.CRITICAL;
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
      case ErrorType.AUTHENTICATION:
      case ErrorType.AUTHORIZATION:
      case ErrorType.EXTERNAL_SERVICE:
        return ErrorSeverity.HIGH;
      case ErrorType.VALIDATION:
      case ErrorType.RATE_LIMIT:
        return ErrorSeverity.MEDIUM;
      default:
        return ErrorSeverity.LOW;
    }
  }
  
  /**
   * Get recoverability for error type
   */
  private static getRecoverabilityForType(type: ErrorType): boolean {
    switch (type) {
      case ErrorType.SECURITY:
      case ErrorType.DATA_CORRUPTION:
      case ErrorType.CONFIGURATION:
      case ErrorType.AUTHORIZATION:
        return false;
      default:
        return true;
    }
  }
  
  /**
   * Get retryability for error type
   */
  private static getRetryabilityForType(type: ErrorType): boolean {
    switch (type) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
      case ErrorType.EXTERNAL_SERVICE:
      case ErrorType.RATE_LIMIT:
      case ErrorType.UNAVAILABLE:
        return true;
      default:
        return false;
    }
  }
  
  /**
   * Generate correlation ID
   */
  private static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sanitizes error messages to prevent information disclosure
   */
  private static sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return 'An error occurred';
    }
    
    let sanitized = message;
    
    // Remove sensitive information patterns
    this.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
    
    // Limit message length to prevent DoS through large error messages
    return sanitized.substring(0, 500);
  }
  
  /**
   * Sanitizes stack traces to remove sensitive file paths
   */
  private static sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;
    
    let sanitized = stack;
    
    // Remove full file paths, keep only file names
    sanitized = sanitized.replace(/(?:C|D|E|F):\\[^\s:]+\\([^\s:]+)/g, '$1');
    sanitized = sanitized.replace(/\/[^\s:]+\/([^\s:]+)/g, '$1');
    
    // Remove other sensitive patterns
    this.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });
    
    return sanitized;
  }
  
  /**
   * Sanitizes context object to remove sensitive information
   */
  private static sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context || typeof context !== 'object') {
      return context;
    }
    
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Skip sensitive keys entirely
      if (/password|token|key|secret|auth|credential/i.test(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeErrorMessage(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Further sanitizes context for public consumption
   */
  private static sanitizeContextForPublic(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;
    
    // Only include safe, non-sensitive context information
    const safeKeys = ['type', 'method', 'timestamp', 'attempt', 'retries'];
    const publicContext: Record<string, any> = {};
    
    for (const key of safeKeys) {
      if (context[key] !== undefined) {
        publicContext[key] = context[key];
      }
    }
    
    return Object.keys(publicContext).length > 0 ? publicContext : undefined;
  }
  
  /**
   * Gets user-friendly error message for public consumption
   */
  private static getPublicErrorMessage(message: string, type: ErrorType): string {
    // In production, return generic messages to prevent information disclosure
    switch (type) {
      case ErrorType.NETWORK:
        return 'Network connection error. Please check your connection and try again.';
      case ErrorType.VALIDATION:
        return 'Input validation failed. Please check your data and try again.';
      case ErrorType.PERMISSION:
        return 'You do not have permission to perform this action.';
      case ErrorType.SECURITY:
        return 'Security validation failed. Please contact support.';
      case ErrorType.AUTHENTICATION:
        return 'Authentication failed. Please log in and try again.';
      case ErrorType.AUTHORIZATION:
        return 'You are not authorized to perform this action.';
      case ErrorType.TIMEOUT:
        return 'The request timed out. Please try again.';
      case ErrorType.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again.';
      case ErrorType.EXTERNAL_SERVICE:
        return 'External service is temporarily unavailable. Please try again later.';
      case ErrorType.UNAVAILABLE:
        return 'Service is temporarily unavailable. Please try again later.';
      case ErrorType.CONFIGURATION:
        return 'Service configuration error. Please contact support.';
      case ErrorType.DATA_CORRUPTION:
        return 'Data integrity error. Please contact support immediately.';
      case ErrorType.RUNTIME:
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }
}

/**
 * Decorator for automatic error handling
 */
export function handleErrors(type: ErrorType = ErrorType.RUNTIME) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        ErrorHandler.handle(error as Error, type, {
          method: propertyKey,
          className: target.constructor.name,
          argsCount: args.length // Don't include actual args to prevent data leakage
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * User-friendly error messages with contextual suggestions
 */
export class UserErrorMessages {
  private static messages: Record<string, { message: string; suggestion?: string; action?: string }> = {
    'Network Error': {
      message: 'Connection problem. Please check your internet connection and try again.',
      suggestion: 'Check your network connection',
      action: 'retry'
    },
    'Permission denied': {
      message: 'You don\'t have permission to perform this action.',
      suggestion: 'Contact your administrator for access',
      action: 'contact_admin'
    },
    'Invalid JSON': {
      message: 'The data format is incorrect. Please check your input.',
      suggestion: 'Verify your data format',
      action: 'validate_input'
    },
    'File too large': {
      message: 'The file is too large. Please choose a smaller file.',
      suggestion: 'Choose a file smaller than 10MB',
      action: 'select_smaller_file'
    },
    'Validation failed': {
      message: 'Some information is missing or incorrect. Please review your input.',
      suggestion: 'Check required fields and formats',
      action: 'review_input'
    },
    'Save failed': {
      message: 'Could not save your changes. Please try again.',
      suggestion: 'Your changes have been queued for retry',
      action: 'auto_retry'
    },
    'Load failed': {
      message: 'Could not load the content. Please refresh the page.',
      suggestion: 'Refresh the page or check your connection',
      action: 'refresh'
    },
    'Timeout': {
      message: 'The operation took too long to complete.',
      suggestion: 'The request will be retried automatically',
      action: 'auto_retry'
    },
    'Rate limited': {
      message: 'Too many requests. Please wait before trying again.',
      suggestion: 'Wait a few moments before retrying',
      action: 'wait_retry'
    },
    'Service unavailable': {
      message: 'The service is temporarily unavailable.',
      suggestion: 'Please try again in a few minutes',
      action: 'retry_later'
    },
    'Authentication failed': {
      message: 'Your session has expired. Please log in again.',
      suggestion: 'Log in to continue',
      action: 'login'
    },
    'Unauthorized': {
      message: 'You are not authorized to access this resource.',
      suggestion: 'Contact support if you believe this is an error',
      action: 'contact_support'
    }
  };

  static getMessageFor(error: string | Error | SightEditError): { message: string; suggestion?: string; action?: string } {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // Handle SightEditError instances
    if (error instanceof SightEditError) {
      const typeMessage = this.getMessageForType(error.type);
      if (typeMessage) {
        return {
          ...typeMessage,
          message: `${typeMessage.message} (Error ID: ${error.correlationId})`
        };
      }
    }
    
    // Find matching user-friendly message
    for (const [key, messageData] of Object.entries(this.messages)) {
      if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
        return messageData;
      }
    }

    // Default fallback
    return {
      message: 'Something went wrong. Please try again or contact support if the problem persists.',
      suggestion: 'If the problem continues, please contact support',
      action: 'contact_support'
    };
  }
  
  static getMessageForType(type: ErrorType): { message: string; suggestion?: string; action?: string } | null {
    switch (type) {
      case ErrorType.NETWORK:
        return this.messages['Network Error'];
      case ErrorType.VALIDATION:
        return this.messages['Validation failed'];
      case ErrorType.PERMISSION:
        return this.messages['Permission denied'];
      case ErrorType.AUTHENTICATION:
        return this.messages['Authentication failed'];
      case ErrorType.AUTHORIZATION:
        return this.messages['Unauthorized'];
      case ErrorType.TIMEOUT:
        return this.messages['Timeout'];
      case ErrorType.RATE_LIMIT:
        return this.messages['Rate limited'];
      case ErrorType.UNAVAILABLE:
      case ErrorType.EXTERNAL_SERVICE:
        return this.messages['Service unavailable'];
      default:
        return null;
    }
  }

  static addMessage(pattern: string, messageData: { message: string; suggestion?: string; action?: string }): void {
    this.messages[pattern] = messageData;
  }
  
  static addMessageForType(type: ErrorType, messageData: { message: string; suggestion?: string; action?: string }): void {
    // This would require extending the switch statement in getMessageForType
    // For now, we'll add it to the general messages with the type name as key
    this.messages[type] = messageData;
  }
}