/**
 * Structured logging system for comprehensive monitoring and debugging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SECURITY = 4
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  component?: string;
  operation?: string;
  timestamp?: string;
  correlationId?: string;
  userAgent?: string;
  ip?: string;
  version?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: LogContext;
  timestamp: string;
  error?: Error;
}

/**
 * Structured logger with multiple output targets and filtering
 */
export class StructuredLogger {
  private static instance: StructuredLogger;
  private logLevel: LogLevel = LogLevel.INFO;
  private outputs: LogOutput[] = [];
  private sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'credential', 'api_key'];

  static getInstance(): StructuredLogger {
    if (!this.instance) {
      this.instance = new StructuredLogger();
      // Add default console output
      this.instance.addOutput(new ConsoleLogOutput());
    }
    return this.instance;
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Add log output target
   */
  addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  /**
   * Remove log output target
   */
  removeOutput(output: LogOutput): void {
    const index = this.outputs.indexOf(output);
    if (index > -1) {
      this.outputs.splice(index, 1);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context: LogContext = {}): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context: LogContext = {}): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context: LogContext = {}): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context: LogContext = {}, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log security event
   */
  security(message: string, context: LogContext = {}): void {
    this.log(LogLevel.SECURITY, message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context: LogContext, error?: Error): void {
    if (level < this.logLevel) {
      return; // Skip logs below threshold
    }

    const sanitizedContext = this.sanitizeContext(context);
    
    const entry: LogEntry = {
      level,
      message,
      context: {
        ...sanitizedContext,
        timestamp: new Date().toISOString(),
        correlationId: sanitizedContext.correlationId || this.generateCorrelationId()
      },
      timestamp: new Date().toISOString(),
      error
    };

    // Send to all outputs
    for (const output of this.outputs) {
      try {
        output.write(entry);
      } catch (outputError) {
        // Fallback to console if output fails
        console.error('Log output failed:', outputError);
        console.log('Original log entry:', entry);
      }
    }
  }

  /**
   * Remove sensitive information from log context
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      // Check if key contains sensitive information
      if (this.sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        // Truncate very long strings
        sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize nested objects
   */
  private sanitizeObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeObject(value);
        }
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Abstract log output interface
 */
export abstract class LogOutput {
  abstract write(entry: LogEntry): void;
}

/**
 * Console log output
 */
export class ConsoleLogOutput extends LogOutput {
  write(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const prefix = `[${entry.timestamp}] [${levelName}]`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.context);
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.context);
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.context);
        break;
      case LogLevel.ERROR:
      case LogLevel.SECURITY:
        console.error(prefix, entry.message, entry.context, entry.error);
        break;
    }
  }
}

/**
 * JSON file log output (for server environments)
 */
export class FileLogOutput extends LogOutput {
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private filePath?: string,
    private bufferSize = 10,
    private flushIntervalMs = 5000
  ) {
    super();
    this.startPeriodicFlush();
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0);
    
    try {
      // In browser environment, store in localStorage as fallback
      if (typeof window !== 'undefined' && window.localStorage) {
        const existing = JSON.parse(localStorage.getItem('sightedit-logs') || '[]');
        const combined = [...existing, ...entries].slice(-100); // Keep last 100 entries
        localStorage.setItem('sightedit-logs', JSON.stringify(combined));
      }
      // In Node.js environment, you would write to file system
      else if (typeof process !== 'undefined' && process.versions?.node) {
        // This would require fs module - placeholder for actual implementation
        console.log('File logging in Node.js environment:', entries);
      }
    } catch (error) {
      console.error('Failed to flush logs:', error);
      // Re-add entries to buffer for retry
      this.buffer.unshift(...entries);
    }
  }

  private startPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush(); // Final flush
  }
}

/**
 * Remote log output (sends logs to external service)
 */
export class RemoteLogOutput extends LogOutput {
  private buffer: LogEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(
    private endpoint: string,
    private apiKey?: string,
    private batchSize = 20,
    private flushDelayMs = 2000
  ) {
    super();
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.batchSize) {
      this.flushImmediate();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flushImmediate();
    }, this.flushDelayMs);
  }

  private async flushImmediate(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({ logs: entries })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send logs to remote endpoint:', error);
      // In production, you might want to implement retry logic
      // For now, we'll just log the error
    }
  }
}

/**
 * Performance monitoring log output
 */
export class PerformanceLogOutput extends LogOutput {
  write(entry: LogEntry): void {
    // Only log performance-related entries
    if (entry.context.component && entry.context.operation) {
      const perfEntry = {
        timestamp: entry.timestamp,
        component: entry.context.component,
        operation: entry.context.operation,
        duration: entry.context.duration,
        level: LogLevel[entry.level]
      };

      // In production, this could send to APM tools like New Relic, DataDog, etc.
      console.log('[PERFORMANCE]', perfEntry);
    }
  }
}

// Global logger instance
export const logger = StructuredLogger.getInstance();

// Convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, context?: LogContext, error?: Error) => logger.error(message, context, error),
  security: (message: string, context?: LogContext) => logger.security(message, context),
  
  // Performance logging helpers
  performance: (operation: string, component: string, duration: number, context?: LogContext) => {
    logger.info(`${operation} completed`, {
      ...context,
      component,
      operation,
      duration,
      category: 'performance'
    });
  },

  // User action logging
  userAction: (action: string, userId?: string, context?: LogContext) => {
    logger.info(`User action: ${action}`, {
      ...context,
      userId,
      category: 'user_action',
      action
    });
  },

  // API request logging
  apiRequest: (method: string, endpoint: string, statusCode?: number, duration?: number, context?: LogContext) => {
    const level = statusCode && statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    if (level === LogLevel.WARN) {
      logger.warn(`${method} ${endpoint}`, {
        ...context,
        method,
        endpoint,
        statusCode,
        duration,
        category: 'api_request'
      });
    } else {
      logger.info(`${method} ${endpoint}`, {
        ...context,
        method,
        endpoint,
        statusCode,
        duration,
        category: 'api_request'
      });
    }
  },
  
  // Export
  export: (filter?: LogFilter) => {
    return logger.exportLogs(filter);
  },
  
  // Configuration
  configure: (options: Parameters<StructuredLogger['configure']>[0]) => {
    logger.configure(options);
  },
  
  // Add output targets
  addOutput: (output: LogOutput) => {
    logger.addOutput(output);
  },
  
  // Create Sentry output
  createSentryOutput: (dsn: string, environment?: string, release?: string) => {
    return new SentryLogOutput(dsn, environment, release);
  },
  
  // Create remote output
  createRemoteOutput: (endpoint: string, apiKey?: string, batchSize?: number) => {
    return new RemoteLogOutput(endpoint, apiKey, batchSize);
  },
  
  // Create performance output
  createPerformanceOutput: (threshold?: number, bufferSize?: number) => {
    return new PerformanceLogOutput(threshold, bufferSize);
  },
  
  // Create analytics output
  createAnalyticsOutput: (analyticsEndpoint?: string, trackingId?: string, bufferSize?: number) => {
    return new AnalyticsLogOutput(analyticsEndpoint, trackingId, bufferSize);
  }
};

// Export types for external use
export type {
  LogContext,
  LogEntry,
  LogFilter,
  LogMetrics
};

// Classes already exported individually above