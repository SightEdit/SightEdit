/**
 * Sentry integration for comprehensive error tracking and performance monitoring
 */

export interface SentryConfig {
  dsn: string;
  environment?: string;
  release?: string;
  debug?: boolean;
  sampleRate?: number;
  tracesSampleRate?: number;
  beforeSend?: (event: any) => any | null;
  beforeBreadcrumb?: (breadcrumb: any) => any | null;
  integrations?: any[];
  tags?: Record<string, string>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
}

export interface SentryMetrics {
  errorsCount: number;
  performanceTransactions: number;
  breadcrumbsCount: number;
  lastError?: {
    message: string;
    timestamp: string;
    level: string;
  };
}

/**
 * Sentry integration manager
 */
export class SentryIntegration {
  private static instance: SentryIntegration;
  private initialized = false;
  private config: SentryConfig | null = null;
  private metrics: SentryMetrics = {
    errorsCount: 0,
    performanceTransactions: 0,
    breadcrumbsCount: 0
  };

  static getInstance(): SentryIntegration {
    if (!this.instance) {
      this.instance = new SentryIntegration();
    }
    return this.instance;
  }

  /**
   * Initialize Sentry with configuration
   */
  async init(config: SentryConfig): Promise<boolean> {
    if (this.initialized) {
      console.warn('Sentry is already initialized');
      return true;
    }

    try {
      this.config = config;
      
      // Determine environment and load appropriate Sentry package
      if (typeof window !== 'undefined') {
        await this.initBrowser(config);
      } else if (typeof process !== 'undefined' && process.versions?.node) {
        await this.initNode(config);
      } else {
        console.warn('Unknown environment, Sentry initialization skipped');
        return false;
      }

      this.initialized = true;
      this.setupGlobalErrorHandlers();
      
      console.log('Sentry initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
      return false;
    }
  }

  /**
   * Initialize Sentry for browser environment
   */
  private async initBrowser(config: SentryConfig): Promise<void> {
    const Sentry = await import('@sentry/browser');
    const { BrowserTracing } = await import('@sentry/tracing');

    const integrations = [
      new BrowserTracing({
        tracingOrigins: ['localhost', /^\//],
      }),
      // Add custom integrations
      ...(config.integrations || [])
    ];

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment || 'production',
      release: config.release,
      debug: config.debug || false,
      sampleRate: config.sampleRate || 1.0,
      tracesSampleRate: config.tracesSampleRate || 0.1,
      integrations,
      beforeSend: (event) => {
        this.metrics.errorsCount++;
        if (event.level === 'error' && event.message) {
          this.metrics.lastError = {
            message: event.message,
            timestamp: new Date().toISOString(),
            level: event.level
          };
        }
        
        // Apply custom beforeSend if provided
        return config.beforeSend ? config.beforeSend(event) : event;
      },
      beforeBreadcrumb: (breadcrumb) => {
        this.metrics.breadcrumbsCount++;
        return config.beforeBreadcrumb ? config.beforeBreadcrumb(breadcrumb) : breadcrumb;
      }
    });

    // Set initial context
    if (config.tags) {
      Object.entries(config.tags).forEach(([key, value]) => {
        Sentry.setTag(key, value);
      });
    }

    if (config.user) {
      Sentry.setUser(config.user);
    }
  }

  /**
   * Initialize Sentry for Node.js environment
   */
  private async initNode(config: SentryConfig): Promise<void> {
    const Sentry = await import('@sentry/node');
    const { nodeProfilingIntegration } = await import('@sentry/profiling-node');

    const integrations = [
      nodeProfilingIntegration(),
      ...(config.integrations || [])
    ];

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment || 'production',
      release: config.release,
      debug: config.debug || false,
      sampleRate: config.sampleRate || 1.0,
      tracesSampleRate: config.tracesSampleRate || 0.1,
      integrations,
      beforeSend: (event) => {
        this.metrics.errorsCount++;
        if (event.level === 'error' && event.message) {
          this.metrics.lastError = {
            message: event.message,
            timestamp: new Date().toISOString(),
            level: event.level
          };
        }
        
        return config.beforeSend ? config.beforeSend(event) : event;
      },
      beforeBreadcrumb: (breadcrumb) => {
        this.metrics.breadcrumbsCount++;
        return config.beforeBreadcrumb ? config.beforeBreadcrumb(breadcrumb) : breadcrumb;
      }
    });

    // Set initial context
    if (config.tags) {
      Object.entries(config.tags).forEach(([key, value]) => {
        Sentry.setTag(key, value);
      });
    }

    if (config.user) {
      Sentry.setUser(config.user);
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window !== 'undefined') {
      // Browser error handlers
      window.addEventListener('unhandledrejection', (event) => {
        this.captureException(event.reason, {
          tags: { type: 'unhandled_promise_rejection' }
        });
      });

      window.addEventListener('error', (event) => {
        this.captureException(event.error || new Error(event.message), {
          tags: { type: 'global_error' },
          extra: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        });
      });
    } else if (typeof process !== 'undefined') {
      // Node.js error handlers
      process.on('unhandledRejection', (reason) => {
        this.captureException(reason, {
          tags: { type: 'unhandled_promise_rejection' }
        });
      });

      process.on('uncaughtException', (error) => {
        this.captureException(error, {
          tags: { type: 'uncaught_exception' }
        });
      });
    }
  }

  /**
   * Capture an exception
   */
  async captureException(error: any, context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: Record<string, any>;
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  }): Promise<string | undefined> {
    if (!this.initialized) {
      console.warn('Sentry not initialized, cannot capture exception');
      return;
    }

    try {
      const Sentry = await this.getSentry();

      // Set context if provided
      if (context) {
        if (context.tags) {
          Object.entries(context.tags).forEach(([key, value]) => {
            Sentry.setTag(key, value);
          });
        }

        if (context.extra) {
          Sentry.setContext('additional_info', context.extra);
        }

        if (context.user) {
          Sentry.setUser(context.user);
        }
      }

      return Sentry.captureException(error, {
        level: context?.level || 'error'
      });
    } catch (captureError) {
      console.error('Failed to capture exception in Sentry:', captureError);
    }
  }

  /**
   * Capture a message
   */
  async captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'): Promise<string | undefined> {
    if (!this.initialized) {
      console.warn('Sentry not initialized, cannot capture message');
      return;
    }

    try {
      const Sentry = await this.getSentry();
      return Sentry.captureMessage(message, level);
    } catch (error) {
      console.error('Failed to capture message in Sentry:', error);
    }
  }

  /**
   * Add breadcrumb
   */
  async addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    data?: Record<string, any>;
  }): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const Sentry = await this.getSentry();
      Sentry.addBreadcrumb({
        message: breadcrumb.message,
        category: breadcrumb.category || 'manual',
        level: breadcrumb.level || 'info',
        data: breadcrumb.data,
        timestamp: Date.now() / 1000
      });
      
      this.metrics.breadcrumbsCount++;
    } catch (error) {
      console.error('Failed to add breadcrumb in Sentry:', error);
    }
  }

  /**
   * Start performance transaction
   */
  async startTransaction(name: string, op?: string): Promise<any> {
    if (!this.initialized) {
      return null;
    }

    try {
      const Sentry = await this.getSentry();
      const transaction = Sentry.startTransaction({
        name,
        op: op || 'custom'
      });
      
      this.metrics.performanceTransactions++;
      return transaction;
    } catch (error) {
      console.error('Failed to start transaction in Sentry:', error);
      return null;
    }
  }

  /**
   * Set user context
   */
  async setUser(user: {
    id?: string;
    email?: string;
    username?: string;
    [key: string]: any;
  }): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const Sentry = await this.getSentry();
      Sentry.setUser(user);
      
      if (this.config) {
        this.config.user = user;
      }
    } catch (error) {
      console.error('Failed to set user in Sentry:', error);
    }
  }

  /**
   * Set tag
   */
  async setTag(key: string, value: string): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const Sentry = await this.getSentry();
      Sentry.setTag(key, value);
      
      if (this.config) {
        if (!this.config.tags) {
          this.config.tags = {};
        }
        this.config.tags[key] = value;
      }
    } catch (error) {
      console.error('Failed to set tag in Sentry:', error);
    }
  }

  /**
   * Set extra context
   */
  async setExtra(key: string, value: any): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const Sentry = await this.getSentry();
      Sentry.setExtra(key, value);
    } catch (error) {
      console.error('Failed to set extra in Sentry:', error);
    }
  }

  /**
   * Flush events to Sentry
   */
  async flush(timeout = 5000): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const Sentry = await this.getSentry();
      return await Sentry.flush(timeout);
    } catch (error) {
      console.error('Failed to flush Sentry:', error);
      return false;
    }
  }

  /**
   * Close Sentry client
   */
  async close(timeout = 2000): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const Sentry = await this.getSentry();
      const result = await Sentry.close(timeout);
      this.initialized = false;
      return result;
    } catch (error) {
      console.error('Failed to close Sentry:', error);
      return false;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): SentryMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if Sentry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current configuration
   */
  getConfig(): SentryConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Get Sentry instance
   */
  private async getSentry(): Promise<any> {
    if (typeof window !== 'undefined') {
      return import('@sentry/browser');
    } else {
      return import('@sentry/node');
    }
  }
}

// Convenience function for easy initialization
export async function initSentry(config: SentryConfig): Promise<boolean> {
  const sentry = SentryIntegration.getInstance();
  return sentry.init(config);
}

// Global instance
export const sentry = SentryIntegration.getInstance();

// Helper functions
export const sentryHelpers = {
  captureError: (error: any, context?: Parameters<SentryIntegration['captureException']>[1]) => {
    return sentry.captureException(error, context);
  },
  
  captureMessage: (message: string, level?: Parameters<SentryIntegration['captureMessage']>[1]) => {
    return sentry.captureMessage(message, level);
  },
  
  addBreadcrumb: (breadcrumb: Parameters<SentryIntegration['addBreadcrumb']>[0]) => {
    return sentry.addBreadcrumb(breadcrumb);
  },
  
  startTransaction: (name: string, op?: string) => {
    return sentry.startTransaction(name, op);
  },
  
  setUser: (user: Parameters<SentryIntegration['setUser']>[0]) => {
    return sentry.setUser(user);
  },
  
  setTag: (key: string, value: string) => {
    return sentry.setTag(key, value);
  },
  
  setExtra: (key: string, value: any) => {
    return sentry.setExtra(key, value);
  }
};