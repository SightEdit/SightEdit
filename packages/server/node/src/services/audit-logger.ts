/**
 * Comprehensive Audit Logging and Error Tracking System
 * Implements security event logging, audit trails, and error monitoring
 */

import * as winston from 'winston';
import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { configManager } from '../config/secure-config';
import * as fs from 'fs/promises';
import * as path from 'path';

// Audit event types
export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',
  
  // Authorization events
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  
  // Data events
  DATA_CREATE = 'DATA_CREATE',
  DATA_READ = 'DATA_READ',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_IMPORT = 'DATA_IMPORT',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BRUTE_FORCE_ATTEMPT = 'BRUTE_FORCE_ATTEMPT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  CSRF_VIOLATION = 'CSRF_VIOLATION',
  
  // System events
  SYSTEM_START = 'SYSTEM_START',
  SYSTEM_STOP = 'SYSTEM_STOP',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  BACKUP_CREATED = 'BACKUP_CREATED',
  BACKUP_RESTORED = 'BACKUP_RESTORED',
  
  // Error events
  APPLICATION_ERROR = 'APPLICATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  API_ERROR = 'API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

// Severity levels
export enum Severity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// Audit log entry interface
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: Severity;
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: {
    type: string;
    id: string;
    name?: string;
  };
  action?: string;
  result: 'success' | 'failure';
  message: string;
  details?: any;
  stackTrace?: string;
  correlationId?: string;
}

/**
 * Audit Logger Service
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private logger: winston.Logger;
  private config: any;
  private buffer: AuditLogEntry[] = [];
  private bufferSize = 100;
  private flushInterval = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.config = configManager.loadConfig();
    this.initializeLogger();
    this.initializeSentry();
    this.startFlushTimer();
  }
  
  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }
  
  /**
   * Initialize Winston logger
   */
  private initializeLogger(): void {
    const logDir = process.env.LOG_DIR || './logs';
    
    // Custom format for audit logs
    const auditFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta,
        });
      })
    );
    
    // Configure transports
    const transports: winston.transport[] = [
      // Console transport (development)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
        silent: process.env.NODE_ENV === 'test',
      }),
      
      // Audit log file
      new winston.transports.File({
        filename: path.join(logDir, 'audit.log'),
        format: auditFormat,
        maxsize: 100 * 1024 * 1024, // 100MB
        maxFiles: 30,
        tailable: true,
      }),
      
      // Error log file
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: auditFormat,
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 10,
      }),
      
      // Security events file
      new winston.transports.File({
        filename: path.join(logDir, 'security.log'),
        format: auditFormat,
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 20,
      }),
    ];
    
    // Add remote logging in production
    if (process.env.NODE_ENV === 'production' && process.env.REMOTE_LOG_ENDPOINT) {
      // Add HTTP transport for centralized logging
      const HttpTransport = require('winston-transport-http');
      transports.push(
        new HttpTransport({
          host: process.env.REMOTE_LOG_HOST,
          port: process.env.REMOTE_LOG_PORT,
          path: process.env.REMOTE_LOG_PATH,
          ssl: true,
          batch: true,
          batchInterval: 5000,
          batchCount: 10,
        })
      );
    }
    
    this.logger = winston.createLogger({
      level: this.config.logging.level,
      format: auditFormat,
      transports,
      exitOnError: false,
    });
  }
  
  /**
   * Initialize Sentry for error tracking
   */
  private initializeSentry(): void {
    if (this.config.logging.errorTracking.enabled && this.config.logging.errorTracking.dsn) {
      Sentry.init({
        dsn: this.config.logging.errorTracking.dsn,
        environment: this.config.server.environment,
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({
            app: require('express')(),
          }),
        ],
        tracesSampleRate: this.config.server.environment === 'production' ? 0.1 : 1.0,
        beforeSend: (event, hint) => {
          // Sanitize sensitive data before sending
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers?.authorization;
            delete event.request.headers?.['x-api-key'];
          }
          
          // Filter out non-error events in production
          if (this.config.server.environment === 'production' && !event.exception) {
            return null;
          }
          
          return event;
        },
      });
    }
  }
  
  /**
   * Log audit event
   */
  public async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry,
    };
    
    // Add to buffer
    this.buffer.push(logEntry);
    
    // Determine log level based on severity
    const logLevel = this.mapSeverityToLogLevel(entry.severity);
    
    // Log to Winston
    this.logger.log(logLevel, logEntry.message, logEntry);
    
    // Send to Sentry for errors
    if (entry.severity === Severity.ERROR || entry.severity === Severity.CRITICAL) {
      Sentry.captureException(new Error(logEntry.message), {
        level: entry.severity === Severity.CRITICAL ? 'fatal' : 'error',
        tags: {
          eventType: logEntry.eventType,
          userId: logEntry.userId,
        },
        extra: logEntry.details,
      });
    }
    
    // Flush buffer if full
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
    
    // Alert on critical events
    if (entry.severity === Severity.CRITICAL) {
      await this.sendAlert(logEntry);
    }
  }
  
  /**
   * Log security event
   */
  public async logSecurity(
    eventType: AuditEventType,
    message: string,
    details?: any,
    req?: Request
  ): Promise<void> {
    const entry: Omit<AuditLogEntry, 'id' | 'timestamp'> = {
      eventType,
      severity: this.getSecurityEventSeverity(eventType),
      message,
      details,
      result: 'failure',
      userId: (req as any)?.user?.id,
      userEmail: (req as any)?.user?.email,
      sessionId: (req as any)?.sessionId,
      ipAddress: req?.ip,
      userAgent: req?.headers['user-agent'],
      correlationId: (req as any)?.correlationId,
    };
    
    // Write to security log file
    const securityLogger = winston.createLogger({
      transports: [
        new winston.transports.File({
          filename: path.join(process.env.LOG_DIR || './logs', 'security.log'),
          format: winston.format.json(),
        }),
      ],
    });
    
    securityLogger.error(message, entry);
    
    await this.log(entry);
  }
  
  /**
   * Log error with context
   */
  public async logError(
    error: Error,
    context?: {
      userId?: string;
      action?: string;
      resource?: any;
      req?: Request;
    }
  ): Promise<void> {
    const entry: Omit<AuditLogEntry, 'id' | 'timestamp'> = {
      eventType: AuditEventType.APPLICATION_ERROR,
      severity: Severity.ERROR,
      message: error.message,
      result: 'failure',
      stackTrace: error.stack,
      userId: context?.userId || (context?.req as any)?.user?.id,
      action: context?.action,
      resource: context?.resource,
      ipAddress: context?.req?.ip,
      userAgent: context?.req?.headers['user-agent'],
      details: {
        errorName: error.name,
        errorCode: (error as any).code,
      },
    };
    
    await this.log(entry);
  }
  
  /**
   * Create audit trail for data changes
   */
  public async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    changes?: any,
    userId?: string
  ): Promise<void> {
    const eventTypeMap = {
      create: AuditEventType.DATA_CREATE,
      update: AuditEventType.DATA_UPDATE,
      delete: AuditEventType.DATA_DELETE,
    };
    
    const entry: Omit<AuditLogEntry, 'id' | 'timestamp'> = {
      eventType: eventTypeMap[action],
      severity: Severity.INFO,
      message: `${action} ${resourceType} ${resourceId}`,
      result: 'success',
      userId,
      resource: {
        type: resourceType,
        id: resourceId,
      },
      action,
      details: changes,
    };
    
    await this.log(entry);
  }
  
  /**
   * Flush buffer to persistent storage
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const entries = [...this.buffer];
    this.buffer = [];
    
    try {
      // Write to audit file
      const auditFile = path.join(
        process.env.LOG_DIR || './logs',
        `audit-${new Date().toISOString().split('T')[0]}.jsonl`
      );
      
      const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(auditFile, content);
      
      // Send to remote logging service if configured
      if (process.env.REMOTE_LOG_ENDPOINT) {
        await this.sendToRemote(entries);
      }
    } catch (error) {
      console.error('Failed to flush audit log buffer:', error);
      // Re-add to buffer on failure
      this.buffer.unshift(...entries);
    }
  }
  
  /**
   * Send logs to remote service
   */
  private async sendToRemote(entries: AuditLogEntry[]): Promise<void> {
    try {
      const response = await fetch(process.env.REMOTE_LOG_ENDPOINT!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REMOTE_LOG_API_KEY || '',
        },
        body: JSON.stringify({ entries }),
      });
      
      if (!response.ok) {
        throw new Error(`Remote logging failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send logs to remote service:', error);
    }
  }
  
  /**
   * Send alert for critical events
   */
  private async sendAlert(entry: AuditLogEntry): Promise<void> {
    // Send to monitoring service
    if (process.env.ALERT_WEBHOOK_URL) {
      try {
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 Critical Security Event: ${entry.eventType}`,
            attachments: [{
              color: 'danger',
              title: entry.message,
              fields: [
                { title: 'User', value: entry.userEmail || entry.userId || 'Unknown', short: true },
                { title: 'IP Address', value: entry.ipAddress || 'Unknown', short: true },
                { title: 'Timestamp', value: entry.timestamp.toISOString(), short: false },
                { title: 'Details', value: JSON.stringify(entry.details, null, 2), short: false },
              ],
            }],
          }),
        });
      } catch (error) {
        console.error('Failed to send alert:', error);
      }
    }
  }
  
  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.error('Flush timer error:', err));
    }, this.flushInterval);
  }
  
  /**
   * Stop flush timer
   */
  public stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  /**
   * Map severity to Winston log level
   */
  private mapSeverityToLogLevel(severity: Severity): string {
    const mapping: { [key in Severity]: string } = {
      [Severity.DEBUG]: 'debug',
      [Severity.INFO]: 'info',
      [Severity.WARNING]: 'warn',
      [Severity.ERROR]: 'error',
      [Severity.CRITICAL]: 'error',
    };
    
    return mapping[severity];
  }
  
  /**
   * Get severity for security events
   */
  private getSecurityEventSeverity(eventType: AuditEventType): Severity {
    const criticalEvents = [
      AuditEventType.PRIVILEGE_ESCALATION,
      AuditEventType.SQL_INJECTION_ATTEMPT,
      AuditEventType.BRUTE_FORCE_ATTEMPT,
    ];
    
    const warningEvents = [
      AuditEventType.ACCESS_DENIED,
      AuditEventType.RATE_LIMIT_EXCEEDED,
      AuditEventType.XSS_ATTEMPT,
      AuditEventType.CSRF_VIOLATION,
    ];
    
    if (criticalEvents.includes(eventType)) {
      return Severity.CRITICAL;
    }
    
    if (warningEvents.includes(eventType)) {
      return Severity.WARNING;
    }
    
    return Severity.INFO;
  }
  
  /**
   * Query audit logs
   */
  public async query(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    eventType?: AuditEventType;
    severity?: Severity;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    // In production, this would query from database
    // For now, read from file
    try {
      const logDir = process.env.LOG_DIR || './logs';
      const auditFile = path.join(logDir, 'audit.log');
      const content = await fs.readFile(auditFile, 'utf-8');
      
      const entries = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(entry => entry !== null) as AuditLogEntry[];
      
      // Apply filters
      let filtered = entries;
      
      if (filters.startDate) {
        filtered = filtered.filter(e => new Date(e.timestamp) >= filters.startDate!);
      }
      
      if (filters.endDate) {
        filtered = filtered.filter(e => new Date(e.timestamp) <= filters.endDate!);
      }
      
      if (filters.userId) {
        filtered = filtered.filter(e => e.userId === filters.userId);
      }
      
      if (filters.eventType) {
        filtered = filtered.filter(e => e.eventType === filters.eventType);
      }
      
      if (filters.severity) {
        filtered = filtered.filter(e => e.severity === filters.severity);
      }
      
      if (filters.limit) {
        filtered = filtered.slice(0, filters.limit);
      }
      
      return filtered;
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }
  
  /**
   * Generate audit report
   */
  public async generateReport(startDate: Date, endDate: Date): Promise<any> {
    const entries = await this.query({ startDate, endDate });
    
    const report = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: {
        totalEvents: entries.length,
        uniqueUsers: new Set(entries.map(e => e.userId).filter(Boolean)).size,
        eventTypes: {} as Record<string, number>,
        severityBreakdown: {} as Record<string, number>,
      },
      securityEvents: entries.filter(e => 
        e.severity === Severity.WARNING || 
        e.severity === Severity.CRITICAL
      ),
      topUsers: {} as Record<string, number>,
      failedOperations: entries.filter(e => e.result === 'failure'),
    };
    
    // Calculate statistics
    for (const entry of entries) {
      // Event types
      report.summary.eventTypes[entry.eventType] = 
        (report.summary.eventTypes[entry.eventType] || 0) + 1;
      
      // Severity breakdown
      report.summary.severityBreakdown[entry.severity] = 
        (report.summary.severityBreakdown[entry.severity] || 0) + 1;
      
      // Top users
      if (entry.userId) {
        report.topUsers[entry.userId] = (report.topUsers[entry.userId] || 0) + 1;
      }
    }
    
    return report;
  }
}

/**
 * Request correlation middleware
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate correlation ID for request tracking
    const correlationId = req.headers['x-correlation-id'] as string || crypto.randomUUID();
    
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    
    // Log request
    const auditLogger = AuditLogger.getInstance();
    auditLogger.log({
      eventType: AuditEventType.ACCESS_GRANTED,
      severity: Severity.DEBUG,
      message: `${req.method} ${req.path}`,
      result: 'success',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId,
      details: {
        method: req.method,
        path: req.path,
        query: req.query,
      },
    });
    
    next();
  };
}

/**
 * Error tracking middleware
 */
export function errorTrackingMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const auditLogger = AuditLogger.getInstance();
    
    // Log error
    auditLogger.logError(err, { req });
    
    // Send to Sentry
    Sentry.captureException(err, {
      tags: {
        path: req.path,
        method: req.method,
      },
      user: {
        id: (req as any).user?.id,
        email: (req as any).user?.email,
      },
      extra: {
        correlationId: (req as any).correlationId,
        body: req.body,
        query: req.query,
      },
    });
    
    // Send error response
    const statusCode = (err as any).statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error'
      : err.message;
    
    res.status(statusCode).json({
      success: false,
      error: message,
      correlationId: (req as any).correlationId,
    });
  };
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();