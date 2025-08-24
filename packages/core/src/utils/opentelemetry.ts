/**
 * OpenTelemetry integration for comprehensive observability
 * Complements the existing telemetry system with distributed tracing and metrics
 */

import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, metrics, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { log } from './logger';

// Environment configuration
const OTEL_ENDPOINT = process.env.OTEL_ENDPOINT || 'http://localhost:4318';
const SERVICE_NAME = 'sightedit-core';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

/**
 * OpenTelemetry integration for SightEdit
 */
export class OpenTelemetryIntegration {
  private static instance: OpenTelemetryIntegration;
  private sdk: NodeSDK | null = null;
  private tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
  private meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
  private initialized = false;

  // Custom metrics
  private editorActivations = this.meter.createCounter('sightedit_editor_activations_total', {
    description: 'Total number of editor activations',
  });

  private saveOperations = this.meter.createCounter('sightedit_save_operations_total', {
    description: 'Total number of save operations',
  });

  private apiRequests = this.meter.createCounter('sightedit_api_requests_total', {
    description: 'Total number of API requests',
  });

  private sessionDuration = this.meter.createHistogram('sightedit_session_duration_seconds', {
    description: 'Duration of user edit sessions',
    boundaries: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
  });

  private operationDuration = this.meter.createHistogram('sightedit_operation_duration_seconds', {
    description: 'Duration of operations',
    boundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
  });

  private errorCounter = this.meter.createCounter('sightedit_errors_total', {
    description: 'Total number of errors',
  });

  private activeUsers = this.meter.createUpDownCounter('sightedit_active_users', {
    description: 'Number of active users',
  });

  private memoryUsage = this.meter.createObservableGauge('sightedit_memory_usage_bytes', {
    description: 'Memory usage in bytes',
  });

  static getInstance(): OpenTelemetryIntegration {
    if (!this.instance) {
      this.instance = new OpenTelemetryIntegration();
    }
    return this.instance;
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  init(): void {
    if (this.initialized) {
      return;
    }

    try {
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
        [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'sightedit',
        'sightedit.component': 'core-library',
      });

      // Configure exporters
      const traceExporter = new OTLPTraceExporter({
        url: `${OTEL_ENDPOINT}/v1/traces`,
        headers: {},
      });

      const metricExporter = new OTLPMetricExporter({
        url: `${OTEL_ENDPOINT}/v1/metrics`,
        headers: {},
      });

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        metricReader: new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 30000,
          exportTimeoutMillis: 30000,
        }),
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': {
              enabled: false, // Disable noisy file system instrumentation
            },
            '@opentelemetry/instrumentation-http': {
              enabled: true,
              requestHook: (span, request) => {
                span.setAttributes({
                  'sightedit.request_id': request.headers['x-request-id'] as string,
                  'sightedit.user_id': request.headers['x-user-id'] as string,
                });
              },
            },
          }),
        ],
      });

      // Setup memory usage monitoring
      this.setupMemoryMonitoring();

      this.sdk.start();
      this.initialized = true;

      log.info('OpenTelemetry initialized successfully', {
        component: 'OpenTelemetryIntegration',
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: ENVIRONMENT,
      });
    } catch (error) {
      log.error('Failed to initialize OpenTelemetry', {
        component: 'OpenTelemetryIntegration',
        error: (error as Error).message,
      });
    }
  }

  /**
   * Shutdown OpenTelemetry SDK
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.initialized = false;
      log.info('OpenTelemetry shut down', {
        component: 'OpenTelemetryIntegration',
      });
    }
  }

  /**
   * Create a span for tracing
   */
  createSpan(
    name: string, 
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
      parent?: any;
    }
  ) {
    return this.tracer.startSpan(name, {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: {
        'sightedit.operation': name,
        ...options?.attributes,
      },
    }, options?.parent);
  }

  /**
   * Execute operation with tracing
   */
  async withSpan<T>(
    name: string,
    operation: (span: any) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, any>;
    }
  ): Promise<T> {
    const span = this.createSpan(name, options);
    const startTime = Date.now();

    try {
      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      
      const duration = (Date.now() - startTime) / 1000;
      this.operationDuration.record(duration, {
        operation: name,
        success: 'true',
      });

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      
      const duration = (Date.now() - startTime) / 1000;
      this.operationDuration.record(duration, {
        operation: name,
        success: 'false',
      });
      
      this.recordError(error as Error, { operation: name });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Record editor activation
   */
  recordEditorActivation(editorType: string, userId?: string): void {
    this.editorActivations.add(1, {
      editor_type: editorType,
      user_id: userId || 'anonymous',
    });
  }

  /**
   * Record save operation
   */
  recordSaveOperation(
    status: 'success' | 'failed', 
    editorType: string, 
    duration?: number,
    userId?: string
  ): void {
    this.saveOperations.add(1, {
      status,
      editor_type: editorType,
      user_id: userId || 'anonymous',
    });

    if (duration !== undefined) {
      this.operationDuration.record(duration, {
        operation: 'save',
        editor_type: editorType,
        success: status === 'success' ? 'true' : 'false',
      });
    }
  }

  /**
   * Record API request
   */
  recordAPIRequest(
    method: string, 
    endpoint: string, 
    status: number, 
    duration?: number,
    userId?: string
  ): void {
    this.apiRequests.add(1, {
      method,
      endpoint,
      status: status.toString(),
      user_id: userId || 'anonymous',
    });

    if (duration !== undefined) {
      this.operationDuration.record(duration, {
        operation: 'api_request',
        method,
        endpoint,
        status: status.toString(),
      });
    }
  }

  /**
   * Record session duration
   */
  recordSessionDuration(duration: number, userId?: string): void {
    this.sessionDuration.record(duration, {
      user_id: userId || 'anonymous',
    });
  }

  /**
   * Record error
   */
  recordError(error: Error, attributes?: Record<string, any>): void {
    this.errorCounter.add(1, {
      error_type: error.name,
      ...attributes,
    });

    // Create error span
    const span = this.createSpan('error_occurred', {
      attributes: {
        'error.type': error.name,
        'error.message': error.message,
        'error.stack': error.stack,
        ...attributes,
      },
    });
    
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    
    span.end();
  }

  /**
   * Track active user
   */
  trackActiveUser(increment: boolean = true): void {
    this.activeUsers.add(increment ? 1 : -1);
  }

  /**
   * Add business context to current span
   */
  addBusinessContext(context: {
    userId?: string;
    sessionId?: string;
    feature?: string;
    action?: string;
    [key: string]: any;
  }): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined) {
          activeSpan.setAttribute(`business.${key}`, value.toString());
        }
      });
    }
  }

  /**
   * Add security context to current span
   */
  addSecurityContext(context: {
    sourceIP?: string;
    userAgent?: string;
    authMethod?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    [key: string]: any;
  }): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined) {
          activeSpan.setAttribute(`security.${key}`, value.toString());
        }
      });
    }
  }

  /**
   * Get trace ID for correlation
   */
  getTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    return activeSpan ? activeSpan.spanContext().traceId : undefined;
  }

  /**
   * Get span ID for correlation
   */
  getSpanId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    return activeSpan ? activeSpan.spanContext().spanId : undefined;
  }

  private setupMemoryMonitoring(): void {
    this.memoryUsage.addCallback((result) => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        result.observe(usage.heapUsed, { type: 'heap_used' });
        result.observe(usage.heapTotal, { type: 'heap_total' });
        result.observe(usage.rss, { type: 'rss' });
        result.observe(usage.external, { type: 'external' });
      }
    });
  }
}

// Singleton instance
export const otelIntegration = OpenTelemetryIntegration.getInstance();

// Convenience functions
export const tracing = {
  createSpan: (name: string, options?: any) => otelIntegration.createSpan(name, options),
  withSpan: <T>(name: string, operation: (span: any) => Promise<T>, options?: any) => 
    otelIntegration.withSpan(name, operation, options),
  getTraceId: () => otelIntegration.getTraceId(),
  getSpanId: () => otelIntegration.getSpanId(),
  addBusinessContext: (context: any) => otelIntegration.addBusinessContext(context),
  addSecurityContext: (context: any) => otelIntegration.addSecurityContext(context),
};

export const otelMetrics = {
  recordEditorActivation: (type: string, userId?: string) => 
    otelIntegration.recordEditorActivation(type, userId),
  recordSaveOperation: (status: 'success' | 'failed', type: string, duration?: number, userId?: string) =>
    otelIntegration.recordSaveOperation(status, type, duration, userId),
  recordAPIRequest: (method: string, endpoint: string, status: number, duration?: number, userId?: string) =>
    otelIntegration.recordAPIRequest(method, endpoint, status, duration, userId),
  recordSessionDuration: (duration: number, userId?: string) =>
    otelIntegration.recordSessionDuration(duration, userId),
  recordError: (error: Error, attributes?: Record<string, any>) =>
    otelIntegration.recordError(error, attributes),
  trackActiveUser: (increment?: boolean) => otelIntegration.trackActiveUser(increment),
};

// Auto-initialize in production
if (process.env.NODE_ENV === 'production') {
  otelIntegration.init();
}

// Graceful shutdown handling
const shutdown = async () => {
  await otelIntegration.shutdown();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGHUP', shutdown);