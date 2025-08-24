/**
 * Telemetry and analytics tracking system for monitoring usage and performance
 */

import { log } from './logger';
import { sentry } from './sentry-integration';

export enum EventType {
  PAGE_VIEW = 'page_view',
  USER_ACTION = 'user_action',
  PERFORMANCE = 'performance',
  ERROR = 'error',
  FEATURE_USE = 'feature_use',
  SYSTEM = 'system',
  BUSINESS = 'business',
  SECURITY = 'security'
}

export interface TelemetryEvent {
  type: EventType;
  name: string;
  properties: Record<string, any>;
  timestamp: number;
  sessionId: string;
  userId?: string;
  version: string;
  environment: string;
  userAgent?: string;
  url?: string;
  referrer?: string;
  viewport?: { width: number; height: number };
  correlationId?: string;
}

export interface SessionData {
  id: string;
  startTime: number;
  lastActivity: number;
  pageViews: number;
  events: number;
  errors: number;
  userId?: string;
  userAgent: string;
  initialUrl: string;
  initialReferrer: string;
  country?: string;
  region?: string;
  city?: string;
}

export interface UserProfile {
  id: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalPageViews: number;
  totalEvents: number;
  averageSessionDuration: number;
  favoriteFeatures: string[];
  deviceInfo: {
    type: 'desktop' | 'tablet' | 'mobile';
    os: string;
    browser: string;
  };
  preferences: Record<string, any>;
}

export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  sessionTimeout: number; // ms
  batchSize: number;
  flushInterval: number; // ms
  enablePerformanceTracking: boolean;
  enableErrorTracking: boolean;
  enableUserTracking: boolean;
  enableDebugMode: boolean;
  privacyMode: boolean; // Don't collect PII
  allowedEvents?: EventType[];
  blockedEvents?: EventType[];
  customProperties?: Record<string, any>;
  consentRequired: boolean;
  consentGranted?: boolean;
}

/**
 * Comprehensive telemetry system for analytics and monitoring
 */
export class TelemetrySystem {
  private static instance: TelemetrySystem;
  private config: TelemetryConfig;
  private eventQueue: TelemetryEvent[] = [];
  private session: SessionData;
  private user: UserProfile | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  private lastActivity = Date.now();
  private pageStartTime = Date.now();
  private isInitialized = false;

  static getInstance(): TelemetrySystem {
    if (!this.instance) {
      this.instance = new TelemetrySystem();
    }
    return this.instance;
  }

  /**
   * Initialize telemetry system
   */
  init(config: Partial<TelemetryConfig>): void {
    this.config = {
      enabled: true,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      batchSize: 20,
      flushInterval: 10000, // 10 seconds
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableUserTracking: true,
      enableDebugMode: false,
      privacyMode: false,
      consentRequired: false,
      consentGranted: false,
      ...config
    };

    if (!this.config.enabled) {
      log.info('Telemetry system disabled');
      return;
    }

    if (this.config.consentRequired && !this.config.consentGranted) {
      log.info('Telemetry system waiting for user consent');
      return;
    }

    this.initializeSession();
    this.loadUserProfile();
    this.setupEventListeners();
    this.setupPerformanceTracking();
    this.startFlushTimer();

    this.isInitialized = true;

    // Track initialization
    this.track(EventType.SYSTEM, 'telemetry_initialized', {
      version: this.getVersion(),
      environment: this.getEnvironment()
    });

    log.info('Telemetry system initialized', {
      component: 'TelemetrySystem',
      sessionId: this.session.id
    });
  }

  /**
   * Grant user consent for telemetry
   */
  grantConsent(): void {
    this.config.consentGranted = true;
    
    if (!this.isInitialized && this.config.enabled) {
      this.init(this.config);
    }

    this.track(EventType.SYSTEM, 'consent_granted', {
      timestamp: Date.now()
    });
  }

  /**
   * Revoke user consent
   */
  revokeConsent(): void {
    this.config.consentGranted = false;
    this.clearStoredData();
    this.stopTracking();

    log.info('Telemetry consent revoked', {
      component: 'TelemetrySystem'
    });
  }

  /**
   * Track an event
   */
  track(type: EventType, name: string, properties: Record<string, any> = {}): void {
    if (!this.shouldTrackEvent(type)) {
      return;
    }

    const event: TelemetryEvent = {
      type,
      name,
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now(),
      sessionId: this.session.id,
      userId: this.user?.id,
      version: this.getVersion(),
      environment: this.getEnvironment(),
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      referrer: this.getReferrer(),
      viewport: this.getViewport(),
      correlationId: properties.correlationId
    };

    this.eventQueue.push(event);
    this.updateSession();

    // Flush immediately for critical events
    if (type === EventType.ERROR || type === EventType.SECURITY) {
      this.flush();
    }

    // Auto-flush if queue is full
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }

    if (this.config.enableDebugMode) {
      log.debug('Telemetry event tracked', {
        component: 'TelemetrySystem',
        type,
        name,
        properties: event.properties
      });
    }
  }

  /**
   * Track user action
   */
  trackUserAction(action: string, properties: Record<string, any> = {}): void {
    this.track(EventType.USER_ACTION, action, {
      ...properties,
      category: 'user_interaction'
    });
  }

  /**
   * Track page view
   */
  trackPageView(url?: string, properties: Record<string, any> = {}): void {
    const pageUrl = url || this.getCurrentUrl();
    const pageTitle = typeof document !== 'undefined' ? document.title : '';

    this.track(EventType.PAGE_VIEW, 'page_viewed', {
      url: pageUrl,
      title: pageTitle,
      referrer: this.getReferrer(),
      ...properties
    });

    this.session.pageViews++;
    this.pageStartTime = Date.now();
  }

  /**
   * Track performance metric
   */
  trackPerformance(name: string, duration: number, properties: Record<string, any> = {}): void {
    if (!this.config.enablePerformanceTracking) return;

    this.track(EventType.PERFORMANCE, name, {
      duration,
      ...properties,
      category: 'performance'
    });

    // Also send to performance monitoring service
    if (typeof window !== 'undefined' && (window as any).performance?.mark) {
      (window as any).performance.mark(`sightedit_${name}`);
    }
  }

  /**
   * Track error
   */
  trackError(error: Error | string, properties: Record<string, any> = {}): void {
    if (!this.config.enableErrorTracking) return;

    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'object' ? error.stack : undefined;

    this.track(EventType.ERROR, 'error_occurred', {
      message: errorMessage,
      stack: this.config.privacyMode ? undefined : errorStack,
      ...properties,
      category: 'error'
    });

    this.session.errors++;
  }

  /**
   * Track feature usage
   */
  trackFeatureUse(feature: string, properties: Record<string, any> = {}): void {
    this.track(EventType.FEATURE_USE, 'feature_used', {
      feature,
      ...properties,
      category: 'feature_usage'
    });

    // Update user profile
    if (this.user) {
      if (!this.user.favoriteFeatures.includes(feature)) {
        this.user.favoriteFeatures.push(feature);
        // Keep only top 10 features
        if (this.user.favoriteFeatures.length > 10) {
          this.user.favoriteFeatures = this.user.favoriteFeatures.slice(-10);
        }
      }
    }
  }

  /**
   * Track business event
   */
  trackBusiness(event: string, properties: Record<string, any> = {}): void {
    this.track(EventType.BUSINESS, event, {
      ...properties,
      category: 'business'
    });
  }

  /**
   * Set user ID
   */
  setUserId(userId: string): void {
    if (!this.config.enableUserTracking) return;

    if (this.user) {
      this.user.id = userId;
    } else {
      this.user = this.createUserProfile(userId);
    }

    this.session.userId = userId;
    this.saveUserProfile();

    this.track(EventType.SYSTEM, 'user_identified', {
      userId
    });
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>): void {
    if (!this.config.enableUserTracking || !this.user) return;

    this.user.preferences = {
      ...this.user.preferences,
      ...this.sanitizeProperties(properties)
    };

    this.saveUserProfile();
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string): () => void {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      this.trackPerformance(name, duration);
    };
  }

  /**
   * Flush events to server
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0);
    
    try {
      await this.sendEvents(events);
      
      log.debug('Telemetry events flushed', {
        component: 'TelemetrySystem',
        eventCount: events.length
      });
    } catch (error) {
      // Put events back in queue for retry
      this.eventQueue.unshift(...events);
      
      log.error('Failed to flush telemetry events', {
        component: 'TelemetrySystem',
        error: (error as Error).message,
        eventCount: events.length
      });
    }
  }

  /**
   * Get current session data
   */
  getSession(): SessionData {
    return { ...this.session };
  }

  /**
   * Get user profile
   */
  getUser(): UserProfile | null {
    return this.user ? { ...this.user } : null;
  }

  /**
   * Get telemetry statistics
   */
  getStats(): {
    queueSize: number;
    sessionDuration: number;
    eventsTracked: number;
    errorsTracked: number;
    lastActivity: number;
  } {
    return {
      queueSize: this.eventQueue.length,
      sessionDuration: Date.now() - this.session.startTime,
      eventsTracked: this.session.events,
      errorsTracked: this.session.errors,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Export telemetry data
   */
  exportData(): {
    session: SessionData;
    user: UserProfile | null;
    queuedEvents: TelemetryEvent[];
    stats: ReturnType<TelemetrySystem['getStats']>;
  } {
    return {
      session: this.getSession(),
      user: this.getUser(),
      queuedEvents: [...this.eventQueue],
      stats: this.getStats()
    };
  }

  private shouldTrackEvent(type: EventType): boolean {
    if (!this.config.enabled || !this.isInitialized) return false;
    if (this.config.consentRequired && !this.config.consentGranted) return false;
    if (this.config.allowedEvents && !this.config.allowedEvents.includes(type)) return false;
    if (this.config.blockedEvents && this.config.blockedEvents.includes(type)) return false;
    return true;
  }

  private initializeSession(): void {
    this.session = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      lastActivity: Date.now(),
      pageViews: 0,
      events: 0,
      errors: 0,
      userAgent: this.getUserAgent(),
      initialUrl: this.getCurrentUrl(),
      initialReferrer: this.getReferrer()
    };

    // Try to get geolocation (if available)
    this.getGeolocation().then(geo => {
      if (geo) {
        this.session.country = geo.country;
        this.session.region = geo.region;
        this.session.city = geo.city;
      }
    });
  }

  private loadUserProfile(): void {
    if (!this.config.enableUserTracking) return;

    try {
      const stored = localStorage.getItem('sightedit_user_profile');
      if (stored) {
        this.user = JSON.parse(stored);
        if (this.user) {
          this.user.lastSeen = Date.now();
          this.user.totalSessions++;
        }
      }
    } catch (error) {
      log.warn('Failed to load user profile', {
        component: 'TelemetrySystem',
        error: (error as Error).message
      });
    }
  }

  private saveUserProfile(): void {
    if (!this.user || !this.config.enableUserTracking) return;

    try {
      localStorage.setItem('sightedit_user_profile', JSON.stringify(this.user));
    } catch (error) {
      log.warn('Failed to save user profile', {
        component: 'TelemetrySystem',
        error: (error as Error).message
      });
    }
  }

  private createUserProfile(userId: string): UserProfile {
    return {
      id: userId,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      totalSessions: 1,
      totalPageViews: 0,
      totalEvents: 0,
      averageSessionDuration: 0,
      favoriteFeatures: [],
      deviceInfo: {
        type: this.getDeviceType(),
        os: this.getOS(),
        browser: this.getBrowser()
      },
      preferences: {}
    };
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.track(EventType.USER_ACTION, 'page_hidden', {
          duration: Date.now() - this.pageStartTime
        });
      } else {
        this.track(EventType.USER_ACTION, 'page_visible');
        this.pageStartTime = Date.now();
      }
    });

    // Track user activity
    ['click', 'keydown', 'scroll', 'mousemove'].forEach(event => {
      document.addEventListener(event, this.updateActivity.bind(this), {
        passive: true,
        capture: true
      });
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.track(EventType.USER_ACTION, 'page_unload', {
        duration: Date.now() - this.pageStartTime
      });
      this.flush(); // Try to send final events
    });
  }

  private setupPerformanceTracking(): void {
    if (!this.config.enablePerformanceTracking || typeof window === 'undefined') return;

    // Track Web Vitals
    this.trackWebVitals();

    // Track resource loading
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            this.trackPerformance('page_load', entry.duration, {
              type: 'navigation'
            });
          } else if (entry.entryType === 'resource') {
            this.trackPerformance('resource_load', entry.duration, {
              type: 'resource',
              name: entry.name
            });
          }
        });
      });

      try {
        this.performanceObserver.observe({ entryTypes: ['navigation', 'resource'] });
      } catch (error) {
        log.warn('Failed to setup performance observer', {
          component: 'TelemetrySystem',
          error: (error as Error).message
        });
      }
    }
  }

  private trackWebVitals(): void {
    if (typeof window === 'undefined') return;

    // Track LCP (Largest Contentful Paint)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.trackPerformance('largest_contentful_paint', lastEntry.startTime, {
            type: 'web_vital'
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (error) {
        // LCP might not be supported
      }
    }

    // Track CLS (Cumulative Layout Shift)
    let clsValue = 0;
    if ('PerformanceObserver' in window) {
      try {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
          this.trackPerformance('cumulative_layout_shift', clsValue, {
            type: 'web_vital'
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (error) {
        // CLS might not be supported
      }
    }
  }

  private updateActivity(): void {
    this.lastActivity = Date.now();
    this.session.lastActivity = this.lastActivity;
  }

  private updateSession(): void {
    this.session.events++;
    this.session.lastActivity = Date.now();

    if (this.user) {
      this.user.totalEvents++;
      this.user.lastSeen = Date.now();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  private async sendEvents(events: TelemetryEvent[]): Promise<void> {
    if (!this.config.endpoint) {
      // No endpoint configured, just log
      if (this.config.enableDebugMode) {
        console.log('Telemetry events:', events);
      }
      return;
    }

    const payload = {
      events,
      session: this.session,
      user: this.config.enableUserTracking ? this.user : null,
      timestamp: Date.now()
    };

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    if (!this.config.privacyMode) {
      return properties;
    }

    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['email', 'password', 'token', 'key', 'secret', 'credit_card', 'ssn'];

    for (const [key, value] of Object.entries(properties)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.includes('@')) {
        sanitized[key] = '[EMAIL]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private clearStoredData(): void {
    try {
      localStorage.removeItem('sightedit_user_profile');
      this.user = null;
    } catch (error) {
      // Ignore storage errors
    }
  }

  private stopTracking(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    this.eventQueue = [];
    this.isInitialized = false;
  }

  private async getGeolocation(): Promise<{ country?: string; region?: string; city?: string } | null> {
    try {
      // This would typically use a geolocation API service
      // For privacy, we might only track country-level data
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      return {
        country: data.country_name,
        region: data.region,
        city: this.config.privacyMode ? undefined : data.city
      };
    } catch (error) {
      return null;
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private getVersion(): string {
    return process.env.BUILD_VERSION || '1.0.0';
  }

  private getEnvironment(): string {
    return process.env.NODE_ENV || 'production';
  }

  private getUserAgent(): string {
    return typeof navigator !== 'undefined' ? navigator.userAgent : '';
  }

  private getCurrentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  private getReferrer(): string {
    return typeof document !== 'undefined' ? document.referrer : '';
  }

  private getViewport(): { width: number; height: number } | undefined {
    if (typeof window === 'undefined') return undefined;
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  private getDeviceType(): 'desktop' | 'tablet' | 'mobile' {
    if (typeof window === 'undefined') return 'desktop';
    
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private getOS(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'unknown';
  }

  private getBrowser(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'unknown';
  }
}

// Global instance
export const telemetry = TelemetrySystem.getInstance();

// Convenience functions
export const track = {
  event: (type: EventType, name: string, properties?: Record<string, any>) =>
    telemetry.track(type, name, properties),
  
  userAction: (action: string, properties?: Record<string, any>) =>
    telemetry.trackUserAction(action, properties),
  
  pageView: (url?: string, properties?: Record<string, any>) =>
    telemetry.trackPageView(url, properties),
  
  performance: (name: string, duration: number, properties?: Record<string, any>) =>
    telemetry.trackPerformance(name, duration, properties),
  
  error: (error: Error | string, properties?: Record<string, any>) =>
    telemetry.trackError(error, properties),
  
  feature: (feature: string, properties?: Record<string, any>) =>
    telemetry.trackFeatureUse(feature, properties),
  
  business: (event: string, properties?: Record<string, any>) =>
    telemetry.trackBusiness(event, properties),
  
  timer: (name: string) => telemetry.startTimer(name)
};