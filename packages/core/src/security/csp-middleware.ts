/**
 * CSP Middleware for different environments (Express.js, Node.js, Browser)
 */

import { CSPManager, CSPConfig, CSPViolation } from './csp-manager';
import { logger } from '../utils/logger';

export interface CSPMiddlewareConfig extends Partial<CSPConfig> {
  reportEndpoint?: string;
  includeReportSample?: boolean;
  maxAge?: number;
  preloadDirectives?: boolean;
  enableBrowserReporting?: boolean;
}

/**
 * Express.js CSP Middleware
 */
export class ExpressCSPMiddleware {
  private cspManager: CSPManager;
  private config: CSPMiddlewareConfig;

  constructor(config: CSPMiddlewareConfig = {}) {
    this.config = config;
    this.cspManager = new CSPManager(config);
  }

  /**
   * Initialize middleware
   */
  async initialize(): Promise<void> {
    await this.cspManager.initialize();
  }

  /**
   * Express middleware function
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      try {
        // Generate fresh nonce for this request
        const nonce = this.cspManager.createNonceStore();
        
        // Store nonce in request for use in templates
        req.cspNonce = {
          script: nonce.scriptNonce,
          style: nonce.styleNonce
        };

        // Generate CSP header
        const policy = await this.generatePolicyForRequest(req, nonce);
        
        // Set CSP header
        if (this.config.enforceMode !== false) {
          res.setHeader('Content-Security-Policy', policy);
        } else {
          res.setHeader('Content-Security-Policy-Report-Only', policy);
        }

        // Set additional security headers
        this.setAdditionalHeaders(res);

        next();
      } catch (error) {
        logger.error('CSP middleware error', { error });
        next(error);
      }
    };
  }

  /**
   * CSP violation reporting endpoint
   */
  reportingEndpoint() {
    return async (req: any, res: any) => {
      try {
        const report = req.body;
        
        // Validate report format
        if (!this.isValidCSPReport(report)) {
          return res.status(400).json({ error: 'Invalid CSP report format' });
        }

        // Process violation
        const violation = this.parseCSPReport(report, req);
        
        // Store and emit violation
        this.handleViolationReport(violation);

        // Respond with 204 No Content
        res.status(204).end();
        
      } catch (error) {
        logger.error('CSP report processing error', { error });
        res.status(500).json({ error: 'Report processing failed' });
      }
    };
  }

  /**
   * Generate CSP policy for specific request
   */
  private async generatePolicyForRequest(req: any, nonce: any): Promise<string> {
    const config = { ...this.cspManager.getConfig() };
    
    // Add nonces to directives
    if (config.useNonces && nonce) {
      if (config.directives['script-src']) {
        config.directives['script-src'] = [
          ...config.directives['script-src'],
          `'nonce-${nonce.script}'`
        ];
      }
      
      if (config.directives['style-src']) {
        config.directives['style-src'] = [
          ...config.directives['style-src'],
          `'nonce-${nonce.style}'`
        ];
      }
    }

    // Add report URI if configured
    if (this.config.reportEndpoint) {
      config.directives['report-uri'] = this.config.reportEndpoint;
    }

    return this.buildPolicyString(config.directives);
  }

  /**
   * Set additional security headers
   */
  private setAdditionalHeaders(res: any): void {
    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // X-Frame-Options (redundant with frame-ancestors but adds defense in depth)
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Referrer-Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Cross-Origin-Embedder-Policy
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    
    // Cross-Origin-Opener-Policy
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    
    // Cross-Origin-Resource-Policy
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    // Permissions-Policy (formerly Feature-Policy)
    res.setHeader('Permissions-Policy', 
      'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  }

  /**
   * Build policy string from directives
   */
  private buildPolicyString(directives: any): string {
    const parts: string[] = [];
    
    for (const [directive, value] of Object.entries(directives)) {
      if (value === true) {
        parts.push(directive);
      } else if (Array.isArray(value) && value.length > 0) {
        parts.push(`${directive} ${value.join(' ')}`);
      } else if (typeof value === 'string') {
        parts.push(`${directive} ${value}`);
      }
    }
    
    return parts.join('; ');
  }

  /**
   * Validate CSP report format
   */
  private isValidCSPReport(report: any): boolean {
    return report && 
           report['csp-report'] && 
           typeof report['csp-report'] === 'object' &&
           report['csp-report']['violated-directive'];
  }

  /**
   * Parse CSP report into violation object
   */
  private parseCSPReport(report: any, req: any): CSPViolation {
    const cspReport = report['csp-report'];
    
    return {
      documentUri: cspReport['document-uri'] || req.url,
      blockedUri: cspReport['blocked-uri'] || '',
      violatedDirective: cspReport['violated-directive'],
      originalPolicy: cspReport['original-policy'] || '',
      referrer: cspReport.referrer,
      statusCode: cspReport['status-code'],
      sourceFile: cspReport['source-file'],
      lineNumber: cspReport['line-number'],
      columnNumber: cspReport['column-number'],
      sample: cspReport['script-sample'],
      timestamp: Date.now(),
      userAgent: req.headers['user-agent'] || 'unknown'
    };
  }

  /**
   * Handle violation report
   */
  private handleViolationReport(violation: CSPViolation): void {
    // Log violation
    logger.warn('CSP violation reported', {
      directive: violation.violatedDirective,
      blockedUri: violation.blockedUri,
      sourceFile: violation.sourceFile,
      userAgent: violation.userAgent
    });

    // Emit event for external handlers
    this.cspManager.emit('violation', violation);

    // Auto-remediation suggestions for development
    if (this.config.environment === 'development') {
      this.suggestRemediation(violation);
    }
  }

  /**
   * Suggest remediation for violations
   */
  private suggestRemediation(violation: CSPViolation): void {
    const suggestions: string[] = [];
    
    if (violation.violatedDirective.includes('script-src')) {
      if (violation.blockedUri === 'inline') {
        suggestions.push('Add nonce or hash for inline script');
        suggestions.push('Move script to external file');
      } else {
        suggestions.push(`Add ${violation.blockedUri} to script-src allowlist`);
      }
    }
    
    if (violation.violatedDirective.includes('style-src')) {
      if (violation.blockedUri === 'inline') {
        suggestions.push('Add nonce or hash for inline style');
        suggestions.push('Move styles to external CSS file');
      } else {
        suggestions.push(`Add ${violation.blockedUri} to style-src allowlist`);
      }
    }

    logger.info('CSP violation remediation suggestions', {
      violation: violation.violatedDirective,
      suggestions
    });
  }
}

/**
 * Browser CSP Helper
 */
export class BrowserCSPHelper {
  private cspManager: CSPManager;
  private observer: MutationObserver | null = null;

  constructor(config: CSPMiddlewareConfig = {}) {
    this.cspManager = new CSPManager(config);
  }

  /**
   * Initialize browser CSP helper
   */
  async initialize(): Promise<void> {
    await this.cspManager.initialize();
    this.setupDOMObserver();
    this.setupViolationListener();
  }

  /**
   * Add script with proper nonce/hash
   */
  addScript(src?: string, content?: string, attributes: Record<string, string> = {}): Promise<HTMLScriptElement> {
    return new Promise((resolve, reject) => {
      const script = this.cspManager.addScript(content || '', { ...attributes, src });
      
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      
      document.head.appendChild(script);
    });
  }

  /**
   * Add style with proper nonce/hash
   */
  addStyle(href?: string, content?: string, attributes: Record<string, string> = {}): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      if (href) {
        // External stylesheet
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        
        Object.entries(attributes).forEach(([key, value]) => {
          link.setAttribute(key, value);
        });
        
        link.onload = () => resolve(link);
        link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
        
        document.head.appendChild(link);
      } else {
        // Inline style
        const style = this.cspManager.addStyle(content || '', attributes);
        document.head.appendChild(style);
        resolve(style);
      }
    });
  }

  /**
   * Set up DOM observer to detect unsafe content
   */
  private setupDOMObserver(): void {
    this.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.validateAddedElement(node as Element);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'style', 'onclick', 'onload']
    });
  }

  /**
   * Validate added DOM elements
   */
  private validateAddedElement(element: Element): void {
    // Check for inline event handlers
    const eventAttributes = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('on'));
    
    if (eventAttributes.length > 0) {
      logger.warn('Inline event handlers detected', {
        element: element.tagName,
        attributes: eventAttributes.map(attr => attr.name)
      });
    }

    // Check for inline styles
    if (element.hasAttribute('style')) {
      logger.warn('Inline style detected', {
        element: element.tagName,
        style: element.getAttribute('style')
      });
    }

    // Check scripts
    if (element.tagName === 'SCRIPT') {
      const script = element as HTMLScriptElement;
      if (script.textContent && !script.hasAttribute('nonce')) {
        logger.warn('Inline script without nonce detected', {
          content: script.textContent.substring(0, 100)
        });
      }
    }
  }

  /**
   * Set up CSP violation listener
   */
  private setupViolationListener(): void {
    document.addEventListener('securitypolicyviolation', (event) => {
      logger.warn('CSP violation detected in browser', {
        directive: event.violatedDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber
      });
    });
  }

  /**
   * Get current nonce values for templates
   */
  getCurrentNonces(): { script: string; style: string } | null {
    const nonce = this.cspManager.getCurrentNonce();
    return nonce ? {
      script: nonce.scriptNonce,
      style: nonce.styleNonce
    } : null;
  }

  /**
   * Destroy helper
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.cspManager.destroy();
  }
}

/**
 * Node.js CSP Utilities
 */
export class NodeCSPUtils {
  /**
   * Generate CSP for static files
   */
  static generateStaticCSP(files: string[]): Promise<Record<string, string[]>> {
    return new Promise(async (resolve, reject) => {
      try {
        const hashes: Record<string, string[]> = {
          'script-src': [],
          'style-src': []
        };

        for (const file of files) {
          if (file.endsWith('.js')) {
            // Would need to read file and compute hash
            // This is a placeholder for actual implementation
            hashes['script-src'].push(`'sha256-${await this.computeFileHash(file)}'`);
          } else if (file.endsWith('.css')) {
            hashes['style-src'].push(`'sha256-${await this.computeFileHash(file)}'`);
          }
        }

        resolve(hashes);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Compute file hash (placeholder)
   */
  private static async computeFileHash(filePath: string): Promise<string> {
    // In real implementation, would read file and compute SHA256
    // This is just a placeholder
    return 'placeholder-hash';
  }

  /**
   * Validate CSP configuration
   */
  static validateCSPConfig(config: CSPConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for security issues
    const scriptSrc = config.directives['script-src'] || [];
    if (scriptSrc.includes("'unsafe-eval'") && config.environment === 'production') {
      errors.push("'unsafe-eval' should not be used in production");
    }

    if (scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'strict-dynamic'")) {
      errors.push("'unsafe-inline' without 'strict-dynamic' is not secure");
    }

    // Check for required directives
    if (!config.directives['default-src']) {
      errors.push("'default-src' directive is recommended");
    }

    if (!config.directives['script-src']) {
      errors.push("'script-src' directive is required");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * CSP Testing Utilities
 */
export class CSPTestingUtils {
  /**
   * Test CSP policy against common attack vectors
   */
  static async testCSPPolicy(policy: string): Promise<{
    passed: boolean;
    results: Array<{ test: string; passed: boolean; message: string }>;
  }> {
    const results = [];
    let allPassed = true;

    // Test 1: Check for unsafe-inline in script-src
    const hasUnsafeInlineScript = policy.includes("script-src") && 
                                 policy.includes("'unsafe-inline'") &&
                                 !policy.includes("'strict-dynamic'");
    
    results.push({
      test: 'Script unsafe-inline check',
      passed: !hasUnsafeInlineScript,
      message: hasUnsafeInlineScript ? 
               "Policy allows unsafe-inline scripts without strict-dynamic" :
               "Script-src properly configured"
    });

    if (hasUnsafeInlineScript) allPassed = false;

    // Test 2: Check for unsafe-eval
    const hasUnsafeEval = policy.includes("'unsafe-eval'");
    results.push({
      test: 'Unsafe eval check',
      passed: !hasUnsafeEval,
      message: hasUnsafeEval ?
               "Policy allows unsafe-eval which can enable XSS" :
               "No unsafe-eval detected"
    });

    if (hasUnsafeEval) allPassed = false;

    // Test 3: Check for wildcard domains
    const hasWildcard = policy.includes(' *') || policy.includes(' *.') || policy.includes('*.');
    results.push({
      test: 'Wildcard domain check',
      passed: !hasWildcard,
      message: hasWildcard ?
               "Policy contains wildcard domains which may be too permissive" :
               "No dangerous wildcards detected"
    });

    // Test 4: Check for data: URIs in script-src
    const hasDataUriScript = policy.includes('script-src') && policy.includes('data:');
    results.push({
      test: 'Data URI in script-src check',
      passed: !hasDataUriScript,
      message: hasDataUriScript ?
               "Policy allows data: URIs in script-src which can bypass CSP" :
               "No data: URIs in script-src"
    });

    if (hasDataUriScript) allPassed = false;

    // Test 5: Check for object-src none
    const hasObjectSrcNone = policy.includes("object-src 'none'");
    results.push({
      test: 'Object-src restriction check',
      passed: hasObjectSrcNone,
      message: hasObjectSrcNone ?
               "Object-src properly restricted" :
               "Consider adding object-src 'none' to prevent Flash/plugin attacks"
    });

    return { passed: allPassed, results };
  }

  /**
   * Generate test cases for CSP policy
   */
  static generateCSPTestCases(policy: string): Array<{
    name: string;
    html: string;
    shouldBlock: boolean;
    directive: string;
  }> {
    return [
      {
        name: 'Inline script execution',
        html: '<script>alert("XSS")</script>',
        shouldBlock: !policy.includes("'unsafe-inline'") || policy.includes("'strict-dynamic'"),
        directive: 'script-src'
      },
      {
        name: 'Inline style execution',
        html: '<div style="background: red;">Test</div>',
        shouldBlock: policy.includes("style-src") && 
                    !policy.includes("style-src 'unsafe-inline'") &&
                    !policy.includes("style-src") === false,
        directive: 'style-src'
      },
      {
        name: 'External script loading',
        html: '<script src="https://evil.com/malicious.js"></script>',
        shouldBlock: !policy.includes('https://evil.com') && !policy.includes('*'),
        directive: 'script-src'
      },
      {
        name: 'Data URI script',
        html: '<script src="data:text/javascript,alert(\'XSS\')"></script>',
        shouldBlock: !policy.includes('data:') || !policy.includes('script-src'),
        directive: 'script-src'
      },
      {
        name: 'Iframe embedding',
        html: '<iframe src="https://evil.com"></iframe>',
        shouldBlock: policy.includes("frame-src 'none'") || 
                    (!policy.includes('https://evil.com') && !policy.includes('*')),
        directive: 'frame-src'
      }
    ];
  }
}