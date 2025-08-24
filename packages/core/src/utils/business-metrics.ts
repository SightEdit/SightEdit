/**
 * Business Metrics Collection for SightEdit
 * Tracks key business indicators and user behavior analytics
 */

import { telemetry, EventType } from './telemetry';
import { otelMetrics } from './opentelemetry';
import { log } from './logger';

export interface BusinessEvent {
  name: string;
  properties: Record<string, any>;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  value?: number;
  metadata?: Record<string, any>;
}

export interface UserEngagementMetrics {
  sessionDuration: number;
  editorActivations: number;
  saveOperations: number;
  featureUsage: Record<string, number>;
  errorCount: number;
  lastActivity: number;
}

export interface BusinessKPIs {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  averageSessionDuration: number;
  editorActivationRate: number;
  saveSuccessRate: number;
  userRetentionRate: number;
  featureAdoptionRate: Record<string, number>;
  errorRate: number;
  performanceScore: number;
}

/**
 * Business metrics collector for SightEdit
 */
export class BusinessMetrics {
  private static instance: BusinessMetrics;
  private events: BusinessEvent[] = [];
  private userMetrics = new Map<string, UserEngagementMetrics>();
  private sessionMetrics = new Map<string, UserEngagementMetrics>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushInterval = 60000; // 1 minute

  static getInstance(): BusinessMetrics {
    if (!this.instance) {
      this.instance = new BusinessMetrics();
    }
    return this.instance;
  }

  constructor() {
    this.startFlushTimer();
  }

  /**
   * Track editor activation
   */
  trackEditorActivation(editorType: string, userId?: string, sessionId?: string): void {
    this.trackEvent('editor_activation', {
      editor_type: editorType,
      category: 'engagement'
    }, userId, sessionId, 1);

    // Update user metrics
    if (userId) {
      this.updateUserMetric(userId, 'editorActivations', 1);
    }

    // Update session metrics
    if (sessionId) {
      this.updateSessionMetric(sessionId, 'editorActivations', 1);
    }

    // Send to telemetry systems
    telemetry.trackFeatureUse('editor_activation', { editor_type: editorType });
    otelMetrics.recordEditorActivation(editorType, userId);

    log.info('Editor activated', {
      component: 'BusinessMetrics',
      editor_type: editorType,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track save operation
   */
  trackSaveOperation(
    status: 'success' | 'failed',
    editorType: string,
    duration?: number,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent('save_operation', {
      status,
      editor_type: editorType,
      duration,
      category: 'conversion'
    }, userId, sessionId, 1);

    // Update user metrics
    if (userId) {
      this.updateUserMetric(userId, 'saveOperations', 1);
    }

    // Update session metrics
    if (sessionId) {
      this.updateSessionMetric(sessionId, 'saveOperations', 1);
    }

    // Send to telemetry systems
    telemetry.trackBusiness('save_operation', { status, editor_type: editorType, duration });
    otelMetrics.recordSaveOperation(status, editorType, duration, userId);

    log.info('Save operation tracked', {
      component: 'BusinessMetrics',
      status,
      editor_type: editorType,
      duration,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track user session start
   */
  trackSessionStart(userId?: string, sessionId?: string): void {
    if (sessionId) {
      this.sessionMetrics.set(sessionId, {
        sessionDuration: 0,
        editorActivations: 0,
        saveOperations: 0,
        featureUsage: {},
        errorCount: 0,
        lastActivity: Date.now()
      });
    }

    this.trackEvent('session_start', {
      category: 'engagement'
    }, userId, sessionId);

    telemetry.trackUserAction('session_start', { session_id: sessionId });

    log.info('Session started', {
      component: 'BusinessMetrics',
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track user session end
   */
  trackSessionEnd(userId?: string, sessionId?: string): void {
    let sessionDuration = 0;
    
    if (sessionId && this.sessionMetrics.has(sessionId)) {
      const session = this.sessionMetrics.get(sessionId)!;
      sessionDuration = Date.now() - (session.lastActivity - session.sessionDuration);
      session.sessionDuration = sessionDuration;
      
      // Update user metrics
      if (userId) {
        this.updateUserMetric(userId, 'sessionDuration', sessionDuration);
      }
    }

    this.trackEvent('session_end', {
      duration: sessionDuration,
      category: 'engagement'
    }, userId, sessionId, sessionDuration / 1000); // Value in seconds

    telemetry.trackUserAction('session_end', { 
      session_id: sessionId,
      duration: sessionDuration 
    });

    otelMetrics.recordSessionDuration(sessionDuration / 1000, userId);

    log.info('Session ended', {
      component: 'BusinessMetrics',
      user_id: userId,
      session_id: sessionId,
      duration: sessionDuration
    });

    // Clean up session data
    if (sessionId) {
      this.sessionMetrics.delete(sessionId);
    }
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(
    feature: string,
    action: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent('feature_usage', {
      feature,
      action,
      category: 'engagement'
    }, userId, sessionId, 1);

    // Update metrics
    if (userId) {
      const user = this.getUserMetrics(userId);
      user.featureUsage[feature] = (user.featureUsage[feature] || 0) + 1;
    }

    if (sessionId) {
      const session = this.getSessionMetrics(sessionId);
      session.featureUsage[feature] = (session.featureUsage[feature] || 0) + 1;
    }

    telemetry.trackFeatureUse(feature, { action });

    log.debug('Feature usage tracked', {
      component: 'BusinessMetrics',
      feature,
      action,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track error occurrence
   */
  trackError(
    errorType: string,
    errorMessage: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      category: 'quality'
    }, userId, sessionId, 1);

    // Update metrics
    if (userId) {
      this.updateUserMetric(userId, 'errorCount', 1);
    }

    if (sessionId) {
      this.updateSessionMetric(sessionId, 'errorCount', 1);
    }

    telemetry.trackError(errorMessage, { error_type: errorType });

    log.warn('Error tracked in business metrics', {
      component: 'BusinessMetrics',
      error_type: errorType,
      error_message: errorMessage,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track user conversion event
   */
  trackConversion(
    conversionType: string,
    value?: number,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent('conversion', {
      conversion_type: conversionType,
      category: 'business'
    }, userId, sessionId, value);

    telemetry.trackBusiness('conversion', { 
      conversion_type: conversionType, 
      value 
    });

    log.info('Conversion tracked', {
      component: 'BusinessMetrics',
      conversion_type: conversionType,
      value,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Track user retention
   */
  trackRetention(
    userId: string,
    daysActive: number,
    totalDays: number
  ): void {
    const retentionRate = daysActive / totalDays;
    
    this.trackEvent('user_retention', {
      days_active: daysActive,
      total_days: totalDays,
      retention_rate: retentionRate,
      category: 'retention'
    }, userId, undefined, retentionRate);

    telemetry.trackBusiness('user_retention', {
      days_active: daysActive,
      total_days: totalDays,
      retention_rate: retentionRate
    });

    log.info('User retention tracked', {
      component: 'BusinessMetrics',
      user_id: userId,
      days_active: daysActive,
      total_days: totalDays,
      retention_rate: retentionRate
    });
  }

  /**
   * Track A/B test participation
   */
  trackABTest(
    testName: string,
    variant: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.trackEvent('ab_test', {
      test_name: testName,
      variant,
      category: 'experiment'
    }, userId, sessionId);

    telemetry.trackBusiness('ab_test', { 
      test_name: testName, 
      variant 
    });

    log.info('A/B test participation tracked', {
      component: 'BusinessMetrics',
      test_name: testName,
      variant,
      user_id: userId,
      session_id: sessionId
    });
  }

  /**
   * Calculate business KPIs
   */
  calculateKPIs(timeframe: 'day' | 'week' | 'month' = 'day'): BusinessKPIs {
    const now = Date.now();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoffTime = now - timeframeDuration;

    const relevantEvents = this.events.filter(event => event.timestamp >= cutoffTime);
    
    // Calculate unique users
    const uniqueUsers = new Set(
      relevantEvents
        .filter(event => event.userId)
        .map(event => event.userId)
    ).size;

    // Calculate average session duration
    const sessionEvents = relevantEvents.filter(event => event.name === 'session_end');
    const totalDuration = sessionEvents.reduce((sum, event) => 
      sum + (event.properties.duration || 0), 0);
    const averageSessionDuration = sessionEvents.length > 0 
      ? totalDuration / sessionEvents.length 
      : 0;

    // Calculate activation rate
    const totalUsers = new Set(relevantEvents.map(event => event.userId)).size;
    const activeUsers = new Set(
      relevantEvents
        .filter(event => event.name === 'editor_activation')
        .map(event => event.userId)
    ).size;
    const editorActivationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;

    // Calculate save success rate
    const saveEvents = relevantEvents.filter(event => event.name === 'save_operation');
    const successfulSaves = saveEvents.filter(event => 
      event.properties.status === 'success').length;
    const saveSuccessRate = saveEvents.length > 0 
      ? successfulSaves / saveEvents.length 
      : 0;

    // Calculate feature adoption rates
    const featureEvents = relevantEvents.filter(event => event.name === 'feature_usage');
    const featureAdoptionRate: Record<string, number> = {};
    
    const featureUsage = new Map<string, Set<string>>();
    featureEvents.forEach(event => {
      const feature = event.properties.feature;
      if (!featureUsage.has(feature)) {
        featureUsage.set(feature, new Set());
      }
      if (event.userId) {
        featureUsage.get(feature)!.add(event.userId);
      }
    });

    featureUsage.forEach((users, feature) => {
      featureAdoptionRate[feature] = totalUsers > 0 ? users.size / totalUsers : 0;
    });

    // Calculate error rate
    const errorEvents = relevantEvents.filter(event => event.name === 'error_occurred');
    const totalActions = relevantEvents.filter(event => 
      ['editor_activation', 'save_operation', 'feature_usage'].includes(event.name)
    ).length;
    const errorRate = totalActions > 0 ? errorEvents.length / totalActions : 0;

    // Calculate performance score (composite metric)
    const performanceScore = this.calculatePerformanceScore({
      saveSuccessRate,
      errorRate,
      averageSessionDuration,
      editorActivationRate
    });

    return {
      dailyActiveUsers: timeframe === 'day' ? uniqueUsers : 0,
      weeklyActiveUsers: timeframe === 'week' ? uniqueUsers : 0,
      monthlyActiveUsers: timeframe === 'month' ? uniqueUsers : 0,
      averageSessionDuration: averageSessionDuration / 1000, // Convert to seconds
      editorActivationRate,
      saveSuccessRate,
      userRetentionRate: 0, // Would need historical data to calculate
      featureAdoptionRate,
      errorRate,
      performanceScore
    };
  }

  /**
   * Get user engagement metrics
   */
  getUserEngagement(userId: string): UserEngagementMetrics | null {
    return this.userMetrics.get(userId) || null;
  }

  /**
   * Get session metrics
   */
  getSessionEngagement(sessionId: string): UserEngagementMetrics | null {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * Export business metrics data
   */
  exportMetrics(): {
    events: BusinessEvent[];
    userMetrics: Record<string, UserEngagementMetrics>;
    sessionMetrics: Record<string, UserEngagementMetrics>;
    kpis: BusinessKPIs;
  } {
    return {
      events: [...this.events],
      userMetrics: Object.fromEntries(this.userMetrics),
      sessionMetrics: Object.fromEntries(this.sessionMetrics),
      kpis: this.calculateKPIs()
    };
  }

  private trackEvent(
    name: string,
    properties: Record<string, any>,
    userId?: string,
    sessionId?: string,
    value?: number
  ): void {
    const event: BusinessEvent = {
      name,
      properties,
      userId,
      sessionId,
      timestamp: Date.now(),
      value,
      metadata: {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      }
    };

    this.events.push(event);

    // Limit event history to prevent memory issues
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }
  }

  private updateUserMetric(userId: string, metric: keyof UserEngagementMetrics, value: number): void {
    const user = this.getUserMetrics(userId);
    if (typeof user[metric] === 'number') {
      (user[metric] as number) += value;
    }
    user.lastActivity = Date.now();
  }

  private updateSessionMetric(sessionId: string, metric: keyof UserEngagementMetrics, value: number): void {
    const session = this.getSessionMetrics(sessionId);
    if (typeof session[metric] === 'number') {
      (session[metric] as number) += value;
    }
    session.lastActivity = Date.now();
  }

  private getUserMetrics(userId: string): UserEngagementMetrics {
    if (!this.userMetrics.has(userId)) {
      this.userMetrics.set(userId, {
        sessionDuration: 0,
        editorActivations: 0,
        saveOperations: 0,
        featureUsage: {},
        errorCount: 0,
        lastActivity: Date.now()
      });
    }
    return this.userMetrics.get(userId)!;
  }

  private getSessionMetrics(sessionId: string): UserEngagementMetrics {
    if (!this.sessionMetrics.has(sessionId)) {
      this.sessionMetrics.set(sessionId, {
        sessionDuration: 0,
        editorActivations: 0,
        saveOperations: 0,
        featureUsage: {},
        errorCount: 0,
        lastActivity: Date.now()
      });
    }
    return this.sessionMetrics.get(sessionId)!;
  }

  private getTimeframeDuration(timeframe: 'day' | 'week' | 'month'): number {
    switch (timeframe) {
      case 'day':
        return 24 * 60 * 60 * 1000; // 24 hours
      case 'week':
        return 7 * 24 * 60 * 60 * 1000; // 7 days
      case 'month':
        return 30 * 24 * 60 * 60 * 1000; // 30 days
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  private calculatePerformanceScore(metrics: {
    saveSuccessRate: number;
    errorRate: number;
    averageSessionDuration: number;
    editorActivationRate: number;
  }): number {
    // Weighted composite score (0-100)
    const weights = {
      saveSuccessRate: 0.3,
      errorRate: 0.2, // Inverted - lower is better
      sessionDuration: 0.25,
      activationRate: 0.25
    };

    const normalizedSessionDuration = Math.min(metrics.averageSessionDuration / 300000, 1); // Normalize to 5 min max
    
    const score = (
      metrics.saveSuccessRate * weights.saveSuccessRate +
      (1 - metrics.errorRate) * weights.errorRate +
      normalizedSessionDuration * weights.sessionDuration +
      metrics.editorActivationRate * weights.activationRate
    ) * 100;

    return Math.round(score);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.flushInterval);
  }

  private flushMetrics(): void {
    // In a real implementation, this would send metrics to external systems
    log.debug('Business metrics flushed', {
      component: 'BusinessMetrics',
      eventCount: this.events.length,
      userCount: this.userMetrics.size,
      sessionCount: this.sessionMetrics.size
    });
  }
}

// Singleton instance
export const businessMetrics = BusinessMetrics.getInstance();

// Convenience functions
export const trackBusiness = {
  editorActivation: (editorType: string, userId?: string, sessionId?: string) =>
    businessMetrics.trackEditorActivation(editorType, userId, sessionId),
    
  saveOperation: (status: 'success' | 'failed', editorType: string, duration?: number, userId?: string, sessionId?: string) =>
    businessMetrics.trackSaveOperation(status, editorType, duration, userId, sessionId),
    
  sessionStart: (userId?: string, sessionId?: string) =>
    businessMetrics.trackSessionStart(userId, sessionId),
    
  sessionEnd: (userId?: string, sessionId?: string) =>
    businessMetrics.trackSessionEnd(userId, sessionId),
    
  featureUsage: (feature: string, action: string, userId?: string, sessionId?: string) =>
    businessMetrics.trackFeatureUsage(feature, action, userId, sessionId),
    
  error: (errorType: string, errorMessage: string, userId?: string, sessionId?: string) =>
    businessMetrics.trackError(errorType, errorMessage, userId, sessionId),
    
  conversion: (conversionType: string, value?: number, userId?: string, sessionId?: string) =>
    businessMetrics.trackConversion(conversionType, value, userId, sessionId),
    
  retention: (userId: string, daysActive: number, totalDays: number) =>
    businessMetrics.trackRetention(userId, daysActive, totalDays),
    
  abTest: (testName: string, variant: string, userId?: string, sessionId?: string) =>
    businessMetrics.trackABTest(testName, variant, userId, sessionId)
};