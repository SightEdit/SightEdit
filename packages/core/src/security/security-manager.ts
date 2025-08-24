import { EventBus } from '../services/event-bus';
import { CSPManager, CSPConfig } from './csp-manager';
import { CSPReporter } from './csp-reporter';
import { logger } from '../utils/logger';

export interface SecurityConfig {
  xss: {
    enabled: boolean;
    mode: 'strict' | 'moderate' | 'loose';
    allowedTags?: string[];
    allowedAttributes?: string[];
    customSanitizer?: (html: string) => string;
  };
  csp: CSPConfig;
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
    skipSuccessfulRequests?: boolean;
  };
  inputValidation: {
    enabled: boolean;
    maxLength: number;
    allowedCharacters?: RegExp;
    blockedPatterns?: RegExp[];
  };
  threatDetection: {
    enabled: boolean;
    suspiciousPatterns: RegExp[];
    alertThreshold: number;
  };
}

export interface ThreatInfo {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  details: Record<string, any>;
  source?: string;
  userAgent?: string;
  ip?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: any;
  threats?: ThreatInfo[];
}

export class SecurityManager {
  private config: SecurityConfig;
  private threatHistory = new Map<string, ThreatInfo[]>();
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private domPurify: any = null;
  private cspManager: CSPManager | null = null;
  private cspReporter: CSPReporter | null = null;

  constructor(
    config: Partial<SecurityConfig>,
    private eventBus: EventBus
  ) {
    this.config = this.mergeWithDefaults(config);
    this.initialize();
  }

  private mergeWithDefaults(config: Partial<SecurityConfig>): SecurityConfig {
    return {
      xss: {
        enabled: true,
        mode: 'strict',
        allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        allowedAttributes: ['href', 'target'],
        ...config.xss
      },
      csp: {
        enabled: true,
        enforceMode: true,
        useNonces: true,
        useHashes: true,
        allowInlineStyles: false,
        allowInlineScripts: false,
        trustedTypes: true,
        environment: 'production',
        directives: {
          'default-src': ["'none'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'https:'],
          'connect-src': ["'self'"],
          'media-src': ["'self'"],
          'object-src': ["'none'"],
          'child-src': ["'none'"],
          'frame-src': ["'none'"],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': true,
          'block-all-mixed-content': true,
          'require-trusted-types-for': ["'script'"],
          'trusted-types': ['sightedit-policy', 'default']
        },
        reportUri: '/api/csp-report',
        ...config.csp
      },
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
        skipSuccessfulRequests: false,
        ...config.rateLimit
      },
      inputValidation: {
        enabled: true,
        maxLength: 10000,
        blockedPatterns: [
          /<script[^>]*>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /data:text\/html/gi
        ],
        ...config.inputValidation
      },
      threatDetection: {
        enabled: true,
        suspiciousPatterns: [
          /<script[^>]*>/gi,
          /javascript:/gi,
          /vbscript:/gi,
          /on\w+\s*=/gi,
          /expression\s*\(/gi,
          /@import/gi,
          /document\.cookie/gi,
          /document\.write/gi,
          /eval\s*\(/gi,
          /setTimeout\s*\(/gi,
          /setInterval\s*\(/gi
        ],
        alertThreshold: 3,
        ...config.threatDetection
      }
    };
  }

  private async initialize(): Promise<void> {
    // Load DOMPurify if XSS protection is enabled
    if (this.config.xss.enabled && !this.domPurify) {
      try {
        if (typeof window !== 'undefined') {
          this.domPurify = await import('dompurify');
        } else {
          // Server-side (Node.js) version
          const createDOMPurify = await import('isomorphic-dompurify');
          this.domPurify = createDOMPurify.default;
        }
      } catch (error) {
        logger.warn('Failed to load DOMPurify:', error);
        this.config.xss.enabled = false;
      }
    }

    // Initialize CSP Manager
    if (this.config.csp.enabled) {
      try {
        this.cspManager = new CSPManager(this.config.csp);
        await this.cspManager.initialize();

        // Set up CSP violation reporting
        this.cspReporter = new CSPReporter({
          endpoint: this.config.csp.reportUri,
          enableMetrics: true,
          enableLocalStorage: true
        });

        // Connect CSP manager to reporter
        this.cspManager.on('violation', (violation) => {
          this.cspReporter?.reportViolation(violation);
          this.reportThreat({
            type: 'csp_violation',
            severity: this.assessCSPViolationSeverity(violation),
            timestamp: Date.now(),
            details: {
              violatedDirective: violation.violatedDirective,
              blockedUri: violation.blockedUri,
              sourceFile: violation.sourceFile,
              sample: violation.sample
            }
          });
        });

        logger.info('CSP system initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize CSP system:', error);
        this.config.csp.enabled = false;
      }
    }

    // Set up threat detection
    if (this.config.threatDetection.enabled) {
      this.setupThreatDetection();
    }
  }

  validateInput(input: string, context?: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      threats: []
    };

    if (!this.config.inputValidation.enabled) {
      result.sanitizedValue = input;
      return result;
    }

    // Length validation
    if (input.length > this.config.inputValidation.maxLength) {
      result.isValid = false;
      result.errors.push(`Input exceeds maximum length of ${this.config.inputValidation.maxLength} characters`);
    }

    // Character validation
    if (this.config.inputValidation.allowedCharacters) {
      if (!this.config.inputValidation.allowedCharacters.test(input)) {
        result.isValid = false;
        result.errors.push('Input contains disallowed characters');
      }
    }

    // Blocked patterns check
    if (this.config.inputValidation.blockedPatterns) {
      for (const pattern of this.config.inputValidation.blockedPatterns) {
        if (pattern.test(input)) {
          result.isValid = false;
          result.errors.push('Input contains blocked pattern');
          
          // This is also a potential threat
          result.threats!.push({
            type: 'blocked_pattern',
            severity: 'high',
            timestamp: Date.now(),
            details: {
              pattern: pattern.toString(),
              input: input.substring(0, 100), // First 100 chars for context
              context
            }
          });
        }
      }
    }

    // XSS sanitization
    if (this.config.xss.enabled && this.domPurify) {
      result.sanitizedValue = this.sanitizeHtml(input);
    } else {
      result.sanitizedValue = input;
    }

    // Threat detection
    if (this.config.threatDetection.enabled) {
      const threats = this.detectThreats(input, context);
      result.threats!.push(...threats);
      
      if (threats.some(t => t.severity === 'critical' || t.severity === 'high')) {
        result.isValid = false;
        result.errors.push('Input contains security threats');
      }
    }

    return result;
  }

  sanitizeHtml(html: string): string {
    if (!this.config.xss.enabled || !this.domPurify) {
      return html;
    }

    if (this.config.xss.customSanitizer) {
      return this.config.xss.customSanitizer(html);
    }

    const options = this.getSanitizeOptions();
    return this.domPurify.sanitize(html, options);
  }

  private getSanitizeOptions(): any {
    const { mode, allowedTags, allowedAttributes } = this.config.xss;

    switch (mode) {
      case 'strict':
        return {
          ALLOWED_TAGS: allowedTags || ['b', 'i', 'em', 'strong'],
          ALLOWED_ATTR: allowedAttributes || [],
          ALLOW_DATA_ATTR: false,
          ALLOW_UNKNOWN_PROTOCOLS: false,
          SAFE_FOR_TEMPLATES: true
        };

      case 'moderate':
        return {
          ALLOWED_TAGS: allowedTags || [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'
          ],
          ALLOWED_ATTR: allowedAttributes || ['href', 'target'],
          ALLOW_DATA_ATTR: false,
          ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
        };

      case 'loose':
        return {
          ALLOWED_TAGS: allowedTags,
          ALLOWED_ATTR: allowedAttributes,
          ALLOW_DATA_ATTR: true
        };

      default:
        return {};
    }
  }

  checkRateLimit(identifier: string): boolean {
    if (!this.config.rateLimit.enabled) {
      return true;
    }

    const now = Date.now();
    const key = `rateLimit:${identifier}`;
    const record = this.rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + this.config.rateLimit.windowMs
      });
      return true;
    }

    if (record.count >= this.config.rateLimit.maxRequests) {
      // Rate limit exceeded
      this.reportThreat({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        timestamp: now,
        details: {
          identifier,
          count: record.count,
          maxRequests: this.config.rateLimit.maxRequests
        }
      });
      return false;
    }

    // Increment counter
    record.count++;
    this.rateLimitStore.set(key, record);
    return true;
  }

  private detectThreats(input: string, context?: string): ThreatInfo[] {
    const threats: ThreatInfo[] = [];

    if (!this.config.threatDetection.enabled) {
      return threats;
    }

    for (const pattern of this.config.threatDetection.suspiciousPatterns) {
      const matches = input.match(pattern);
      if (matches) {
        threats.push({
          type: 'suspicious_pattern',
          severity: this.calculateThreatSeverity(pattern.toString(), input),
          timestamp: Date.now(),
          details: {
            pattern: pattern.toString(),
            matches: matches.slice(0, 5), // First 5 matches
            input: input.substring(0, 200), // First 200 chars
            context
          }
        });
      }
    }

    return threats;
  }

  private calculateThreatSeverity(pattern: string, input: string): ThreatInfo['severity'] {
    // High severity patterns
    const highSeverityPatterns = [
      'script',
      'javascript:',
      'vbscript:',
      'document.cookie',
      'eval(',
      'setTimeout(',
      'setInterval('
    ];

    if (highSeverityPatterns.some(p => pattern.toLowerCase().includes(p))) {
      return 'high';
    }

    // Medium severity patterns
    const mediumSeverityPatterns = [
      'on\\w+\\s*=',
      'expression',
      '@import'
    ];

    if (mediumSeverityPatterns.some(p => pattern.toLowerCase().includes(p))) {
      return 'medium';
    }

    return 'low';
  }

  private applyCsp(): void {
    if (typeof document === 'undefined') return;

    const policy = this.generateCspPolicy();
    const meta = document.createElement('meta');
    
    if (this.config.csp.enforceMode) {
      meta.httpEquiv = 'Content-Security-Policy';
    } else {
      meta.httpEquiv = 'Content-Security-Policy-Report-Only';
    }
    
    meta.content = policy;
    document.head.appendChild(meta);
  }

  private generateCspPolicy(): string {
    const directives: string[] = [];

    for (const [directive, sources] of Object.entries(this.config.csp.directives)) {
      if (sources.length > 0) {
        directives.push(`${directive} ${sources.join(' ')}`);
      }
    }

    if (this.config.csp.reportUri) {
      directives.push(`report-uri ${this.config.csp.reportUri}`);
    }

    return directives.join('; ');
  }

  private setupThreatDetection(): void {
    if (typeof document === 'undefined') return;

    // Monitor DOM mutations for potential threats
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanElementForThreats(node as Element);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'onclick', 'onload', 'onerror']
    });
  }

  private scanElementForThreats(element: Element): void {
    // Check for suspicious scripts
    const scripts = element.querySelectorAll('script');
    scripts.forEach(script => {
      if (this.isSuspiciousScript(script)) {
        this.reportThreat({
          type: 'suspicious_script',
          severity: 'high',
          timestamp: Date.now(),
          details: {
            element: element.outerHTML.substring(0, 500),
            script: script.outerHTML
          }
        });
      }
    });

    // Check for suspicious links
    const links = element.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = (link as HTMLAnchorElement).href;
      if (this.isSuspiciousLink(href)) {
        this.reportThreat({
          type: 'suspicious_link',
          severity: 'medium',
          timestamp: Date.now(),
          details: {
            href,
            element: link.outerHTML
          }
        });
      }
    });
  }

  private isSuspiciousScript(script: HTMLScriptElement): boolean {
    // Check for inline scripts with suspicious content
    if (script.innerHTML) {
      return this.config.threatDetection.suspiciousPatterns.some(pattern =>
        pattern.test(script.innerHTML)
      );
    }

    // Check for suspicious src attributes
    if (script.src) {
      return /^(data:|javascript:|vbscript:)/.test(script.src.toLowerCase());
    }

    return false;
  }

  private isSuspiciousLink(href: string): boolean {
    try {
      const url = new URL(href);
      
      // Check for suspicious protocols
      if (['javascript:', 'vbscript:', 'data:'].includes(url.protocol)) {
        return true;
      }

      // Check for suspicious domains (basic check)
      const suspiciousDomains = ['evil.com', 'malware.org']; // This would be more comprehensive
      return suspiciousDomains.some(domain => url.hostname.includes(domain));
    } catch {
      // Invalid URL
      return true;
    }
  }

  reportThreat(threat: ThreatInfo): void {
    // Store threat history
    const key = threat.source || 'unknown';
    if (!this.threatHistory.has(key)) {
      this.threatHistory.set(key, []);
    }
    
    const history = this.threatHistory.get(key)!;
    history.push(threat);
    
    // Keep only recent threats (last 100)
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    // Emit event
    this.eventBus.emit('security:threat-detected', { threat });

    // Check for alert threshold
    const recentThreats = history.filter(t => 
      Date.now() - t.timestamp < 3600000 // Last hour
    );

    if (recentThreats.length >= this.config.threatDetection.alertThreshold) {
      this.eventBus.emit('security:alert-threshold-exceeded', {
        source: key,
        threats: recentThreats,
        threshold: this.config.threatDetection.alertThreshold
      });
    }
  }

  getThreatHistory(source?: string): ThreatInfo[] {
    if (source) {
      return this.threatHistory.get(source) || [];
    }

    // Return all threats
    const allThreats: ThreatInfo[] = [];
    for (const threats of this.threatHistory.values()) {
      allThreats.push(...threats);
    }

    return allThreats.sort((a, b) => b.timestamp - a.timestamp);
  }

  clearThreatHistory(): void {
    this.threatHistory.clear();
  }

  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates };
    this.initialize(); // Re-initialize with new config
  }

  getConfig(): Readonly<SecurityConfig> {
    return { ...this.config };
  }

  /**
   * Assess CSP violation severity
   */
  private assessCSPViolationSeverity(violation: any): ThreatInfo['severity'] {
    const directive = violation.violatedDirective || '';
    const blockedUri = violation.blockedUri || '';

    // Critical violations
    if (directive.includes('script-src') && (
      blockedUri.includes('javascript:') ||
      blockedUri.includes('data:text/html') ||
      blockedUri.includes('eval')
    )) {
      return 'critical';
    }

    if (directive.includes('object-src') || directive.includes('base-uri')) {
      return 'high';
    }

    // High severity for inline scripts/styles in production
    if (directive.includes('script-src') && blockedUri === 'inline') {
      return 'high';
    }

    if (directive.includes('style-src') && blockedUri === 'inline') {
      return 'medium';
    }

    // External resource violations
    if (blockedUri.startsWith('http')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Add script with CSP compliance
   */
  addScript(content: string, attributes: Record<string, string> = {}): HTMLScriptElement | null {
    if (!this.cspManager) {
      logger.warn('CSP manager not initialized, cannot add script safely');
      return null;
    }

    try {
      return this.cspManager.addScript(content, attributes);
    } catch (error) {
      logger.error('Failed to add script with CSP compliance', { error });
      return null;
    }
  }

  /**
   * Add style with CSP compliance
   */
  addStyle(content: string, attributes: Record<string, string> = {}): HTMLStyleElement | null {
    if (!this.cspManager) {
      logger.warn('CSP manager not initialized, cannot add style safely');
      return null;
    }

    try {
      return this.cspManager.addStyle(content, attributes);
    } catch (error) {
      logger.error('Failed to add style with CSP compliance', { error });
      return null;
    }
  }

  /**
   * Get current CSP nonces for templates
   */
  getCurrentNonces(): { script: string; style: string } | null {
    if (!this.cspManager) {
      return null;
    }

    const nonce = this.cspManager.getCurrentNonce();
    return nonce ? {
      script: nonce.scriptNonce,
      style: nonce.styleNonce
    } : null;
  }

  /**
   * Get CSP violations
   */
  getCSPViolations(limit?: number): any[] {
    return this.cspReporter?.getViolations({ limit }) || [];
  }

  /**
   * Get CSP metrics
   */
  getCSPMetrics(): any {
    return this.cspReporter?.getMetrics() || null;
  }

  /**
   * Generate security report including CSP data
   */
  generateSecurityReport(): {
    threatSummary: {
      totalThreats: number;
      criticalThreats: number;
      recentThreats: number;
    };
    cspSummary?: any;
    recommendations: string[];
    securityStatus: 'secure' | 'warning' | 'critical';
  } {
    const allThreats = this.getThreatHistory();
    const recentThreats = allThreats.filter(t => 
      Date.now() - t.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );
    const criticalThreats = allThreats.filter(t => 
      t.severity === 'critical' || t.severity === 'high'
    );

    const recommendations: string[] = [];
    let securityStatus: 'secure' | 'warning' | 'critical' = 'secure';

    // Analyze threat patterns
    if (criticalThreats.length > 0) {
      securityStatus = 'critical';
      recommendations.push('Address critical security threats immediately');
    } else if (recentThreats.length > 10) {
      securityStatus = 'warning';
      recommendations.push('Monitor recent security activity');
    }

    // CSP recommendations
    const cspSummary = this.cspReporter?.generateReport();
    if (cspSummary?.criticalIssues.length > 0) {
      securityStatus = 'critical';
      recommendations.push(...cspSummary.criticalIssues);
    }
    if (cspSummary?.recommendations) {
      recommendations.push(...cspSummary.recommendations);
    }

    // General security recommendations
    if (!this.config.csp.enabled) {
      recommendations.push('Enable Content Security Policy for better protection');
      if (securityStatus === 'secure') securityStatus = 'warning';
    }

    if (this.config.xss.mode !== 'strict') {
      recommendations.push('Use strict XSS protection mode in production');
    }

    return {
      threatSummary: {
        totalThreats: allThreats.length,
        criticalThreats: criticalThreats.length,
        recentThreats: recentThreats.length
      },
      cspSummary,
      recommendations: [...new Set(recommendations)], // Remove duplicates
      securityStatus
    };
  }

  /**
   * Update CSP configuration
   */
  async updateCSPConfig(config: Partial<CSPConfig>): Promise<void> {
    if (!this.cspManager) {
      throw new Error('CSP manager not initialized');
    }

    this.config.csp = { ...this.config.csp, ...config };
    await this.cspManager.updateConfig(config);
    logger.info('CSP configuration updated');
  }

  /**
   * Validate current security configuration
   */
  validateSecurityConfig(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // CSP validation
    if (this.cspManager) {
      const cspValidation = this.cspManager.validateConfiguration();
      if (!cspValidation.isValid) {
        errors.push(...cspValidation.errors);
      }
    } else if (this.config.csp.enabled) {
      errors.push('CSP is enabled but manager failed to initialize');
    }

    // XSS protection validation
    if (this.config.xss.enabled && !this.domPurify) {
      errors.push('XSS protection is enabled but DOMPurify failed to load');
    }

    if (this.config.xss.mode === 'loose') {
      warnings.push('XSS protection is in loose mode - consider stricter settings');
    }

    // Rate limiting validation
    if (!this.config.rateLimit.enabled) {
      warnings.push('Rate limiting is disabled - consider enabling for production');
    }

    // Threat detection validation
    if (!this.config.threatDetection.enabled) {
      warnings.push('Threat detection is disabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Destroy security manager and cleanup resources
   */
  destroy(): void {
    if (this.cspManager) {
      this.cspManager.destroy();
      this.cspManager = null;
    }

    if (this.cspReporter) {
      this.cspReporter.destroy();
      this.cspReporter = null;
    }

    this.threatHistory.clear();
    this.rateLimitStore.clear();

    logger.info('Security manager destroyed');
  }
}