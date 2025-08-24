/**
 * Security Monitoring and Threat Detection System for SightEdit
 * Monitors for security violations, suspicious activity, and potential threats
 */

import { telemetry, EventType } from '../utils/telemetry';
import { otelMetrics } from '../utils/opentelemetry';
import { log } from '../utils/logger';
import { sentry } from '../utils/sentry-integration';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  sourceIP?: string;
  userAgent?: string;
  action: string;
  resource?: string;
  timestamp: number;
  details: Record<string, any>;
  riskScore: number;
}

export enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'auth_failure',
  SUSPICIOUS_LOGIN = 'suspicious_login',
  BRUTE_FORCE_ATTEMPT = 'brute_force',
  SQL_INJECTION = 'sql_injection',
  XSS_ATTEMPT = 'xss_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_EXFILTRATION = 'data_exfiltration',
  RATE_LIMIT_VIOLATION = 'rate_limit_violation',
  MALICIOUS_FILE_UPLOAD = 'malicious_file_upload',
  SUSPICIOUS_API_USAGE = 'suspicious_api_usage',
  ACCOUNT_TAKEOVER = 'account_takeover',
  FRAUD_ATTEMPT = 'fraud_attempt'
}

export interface ThreatIntelligence {
  ipAddress: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  lastSeen: number;
  source: string;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<string, number>;
  topSourceIPs: Array<{ ip: string; count: number }>;
  riskScoreDistribution: number[];
  averageRiskScore: number;
  criticalEventsLast24h: number;
}

/**
 * Security monitoring system
 */
export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private events: SecurityEvent[] = [];
  private threatIntel = new Map<string, ThreatIntelligence>();
  private loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private rateLimit = new Map<string, { requests: number; windowStart: number }>();
  private suspiciousUsers = new Set<string>();
  
  // Configuration
  private readonly maxLoginAttempts = 5;
  private readonly loginAttemptWindow = 15 * 60 * 1000; // 15 minutes
  private readonly rateLimitWindow = 60 * 1000; // 1 minute
  private readonly rateLimitThreshold = 100; // requests per minute
  private readonly highRiskThreshold = 70;
  private readonly criticalRiskThreshold = 90;

  static getInstance(): SecurityMonitor {
    if (!this.instance) {
      this.instance = new SecurityMonitor();
    }
    return this.instance;
  }

  constructor() {
    this.loadThreatIntelligence();
    this.startCleanupTimer();
  }

  /**
   * Report a security event
   */
  reportSecurityEvent(event: Omit<SecurityEvent, 'timestamp' | 'riskScore'>): void {
    const riskScore = this.calculateRiskScore(event);
    
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: Date.now(),
      riskScore
    };

    this.events.push(securityEvent);
    this.processSecurityEvent(securityEvent);

    // Limit event history to prevent memory issues
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }

    log.warn('Security event reported', {
      component: 'SecurityMonitor',
      type: event.type,
      severity: event.severity,
      risk_score: riskScore,
      user_id: event.userId,
      source_ip: event.sourceIP
    });
  }

  /**
   * Check for authentication failure patterns
   */
  checkAuthenticationFailure(
    userId: string,
    sourceIP: string,
    userAgent?: string,
    details: Record<string, any> = {}
  ): void {
    const key = `${sourceIP}:${userId}`;
    const now = Date.now();

    // Update login attempt tracking
    if (!this.loginAttempts.has(key)) {
      this.loginAttempts.set(key, { count: 0, lastAttempt: now });
    }

    const attempts = this.loginAttempts.get(key)!;
    
    // Reset if outside window
    if (now - attempts.lastAttempt > this.loginAttemptWindow) {
      attempts.count = 0;
    }

    attempts.count++;
    attempts.lastAttempt = now;

    // Determine severity based on attempt count
    let severity: SecurityEvent['severity'] = 'low';
    if (attempts.count >= this.maxLoginAttempts * 2) {
      severity = 'critical';
    } else if (attempts.count >= this.maxLoginAttempts) {
      severity = 'high';
    } else if (attempts.count >= 3) {
      severity = 'medium';
    }

    this.reportSecurityEvent({
      type: SecurityEventType.AUTHENTICATION_FAILURE,
      severity,
      userId,
      sourceIP,
      userAgent,
      action: 'login_failed',
      details: {
        ...details,
        attempt_count: attempts.count,
        window_start: now - this.loginAttemptWindow
      }
    });

    // Check for brute force pattern
    if (attempts.count >= this.maxLoginAttempts) {
      this.reportSecurityEvent({
        type: SecurityEventType.BRUTE_FORCE_ATTEMPT,
        severity: 'high',
        userId,
        sourceIP,
        userAgent,
        action: 'brute_force_detected',
        details: {
          total_attempts: attempts.count,
          window_duration: this.loginAttemptWindow
        }
      });
    }
  }

  /**
   * Check for suspicious login patterns
   */
  checkSuspiciousLogin(
    userId: string,
    sourceIP: string,
    userAgent?: string,
    details: Record<string, any> = {}
  ): void {
    const threats = this.analyzeLoginThreats(userId, sourceIP, userAgent, details);
    
    if (threats.length > 0) {
      this.reportSecurityEvent({
        type: SecurityEventType.SUSPICIOUS_LOGIN,
        severity: this.getSeverityFromThreats(threats),
        userId,
        sourceIP,
        userAgent,
        action: 'suspicious_login_detected',
        details: {
          threats,
          ...details
        }
      });
    }
  }

  /**
   * Check for SQL injection attempts
   */
  checkSQLInjection(
    input: string,
    userId?: string,
    sourceIP?: string,
    context: Record<string, any> = {}
  ): boolean {
    const sqlPatterns = [
      /(['"](\s)*(or|and)(\s)*['"]?\s*=?\s*['"]?\s*(or|and|true|false))/i,
      /(union(\s)+select)/i,
      /(select(\s)+\*(\s)+from)/i,
      /(drop(\s)+table)/i,
      /(insert(\s)+into)/i,
      /(delete(\s)+from)/i,
      /(update(\s)+set)/i,
      /(\-\-|#|\/\*|\*\/)/i
    ];

    const detected = sqlPatterns.some(pattern => pattern.test(input));

    if (detected) {
      this.reportSecurityEvent({
        type: SecurityEventType.SQL_INJECTION,
        severity: 'critical',
        userId,
        sourceIP,
        action: 'sql_injection_attempt',
        details: {
          input: input.substring(0, 500), // Limit input length in logs
          context,
          detected_patterns: sqlPatterns.filter(p => p.test(input)).map(p => p.source)
        }
      });
    }

    return detected;
  }

  /**
   * Check for XSS attempts
   */
  checkXSSAttempt(
    input: string,
    userId?: string,
    sourceIP?: string,
    context: Record<string, any> = {}
  ): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/i,
      /<iframe[^>]*>.*?<\/iframe>/i,
      /javascript:/i,
      /on\w+\s*=\s*["'][^"']*["']/i,
      /<img[^>]+src[^>]*=.*?>/i,
      /<object[^>]*>.*?<\/object>/i,
      /<embed[^>]*>.*?<\/embed>/i,
      /eval\s*\(/i,
      /expression\s*\(/i
    ];

    const detected = xssPatterns.some(pattern => pattern.test(input));

    if (detected) {
      this.reportSecurityEvent({
        type: SecurityEventType.XSS_ATTEMPT,
        severity: 'high',
        userId,
        sourceIP,
        action: 'xss_attempt',
        details: {
          input: input.substring(0, 500),
          context,
          detected_patterns: xssPatterns.filter(p => p.test(input)).map(p => p.source)
        }
      });
    }

    return detected;
  }

  /**
   * Check rate limiting violations
   */
  checkRateLimit(
    identifier: string,
    sourceIP: string,
    userId?: string,
    action: string = 'api_request'
  ): boolean {
    const now = Date.now();
    const key = `${identifier}:${sourceIP}`;

    if (!this.rateLimit.has(key)) {
      this.rateLimit.set(key, { requests: 0, windowStart: now });
    }

    const limit = this.rateLimit.get(key)!;

    // Reset window if expired
    if (now - limit.windowStart > this.rateLimitWindow) {
      limit.requests = 0;
      limit.windowStart = now;
    }

    limit.requests++;

    if (limit.requests > this.rateLimitThreshold) {
      this.reportSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_VIOLATION,
        severity: 'medium',
        userId,
        sourceIP,
        action,
        details: {
          requests_per_window: limit.requests,
          window_duration: this.rateLimitWindow,
          threshold: this.rateLimitThreshold
        }
      });

      return true;
    }

    return false;
  }

  /**
   * Check for unauthorized access attempts
   */
  checkUnauthorizedAccess(
    resource: string,
    requiredPermission: string,
    userPermissions: string[],
    userId?: string,
    sourceIP?: string
  ): boolean {
    const hasPermission = userPermissions.includes(requiredPermission) || 
                         userPermissions.includes('admin');

    if (!hasPermission) {
      this.reportSecurityEvent({
        type: SecurityEventType.UNAUTHORIZED_ACCESS,
        severity: 'high',
        userId,
        sourceIP,
        action: 'unauthorized_access_attempt',
        resource,
        details: {
          required_permission: requiredPermission,
          user_permissions: userPermissions,
          resource
        }
      });

      return true;
    }

    return false;
  }

  /**
   * Check for suspicious API usage patterns
   */
  checkSuspiciousAPIUsage(
    apiKey: string,
    endpoint: string,
    method: string,
    sourceIP: string,
    userId?: string
  ): void {
    // Check for unusual API usage patterns
    const patterns = this.analyzeAPIPatterns(apiKey, endpoint, method, sourceIP);
    
    if (patterns.length > 0) {
      let severity: SecurityEvent['severity'] = 'low';
      
      if (patterns.some(p => p.includes('high_frequency') || p.includes('unusual_endpoint'))) {
        severity = 'medium';
      }
      
      if (patterns.some(p => p.includes('automated_scraping') || p.includes('data_enumeration'))) {
        severity = 'high';
      }

      this.reportSecurityEvent({
        type: SecurityEventType.SUSPICIOUS_API_USAGE,
        severity,
        userId,
        sourceIP,
        action: 'suspicious_api_usage',
        details: {
          api_key: this.maskAPIKey(apiKey),
          endpoint,
          method,
          suspicious_patterns: patterns
        }
      });
    }
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(timeframe: number = 24 * 60 * 60 * 1000): SecurityMetrics {
    const now = Date.now();
    const cutoffTime = now - timeframe;
    const recentEvents = this.events.filter(event => event.timestamp >= cutoffTime);

    // Count events by type
    const eventsByType: Record<SecurityEventType, number> = {} as any;
    Object.values(SecurityEventType).forEach(type => {
      eventsByType[type] = 0;
    });

    // Count events by severity
    const eventsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    // Track source IPs
    const ipCounts = new Map<string, number>();

    // Risk score tracking
    const riskScores: number[] = [];

    recentEvents.forEach(event => {
      eventsByType[event.type]++;
      eventsBySeverity[event.severity]++;
      riskScores.push(event.riskScore);

      if (event.sourceIP) {
        ipCounts.set(event.sourceIP, (ipCounts.get(event.sourceIP) || 0) + 1);
      }
    });

    // Top source IPs
    const topSourceIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    // Risk score distribution
    const riskScoreDistribution = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
    riskScores.forEach(score => {
      const bucket = Math.min(Math.floor(score / 20), 4);
      riskScoreDistribution[bucket]++;
    });

    const averageRiskScore = riskScores.length > 0 
      ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length 
      : 0;

    return {
      totalEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      topSourceIPs,
      riskScoreDistribution,
      averageRiskScore,
      criticalEventsLast24h: recentEvents.filter(e => e.severity === 'critical').length
    };
  }

  /**
   * Get threat intelligence for an IP address
   */
  getThreatIntelligence(ipAddress: string): ThreatIntelligence | null {
    return this.threatIntel.get(ipAddress) || null;
  }

  /**
   * Add threat intelligence data
   */
  addThreatIntelligence(intel: ThreatIntelligence): void {
    this.threatIntel.set(intel.ipAddress, intel);
    
    log.info('Threat intelligence added', {
      component: 'SecurityMonitor',
      ip: intel.ipAddress,
      risk_level: intel.riskLevel,
      categories: intel.categories
    });
  }

  private processSecurityEvent(event: SecurityEvent): void {
    // Send to telemetry systems
    telemetry.track(EventType.SECURITY, `security_${event.type}`, {
      severity: event.severity,
      risk_score: event.riskScore,
      source_ip: event.sourceIP,
      user_id: event.userId
    });

    // Send to OpenTelemetry
    otelMetrics.recordError(new Error(`Security event: ${event.type}`), {
      security_event_type: event.type,
      severity: event.severity,
      risk_score: event.riskScore.toString()
    });

    // Send critical events to Sentry
    if (event.severity === 'critical' || event.riskScore >= this.criticalRiskThreshold) {
      sentry.captureException(new Error(`Critical security event: ${event.type}`), {
        tags: {
          security_event: event.type,
          severity: event.severity,
          risk_score: event.riskScore.toString()
        },
        extra: {
          event_details: event.details,
          source_ip: event.sourceIP,
          user_id: event.userId
        },
        level: 'error'
      });
    }

    // Mark user as suspicious if high risk
    if (event.riskScore >= this.highRiskThreshold && event.userId) {
      this.suspiciousUsers.add(event.userId);
      
      log.warn('User marked as suspicious', {
        component: 'SecurityMonitor',
        user_id: event.userId,
        risk_score: event.riskScore,
        event_type: event.type
      });
    }
  }

  private calculateRiskScore(event: Omit<SecurityEvent, 'timestamp' | 'riskScore'>): number {
    let score = 0;

    // Base score by event type
    const typeScores: Record<SecurityEventType, number> = {
      [SecurityEventType.AUTHENTICATION_FAILURE]: 10,
      [SecurityEventType.SUSPICIOUS_LOGIN]: 30,
      [SecurityEventType.BRUTE_FORCE_ATTEMPT]: 60,
      [SecurityEventType.SQL_INJECTION]: 90,
      [SecurityEventType.XSS_ATTEMPT]: 80,
      [SecurityEventType.UNAUTHORIZED_ACCESS]: 70,
      [SecurityEventType.PRIVILEGE_ESCALATION]: 95,
      [SecurityEventType.DATA_EXFILTRATION]: 100,
      [SecurityEventType.RATE_LIMIT_VIOLATION]: 20,
      [SecurityEventType.MALICIOUS_FILE_UPLOAD]: 85,
      [SecurityEventType.SUSPICIOUS_API_USAGE]: 40,
      [SecurityEventType.ACCOUNT_TAKEOVER]: 95,
      [SecurityEventType.FRAUD_ATTEMPT]: 90
    };

    score += typeScores[event.type] || 0;

    // Severity multiplier
    const severityMultipliers = {
      low: 1.0,
      medium: 1.3,
      high: 1.6,
      critical: 2.0
    };

    score *= severityMultipliers[event.severity];

    // Source IP threat intelligence
    if (event.sourceIP) {
      const threat = this.threatIntel.get(event.sourceIP);
      if (threat) {
        const threatScores = {
          low: 5,
          medium: 15,
          high: 30,
          critical: 50
        };
        score += threatScores[threat.riskLevel];
      }
    }

    // User reputation
    if (event.userId && this.suspiciousUsers.has(event.userId)) {
      score += 20;
    }

    return Math.min(Math.round(score), 100);
  }

  private analyzeLoginThreats(
    userId: string,
    sourceIP: string,
    userAgent?: string,
    details: Record<string, any> = {}
  ): string[] {
    const threats: string[] = [];

    // Check threat intelligence
    const threat = this.threatIntel.get(sourceIP);
    if (threat && threat.riskLevel !== 'low') {
      threats.push(`known_malicious_ip_${threat.riskLevel}`);
    }

    // Check for unusual location (simplified)
    if (details.country && details.usual_countries && 
        !details.usual_countries.includes(details.country)) {
      threats.push('unusual_location');
    }

    // Check for unusual time (simplified)
    const hour = new Date().getHours();
    if (details.usual_hours && !details.usual_hours.includes(hour)) {
      threats.push('unusual_time');
    }

    // Check user agent
    if (userAgent) {
      if (userAgent.includes('curl') || userAgent.includes('wget')) {
        threats.push('automated_tool');
      }
      if (userAgent.length < 20) {
        threats.push('suspicious_user_agent');
      }
    }

    // Check if user is already flagged as suspicious
    if (this.suspiciousUsers.has(userId)) {
      threats.push('suspicious_user');
    }

    return threats;
  }

  private analyzeAPIPatterns(
    apiKey: string,
    endpoint: string,
    method: string,
    sourceIP: string
  ): string[] {
    const patterns: string[] = [];

    // This would implement more sophisticated pattern analysis
    // For now, we'll use simple heuristics

    // Check for high frequency usage (simplified)
    const rateLimitData = this.rateLimit.get(`${apiKey}:${sourceIP}`);
    if (rateLimitData && rateLimitData.requests > 50) {
      patterns.push('high_frequency_usage');
    }

    // Check for unusual endpoints
    const sensitiveEndpoints = ['/admin', '/users', '/config', '/debug'];
    if (sensitiveEndpoints.some(ep => endpoint.includes(ep))) {
      patterns.push('unusual_endpoint_access');
    }

    // Check for data enumeration patterns
    if (method === 'GET' && /\/\d+$/.test(endpoint)) {
      patterns.push('potential_data_enumeration');
    }

    return patterns;
  }

  private getSeverityFromThreats(threats: string[]): SecurityEvent['severity'] {
    const highSeverityThreats = ['known_malicious_ip_critical', 'known_malicious_ip_high'];
    const mediumSeverityThreats = ['known_malicious_ip_medium', 'automated_tool'];

    if (threats.some(threat => highSeverityThreats.includes(threat))) {
      return 'high';
    }

    if (threats.some(threat => mediumSeverityThreats.includes(threat)) || threats.length >= 3) {
      return 'medium';
    }

    return 'low';
  }

  private maskAPIKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return '***';
    }
    return apiKey.substring(0, 4) + '***' + apiKey.substring(apiKey.length - 4);
  }

  private loadThreatIntelligence(): void {
    // In a real implementation, this would load threat intelligence from external sources
    log.info('Loading threat intelligence data', {
      component: 'SecurityMonitor'
    });
  }

  private startCleanupTimer(): void {
    // Clean up old data every hour
    setInterval(() => {
      const now = Date.now();
      const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours

      // Clean up old events
      this.events = this.events.filter(event => event.timestamp >= cutoffTime);

      // Clean up old login attempts
      for (const [key, data] of this.loginAttempts) {
        if (now - data.lastAttempt > this.loginAttemptWindow * 2) {
          this.loginAttempts.delete(key);
        }
      }

      // Clean up old rate limit data
      for (const [key, data] of this.rateLimit) {
        if (now - data.windowStart > this.rateLimitWindow * 2) {
          this.rateLimit.delete(key);
        }
      }

      log.debug('Security data cleanup completed', {
        component: 'SecurityMonitor',
        events_count: this.events.length,
        login_attempts_count: this.loginAttempts.size,
        rate_limit_entries: this.rateLimit.size
      });
    }, 60 * 60 * 1000); // 1 hour
  }
}

// Singleton instance
export const securityMonitor = SecurityMonitor.getInstance();

// Convenience functions
export const checkSecurity = {
  authFailure: (userId: string, sourceIP: string, userAgent?: string, details?: Record<string, any>) =>
    securityMonitor.checkAuthenticationFailure(userId, sourceIP, userAgent, details),
    
  suspiciousLogin: (userId: string, sourceIP: string, userAgent?: string, details?: Record<string, any>) =>
    securityMonitor.checkSuspiciousLogin(userId, sourceIP, userAgent, details),
    
  sqlInjection: (input: string, userId?: string, sourceIP?: string, context?: Record<string, any>) =>
    securityMonitor.checkSQLInjection(input, userId, sourceIP, context),
    
  xssAttempt: (input: string, userId?: string, sourceIP?: string, context?: Record<string, any>) =>
    securityMonitor.checkXSSAttempt(input, userId, sourceIP, context),
    
  rateLimit: (identifier: string, sourceIP: string, userId?: string, action?: string) =>
    securityMonitor.checkRateLimit(identifier, sourceIP, userId, action),
    
  unauthorizedAccess: (resource: string, requiredPermission: string, userPermissions: string[], userId?: string, sourceIP?: string) =>
    securityMonitor.checkUnauthorizedAccess(resource, requiredPermission, userPermissions, userId, sourceIP),
    
  suspiciousAPI: (apiKey: string, endpoint: string, method: string, sourceIP: string, userId?: string) =>
    securityMonitor.checkSuspiciousAPIUsage(apiKey, endpoint, method, sourceIP, userId)
};