/**
 * Stub implementation of telemetry system
 */

export interface TelemetryConfig {
  enabled?: boolean;
  endpoint?: string;
  apiKey?: string;
  userId?: string;
  sessionId?: string;
  sampleRate?: number;
  batchSize?: number;
  flushInterval?: number;
  debug?: boolean;
}

export class TelemetrySystem {
  private config: TelemetryConfig;

  constructor(config: TelemetryConfig = {}) {
    this.config = {
      enabled: false,
      sampleRate: 1.0,
      batchSize: 50,
      flushInterval: 30000,
      debug: false,
      ...config
    };

    if (this.config.debug) {
      console.warn('TelemetrySystem initialized in stub mode');
    }
  }

  track(category: string, action: string, properties?: Record<string, any>): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.track called (stubbed):', { category, action, properties });
    }
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.identify called (stubbed):', { userId, traits });
    }
  }

  page(name?: string, properties?: Record<string, any>): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.page called (stubbed):', { name, properties });
    }
  }

  flush(): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.flush called (stubbed)');
    }
  }

  setUserId(userId: string): void {
    this.config.userId = userId;
    if (this.config.debug) {
      console.warn('TelemetrySystem.setUserId called (stubbed):', userId);
    }
  }

  reset(): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.reset called (stubbed)');
    }
  }

  isEnabled(): boolean {
    return this.config.enabled || false;
  }

  destroy(): void {
    if (this.config.debug) {
      console.warn('TelemetrySystem.destroy called (stubbed)');
    }
  }
}