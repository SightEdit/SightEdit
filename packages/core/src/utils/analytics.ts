import { EventEmitter } from './event-emitter';
import { SafeJSONParser } from './safe-json';

export interface AnalyticsEvent {
  type: string;
  action: string;
  category: string;
  label?: string;
  value?: number;
  properties?: Record<string, any>;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

export interface UserSession {
  id: string;
  userId?: string;
  startTime: number;
  lastActivity: number;
  pageViews: number;
  editActions: number;
  saveActions: number;
  errorCount: number;
  userAgent: string;
  referrer: string;
  page: string;
}

export interface AnalyticsMetrics {
  totalEvents: number;
  uniqueSessions: number;
  avgSessionDuration: number;
  topEditorTypes: Record<string, number>;
  saveSuccessRate: number;
  errorRate: number;
  performanceMetrics: {
    avgLoadTime: number;
    avgSaveTime: number;
    avgResponseTime: number;
  };
}

export interface AnalyticsConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  batchSize: number;
  flushInterval: number;
  sessionTimeout: number;
  trackPerformance: boolean;
  trackErrors: boolean;
  trackUserBehavior: boolean;
  anonymizeData: boolean;
  debug: boolean;
}

export class AnalyticsTracker extends EventEmitter {
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private session: UserSession;
  private flushTimer?: NodeJS.Timeout;
  private performanceObserver?: PerformanceObserver;
  private lastFlush = Date.now();

  constructor(config: Partial<AnalyticsConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      batchSize: 50,
      flushInterval: 30000, // 30 seconds
      sessionTimeout: 1800000, // 30 minutes
      trackPerformance: true,
      trackErrors: true,
      trackUserBehavior: true,
      anonymizeData: false,
      debug: false,
      ...config
    };

    this.session = this.createSession();
    this.init();
  }

  private init(): void {
    if (!this.config.enabled) return;

    this.setupEventListeners();
    this.setupPerformanceTracking();
    this.startFlushTimer();
    this.trackPageView();

    // Track initial session
    this.track('session', 'start', 'user');
  }

  private createSession(): UserSession {
    const existingSession = this.getStoredSession();
    const now = Date.now();

    // Resume existing session if within timeout
    if (existingSession && (now - existingSession.lastActivity) < this.config.sessionTimeout) {
      existingSession.lastActivity = now;
      this.storeSession(existingSession);
      return existingSession;
    }

    // Create new session
    const session: UserSession = {
      id: this.generateSessionId(),
      userId: this.getUserId(),
      startTime: now,
      lastActivity: now,
      pageViews: 0,
      editActions: 0,
      saveActions: 0,
      errorCount: 0,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      page: window.location.pathname
    };

    this.storeSession(session);
    return session;
  }

  private setupEventListeners(): void {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.track('session', 'blur', 'user');
        this.flush(); // Ensure events are sent before page becomes inactive
      } else {
        this.track('session', 'focus', 'user');
        this.updateSessionActivity();
      }
    });

    // Track beforeunload for session end
    window.addEventListener('beforeunload', () => {
      this.track('session', 'end', 'user', undefined, {
        duration: Date.now() - this.session.startTime
      });
      this.flush(true); // Synchronous flush
    });

    // Track errors if enabled
    if (this.config.trackErrors) {
      window.addEventListener('error', (event) => {
        this.trackError(event.error, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.trackError(event.reason, {
          type: 'unhandled_promise_rejection'
        });
      });
    }
  }

  private setupPerformanceTracking(): void {
    if (!this.config.trackPerformance) return;

    // Track navigation timing
    if ('performance' in window && 'getEntriesByType' in performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.track('performance', 'page_load', 'timing', navigation.loadEventEnd - navigation.navigationStart, {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
          firstPaint: this.getFirstPaint(),
          firstContentfulPaint: this.getFirstContentfulPaint()
        });
      }
    }

    // Setup performance observer for ongoing metrics
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure' || entry.entryType === 'navigation') {
            this.track('performance', entry.name, 'timing', entry.duration, {
              entryType: entry.entryType,
              startTime: entry.startTime
            });
          }
        }
      });

      try {
        this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
      } catch (e) {
        // Performance observer not supported for these entry types
      }
    }
  }

  track(
    type: string,
    action: string,
    category: string,
    value?: number,
    properties?: Record<string, any>
  ): void {
    if (!this.config.enabled) return;

    const event: AnalyticsEvent = {
      type,
      action,
      category,
      label: properties?.label,
      value,
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now(),
      sessionId: this.session.id,
      userId: this.config.anonymizeData ? undefined : this.session.userId
    };

    this.eventQueue.push(event);
    this.updateSessionActivity();
    this.updateSessionCounters(event);

    this.emit('tracked', event);

    if (this.config.debug) {
      console.log('Analytics tracked:', event);
    }

    // Auto-flush if queue is full
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  trackPageView(page?: string): void {
    const currentPage = page || window.location.pathname;
    this.session.pageViews++;
    this.session.page = currentPage;
    this.storeSession(this.session);

    this.track('page', 'view', 'navigation', undefined, {
      page: currentPage,
      title: document.title,
      referrer: document.referrer
    });
  }

  trackEditAction(editorType: string, sight: string, action: 'start' | 'change' | 'save' | 'cancel'): void {
    this.session.editActions++;
    
    if (action === 'save') {
      this.session.saveActions++;
    }

    this.track('editor', action, editorType, undefined, {
      sight,
      editorType
    });
  }

  trackSaveOperation(sight: string, success: boolean, duration: number, editorType?: string): void {
    this.track('save', success ? 'success' : 'failure', 'operation', duration, {
      sight,
      editorType,
      success
    });

    // Update session save counter
    if (success) {
      this.session.saveActions++;
    } else {
      this.session.errorCount++;
    }

    this.storeSession(this.session);
  }

  trackError(error: Error | any, context?: Record<string, any>): void {
    this.session.errorCount++;
    
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : { message: String(error) };

    this.track('error', 'exception', 'javascript', undefined, {
      ...errorData,
      ...context,
      url: window.location.href,
      userAgent: navigator.userAgent
    });
  }

  trackTiming(name: string, duration: number, category = 'timing'): void {
    this.track('timing', name, category, duration);
  }

  trackUserAction(action: string, target: string, properties?: Record<string, any>): void {
    if (!this.config.trackUserBehavior) return;

    this.track('user', action, 'interaction', undefined, {
      target,
      ...properties
    });
  }

  private updateSessionActivity(): void {
    this.session.lastActivity = Date.now();
    this.storeSession(this.session);
  }

  private updateSessionCounters(event: AnalyticsEvent): void {
    if (event.category === 'editor') {
      this.session.editActions++;
    } else if (event.type === 'save' && event.action === 'success') {
      this.session.saveActions++;
    } else if (event.type === 'error') {
      this.session.errorCount++;
    }

    this.storeSession(this.session);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  async flush(synchronous = false): Promise<void> {
    if (!this.config.enabled || this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];
    this.lastFlush = Date.now();

    this.emit('flushing', { eventCount: events.length });

    try {
      if (this.config.endpoint) {
        await this.sendToEndpoint(events, synchronous);
      } else {
        // Store locally if no endpoint configured
        this.storeEvents(events);
      }

      this.emit('flushed', { eventCount: events.length });
    } catch (error) {
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
      this.emit('flushError', { error, eventCount: events.length });
      
      if (this.config.debug) {
        console.error('Analytics flush failed:', error);
      }
    }
  }

  private async sendToEndpoint(events: AnalyticsEvent[], synchronous: boolean): Promise<void> {
    const payload = {
      events,
      session: this.session,
      timestamp: Date.now()
    };

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey })
      },
      body: JSON.stringify(payload)
    };

    if (synchronous && 'sendBeacon' in navigator) {
      // Use sendBeacon for synchronous requests (e.g., on page unload)
      const success = navigator.sendBeacon(
        this.config.endpoint!,
        JSON.stringify(payload)
      );
      
      if (!success) {
        throw new Error('sendBeacon failed');
      }
    } else {
      const response = await fetch(this.config.endpoint!, requestOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }
  }

  private storeEvents(events: AnalyticsEvent[]): void {
    try {
      const key = `sightedit_analytics_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(events));
      
      // Clean up old stored events (keep last 10)
      const keys = Object.keys(localStorage)
        .filter(key => key.startsWith('sightedit_analytics_'))
        .sort()
        .slice(0, -10);
        
      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      // Storage failed, events will be lost
      if (this.config.debug) {
        console.warn('Failed to store analytics events:', error);
      }
    }
  }

  private sanitizeProperties(properties?: Record<string, any>): Record<string, any> | undefined {
    if (!properties) return undefined;

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (this.config.anonymizeData) {
        // Skip potentially sensitive data
        const sensitiveKeys = ['email', 'password', 'token', 'secret', 'key'];
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          continue;
        }
      }

      // Sanitize value
      if (value === null || value === undefined) {
        sanitized[key] = null;
      } else if (typeof value === 'object') {
        sanitized[key] = '[Object]';
      } else if (typeof value === 'function') {
        sanitized[key] = '[Function]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private generateSessionId(): string {
    return 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private getUserId(): string | undefined {
    // Try to get user ID from various sources
    const sources = [
      () => localStorage.getItem('user_id'),
      () => localStorage.getItem('userId'),
      () => sessionStorage.getItem('user_id'),
      () => document.querySelector('meta[name="user-id"]')?.getAttribute('content'),
      () => (window as any).currentUserId
    ];

    for (const source of sources) {
      try {
        const id = source();
        if (id) return id;
      } catch (e) {
        // Source failed, try next
      }
    }

    return undefined;
  }

  private getStoredSession(): UserSession | null {
    try {
      const stored = localStorage.getItem('sightedit_session');
      return stored ? SafeJSONParser.tryParse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  private storeSession(session: UserSession): void {
    try {
      localStorage.setItem('sightedit_session', JSON.stringify(session));
    } catch (error) {
      // Storage failed, session will be lost on refresh
    }
  }

  private getFirstPaint(): number | undefined {
    if ('performance' in window) {
      const paintEntries = performance.getEntriesByType('paint');
      const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
      return firstPaint?.startTime;
    }
    return undefined;
  }

  private getFirstContentfulPaint(): number | undefined {
    if ('performance' in window) {
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      return fcp?.startTime;
    }
    return undefined;
  }

  getMetrics(): AnalyticsMetrics {
    const storedEvents = this.getStoredEvents();
    const allEvents = [...this.eventQueue, ...storedEvents];

    const sessions = new Set(allEvents.map(e => e.sessionId));
    const editEvents = allEvents.filter(e => e.category === 'editor');
    const saveEvents = allEvents.filter(e => e.type === 'save');
    const errorEvents = allEvents.filter(e => e.type === 'error');
    const timingEvents = allEvents.filter(e => e.category === 'timing');

    // Calculate editor type usage
    const editorTypes: Record<string, number> = {};
    editEvents.forEach(event => {
      const type = event.properties?.editorType || event.category;
      editorTypes[type] = (editorTypes[type] || 0) + 1;
    });

    // Calculate success rates
    const successfulSaves = saveEvents.filter(e => e.action === 'success').length;
    const totalSaves = saveEvents.length;
    const saveSuccessRate = totalSaves > 0 ? (successfulSaves / totalSaves) * 100 : 0;

    // Calculate error rate
    const totalEvents = allEvents.length;
    const errorRate = totalEvents > 0 ? (errorEvents.length / totalEvents) * 100 : 0;

    // Calculate performance metrics
    const loadTimeEvents = timingEvents.filter(e => e.action === 'page_load');
    const saveTimeEvents = saveEvents.filter(e => e.value);
    const responseTimeEvents = timingEvents.filter(e => e.action.includes('response'));

    const avgLoadTime = this.calculateAverage(loadTimeEvents.map(e => e.value!));
    const avgSaveTime = this.calculateAverage(saveTimeEvents.map(e => e.value!));
    const avgResponseTime = this.calculateAverage(responseTimeEvents.map(e => e.value!));

    return {
      totalEvents: allEvents.length,
      uniqueSessions: sessions.size,
      avgSessionDuration: Date.now() - this.session.startTime,
      topEditorTypes: editorTypes,
      saveSuccessRate: Math.round(saveSuccessRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      performanceMetrics: {
        avgLoadTime: Math.round(avgLoadTime),
        avgSaveTime: Math.round(avgSaveTime),
        avgResponseTime: Math.round(avgResponseTime)
      }
    };
  }

  private getStoredEvents(): AnalyticsEvent[] {
    const events: AnalyticsEvent[] = [];
    
    try {
      const keys = Object.keys(localStorage)
        .filter(key => key.startsWith('sightedit_analytics_'));
        
      for (const key of keys) {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsedEvents = SafeJSONParser.tryParse(stored);
          if (Array.isArray(parsedEvents)) {
            events.push(...parsedEvents);
          }
        }
      }
    } catch (error) {
      // Failed to load stored events
    }
    
    return events;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  exportData(): string {
    const data = {
      session: this.session,
      queuedEvents: this.eventQueue,
      storedEvents: this.getStoredEvents(),
      metrics: this.getMetrics(),
      config: {
        ...this.config,
        apiKey: this.config.apiKey ? '[REDACTED]' : undefined
      }
    };
    
    return JSON.stringify(data, null, 2);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    // Final flush
    this.flush(true);
    
    this.removeAllListeners();
  }
}

// Create global analytics instance
export const analytics = new AnalyticsTracker();