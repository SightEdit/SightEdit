/**
 * Performance Monitor
 *
 * Tracks and reports performance metrics for SightEdit operations
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  slowestOperations: PerformanceMetric[];
  operations: PerformanceMetric[];
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completed: PerformanceMetric[] = [];
  private maxMetrics: number = 1000;
  private enabled: boolean = true;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start measuring an operation
   */
  start(name: string, metadata?: Record<string, any>): string {
    if (!this.enabled) return name;

    const id = `${name}-${Date.now()}-${Math.random()}`;

    this.metrics.set(id, {
      name,
      startTime: performance.now(),
      metadata
    });

    return id;
  }

  /**
   * End measuring an operation
   */
  end(id: string): number | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(id);
    if (!metric) {
      console.warn(`Performance metric not found: ${id}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    // Move to completed
    this.completed.unshift(metric);
    this.metrics.delete(id);

    // Limit completed metrics
    if (this.completed.length > this.maxMetrics) {
      this.completed = this.completed.slice(0, this.maxMetrics);
    }

    return metric.duration;
  }

  /**
   * Measure a function execution
   */
  async measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.enabled) {
      return await fn();
    }

    const id = this.start(name, metadata);

    try {
      const result = await fn();
      this.end(id);
      return result;
    } catch (error) {
      this.end(id);
      throw error;
    }
  }

  /**
   * Get performance report
   */
  getReport(operationName?: string): PerformanceReport {
    let operations = [...this.completed];

    if (operationName) {
      operations = operations.filter(m => m.name === operationName);
    }

    if (operations.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        slowestOperations: [],
        operations: []
      };
    }

    const durations = operations
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);

    const sum = durations.reduce((a, b) => a + b, 0);

    const slowest = [...operations]
      .filter(m => m.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    return {
      totalOperations: operations.length,
      averageDuration: sum / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      slowestOperations: slowest,
      operations
    };
  }

  /**
   * Get operations by name
   */
  getOperationsByName(name: string): PerformanceMetric[] {
    return this.completed.filter(m => m.name === name);
  }

  /**
   * Get slow operations (above threshold)
   */
  getSlowOperations(thresholdMs: number = 100): PerformanceMetric[] {
    return this.completed.filter(m => m.duration && m.duration > thresholdMs);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.completed = [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    average: number;
    percentiles: { p50: number; p75: number; p95: number; p99: number };
  } {
    const durations = this.completed
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        total: 0,
        average: 0,
        percentiles: { p50: 0, p75: 0, p95: 0, p99: 0 }
      };
    }

    const getPercentile = (p: number) => {
      const index = Math.ceil((durations.length * p) / 100) - 1;
      return durations[index] || 0;
    };

    return {
      total: durations.length,
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      percentiles: {
        p50: getPercentile(50),
        p75: getPercentile(75),
        p95: getPercentile(95),
        p99: getPercentile(99)
      }
    };
  }

  /**
   * Log report to console
   */
  logReport(operationName?: string): void {
    const report = this.getReport(operationName);

    console.group(`📊 Performance Report${operationName ? ` - ${operationName}` : ''}`);
    console.log(`Total Operations: ${report.totalOperations}`);
    console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);
    console.log(`Min Duration: ${report.minDuration.toFixed(2)}ms`);
    console.log(`Max Duration: ${report.maxDuration.toFixed(2)}ms`);

    if (report.slowestOperations.length > 0) {
      console.group('Slowest Operations:');
      report.slowestOperations.forEach((op, i) => {
        console.log(`${i + 1}. ${op.name}: ${op.duration?.toFixed(2)}ms`);
      });
      console.groupEnd();
    }

    console.groupEnd();
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      completed: this.completed,
      active: Array.from(this.metrics.values()),
      summary: this.getSummary()
    }, null, 2);
  }

  /**
   * Import metrics from JSON
   */
  importMetrics(json: string): void {
    try {
      const data = JSON.parse(json);
      this.completed = data.completed || [];
    } catch (error) {
      console.error('Failed to import metrics:', error);
    }
  }
}

// Export singleton
export const performanceMonitor = PerformanceMonitor.getInstance();

// Convenience functions
export function measurePerformance<T>(
  name: string,
  fn: () => T | Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return performanceMonitor.measure(name, fn, metadata);
}

export function startMeasure(name: string, metadata?: Record<string, any>): string {
  return performanceMonitor.start(name, metadata);
}

export function endMeasure(id: string): number | null {
  return performanceMonitor.end(id);
}

export function getPerformanceReport(operationName?: string): PerformanceReport {
  return performanceMonitor.getReport(operationName);
}
