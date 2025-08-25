/**
 * Stub implementation of Sentry integration when Sentry packages are not available
 */

export interface SentryConfig {
  dsn: string;
  environment?: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  release?: string;
  debug?: boolean;
}

export class SentryIntegration {
  private initialized = false;

  constructor() {
    // Stub constructor
  }

  initialize(config: SentryConfig): void {
    this.initialized = true;
    console.warn('Sentry integration is stubbed - install @sentry/browser for full functionality');
  }

  captureException(error: Error, context?: any): void {
    console.warn('SentryIntegration.captureException called (stubbed):', error.message);
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    console.warn('SentryIntegration.captureMessage called (stubbed):', message);
  }

  setUser(user: any): void {
    console.warn('SentryIntegration.setUser called (stubbed)');
  }

  setTag(key: string, value: string): void {
    console.warn('SentryIntegration.setTag called (stubbed)');
  }

  setContext(key: string, context: any): void {
    console.warn('SentryIntegration.setContext called (stubbed)');
  }

  addBreadcrumb(breadcrumb: any): void {
    console.warn('SentryIntegration.addBreadcrumb called (stubbed)');
  }

  async flush(timeout?: number): Promise<boolean> {
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}