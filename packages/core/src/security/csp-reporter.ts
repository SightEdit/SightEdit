/**
 * CSP Violation Reporting and Monitoring System
 */

import { EventEmitter } from '../utils/event-emitter';
import { logger } from '../utils/logger';
import { CSPViolation } from './csp-manager';

export interface CSPReportConfig {
  endpoint?: string;
  maxReports: number;
  reportingWindow: number; // milliseconds
  aggregateReports: boolean;
  enableLocalStorage: boolean;
  enableMetrics: boolean;
  alertThresholds: {
    violationsPerMinute: number;
    uniqueViolationsPerHour: number;
    criticalDirectives: string[];
  };
}

export interface AggregatedViolation {
  violatedDirective: string;
  blockedUri: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  sources: string[];
  userAgents: Set<string>;
  samples: string[];
}

export interface CSPMetrics {
  totalViolations: number;
  uniqueViolations: number;
  violationsByDirective: Record<string, number>;
  violationsBySource: Record<string, number>;
  violationsPerHour: number[];
  topBlockedUris: Array<{ uri: string; count: number }>;
  topViolatedDirectives: Array<{ directive: string; count: number }>;
  browserDistribution: Record<string, number>;
}

export interface CSPAlert {
  type: 'threshold' | 'critical' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: any;
  timestamp: number;
}

export class CSPReporter extends EventEmitter {
  private config: CSPReportConfig;
  private violations: CSPViolation[] = [];
  private aggregatedViolations: Map<string, AggregatedViolation> = new Map();
  private metrics: CSPMetrics = this.initializeMetrics();
  private reportQueue: CSPViolation[] = [];
  private isReporting = false;
  private reportTimer: NodeJS.Timeout | null = null;
  private alertHistory: CSPAlert[] = [];

  constructor(config: Partial<CSPReportConfig> = {}) {
    super();
    this.config = this.mergeWithDefaults(config);
    this.setupReporting();
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(config: Partial<CSPReportConfig>): CSPReportConfig {
    return {
      maxReports: 1000,
      reportingWindow: 60000, // 1 minute
      aggregateReports: true,
      enableLocalStorage: true,
      enableMetrics: true,
      alertThresholds: {
        violationsPerMinute: 10,
        uniqueViolationsPerHour: 5,
        criticalDirectives: ['script-src', 'object-src', 'base-uri']
      },
      ...config
    };
  }

  /**
   * Initialize metrics object
   */
  private initializeMetrics(): CSPMetrics {
    return {
      totalViolations: 0,
      uniqueViolations: 0,
      violationsByDirective: {},
      violationsBySource: {},
      violationsPerHour: new Array(24).fill(0),
      topBlockedUris: [],
      topViolatedDirectives: [],
      browserDistribution: {}
    };
  }

  /**
   * Set up reporting infrastructure
   */
  private setupReporting(): void {
    // Load existing violations from localStorage if enabled
    if (this.config.enableLocalStorage && typeof localStorage !== 'undefined') {
      this.loadStoredViolations();
    }

    // Set up periodic reporting
    if (this.config.endpoint) {
      this.reportTimer = setInterval(() => {
        this.flushReportQueue();
      }, this.config.reportingWindow);
    }

    // Set up metrics calculation
    if (this.config.enableMetrics) {
      setInterval(() => {
        this.updateMetrics();
      }, 300000); // Update metrics every 5 minutes
    }
  }

  /**
   * Report a CSP violation
   */
  reportViolation(violation: CSPViolation): void {
    try {
      // Add to violations array
      this.violations.push(violation);
      
      // Enforce max reports limit
      if (this.violations.length > this.config.maxReports) {
        this.violations = this.violations.slice(-this.config.maxReports);
      }

      // Add to report queue
      this.reportQueue.push(violation);

      // Update aggregated violations
      if (this.config.aggregateReports) {
        this.updateAggregatedViolation(violation);
      }

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateMetricsForViolation(violation);
      }

      // Store in localStorage
      if (this.config.enableLocalStorage) {
        this.storeViolation(violation);
      }

      // Check for alerts
      this.checkAlertThresholds(violation);

      // Emit event
      this.emit('violationReported', violation);

      logger.warn('CSP violation reported', {
        directive: violation.violatedDirective,
        blockedUri: violation.blockedUri,
        sourceFile: violation.sourceFile
      });

    } catch (error) {
      logger.error('Error reporting CSP violation', { error, violation });
    }
  }

  /**
   * Update aggregated violation data
   */
  private updateAggregatedViolation(violation: CSPViolation): void {
    const key = `${violation.violatedDirective}|${violation.blockedUri}`;
    const existing = this.aggregatedViolations.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = violation.timestamp;
      existing.sources.push(violation.sourceFile || 'unknown');
      existing.userAgents.add(violation.userAgent);
      if (violation.sample && existing.samples.length < 5) {
        existing.samples.push(violation.sample);
      }
    } else {
      this.aggregatedViolations.set(key, {
        violatedDirective: violation.violatedDirective,
        blockedUri: violation.blockedUri,
        count: 1,
        firstSeen: violation.timestamp,
        lastSeen: violation.timestamp,
        sources: [violation.sourceFile || 'unknown'],
        userAgents: new Set([violation.userAgent]),
        samples: violation.sample ? [violation.sample] : []
      });
    }
  }

  /**
   * Update metrics for a single violation
   */
  private updateMetricsForViolation(violation: CSPViolation): void {
    this.metrics.totalViolations++;

    // Update by directive
    const directive = violation.violatedDirective;
    this.metrics.violationsByDirective[directive] = 
      (this.metrics.violationsByDirective[directive] || 0) + 1;

    // Update by source
    const source = violation.sourceFile || 'unknown';
    this.metrics.violationsBySource[source] = 
      (this.metrics.violationsBySource[source] || 0) + 1;

    // Update hourly data
    const hour = new Date(violation.timestamp).getHours();
    this.metrics.violationsPerHour[hour]++;

    // Update browser distribution
    const browser = this.extractBrowser(violation.userAgent);
    this.metrics.browserDistribution[browser] = 
      (this.metrics.browserDistribution[browser] || 0) + 1;
  }

  /**
   * Extract browser from user agent
   */
  private extractBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  }

  /**
   * Update comprehensive metrics
   */
  private updateMetrics(): void {
    // Update unique violations count
    this.metrics.uniqueViolations = this.aggregatedViolations.size;

    // Update top blocked URIs
    const uriCounts = new Map<string, number>();
    this.aggregatedViolations.forEach(agg => {
      uriCounts.set(agg.blockedUri, agg.count);
    });
    
    this.metrics.topBlockedUris = Array.from(uriCounts.entries())
      .map(([uri, count]) => ({ uri, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Update top violated directives
    const directiveCounts = new Map<string, number>();
    this.aggregatedViolations.forEach(agg => {
      const current = directiveCounts.get(agg.violatedDirective) || 0;
      directiveCounts.set(agg.violatedDirective, current + agg.count);
    });

    this.metrics.topViolatedDirectives = Array.from(directiveCounts.entries())
      .map(([directive, count]) => ({ directive, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    this.emit('metricsUpdated', this.metrics);
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(violation: CSPViolation): void {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    // Check violations per minute threshold
    const recentViolations = this.violations.filter(v => 
      now - v.timestamp <= oneMinute
    );
    
    if (recentViolations.length >= this.config.alertThresholds.violationsPerMinute) {
      this.createAlert('threshold', 'high', 
        `High violation rate: ${recentViolations.length} violations in the last minute`,
        { violationsPerMinute: recentViolations.length, violations: recentViolations }
      );
    }

    // Check unique violations per hour
    const hourlyViolations = this.violations.filter(v => 
      now - v.timestamp <= oneHour
    );
    
    const uniqueHourlyViolations = new Set(
      hourlyViolations.map(v => `${v.violatedDirective}|${v.blockedUri}`)
    ).size;

    if (uniqueHourlyViolations >= this.config.alertThresholds.uniqueViolationsPerHour) {
      this.createAlert('threshold', 'medium',
        `High unique violation rate: ${uniqueHourlyViolations} unique violations in the last hour`,
        { uniqueViolationsPerHour: uniqueHourlyViolations }
      );
    }

    // Check critical directive violations
    if (this.config.alertThresholds.criticalDirectives.some(dir => 
        violation.violatedDirective.includes(dir)
    )) {
      this.createAlert('critical', 'critical',
        `Critical directive violation: ${violation.violatedDirective}`,
        { violation }
      );
    }

    // Anomaly detection - sudden spike in violations
    if (this.violations.length >= 100) {
      const recent10Min = this.violations.filter(v => 
        now - v.timestamp <= 10 * 60 * 1000
      ).length;
      
      const previous10Min = this.violations.filter(v => 
        now - v.timestamp > 10 * 60 * 1000 && now - v.timestamp <= 20 * 60 * 1000
      ).length;

      if (recent10Min > previous10Min * 3) { // 3x increase
        this.createAlert('anomaly', 'high',
          `Violation spike detected: ${recent10Min} violations in last 10 minutes (vs ${previous10Min} in previous 10 minutes)`,
          { recent10Min, previous10Min }
        );
      }
    }
  }

  /**
   * Create and emit alert
   */
  private createAlert(type: CSPAlert['type'], severity: CSPAlert['severity'], 
                     message: string, data: any): void {
    const alert: CSPAlert = {
      type,
      severity,
      message,
      data,
      timestamp: Date.now()
    };

    this.alertHistory.push(alert);
    
    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    this.emit('alert', alert);
    
    logger.warn(`CSP Alert [${severity.toUpperCase()}]`, {
      type,
      message,
      data: JSON.stringify(data).substring(0, 500)
    });
  }

  /**
   * Flush report queue to endpoint
   */
  private async flushReportQueue(): Promise<void> {
    if (this.isReporting || this.reportQueue.length === 0 || !this.config.endpoint) {
      return;
    }

    this.isReporting = true;
    const reports = [...this.reportQueue];
    this.reportQueue = [];

    try {
      await this.sendReports(reports);
      logger.info(`Sent ${reports.length} CSP violation reports`);
    } catch (error) {
      logger.error('Failed to send CSP reports', { error, reportCount: reports.length });
      
      // Put reports back in queue for retry
      this.reportQueue.unshift(...reports);
      
      // Limit queue size to prevent memory issues
      if (this.reportQueue.length > this.config.maxReports) {
        this.reportQueue = this.reportQueue.slice(-this.config.maxReports);
      }
    } finally {
      this.isReporting = false;
    }
  }

  /**
   * Send reports to endpoint
   */
  private async sendReports(reports: CSPViolation[]): Promise<void> {
    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SightEdit-CSP-Reporter/1.0'
      },
      body: JSON.stringify({
        reports,
        metadata: {
          timestamp: Date.now(),
          reporterVersion: '1.0.0',
          aggregatedData: this.config.aggregateReports ? 
            Array.from(this.aggregatedViolations.values()) : null
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Store violation in localStorage
   */
  private storeViolation(violation: CSPViolation): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const key = 'sightedit-csp-violations';
      const stored = localStorage.getItem(key);
      let violations: CSPViolation[] = stored ? JSON.parse(stored) : [];
      
      violations.push(violation);
      
      // Keep only recent violations (last 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      violations = violations.filter(v => v.timestamp > oneDayAgo);
      
      // Limit storage size
      if (violations.length > 100) {
        violations = violations.slice(-100);
      }
      
      localStorage.setItem(key, JSON.stringify(violations));
    } catch (error) {
      logger.warn('Failed to store CSP violation in localStorage', { error });
    }
  }

  /**
   * Load stored violations from localStorage
   */
  private loadStoredViolations(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const key = 'sightedit-csp-violations';
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const violations: CSPViolation[] = JSON.parse(stored);
        
        // Filter recent violations (last 24 hours)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const recentViolations = violations.filter(v => v.timestamp > oneDayAgo);
        
        this.violations.push(...recentViolations);
        
        // Update aggregated data
        if (this.config.aggregateReports) {
          recentViolations.forEach(v => this.updateAggregatedViolation(v));
        }
        
        logger.info(`Loaded ${recentViolations.length} stored CSP violations`);
      }
    } catch (error) {
      logger.warn('Failed to load stored CSP violations', { error });
    }
  }

  /**
   * Get violation reports with optional filtering
   */
  getViolations(filter?: {
    directive?: string;
    blockedUri?: string;
    timeRange?: { start: number; end: number };
    limit?: number;
  }): CSPViolation[] {
    let filtered = [...this.violations];

    if (filter) {
      if (filter.directive) {
        filtered = filtered.filter(v => 
          v.violatedDirective.includes(filter.directive!)
        );
      }
      
      if (filter.blockedUri) {
        filtered = filtered.filter(v => 
          v.blockedUri.includes(filter.blockedUri!)
        );
      }
      
      if (filter.timeRange) {
        filtered = filtered.filter(v => 
          v.timestamp >= filter.timeRange!.start && 
          v.timestamp <= filter.timeRange!.end
        );
      }
      
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get aggregated violation data
   */
  getAggregatedViolations(): AggregatedViolation[] {
    return Array.from(this.aggregatedViolations.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get current metrics
   */
  getMetrics(): CSPMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit?: number): CSPAlert[] {
    return limit ? 
      this.alertHistory.slice(-limit) : 
      [...this.alertHistory];
  }

  /**
   * Clear all violation data
   */
  clearViolations(): void {
    this.violations = [];
    this.aggregatedViolations.clear();
    this.reportQueue = [];
    this.metrics = this.initializeMetrics();
    this.alertHistory = [];
    
    if (this.config.enableLocalStorage && typeof localStorage !== 'undefined') {
      localStorage.removeItem('sightedit-csp-violations');
    }
    
    this.emit('violationsCleared');
    logger.info('CSP violation data cleared');
  }

  /**
   * Generate violation summary report
   */
  generateReport(): {
    summary: {
      totalViolations: number;
      uniqueViolations: number;
      timeRange: { start: number; end: number };
      topDirectives: Array<{ directive: string; count: number }>;
      topBlockedUris: Array<{ uri: string; count: number }>;
    };
    recommendations: string[];
    criticalIssues: string[];
  } {
    const now = Date.now();
    const oldestViolation = this.violations.length > 0 ? 
      Math.min(...this.violations.map(v => v.timestamp)) : now;

    const topDirectives = this.metrics.topViolatedDirectives.slice(0, 5);
    const topBlockedUris = this.metrics.topBlockedUris.slice(0, 5);
    
    const recommendations: string[] = [];
    const criticalIssues: string[] = [];

    // Generate recommendations based on violation patterns
    topDirectives.forEach(({ directive, count }) => {
      if (directive.includes('script-src')) {
        if (count > 10) {
          criticalIssues.push(`High number of script-src violations (${count}). Review and update script sources.`);
        }
        recommendations.push('Consider using nonces or hashes for inline scripts');
        recommendations.push('Audit all script sources and remove unnecessary ones');
      }
      
      if (directive.includes('style-src')) {
        recommendations.push('Move inline styles to external CSS files');
        recommendations.push('Use CSS-in-JS libraries that support CSP nonces');
      }
      
      if (directive.includes('img-src')) {
        recommendations.push('Review image sources and update img-src directive');
      }
    });

    // Check for blocked URIs that might indicate attacks
    topBlockedUris.forEach(({ uri, count }) => {
      if (uri.includes('javascript:') || uri.includes('data:text/html')) {
        criticalIssues.push(`Potential XSS attempt blocked: ${uri} (${count} times)`);
      }
      
      if (uri.includes('eval') || uri.includes('inline')) {
        recommendations.push('Replace eval() and inline code with safer alternatives');
      }
    });

    return {
      summary: {
        totalViolations: this.metrics.totalViolations,
        uniqueViolations: this.metrics.uniqueViolations,
        timeRange: { start: oldestViolation, end: now },
        topDirectives,
        topBlockedUris
      },
      recommendations: [...new Set(recommendations)], // Remove duplicates
      criticalIssues
    };
  }

  /**
   * Destroy reporter
   */
  destroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    // Flush remaining reports
    if (this.reportQueue.length > 0) {
      this.flushReportQueue().catch(error => {
        logger.warn('Failed to flush reports during destroy', { error });
      });
    }

    this.removeAllListeners();
    logger.info('CSP Reporter destroyed');
  }
}