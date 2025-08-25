/**
 * Comprehensive Content Security Policy (CSP) Manager
 * Implements strict CSP policies with nonce and hash-based content support
 */

import { EventEmitter } from '../utils/event-emitter';
import { logger } from '../utils/logger';

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'child-src'?: string[];
  'frame-src'?: string[];
  'worker-src'?: string[];
  'manifest-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'plugin-types'?: string[];
  'sandbox'?: string[];
  'report-uri'?: string;
  'report-to'?: string;
  'require-trusted-types-for'?: string[];
  'trusted-types'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

export interface CSPConfig {
  enabled: boolean;
  enforceMode: boolean;
  directives: CSPDirectives;
  reportUri?: string;
  reportTo?: string;
  useNonces: boolean;
  useHashes: boolean;
  allowInlineStyles: boolean;
  allowInlineScripts: boolean;
  trustedTypes: boolean;
  environment: 'development' | 'production' | 'test';
  customDirectives?: Record<string, string[]>;
}

export interface CSPViolation {
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  originalPolicy: string;
  referrer?: string;
  statusCode?: number;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
  timestamp: number;
  userAgent: string;
}

export interface NonceStore {
  scriptNonce: string;
  styleNonce: string;
  timestamp: number;
  isValid: boolean;
}

export class CSPManager extends EventEmitter {
  private config: CSPConfig;
  private nonceStore: Map<string, NonceStore> = new Map();
  private hashStore: Map<string, Set<string>> = new Map();
  private violations: CSPViolation[] = [];
  private isInitialized = false;
  private metaElement: HTMLMetaElement | null = null;
  private reportEndpoint: string | null = null;

  constructor(config: Partial<CSPConfig> = {}) {
    super();
    this.config = this.mergeWithDefaults(config);
    this.initializeHashStores();
  }

  /**
   * Merge user config with secure defaults
   */
  private mergeWithDefaults(config: Partial<CSPConfig>): CSPConfig {
    const defaultConfig: CSPConfig = {
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
      }
    };

    // Merge with user config
    const merged = { ...defaultConfig, ...config };

    // Handle development environment
    if (merged.environment === 'development') {
      merged.directives = {
        ...merged.directives,
        'script-src': ["'self'", "'unsafe-eval'"], // Allow eval for dev tools
        'connect-src': ["'self'", 'ws:', 'wss:', 'http://localhost:*', 'https://localhost:*']
      };
    }

    // Handle test environment
    if (merged.environment === 'test') {
      merged.enforceMode = false; // Use report-only in tests
      merged.directives = {
        ...merged.directives,
        'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
      };
    }

    return merged;
  }

  /**
   * Initialize hash stores for different content types
   */
  private initializeHashStores(): void {
    this.hashStore.set('scripts', new Set());
    this.hashStore.set('styles', new Set());
    this.hashStore.set('inline-scripts', new Set());
    this.hashStore.set('inline-styles', new Set());
  }

  /**
   * Initialize CSP manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || !this.config.enabled) {
      return;
    }

    try {
      // Set up violation reporting
      if (this.config.reportUri || this.config.reportTo) {
        this.setupViolationReporting();
      }

      // Apply CSP to current document
      if (typeof document !== 'undefined') {
        await this.applyCSP();
      }

      // Set up nonce rotation if enabled
      if (this.config.useNonces) {
        this.setupNonceRotation();
      }

      // Set up hash computation for static content
      if (this.config.useHashes) {
        await this.computeContentHashes();
      }

      this.isInitialized = true;
      this.emit('initialized');

      logger.info('CSP Manager initialized successfully', {
        enforceMode: this.config.enforceMode,
        useNonces: this.config.useNonces,
        useHashes: this.config.useHashes,
        environment: this.config.environment
      });

    } catch (error) {
      logger.error('Failed to initialize CSP Manager', { error });
      throw error;
    }
  }

  /**
   * Apply CSP to the current document
   */
  private async applyCSP(): Promise<void> {
    // Skip CSP application in test environment if document is not properly available
    if (this.config.environment === 'test' && (!document || !document.head || !document.createElement)) {
      logger.info('CSP application skipped in test environment');
      return;
    }

    const policy = await this.generatePolicyString();
    
    // Remove existing CSP meta tag
    this.removeExistingCSP();

    // Create new meta tag
    this.metaElement = document.createElement('meta');
    this.metaElement.setAttribute('data-csp-source', 'sightedit');
    
    if (this.config.enforceMode) {
      this.metaElement.httpEquiv = 'Content-Security-Policy';
    } else {
      this.metaElement.httpEquiv = 'Content-Security-Policy-Report-Only';
    }
    
    this.metaElement.content = policy;
    document.head.appendChild(this.metaElement);

    logger.info(`CSP ${this.config.enforceMode ? 'enforced' : 'report-only'} policy applied`, {
      policy: policy.substring(0, 200) + '...'
    });
  }

  /**
   * Remove existing CSP meta tags
   */
  private removeExistingCSP(): void {
    const existing = document.querySelectorAll('meta[http-equiv*="Content-Security-Policy"]');
    existing.forEach(el => {
      if (el.getAttribute('data-csp-source') === 'sightedit') {
        el.remove();
      }
    });
  }

  /**
   * Generate CSP policy string with nonces and hashes
   */
  private async generatePolicyString(): Promise<string> {
    const directives: string[] = [];
    const currentNonce = this.getCurrentNonce();

    for (const [directive, sources] of Object.entries(this.config.directives)) {
      if (sources === true || sources === false) {
        if (sources === true) {
          directives.push(directive);
        }
        continue;
      }

      if (Array.isArray(sources) && sources.length > 0) {
        let directiveSources = [...sources];

        // Add nonces for script-src and style-src
        if (this.config.useNonces && currentNonce) {
          if (directive === 'script-src') {
            directiveSources.push(`'nonce-${currentNonce.scriptNonce}'`);
          } else if (directive === 'style-src') {
            directiveSources.push(`'nonce-${currentNonce.styleNonce}'`);
          }
        }

        // Add hashes for inline content
        if (this.config.useHashes) {
          const hashes = this.getHashesForDirective(directive);
          directiveSources.push(...hashes);
        }

        // Add strict-dynamic for modern browsers
        if (directive === 'script-src' && this.config.useNonces) {
          directiveSources.push("'strict-dynamic'");
          // Remove 'unsafe-inline' when strict-dynamic is used
          directiveSources = directiveSources.filter(src => src !== "'unsafe-inline'");
        }

        directives.push(`${directive} ${directiveSources.join(' ')}`);
      } else if (typeof sources === 'string') {
        directives.push(`${directive} ${sources}`);
      }
    }

    // Add report endpoints
    if (this.config.reportUri) {
      directives.push(`report-uri ${this.config.reportUri}`);
    }

    if (this.config.reportTo) {
      directives.push(`report-to ${this.config.reportTo}`);
    }

    return directives.join('; ');
  }

  /**
   * Get hashes for a specific directive
   */
  private getHashesForDirective(directive: string): string[] {
    const hashes: string[] = [];

    switch (directive) {
      case 'script-src':
        const scriptHashes = this.hashStore.get('scripts') || new Set();
        const inlineScriptHashes = this.hashStore.get('inline-scripts') || new Set();
        hashes.push(
          ...Array.from(scriptHashes).map(hash => `'sha256-${hash}'`),
          ...Array.from(inlineScriptHashes).map(hash => `'sha256-${hash}'`)
        );
        break;

      case 'style-src':
        const styleHashes = this.hashStore.get('styles') || new Set();
        const inlineStyleHashes = this.hashStore.get('inline-styles') || new Set();
        hashes.push(
          ...Array.from(styleHashes).map(hash => `'sha256-${hash}'`),
          ...Array.from(inlineStyleHashes).map(hash => `'sha256-${hash}'`)
        );
        break;
    }

    return hashes;
  }

  /**
   * Generate a new nonce
   */
  generateNonce(length: number = 32): string {
    const array = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, '');
  }

  /**
   * Create a new nonce store
   */
  createNonceStore(): NonceStore {
    return {
      scriptNonce: this.generateNonce(),
      styleNonce: this.generateNonce(),
      timestamp: Date.now(),
      isValid: true
    };
  }

  /**
   * Get current valid nonce
   */
  getCurrentNonce(): NonceStore | null {
    const sessionId = this.getSessionId();
    const stored = this.nonceStore.get(sessionId);
    
    if (stored && stored.isValid && (Date.now() - stored.timestamp < 300000)) { // 5 minutes
      return stored;
    }

    // Generate new nonce
    const newNonce = this.createNonceStore();
    this.nonceStore.set(sessionId, newNonce);
    return newNonce;
  }

  /**
   * Get session identifier
   */
  private getSessionId(): string {
    if (typeof document !== 'undefined') {
      return document.location.href;
    }
    return 'default';
  }

  /**
   * Set up nonce rotation
   */
  private setupNonceRotation(): void {
    // Rotate nonces every 5 minutes
    setInterval(() => {
      this.rotateNonces();
    }, 300000);
  }

  /**
   * Rotate all nonces
   */
  private async rotateNonces(): Promise<void> {
    // Invalidate all existing nonces
    this.nonceStore.forEach(nonce => {
      nonce.isValid = false;
    });

    // Clear old nonces
    this.nonceStore.clear();

    // Regenerate CSP with new nonces
    if (typeof document !== 'undefined' && this.isInitialized) {
      await this.applyCSP();
    }

    this.emit('noncesRotated');
    logger.info('CSP nonces rotated successfully');
  }

  /**
   * Add script with nonce
   */
  addScript(content: string, attributes: Record<string, string> = {}): HTMLScriptElement {
    const script = document.createElement('script');
    const nonce = this.getCurrentNonce();

    if (nonce && this.config.useNonces) {
      script.setAttribute('nonce', nonce.scriptNonce);
    }

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    // Add content
    if (attributes.src) {
      // External script
      script.src = attributes.src;
    } else {
      // Inline script - compute hash if hashes are enabled
      script.textContent = content;
      if (this.config.useHashes) {
        this.addContentHash('inline-scripts', content);
      }
    }

    return script;
  }

  /**
   * Add style with nonce
   */
  addStyle(content: string, attributes: Record<string, string> = {}): HTMLStyleElement {
    const style = document.createElement('style');
    const nonce = this.getCurrentNonce();

    if (nonce && this.config.useNonces) {
      style.setAttribute('nonce', nonce.styleNonce);
    }

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      style.setAttribute(key, value);
    });

    style.textContent = content;

    // Compute hash if hashes are enabled
    if (this.config.useHashes) {
      this.addContentHash('inline-styles', content);
    }

    return style;
  }

  /**
   * Compute SHA256 hash of content
   */
  private async computeSHA256(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return btoa(String.fromCharCode(...hashArray));
    }
    
    // Fallback for environments without crypto.subtle
    return btoa(content); // This is not secure, just for compatibility
  }

  /**
   * Add content hash to store
   */
  async addContentHash(type: string, content: string): Promise<void> {
    const hash = await this.computeSHA256(content);
    const store = this.hashStore.get(type) || new Set();
    store.add(hash);
    this.hashStore.set(type, store);
  }

  /**
   * Compute hashes for existing content
   */
  private async computeContentHashes(): Promise<void> {
    if (typeof document === 'undefined') return;

    // Compute hashes for inline scripts
    const inlineScripts = document.querySelectorAll('script:not([src])');
    for (const script of Array.from(inlineScripts)) {
      if (script.textContent) {
        await this.addContentHash('inline-scripts', script.textContent);
      }
    }

    // Compute hashes for inline styles
    const inlineStyles = document.querySelectorAll('style');
    for (const style of Array.from(inlineStyles)) {
      if (style.textContent) {
        await this.addContentHash('inline-styles', style.textContent);
      }
    }

    logger.info('Content hashes computed', {
      scriptHashes: this.hashStore.get('inline-scripts')?.size || 0,
      styleHashes: this.hashStore.get('inline-styles')?.size || 0
    });
  }

  /**
   * Set up CSP violation reporting
   */
  private setupViolationReporting(): void {
    if (typeof document === 'undefined') return;

    // Listen for CSP violations
    document.addEventListener('securitypolicyviolation', (event: SecurityPolicyViolationEvent) => {
      this.handleCSPViolation(event);
    });

    // Set up Report API if supported
    if ('ReportingObserver' in window && this.config.reportTo) {
      const observer = new (window as any).ReportingObserver((reports: any[]) => {
        reports.forEach(report => {
          if (report.type === 'csp-violation') {
            this.handleReportAPIViolation(report);
          }
        });
      });
      observer.observe();
    }

    // Set up report endpoint
    if (this.config.reportUri) {
      this.reportEndpoint = this.config.reportUri;
    }
  }

  /**
   * Handle CSP violation event
   */
  private handleCSPViolation(event: SecurityPolicyViolationEvent): void {
    const violation: CSPViolation = {
      documentUri: event.documentURI,
      blockedUri: event.blockedURI,
      violatedDirective: event.violatedDirective,
      originalPolicy: event.originalPolicy,
      referrer: event.referrer,
      statusCode: event.statusCode,
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
      columnNumber: event.columnNumber,
      sample: event.sample,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    };

    this.violations.push(violation);
    this.emit('violation', violation);

    // Log violation
    logger.warn('CSP violation detected', violation);

    // Report violation to endpoint
    if (this.reportEndpoint) {
      this.reportViolation(violation);
    }

    // Auto-remediation for development
    if (this.config.environment === 'development') {
      this.suggestAutoRemediation(violation);
    }
  }

  /**
   * Handle Report API violation
   */
  private handleReportAPIViolation(report: any): void {
    const violation: CSPViolation = {
      documentUri: report.url,
      blockedUri: report.body['blocked-uri'] || '',
      violatedDirective: report.body['violated-directive'] || '',
      originalPolicy: report.body['original-policy'] || '',
      statusCode: report.body['status-code'],
      sourceFile: report.body['source-file'],
      lineNumber: report.body['line-number'],
      columnNumber: report.body['column-number'],
      sample: report.body['script-sample'],
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    };

    this.handleCSPViolation(new SecurityPolicyViolationEvent('securitypolicyviolation', violation as any));
  }

  /**
   * Report violation to endpoint
   */
  private async reportViolation(violation: CSPViolation): Promise<void> {
    if (!this.reportEndpoint) return;

    try {
      await fetch(this.reportEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report'
        },
        body: JSON.stringify({
          'csp-report': violation
        })
      });
    } catch (error) {
      logger.error('Failed to report CSP violation', { error, violation });
    }
  }

  /**
   * Suggest auto-remediation for development
   */
  private suggestAutoRemediation(violation: CSPViolation): void {
    const suggestions: string[] = [];

    if (violation.violatedDirective.startsWith('script-src')) {
      if (violation.blockedUri === 'inline') {
        suggestions.push('Use nonce or hash for inline scripts');
        suggestions.push('Move script content to external file');
      } else {
        suggestions.push(`Add '${violation.blockedUri}' to script-src directive`);
      }
    }

    if (violation.violatedDirective.startsWith('style-src')) {
      if (violation.blockedUri === 'inline') {
        suggestions.push('Use nonce or hash for inline styles');
        suggestions.push('Move styles to external CSS file');
      } else {
        suggestions.push(`Add '${violation.blockedUri}' to style-src directive`);
      }
    }

    if (suggestions.length > 0) {
      logger.info('CSP auto-remediation suggestions', {
        violation: violation.violatedDirective,
        suggestions
      });
    }
  }

  /**
   * Update CSP configuration
   */
  async updateConfig(newConfig: Partial<CSPConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    if (this.isInitialized) {
      await this.applyCSP();
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Get CSP violations
   */
  getViolations(limit?: number): CSPViolation[] {
    return limit ? this.violations.slice(-limit) : this.violations;
  }

  /**
   * Clear violation history
   */
  clearViolations(): void {
    this.violations = [];
    this.emit('violationsCleared');
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<CSPConfig> {
    return { ...this.config };
  }

  /**
   * Check if CSP is properly configured
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for unsafe directives in production
    if (this.config.environment === 'production') {
      const scriptSrc = this.config.directives['script-src'] || [];
      if (scriptSrc.includes("'unsafe-inline'")) {
        errors.push("'unsafe-inline' should not be used in script-src for production");
      }
      if (scriptSrc.includes("'unsafe-eval'")) {
        errors.push("'unsafe-eval' should not be used in script-src for production");
      }

      const styleSrc = this.config.directives['style-src'] || [];
      if (styleSrc.includes("'unsafe-inline'") && !this.config.useNonces && !this.config.useHashes) {
        errors.push("'unsafe-inline' in style-src without nonces or hashes is not secure");
      }
    }

    // Check for missing essential directives
    if (!this.config.directives['default-src']) {
      errors.push("default-src directive is recommended");
    }

    if (!this.config.directives['script-src']) {
      errors.push("script-src directive is required");
    }

    // Check for overly permissive directives
    const defaultSrc = this.config.directives['default-src'] || [];
    if (defaultSrc.includes('*')) {
      errors.push("Wildcard '*' in default-src is too permissive");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get CSP status information
   */
  getStatus(): {
    enabled: boolean;
    enforcing: boolean;
    nonceCount: number;
    hashCount: number;
    violationCount: number;
    lastViolation?: CSPViolation;
  } {
    return {
      enabled: this.config.enabled,
      enforcing: this.config.enforceMode,
      nonceCount: this.nonceStore.size,
      hashCount: Array.from(this.hashStore.values()).reduce((acc, set) => acc + set.size, 0),
      violationCount: this.violations.length,
      lastViolation: this.violations[this.violations.length - 1]
    };
  }

  /**
   * Destroy CSP manager
   */
  destroy(): void {
    // Remove meta element
    if (this.metaElement) {
      this.metaElement.remove();
      this.metaElement = null;
    }

    // Clear stores
    this.nonceStore.clear();
    this.hashStore.clear();
    this.violations = [];

    // Remove all listeners
    this.removeAllListeners();

    this.isInitialized = false;
    logger.info('CSP Manager destroyed');
  }
}