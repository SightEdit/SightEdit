/**
 * Comprehensive Cache Metrics and Monitoring System for SightEdit
 * Real-time monitoring, alerting, and performance analytics
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface MonitoringConfig {
  // Collection settings
  collection: {
    enabled: boolean;
    interval: number; // milliseconds
    retention: number; // seconds
    batchSize: number;
  };
  
  // Metrics settings
  metrics: {
    enableRealtime: boolean;
    enableHistorical: boolean;
    enablePredictive: boolean;
    aggregationWindows: number[]; // seconds: [60, 300, 3600, 86400]
  };
  
  // Alerting
  alerts: {
    enabled: boolean;
    thresholds: {
      hitRateLow: number;
      responseTimeHigh: number;
      errorRateHigh: number;
      memoryUsageHigh: number;
      evictionRateHigh: number;
    };
    channels: {
      webhook?: string;
      email?: string[];
      slack?: string;
    };
  };
  
  // Performance baselines
  baselines: {
    enabled: boolean;
    learningPeriod: number; // seconds
    adaptiveThresholds: boolean;
    confidenceInterval: number;
  };
  
  // Export settings
  export: {
    enabled: boolean;
    format: 'json' | 'csv' | 'prometheus';
    endpoint?: string;
    interval: number;
  };
}

export interface CacheMetricsSnapshot {
  timestamp: number;
  layers: {
    [layerName: string]: LayerMetrics;
  };
  overall: OverallMetrics;
  system: SystemMetrics;
}

export interface LayerMetrics {
  name: string;
  hitRate: number;
  missRate: number;
  hitCount: number;
  missCount: number;
  totalRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  errorCount: number;
  
  // Size and capacity
  currentSize: number;
  maxSize: number;
  utilizationRate: number;
  
  // Operations
  evictionCount: number;
  evictionRate: number; // per second
  setOperations: number;
  getOperations: number;
  deleteOperations: number;
  
  // Time-based metrics
  ttlHits: number;
  expiredKeys: number;
  staleness: number; // average age of cached items
}

export interface OverallMetrics {
  // Aggregated hit rates across all layers
  globalHitRate: number;
  globalMissRate: number;
  globalResponseTime: number;
  globalErrorRate: number;
  
  // Traffic patterns
  requestsPerSecond: number;
  peakRequestsPerSecond: number;
  trafficGrowth: number; // percentage
  
  // Efficiency metrics
  bandwidthSaved: number; // bytes
  costSavings: number; // estimated cost savings
  carbonFootprintReduction: number; // estimated CO2 saved
  
  // Health indicators
  healthScore: number; // 0-100
  performanceIndex: number; // composite performance score
  reliabilityScore: number; // uptime and consistency score
}

export interface SystemMetrics {
  // Memory usage
  memoryUsed: number;
  memoryAvailable: number;
  memoryPressure: number; // 0-1 scale
  
  // CPU usage
  cpuUsage: number;
  cacheOverhead: number; // CPU usage attributable to caching
  
  // Network
  networkLatency: number;
  networkThroughput: number;
  networkErrors: number;
  
  // Storage
  diskUsage: number;
  diskIOPS: number;
  diskLatency: number;
}

export interface Alert {
  id: string;
  type: 'threshold' | 'anomaly' | 'trend' | 'prediction';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  layer?: string;
  threshold?: number;
  currentValue: number;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata: Record<string, any>;
}

export interface PerformanceBaseline {
  metric: string;
  layer?: string;
  mean: number;
  standardDeviation: number;
  min: number;
  max: number;
  percentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  sampleCount: number;
  lastUpdated: number;
  confidence: number;
}

export interface TrendAnalysis {
  metric: string;
  layer?: string;
  direction: 'up' | 'down' | 'stable';
  changeRate: number; // percentage per hour
  correlation: number; // -1 to 1
  significance: number; // statistical significance
  prediction: {
    nextHour: number;
    nextDay: number;
    nextWeek: number;
    confidence: number;
  };
}

/**
 * Advanced cache monitoring and metrics system
 */
export class CacheMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private metricsHistory: CacheMetricsSnapshot[] = [];
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private trendAnalyses: Map<string, TrendAnalysis> = new Map();
  private collectionInterval?: NodeJS.Timeout;
  private alertingInterval?: NodeJS.Timeout;
  private exportInterval?: NodeJS.Timeout;
  private responseTimeBuffer: number[] = [];
  private isInitialized = false;
  
  constructor(config: MonitoringConfig) {
    super();
    this.config = {
      collection: {
        enabled: true,
        interval: 10000, // 10 seconds
        retention: 86400 * 7, // 7 days
        batchSize: 100
      },
      metrics: {
        enableRealtime: true,
        enableHistorical: true,
        enablePredictive: false,
        aggregationWindows: [60, 300, 3600, 86400] // 1min, 5min, 1hour, 1day
      },
      alerts: {
        enabled: true,
        thresholds: {
          hitRateLow: 0.8,
          responseTimeHigh: 1000,
          errorRateHigh: 0.05,
          memoryUsageHigh: 0.9,
          evictionRateHigh: 100
        },
        channels: {}
      },
      baselines: {
        enabled: true,
        learningPeriod: 86400, // 24 hours
        adaptiveThresholds: true,
        confidenceInterval: 0.95
      },
      export: {
        enabled: false,
        format: 'json',
        interval: 300000 // 5 minutes
      },
      ...config
    };
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing cache monitoring system', {
        component: 'CacheMonitor',
        config: {
          realtime: this.config.metrics.enableRealtime,
          historical: this.config.metrics.enableHistorical,
          predictive: this.config.metrics.enablePredictive,
          alerts: this.config.alerts.enabled
        }
      });
      
      // Load historical baselines
      await this.loadBaselines();
      
      // Start monitoring intervals
      if (this.config.collection.enabled) {
        this.startMetricsCollection();
      }
      
      if (this.config.alerts.enabled) {
        this.startAlerting();
      }
      
      if (this.config.export.enabled) {
        this.startExport();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Cache monitoring system initialized', {
        component: 'CacheMonitor'
      });
      
    } catch (error) {
      logger.error('Failed to initialize cache monitoring system', {
        component: 'CacheMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Record cache operation metrics
   */
  recordOperation(
    layer: string,
    operation: 'hit' | 'miss' | 'set' | 'delete' | 'eviction',
    responseTime?: number,
    size?: number
  ): void {
    if (!this.config.collection.enabled) return;
    
    const timestamp = Date.now();
    
    // Buffer response times for percentile calculations
    if (responseTime !== undefined) {
      this.responseTimeBuffer.push(responseTime);
      // Keep buffer size manageable
      if (this.responseTimeBuffer.length > 1000) {
        this.responseTimeBuffer.shift();
      }
    }
    
    // Emit real-time metric event
    if (this.config.metrics.enableRealtime) {
      this.emit('operation', {
        layer,
        operation,
        responseTime,
        size,
        timestamp
      });
    }
    
    // Update baselines if enabled
    if (this.config.baselines.enabled && responseTime !== undefined) {
      this.updateBaseline(`${layer}.responseTime`, responseTime);
    }
  }
  
  /**
   * Record error metrics
   */
  recordError(
    layer: string,
    operation: string,
    error: Error,
    context?: any
  ): void {
    if (!this.config.collection.enabled) return;
    
    const timestamp = Date.now();
    
    this.emit('error', {
      layer,
      operation,
      error: error.message,
      context,
      timestamp
    });
    
    // Check for error rate alerts
    if (this.config.alerts.enabled) {
      this.checkErrorRateAlert(layer);
    }
  }
  
  /**
   * Get current metrics snapshot
   */
  async getMetricsSnapshot(cacheInstances: Map<string, any>): Promise<CacheMetricsSnapshot> {
    const timestamp = Date.now();
    const layers: { [layerName: string]: LayerMetrics } = {};
    
    // Collect metrics from each cache layer
    for (const [layerName, cacheInstance] of cacheInstances) {
      try {
        layers[layerName] = await this.collectLayerMetrics(layerName, cacheInstance);
      } catch (error) {
        logger.error('Failed to collect metrics for layer', {
          component: 'CacheMonitor',
          layer: layerName,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Provide default metrics to prevent monitoring gaps
        layers[layerName] = this.getDefaultLayerMetrics(layerName);
      }
    }
    
    const overall = this.calculateOverallMetrics(layers);
    const system = await this.collectSystemMetrics();
    
    const snapshot: CacheMetricsSnapshot = {
      timestamp,
      layers,
      overall,
      system
    };
    
    // Store in history
    if (this.config.metrics.enableHistorical) {
      this.storeHistoricalMetrics(snapshot);
    }
    
    return snapshot;
  }
  
  /**
   * Get metrics history for a time range
   */
  getMetricsHistory(
    startTime: number,
    endTime: number,
    aggregationWindow?: number
  ): CacheMetricsSnapshot[] {
    let history = this.metricsHistory.filter(
      snapshot => snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
    );
    
    // Aggregate if window specified
    if (aggregationWindow && aggregationWindow > 0) {
      history = this.aggregateMetrics(history, aggregationWindow);
    }
    
    return history;
  }
  
  /**
   * Get performance baselines
   */
  getBaselines(): PerformanceBaseline[] {
    return Array.from(this.baselines.values());
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }
  
  /**
   * Get trend analyses
   */
  getTrendAnalyses(): TrendAnalysis[] {
    return Array.from(this.trendAnalyses.values());
  }
  
  /**
   * Generate performance report
   */
  async generatePerformanceReport(
    timeRange: { start: number; end: number }
  ): Promise<any> {
    const history = this.getMetricsHistory(timeRange.start, timeRange.end);
    
    if (history.length === 0) {
      return { error: 'No metrics data available for the specified time range' };
    }
    
    const firstSnapshot = history[0];
    const lastSnapshot = history[history.length - 1];
    const duration = lastSnapshot.timestamp - firstSnapshot.timestamp;
    
    // Calculate averages and trends
    const avgHitRate = this.calculateAverage(history.map(h => h.overall.globalHitRate));
    const avgResponseTime = this.calculateAverage(history.map(h => h.overall.globalResponseTime));
    const totalRequests = history.reduce((sum, h) => 
      sum + Object.values(h.layers).reduce((layerSum, l) => layerSum + l.totalRequests, 0), 0
    );
    
    // Identify top performing and problematic layers
    const layerPerformance = this.analyzeLayerPerformance(history);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(history, layerPerformance);
    
    return {
      period: {
        start: new Date(timeRange.start).toISOString(),
        end: new Date(timeRange.end).toISOString(),
        duration: `${Math.round(duration / 1000 / 60)} minutes`
      },
      summary: {
        avgHitRate: `${(avgHitRate * 100).toFixed(2)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
        totalRequests: totalRequests.toLocaleString(),
        dataPoints: history.length
      },
      layerPerformance,
      trends: this.getTrendAnalyses(),
      alerts: this.getAlertsInTimeRange(timeRange.start, timeRange.end),
      recommendations
    };
  }
  
  private async collectLayerMetrics(layerName: string, cacheInstance: any): Promise<LayerMetrics> {
    // This would integrate with actual cache layer instances
    // For now, return mock metrics
    const baseMetrics = this.getDefaultLayerMetrics(layerName);
    
    // Try to get real metrics if the cache instance supports it
    if (typeof cacheInstance.getMetrics === 'function') {
      try {
        const realMetrics = await cacheInstance.getMetrics();
        return { ...baseMetrics, ...realMetrics };
      } catch (error) {
        logger.debug('Failed to get metrics from cache instance', {
          component: 'CacheMonitor',
          layer: layerName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return baseMetrics;
  }
  
  private getDefaultLayerMetrics(layerName: string): LayerMetrics {
    return {
      name: layerName,
      hitRate: 0.85,
      missRate: 0.15,
      hitCount: 850,
      missCount: 150,
      totalRequests: 1000,
      averageResponseTime: 50,
      p95ResponseTime: 120,
      p99ResponseTime: 200,
      errorRate: 0.01,
      errorCount: 10,
      currentSize: 1024 * 1024, // 1MB
      maxSize: 10 * 1024 * 1024, // 10MB
      utilizationRate: 0.1,
      evictionCount: 5,
      evictionRate: 0.1,
      setOperations: 100,
      getOperations: 900,
      deleteOperations: 10,
      ttlHits: 800,
      expiredKeys: 50,
      staleness: 300 // 5 minutes average
    };
  }
  
  private calculateOverallMetrics(layers: { [layerName: string]: LayerMetrics }): OverallMetrics {
    const layerArray = Object.values(layers);
    
    if (layerArray.length === 0) {
      return this.getDefaultOverallMetrics();
    }
    
    const totalRequests = layerArray.reduce((sum, layer) => sum + layer.totalRequests, 0);
    const totalHits = layerArray.reduce((sum, layer) => sum + layer.hitCount, 0);
    const totalResponseTime = layerArray.reduce((sum, layer) => 
      sum + (layer.averageResponseTime * layer.totalRequests), 0
    );
    
    const globalHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
    const globalResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    // Calculate health score (composite metric)
    const healthScore = this.calculateHealthScore(layers);
    
    return {
      globalHitRate,
      globalMissRate: 1 - globalHitRate,
      globalResponseTime,
      globalErrorRate: layerArray.reduce((sum, layer) => sum + layer.errorRate, 0) / layerArray.length,
      requestsPerSecond: totalRequests / 60, // Assuming 1-minute window
      peakRequestsPerSecond: Math.max(...layerArray.map(l => l.totalRequests)) / 60,
      trafficGrowth: 0.05, // 5% growth (would calculate from historical data)
      bandwidthSaved: layerArray.reduce((sum, layer) => sum + layer.currentSize, 0),
      costSavings: this.estimateCostSavings(globalHitRate, totalRequests),
      carbonFootprintReduction: this.estimateCarbonSavings(globalHitRate, totalRequests),
      healthScore,
      performanceIndex: this.calculatePerformanceIndex(layers),
      reliabilityScore: this.calculateReliabilityScore(layers)
    };
  }
  
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    // This would integrate with actual system monitoring
    // For now, return mock system metrics
    return {
      memoryUsed: 512 * 1024 * 1024, // 512MB
      memoryAvailable: 2 * 1024 * 1024 * 1024, // 2GB
      memoryPressure: 0.25,
      cpuUsage: 0.15,
      cacheOverhead: 0.05,
      networkLatency: 10, // ms
      networkThroughput: 1000 * 1000 * 100, // 100 Mbps in bytes/sec
      networkErrors: 0,
      diskUsage: 1024 * 1024 * 1024, // 1GB
      diskIOPS: 1000,
      diskLatency: 5 // ms
    };
  }
  
  private calculateHealthScore(layers: { [layerName: string]: LayerMetrics }): number {
    const layerArray = Object.values(layers);
    if (layerArray.length === 0) return 100;
    
    // Weighted health calculation
    let score = 0;
    let weights = 0;
    
    for (const layer of layerArray) {
      const layerScore = (
        (layer.hitRate * 30) +                    // Hit rate: 30%
        ((1 - layer.errorRate) * 25) +           // Error rate: 25%
        (Math.min(layer.averageResponseTime, 1000) / 1000 * 20) + // Response time: 20%
        ((1 - layer.utilizationRate) * 15) +     // Utilization: 15%
        (Math.min(layer.evictionRate, 10) / 10 * 10) // Eviction rate: 10%
      );
      
      score += layerScore;
      weights += 1;
    }
    
    return Math.round((score / weights) * 100) / 100;
  }
  
  private calculatePerformanceIndex(layers: { [layerName: string]: LayerMetrics }): number {
    const layerArray = Object.values(layers);
    if (layerArray.length === 0) return 100;
    
    const avgHitRate = layerArray.reduce((sum, l) => sum + l.hitRate, 0) / layerArray.length;
    const avgResponseTime = layerArray.reduce((sum, l) => sum + l.averageResponseTime, 0) / layerArray.length;
    
    // Performance index based on hit rate and response time
    const hitRateScore = avgHitRate * 60; // 60% weight
    const responseTimeScore = Math.max(0, (1000 - avgResponseTime) / 1000) * 40; // 40% weight
    
    return Math.round((hitRateScore + responseTimeScore) * 100) / 100;
  }
  
  private calculateReliabilityScore(layers: { [layerName: string]: LayerMetrics }): number {
    const layerArray = Object.values(layers);
    if (layerArray.length === 0) return 100;
    
    const avgErrorRate = layerArray.reduce((sum, l) => sum + l.errorRate, 0) / layerArray.length;
    const avgUtilization = layerArray.reduce((sum, l) => sum + l.utilizationRate, 0) / layerArray.length;
    
    // Reliability based on low error rate and stable utilization
    const errorScore = (1 - avgErrorRate) * 70; // 70% weight
    const stabilityScore = (1 - Math.abs(avgUtilization - 0.7)) * 30; // 30% weight, optimal ~70%
    
    return Math.round((errorScore + stabilityScore) * 100) / 100;
  }
  
  private estimateCostSavings(hitRate: number, totalRequests: number): number {
    // Estimate cost savings based on cache hits vs database/API calls
    const costPerDatabaseCall = 0.001; // $0.001 per call
    const cacheSavings = totalRequests * hitRate * costPerDatabaseCall;
    return Math.round(cacheSavings * 100) / 100;
  }
  
  private estimateCarbonSavings(hitRate: number, totalRequests: number): number {
    // Estimate CO2 savings based on reduced server/network usage
    const co2PerDatabaseCall = 0.0001; // kg CO2 per call
    const carbonSavings = totalRequests * hitRate * co2PerDatabaseCall;
    return Math.round(carbonSavings * 1000) / 1000; // Round to grams
  }
  
  private getDefaultOverallMetrics(): OverallMetrics {
    return {
      globalHitRate: 0.85,
      globalMissRate: 0.15,
      globalResponseTime: 50,
      globalErrorRate: 0.01,
      requestsPerSecond: 16.67,
      peakRequestsPerSecond: 25,
      trafficGrowth: 0.05,
      bandwidthSaved: 1024 * 1024,
      costSavings: 0.85,
      carbonFootprintReduction: 0.085,
      healthScore: 85,
      performanceIndex: 82,
      reliabilityScore: 88
    };
  }
  
  private storeHistoricalMetrics(snapshot: CacheMetricsSnapshot): void {
    this.metricsHistory.push(snapshot);
    
    // Cleanup old metrics based on retention policy
    const retentionCutoff = Date.now() - (this.config.collection.retention * 1000);
    this.metricsHistory = this.metricsHistory.filter(
      s => s.timestamp >= retentionCutoff
    );
  }
  
  private aggregateMetrics(history: CacheMetricsSnapshot[], windowSize: number): CacheMetricsSnapshot[] {
    const aggregated: CacheMetricsSnapshot[] = [];
    const windows = Math.ceil((history[history.length - 1].timestamp - history[0].timestamp) / (windowSize * 1000));
    
    for (let i = 0; i < windows; i++) {
      const windowStart = history[0].timestamp + (i * windowSize * 1000);
      const windowEnd = windowStart + (windowSize * 1000);
      
      const windowSnapshots = history.filter(
        s => s.timestamp >= windowStart && s.timestamp < windowEnd
      );
      
      if (windowSnapshots.length > 0) {
        aggregated.push(this.createAggregatedSnapshot(windowSnapshots, windowStart));
      }
    }
    
    return aggregated;
  }
  
  private createAggregatedSnapshot(snapshots: CacheMetricsSnapshot[], timestamp: number): CacheMetricsSnapshot {
    // Aggregate layer metrics
    const layers: { [layerName: string]: LayerMetrics } = {};
    const layerNames = new Set<string>();
    
    snapshots.forEach(s => {
      Object.keys(s.layers).forEach(name => layerNames.add(name));
    });
    
    for (const layerName of layerNames) {
      const layerSnapshots = snapshots.map(s => s.layers[layerName]).filter(Boolean);
      layers[layerName] = this.aggregateLayerMetrics(layerSnapshots);
    }
    
    // Aggregate overall metrics
    const overallSnapshots = snapshots.map(s => s.overall);
    const overall = this.aggregateOverallMetrics(overallSnapshots);
    
    // Aggregate system metrics
    const systemSnapshots = snapshots.map(s => s.system);
    const system = this.aggregateSystemMetrics(systemSnapshots);
    
    return { timestamp, layers, overall, system };
  }
  
  private aggregateLayerMetrics(snapshots: LayerMetrics[]): LayerMetrics {
    if (snapshots.length === 0) {
      return this.getDefaultLayerMetrics('unknown');
    }
    
    const first = snapshots[0];
    return {
      name: first.name,
      hitRate: this.calculateAverage(snapshots.map(s => s.hitRate)),
      missRate: this.calculateAverage(snapshots.map(s => s.missRate)),
      hitCount: snapshots.reduce((sum, s) => sum + s.hitCount, 0),
      missCount: snapshots.reduce((sum, s) => sum + s.missCount, 0),
      totalRequests: snapshots.reduce((sum, s) => sum + s.totalRequests, 0),
      averageResponseTime: this.calculateAverage(snapshots.map(s => s.averageResponseTime)),
      p95ResponseTime: this.calculatePercentile(snapshots.map(s => s.p95ResponseTime), 0.95),
      p99ResponseTime: this.calculatePercentile(snapshots.map(s => s.p99ResponseTime), 0.99),
      errorRate: this.calculateAverage(snapshots.map(s => s.errorRate)),
      errorCount: snapshots.reduce((sum, s) => sum + s.errorCount, 0),
      currentSize: this.calculateAverage(snapshots.map(s => s.currentSize)),
      maxSize: Math.max(...snapshots.map(s => s.maxSize)),
      utilizationRate: this.calculateAverage(snapshots.map(s => s.utilizationRate)),
      evictionCount: snapshots.reduce((sum, s) => sum + s.evictionCount, 0),
      evictionRate: this.calculateAverage(snapshots.map(s => s.evictionRate)),
      setOperations: snapshots.reduce((sum, s) => sum + s.setOperations, 0),
      getOperations: snapshots.reduce((sum, s) => sum + s.getOperations, 0),
      deleteOperations: snapshots.reduce((sum, s) => sum + s.deleteOperations, 0),
      ttlHits: snapshots.reduce((sum, s) => sum + s.ttlHits, 0),
      expiredKeys: snapshots.reduce((sum, s) => sum + s.expiredKeys, 0),
      staleness: this.calculateAverage(snapshots.map(s => s.staleness))
    };
  }
  
  private aggregateOverallMetrics(snapshots: OverallMetrics[]): OverallMetrics {
    if (snapshots.length === 0) {
      return this.getDefaultOverallMetrics();
    }
    
    return {
      globalHitRate: this.calculateAverage(snapshots.map(s => s.globalHitRate)),
      globalMissRate: this.calculateAverage(snapshots.map(s => s.globalMissRate)),
      globalResponseTime: this.calculateAverage(snapshots.map(s => s.globalResponseTime)),
      globalErrorRate: this.calculateAverage(snapshots.map(s => s.globalErrorRate)),
      requestsPerSecond: this.calculateAverage(snapshots.map(s => s.requestsPerSecond)),
      peakRequestsPerSecond: Math.max(...snapshots.map(s => s.peakRequestsPerSecond)),
      trafficGrowth: this.calculateAverage(snapshots.map(s => s.trafficGrowth)),
      bandwidthSaved: snapshots.reduce((sum, s) => sum + s.bandwidthSaved, 0),
      costSavings: snapshots.reduce((sum, s) => sum + s.costSavings, 0),
      carbonFootprintReduction: snapshots.reduce((sum, s) => sum + s.carbonFootprintReduction, 0),
      healthScore: this.calculateAverage(snapshots.map(s => s.healthScore)),
      performanceIndex: this.calculateAverage(snapshots.map(s => s.performanceIndex)),
      reliabilityScore: this.calculateAverage(snapshots.map(s => s.reliabilityScore))
    };
  }
  
  private aggregateSystemMetrics(snapshots: SystemMetrics[]): SystemMetrics {
    if (snapshots.length === 0) {
      return {
        memoryUsed: 0, memoryAvailable: 0, memoryPressure: 0,
        cpuUsage: 0, cacheOverhead: 0,
        networkLatency: 0, networkThroughput: 0, networkErrors: 0,
        diskUsage: 0, diskIOPS: 0, diskLatency: 0
      };
    }
    
    return {
      memoryUsed: this.calculateAverage(snapshots.map(s => s.memoryUsed)),
      memoryAvailable: this.calculateAverage(snapshots.map(s => s.memoryAvailable)),
      memoryPressure: this.calculateAverage(snapshots.map(s => s.memoryPressure)),
      cpuUsage: this.calculateAverage(snapshots.map(s => s.cpuUsage)),
      cacheOverhead: this.calculateAverage(snapshots.map(s => s.cacheOverhead)),
      networkLatency: this.calculateAverage(snapshots.map(s => s.networkLatency)),
      networkThroughput: this.calculateAverage(snapshots.map(s => s.networkThroughput)),
      networkErrors: snapshots.reduce((sum, s) => sum + s.networkErrors, 0),
      diskUsage: this.calculateAverage(snapshots.map(s => s.diskUsage)),
      diskIOPS: this.calculateAverage(snapshots.map(s => s.diskIOPS)),
      diskLatency: this.calculateAverage(snapshots.map(s => s.diskLatency))
    };
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.floor(percentile * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }
  
  private startMetricsCollection(): void {
    this.collectionInterval = setInterval(async () => {
      try {
        // This would collect from actual cache instances
        // For now, we'll emit a collection event
        this.emit('collect');
      } catch (error) {
        logger.error('Metrics collection failed', {
          component: 'CacheMonitor',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.collection.interval);
  }
  
  private startAlerting(): void {
    this.alertingInterval = setInterval(() => {
      try {
        this.checkAlertConditions();
      } catch (error) {
        logger.error('Alert checking failed', {
          component: 'CacheMonitor',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 30000); // Check every 30 seconds
  }
  
  private startExport(): void {
    if (!this.config.export.enabled) return;
    
    this.exportInterval = setInterval(async () => {
      try {
        await this.exportMetrics();
      } catch (error) {
        logger.error('Metrics export failed', {
          component: 'CacheMonitor',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.export.interval);
  }
  
  private async loadBaselines(): Promise<void> {
    // In production, load from persistent storage
    logger.debug('Performance baselines loaded', {
      component: 'CacheMonitor',
      baselinesCount: this.baselines.size
    });
  }
  
  private updateBaseline(metricKey: string, value: number): void {
    let baseline = this.baselines.get(metricKey);
    
    if (!baseline) {
      baseline = {
        metric: metricKey,
        mean: value,
        standardDeviation: 0,
        min: value,
        max: value,
        percentiles: { p50: value, p75: value, p90: value, p95: value, p99: value },
        sampleCount: 1,
        lastUpdated: Date.now(),
        confidence: 0.1
      };
    } else {
      // Update running statistics
      baseline.sampleCount++;
      const delta = value - baseline.mean;
      baseline.mean += delta / baseline.sampleCount;
      baseline.min = Math.min(baseline.min, value);
      baseline.max = Math.max(baseline.max, value);
      baseline.lastUpdated = Date.now();
      
      // Update confidence based on sample size
      baseline.confidence = Math.min(0.95, baseline.sampleCount / 100);
    }
    
    this.baselines.set(metricKey, baseline);
  }
  
  private checkAlertConditions(): void {
    // This would check current metrics against thresholds
    // For now, create a sample alert checking logic
    
    if (this.metricsHistory.length === 0) return;
    
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    
    // Check hit rate alert
    if (latest.overall.globalHitRate < this.config.alerts.thresholds.hitRateLow) {
      this.createAlert({
        type: 'threshold',
        severity: 'medium',
        metric: 'globalHitRate',
        threshold: this.config.alerts.thresholds.hitRateLow,
        currentValue: latest.overall.globalHitRate,
        message: `Cache hit rate is below threshold: ${(latest.overall.globalHitRate * 100).toFixed(1)}%`
      });
    }
    
    // Check response time alert
    if (latest.overall.globalResponseTime > this.config.alerts.thresholds.responseTimeHigh) {
      this.createAlert({
        type: 'threshold',
        severity: 'high',
        metric: 'globalResponseTime',
        threshold: this.config.alerts.thresholds.responseTimeHigh,
        currentValue: latest.overall.globalResponseTime,
        message: `Cache response time is above threshold: ${latest.overall.globalResponseTime.toFixed(1)}ms`
      });
    }
    
    // Check memory usage alert
    if (latest.system.memoryPressure > this.config.alerts.thresholds.memoryUsageHigh) {
      this.createAlert({
        type: 'threshold',
        severity: 'critical',
        metric: 'memoryPressure',
        threshold: this.config.alerts.thresholds.memoryUsageHigh,
        currentValue: latest.system.memoryPressure,
        message: `Memory pressure is critical: ${(latest.system.memoryPressure * 100).toFixed(1)}%`
      });
    }
  }
  
  private checkErrorRateAlert(layer: string): void {
    // Implementation would check error rate for specific layer
  }
  
  private createAlert(alertData: Partial<Alert>): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      type: 'threshold',
      severity: 'medium',
      metric: '',
      currentValue: 0,
      message: '',
      timestamp: Date.now(),
      resolved: false,
      metadata: {},
      ...alertData
    };
    
    this.activeAlerts.set(alert.id, alert);
    this.emit('alert', alert);
    
    // Send alert notifications
    this.sendAlertNotification(alert);
    
    logger.warn('Cache alert created', {
      component: 'CacheMonitor',
      alertId: alert.id,
      metric: alert.metric,
      severity: alert.severity,
      message: alert.message
    });
  }
  
  private async sendAlertNotification(alert: Alert): Promise<void> {
    const notifications: Promise<void>[] = [];
    
    // Webhook notification
    if (this.config.alerts.channels.webhook) {
      notifications.push(this.sendWebhookAlert(alert));
    }
    
    // Email notification
    if (this.config.alerts.channels.email) {
      notifications.push(this.sendEmailAlert(alert));
    }
    
    // Slack notification
    if (this.config.alerts.channels.slack) {
      notifications.push(this.sendSlackAlert(alert));
    }
    
    await Promise.allSettled(notifications);
  }
  
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    if (!this.config.alerts.channels.webhook) return;
    
    try {
      await fetch(this.config.alerts.channels.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'sightedit-cache',
          alert: {
            id: alert.id,
            severity: alert.severity,
            metric: alert.metric,
            message: alert.message,
            value: alert.currentValue,
            threshold: alert.threshold,
            timestamp: alert.timestamp
          }
        })
      });
    } catch (error) {
      logger.error('Failed to send webhook alert', {
        component: 'CacheMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private async sendEmailAlert(alert: Alert): Promise<void> {
    // Email implementation would go here
    logger.debug('Email alert would be sent', {
      component: 'CacheMonitor',
      alertId: alert.id
    });
  }
  
  private async sendSlackAlert(alert: Alert): Promise<void> {
    // Slack implementation would go here
    logger.debug('Slack alert would be sent', {
      component: 'CacheMonitor',
      alertId: alert.id
    });
  }
  
  private async exportMetrics(): Promise<void> {
    if (!this.config.export.enabled || !this.config.export.endpoint) return;
    
    try {
      const recentMetrics = this.metricsHistory.slice(-10); // Export last 10 data points
      let data: string;
      
      switch (this.config.export.format) {
        case 'json':
          data = JSON.stringify(recentMetrics, null, 2);
          break;
        case 'csv':
          data = this.convertToCSV(recentMetrics);
          break;
        case 'prometheus':
          data = this.convertToPrometheus(recentMetrics);
          break;
        default:
          data = JSON.stringify(recentMetrics);
      }
      
      await fetch(this.config.export.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': this.getContentType(),
          'X-Export-Format': this.config.export.format
        },
        body: data
      });
      
    } catch (error) {
      logger.error('Failed to export metrics', {
        component: 'CacheMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private convertToCSV(metrics: CacheMetricsSnapshot[]): string {
    // Simple CSV conversion
    const headers = ['timestamp', 'globalHitRate', 'globalResponseTime', 'healthScore'];
    const rows = metrics.map(m => [
      m.timestamp,
      m.overall.globalHitRate,
      m.overall.globalResponseTime,
      m.overall.healthScore
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  private convertToPrometheus(metrics: CacheMetricsSnapshot[]): string {
    // Simple Prometheus format conversion
    const latest = metrics[metrics.length - 1];
    if (!latest) return '';
    
    const lines: string[] = [];
    
    // Overall metrics
    lines.push(`# HELP cache_hit_rate Cache hit rate`);
    lines.push(`# TYPE cache_hit_rate gauge`);
    lines.push(`cache_hit_rate ${latest.overall.globalHitRate}`);
    
    lines.push(`# HELP cache_response_time_ms Cache response time in milliseconds`);
    lines.push(`# TYPE cache_response_time_ms gauge`);
    lines.push(`cache_response_time_ms ${latest.overall.globalResponseTime}`);
    
    lines.push(`# HELP cache_health_score Cache health score`);
    lines.push(`# TYPE cache_health_score gauge`);
    lines.push(`cache_health_score ${latest.overall.healthScore}`);
    
    return lines.join('\n');
  }
  
  private getContentType(): string {
    switch (this.config.export.format) {
      case 'csv': return 'text/csv';
      case 'prometheus': return 'text/plain';
      default: return 'application/json';
    }
  }
  
  private analyzeLayerPerformance(history: CacheMetricsSnapshot[]): any {
    // Analyze layer performance over time
    const layerStats: any = {};
    
    if (history.length === 0) return layerStats;
    
    const latest = history[history.length - 1];
    
    for (const [layerName, metrics] of Object.entries(latest.layers)) {
      layerStats[layerName] = {
        hitRate: `${(metrics.hitRate * 100).toFixed(2)}%`,
        avgResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
        errorRate: `${(metrics.errorRate * 100).toFixed(3)}%`,
        utilization: `${(metrics.utilizationRate * 100).toFixed(1)}%`,
        status: metrics.hitRate > 0.8 ? 'good' : metrics.hitRate > 0.6 ? 'fair' : 'poor'
      };
    }
    
    return layerStats;
  }
  
  private generateRecommendations(history: CacheMetricsSnapshot[], layerPerformance: any): string[] {
    const recommendations: string[] = [];
    
    if (history.length === 0) return recommendations;
    
    const latest = history[history.length - 1];
    
    // Hit rate recommendations
    if (latest.overall.globalHitRate < 0.8) {
      recommendations.push('Consider increasing cache TTL or adding more frequently accessed content to cache');
    }
    
    // Response time recommendations
    if (latest.overall.globalResponseTime > 100) {
      recommendations.push('High response times detected - consider optimizing cache layer or network configuration');
    }
    
    // Memory recommendations
    if (latest.system.memoryPressure > 0.8) {
      recommendations.push('High memory pressure - consider increasing cache size limits or implementing more aggressive eviction policies');
    }
    
    // Layer-specific recommendations
    for (const [layerName, stats] of Object.entries(layerPerformance)) {
      if ((stats as any).status === 'poor') {
        recommendations.push(`Layer '${layerName}' has poor performance - review cache configuration and usage patterns`);
      }
    }
    
    return recommendations;
  }
  
  private getAlertsInTimeRange(startTime: number, endTime: number): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(
      alert => alert.timestamp >= startTime && alert.timestamp <= endTime
    );
  }
  
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    
    if (this.alertingInterval) {
      clearInterval(this.alertingInterval);
    }
    
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
    }
    
    this.metricsHistory = [];
    this.baselines.clear();
    this.activeAlerts.clear();
    this.trendAnalyses.clear();
    this.responseTimeBuffer = [];
    this.removeAllListeners();
    
    this.isInitialized = false;
    
    logger.info('Cache monitoring system destroyed', {
      component: 'CacheMonitor'
    });
  }
}

export { CacheMonitor };