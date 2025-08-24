/**
 * CSP Header Injection Prevention
 * Prevents malicious CSP header injection attacks and validates CSP headers
 */

import { logger } from '../utils/logger';
import { CSPDirectives } from './csp-manager';

export interface CSPInjectionResult {
  isSafe: boolean;
  threats: string[];
  sanitizedValue?: string;
  originalValue: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface CSPHeaderValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityRating: 'secure' | 'weak' | 'vulnerable';
  recommendations: string[];
}

export class CSPInjectionPrevention {
  private static readonly DANGEROUS_PATTERNS = [
    // Header injection patterns
    /[\r\n]/g, // CRLF injection
    /\x00/g,   // Null byte injection
    /\x0b/g,   // Vertical tab
    /\x0c/g,   // Form feed
    
    // CSP bypass attempts
    /data:\s*text\/html/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /livescript:/gi,
    /mocha:/gi,
    
    // Dangerous CSP values
    /'unsafe-eval'/gi,
    /'unsafe-inline'/gi,
    /\*\.[\w-]+/gi, // Wildcard subdomains that could be dangerous
    
    // Protocol injection
    /['"]\s*(data|javascript|vbscript):/gi,
    
    // Unicode/encoding bypass attempts
    /\\u[\da-f]{4}/gi,
    /%[\da-f]{2}/gi,
    
    // Control character injection
    /[\x01-\x08\x0e-\x1f\x7f]/g
  ];

  private static readonly BYPASS_KEYWORDS = [
    'eval',
    'Function',
    'setTimeout',
    'setInterval',
    'import(',
    'document.write',
    'innerHTML',
    'outerHTML',
    'insertAdjacentHTML',
    'srcdoc',
    'javascript:',
    'data:text/html'
  ];

  private static readonly SAFE_CSP_KEYWORDS = [
    "'self'",
    "'none'",
    "'strict-dynamic'",
    "'report-sample'",
    "'unsafe-hashes'",
    "blob:",
    "filesystem:",
    "https:",
    "wss:",
    "ws:"
  ];

  /**
   * Validate and sanitize CSP directive value
   */
  static validateCSPValue(directive: string, value: string): CSPInjectionResult {
    const result: CSPInjectionResult = {
      isSafe: true,
      threats: [],
      originalValue: value,
      threatLevel: 'low'
    };

    // Check for header injection patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        result.isSafe = false;
        result.threats.push(`Header injection pattern detected: ${pattern.source}`);
        result.threatLevel = 'critical';
      }
    }

    // Check for CSP bypass attempts
    const lowerValue = value.toLowerCase();
    for (const keyword of this.BYPASS_KEYWORDS) {
      if (lowerValue.includes(keyword.toLowerCase())) {
        result.isSafe = false;
        result.threats.push(`Potential CSP bypass keyword detected: ${keyword}`);
        result.threatLevel = result.threatLevel === 'critical' ? 'critical' : 'high';
      }
    }

    // Check for suspicious domain patterns
    const suspiciousDomains = this.extractSuspiciousDomains(value);
    if (suspiciousDomains.length > 0) {
      result.threats.push(`Suspicious domains detected: ${suspiciousDomains.join(', ')}`);
      result.threatLevel = result.threatLevel === 'critical' ? 'critical' : 'medium';
      result.isSafe = false;
    }

    // Check for protocol confusion
    if (this.hasProtocolConfusion(value)) {
      result.isSafe = false;
      result.threats.push('Protocol confusion attack detected');
      result.threatLevel = 'high';
    }

    // Sanitize the value if not safe
    if (!result.isSafe) {
      result.sanitizedValue = this.sanitizeCSPValue(directive, value);
    } else {
      result.sanitizedValue = value;
    }

    return result;
  }

  /**
   * Validate entire CSP header
   */
  static validateCSPHeader(cspHeader: string): CSPHeaderValidation {
    const result: CSPHeaderValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      securityRating: 'secure',
      recommendations: []
    };

    try {
      // Parse CSP header
      const directives = this.parseCSPHeader(cspHeader);
      
      // Validate each directive
      for (const [directive, values] of Object.entries(directives)) {
        const directiveValidation = this.validateDirective(directive, values);
        
        if (directiveValidation.errors.length > 0) {
          result.isValid = false;
          result.errors.push(...directiveValidation.errors);
        }
        
        result.warnings.push(...directiveValidation.warnings);
        result.recommendations.push(...directiveValidation.recommendations);
      }

      // Overall security assessment
      result.securityRating = this.assessSecurityRating(directives);
      
      // Add general recommendations
      this.addGeneralRecommendations(result, directives);

    } catch (error) {
      result.isValid = false;
      result.errors.push(`CSP header parsing failed: ${error}`);
      result.securityRating = 'vulnerable';
    }

    return result;
  }

  /**
   * Sanitize CSP directive value
   */
  private static sanitizeCSPValue(directive: string, value: string): string {
    let sanitized = value;

    // Remove dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Remove bypass keywords (but preserve safe ones)
    for (const keyword of this.BYPASS_KEYWORDS) {
      if (!this.SAFE_CSP_KEYWORDS.some(safe => 
        sanitized.toLowerCase().includes(safe.toLowerCase())
      )) {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(regex, '');
      }
    }

    // Clean up whitespace and normalize
    sanitized = sanitized
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(part => part.length > 0)
      .join(' ');

    // If sanitization removed everything, provide safe default
    if (!sanitized || sanitized.length === 0) {
      return "'none'";
    }

    return sanitized;
  }

  /**
   * Extract suspicious domains from CSP value
   */
  private static extractSuspiciousDomains(value: string): string[] {
    const suspicious: string[] = [];
    const domainRegex = /https?:\/\/([^\s;]+)/gi;
    const matches = value.match(domainRegex);

    if (matches) {
      for (const match of matches) {
        try {
          const url = new URL(match);
          const hostname = url.hostname.toLowerCase();
          
          // Check for suspicious TLDs
          const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.bit', '.onion'];
          if (suspiciousTlds.some(tld => hostname.endsWith(tld))) {
            suspicious.push(hostname);
          }
          
          // Check for IP addresses (potential security risk)
          if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            suspicious.push(hostname);
          }
          
          // Check for homograph attacks (basic check)
          if (/[а-я]/.test(hostname) || /[α-ω]/.test(hostname)) {
            suspicious.push(hostname);
          }
          
          // Check for suspicious patterns
          if (hostname.includes('xn--') || hostname.includes('..')) {
            suspicious.push(hostname);
          }
          
        } catch (error) {
          suspicious.push(match); // Malformed URL is suspicious
        }
      }
    }

    return suspicious;
  }

  /**
   * Check for protocol confusion attacks
   */
  private static hasProtocolConfusion(value: string): boolean {
    // Look for mixed protocols or protocol switching
    const protocolMixPattern = /(https?:.*ws:)|(wss?:.*https?:)/gi;
    
    // Look for protocol injection
    const protocolInjectionPattern = /['"]\s*[a-z]+:/gi;
    
    // Look for data URI with executable content
    const dataUriPattern = /data:\s*(?:text\/html|application\/javascript)/gi;
    
    return protocolMixPattern.test(value) || 
           protocolInjectionPattern.test(value) || 
           dataUriPattern.test(value);
  }

  /**
   * Parse CSP header into directives
   */
  private static parseCSPHeader(header: string): Record<string, string[]> {
    const directives: Record<string, string[]> = {};
    
    // Split by semicolon and process each directive
    const parts = header.split(';').map(part => part.trim()).filter(part => part);
    
    for (const part of parts) {
      const spaceIndex = part.indexOf(' ');
      if (spaceIndex === -1) {
        // Directive without values (like upgrade-insecure-requests)
        directives[part] = [];
      } else {
        const directive = part.substring(0, spaceIndex).trim();
        const values = part.substring(spaceIndex + 1).trim().split(/\s+/);
        directives[directive] = values;
      }
    }
    
    return directives;
  }

  /**
   * Validate individual directive
   */
  private static validateDirective(directive: string, values: string[]): {
    errors: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const result = { errors: [], warnings: [], recommendations: [] };
    
    // Validate directive name
    const validDirectives = [
      'default-src', 'script-src', 'style-src', 'img-src', 'connect-src',
      'font-src', 'object-src', 'media-src', 'frame-src', 'child-src',
      'worker-src', 'manifest-src', 'base-uri', 'form-action', 'frame-ancestors',
      'plugin-types', 'sandbox', 'report-uri', 'report-to',
      'require-trusted-types-for', 'trusted-types', 'upgrade-insecure-requests',
      'block-all-mixed-content'
    ];

    if (!validDirectives.includes(directive)) {
      result.warnings.push(`Unknown CSP directive: ${directive}`);
    }

    // Validate directive values
    for (const value of values) {
      const validation = this.validateCSPValue(directive, value);
      
      if (!validation.isSafe) {
        if (validation.threatLevel === 'critical' || validation.threatLevel === 'high') {
          result.errors.push(
            `Dangerous value in ${directive}: ${value} (${validation.threats.join(', ')})`
          );
        } else {
          result.warnings.push(
            `Potentially unsafe value in ${directive}: ${value}`
          );
        }
      }
    }

    // Directive-specific validations
    switch (directive) {
      case 'script-src':
        if (values.includes("'unsafe-eval'")) {
          result.warnings.push("'unsafe-eval' allows dangerous eval() function");
        }
        if (values.includes("'unsafe-inline'") && !values.includes("'strict-dynamic'")) {
          result.warnings.push("'unsafe-inline' without 'strict-dynamic' reduces security");
        }
        break;

      case 'object-src':
        if (!values.includes("'none'")) {
          result.recommendations.push("Consider setting object-src to 'none' to prevent Flash/plugin attacks");
        }
        break;

      case 'base-uri':
        if (values.includes("'unsafe-inline'") || values.length === 0) {
          result.errors.push("base-uri must be restricted to prevent base tag injection");
        }
        break;
    }

    return result;
  }

  /**
   * Assess overall security rating
   */
  private static assessSecurityRating(directives: Record<string, string[]>): 'secure' | 'weak' | 'vulnerable' {
    let score = 100;

    // Check for critical security issues
    if (directives['script-src']?.includes("'unsafe-eval'")) {
      score -= 30;
    }

    if (directives['script-src']?.includes("'unsafe-inline'") && 
        !directives['script-src']?.includes("'strict-dynamic'")) {
      score -= 25;
    }

    if (directives['object-src'] && !directives['object-src'].includes("'none'")) {
      score -= 15;
    }

    if (!directives['base-uri'] || directives['base-uri'].length === 0) {
      score -= 20;
    }

    if (!directives['default-src']) {
      score -= 10;
    }

    // Bonus for security features
    if (directives['require-trusted-types-for']?.includes("'script'")) {
      score += 5;
    }

    if (directives['upgrade-insecure-requests']) {
      score += 5;
    }

    if (score >= 80) return 'secure';
    if (score >= 50) return 'weak';
    return 'vulnerable';
  }

  /**
   * Add general recommendations
   */
  private static addGeneralRecommendations(
    result: CSPHeaderValidation, 
    directives: Record<string, string[]>
  ): void {
    if (!directives['default-src']) {
      result.recommendations.push("Add 'default-src' directive as a fallback");
    }

    if (!directives['object-src'] || !directives['object-src'].includes("'none'")) {
      result.recommendations.push("Set 'object-src' to 'none' to prevent plugin-based attacks");
    }

    if (!directives['base-uri']) {
      result.recommendations.push("Add 'base-uri' directive to prevent base tag injection");
    }

    if (!directives['frame-ancestors']) {
      result.recommendations.push("Add 'frame-ancestors' directive to control embedding");
    }

    if (!directives['upgrade-insecure-requests']) {
      result.recommendations.push("Consider adding 'upgrade-insecure-requests' for HTTPS enforcement");
    }

    if (!directives['require-trusted-types-for']) {
      result.recommendations.push("Consider enabling Trusted Types with 'require-trusted-types-for'");
    }
  }

  /**
   * Detect CSP bypass attempts in user input
   */
  static detectBypassAttempts(input: string): {
    hasBypassAttempt: boolean;
    bypassMethods: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const bypassMethods: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Common CSP bypass patterns
    const bypassPatterns = [
      { pattern: /jsonp/gi, method: 'JSONP bypass', risk: 'high' as const },
      { pattern: /angular/gi, method: 'AngularJS bypass', risk: 'high' as const },
      { pattern: /iframe.*srcdoc/gi, method: 'Iframe srcdoc bypass', risk: 'critical' as const },
      { pattern: /base64/gi, method: 'Base64 encoding bypass', risk: 'medium' as const },
      { pattern: /eval.*atob/gi, method: 'Base64 eval bypass', risk: 'critical' as const },
      { pattern: /document\.domain/gi, method: 'Document domain bypass', risk: 'high' as const },
      { pattern: /postMessage/gi, method: 'PostMessage bypass', risk: 'medium' as const },
      { pattern: /location\.href/gi, method: 'Location manipulation', risk: 'medium' as const },
      { pattern: /window\.open/gi, method: 'Window.open bypass', risk: 'medium' as const }
    ];

    for (const { pattern, method, risk } of bypassPatterns) {
      if (pattern.test(input)) {
        bypassMethods.push(method);
        if (risk === 'critical' || (risk === 'high' && riskLevel !== 'critical')) {
          riskLevel = risk;
        } else if (risk === 'medium' && riskLevel === 'low') {
          riskLevel = risk;
        }
      }
    }

    return {
      hasBypassAttempt: bypassMethods.length > 0,
      bypassMethods,
      riskLevel
    };
  }

  /**
   * Generate secure CSP header for given requirements
   */
  static generateSecureCSP(requirements: {
    allowInlineStyles: boolean;
    allowInlineScripts: boolean;
    allowedDomains: string[];
    useNonces: boolean;
    useTrustedTypes: boolean;
    environment: 'development' | 'production';
  }): string {
    const directives: string[] = [];

    // Default source - start restrictive
    directives.push("default-src 'none'");

    // Script source
    const scriptSrc = ["'self'"];
    if (requirements.allowInlineScripts) {
      if (requirements.useNonces) {
        // Nonce will be added at runtime
        scriptSrc.push("'strict-dynamic'");
      } else {
        scriptSrc.push("'unsafe-inline'");
      }
    }
    if (requirements.environment === 'development') {
      scriptSrc.push("'unsafe-eval'"); // For dev tools
    }
    scriptSrc.push(...requirements.allowedDomains);
    directives.push(`script-src ${scriptSrc.join(' ')}`);

    // Style source  
    const styleSrc = ["'self'"];
    if (requirements.allowInlineStyles) {
      if (requirements.useNonces) {
        // Nonce will be added at runtime
      } else {
        styleSrc.push("'unsafe-inline'");
      }
    }
    styleSrc.push(...requirements.allowedDomains);
    directives.push(`style-src ${styleSrc.join(' ')}`);

    // Other sources
    directives.push("img-src 'self' data: https:");
    directives.push("font-src 'self' https:");
    directives.push("connect-src 'self'");
    directives.push("media-src 'self'");
    directives.push("object-src 'none'");
    directives.push("child-src 'none'");
    directives.push("frame-src 'none'");
    directives.push("worker-src 'self'");
    directives.push("manifest-src 'self'");
    directives.push("base-uri 'self'");
    directives.push("form-action 'self'");
    directives.push("frame-ancestors 'none'");

    // Security features
    if (requirements.environment === 'production') {
      directives.push("upgrade-insecure-requests");
      directives.push("block-all-mixed-content");
    }

    if (requirements.useTrustedTypes) {
      directives.push("require-trusted-types-for 'script'");
      directives.push("trusted-types sightedit-policy default");
    }

    return directives.join('; ');
  }

  /**
   * Monitor for CSP header tampering
   */
  static monitorHeaderTampering(): {
    startMonitoring: () => void;
    stopMonitoring: () => void;
    getDetectedTampering: () => Array<{
      timestamp: number;
      originalHeader: string;
      tamperedHeader: string;
      source: string;
    }>;
  } {
    const tamperedHeaders: Array<{
      timestamp: number;
      originalHeader: string;
      tamperedHeader: string;
      source: string;
    }> = [];

    let monitoring = false;
    let originalHeaders = new Map<string, string>();
    let observer: MutationObserver | null = null;

    const startMonitoring = () => {
      if (monitoring) return;
      monitoring = true;

      // Store original CSP headers
      const metaElements = document.querySelectorAll('meta[http-equiv*="Content-Security-Policy"]');
      metaElements.forEach((meta, index) => {
        const content = meta.getAttribute('content') || '';
        originalHeaders.set(`meta-${index}`, content);
      });

      // Monitor for changes
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && 
              mutation.target instanceof HTMLMetaElement &&
              mutation.target.getAttribute('http-equiv')?.includes('Content-Security-Policy')) {
            
            const originalKey = `meta-${Array.from(document.querySelectorAll('meta[http-equiv*="Content-Security-Policy"]')).indexOf(mutation.target)}`;
            const original = originalHeaders.get(originalKey) || '';
            const current = mutation.target.getAttribute('content') || '';
            
            if (original !== current) {
              tamperedHeaders.push({
                timestamp: Date.now(),
                originalHeader: original,
                tamperedHeader: current,
                source: 'meta-element-modification'
              });
              
              logger.warn('CSP header tampering detected', {
                original,
                tampered: current,
                element: mutation.target.outerHTML
              });
            }
          }
        });
      });

      observer.observe(document.head, {
        attributes: true,
        subtree: true,
        attributeFilter: ['content', 'http-equiv']
      });

      logger.info('CSP header tampering monitoring started');
    };

    const stopMonitoring = () => {
      if (!monitoring) return;
      monitoring = false;

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      originalHeaders.clear();
      logger.info('CSP header tampering monitoring stopped');
    };

    const getDetectedTampering = () => [...tamperedHeaders];

    return {
      startMonitoring,
      stopMonitoring,
      getDetectedTampering
    };
  }
}