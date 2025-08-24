/**
 * Comprehensive Security Headers Middleware
 * Implements all OWASP recommended security headers with strict CSP
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { configManager } from '../config/secure-config';

export interface SecurityHeadersConfig {
  // Content Security Policy
  csp?: {
    enabled?: boolean;
    reportOnly?: boolean;
    directives?: Record<string, string[]>;
    reportUri?: string;
    nonce?: boolean;
  };
  
  // HTTP Strict Transport Security
  hsts?: {
    enabled?: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  
  // X-Frame-Options
  frameOptions?: {
    enabled?: boolean;
    action?: 'DENY' | 'SAMEORIGIN';
  };
  
  // X-Content-Type-Options
  noSniff?: boolean;
  
  // X-XSS-Protection (deprecated but still used by older browsers)
  xssProtection?: boolean;
  
  // Referrer-Policy
  referrerPolicy?: string;
  
  // Permissions-Policy (formerly Feature-Policy)
  permissionsPolicy?: {
    enabled?: boolean;
    directives?: Record<string, string[]>;
  };
  
  // Cross-Origin Headers
  crossOrigin?: {
    embedderPolicy?: 'require-corp' | 'credentialless' | 'unsafe-none';
    openerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';
    resourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin';
  };
  
  // Custom headers
  customHeaders?: Record<string, string>;
}

/**
 * CSP Nonce Manager
 */
class CSPNonceManager {
  private nonceCache = new Map<string, { nonce: string; timestamp: number }>();
  private readonly NONCE_TTL = 5 * 60 * 1000; // 5 minutes
  
  generateNonce(): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    return nonce;
  }
  
  storeNonce(requestId: string, nonce: string): void {
    this.nonceCache.set(requestId, {
      nonce,
      timestamp: Date.now(),
    });
    
    // Cleanup old nonces
    this.cleanup();
  }
  
  getNonce(requestId: string): string | null {
    const entry = this.nonceCache.get(requestId);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.NONCE_TTL) {
      this.nonceCache.delete(requestId);
      return null;
    }
    
    return entry.nonce;
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.nonceCache.entries()) {
      if (now - value.timestamp > this.NONCE_TTL) {
        this.nonceCache.delete(key);
      }
    }
  }
}

const nonceManager = new CSPNonceManager();

/**
 * Build Content Security Policy
 */
function buildCSP(config: SecurityHeadersConfig['csp'], nonce?: string): string {
  if (!config || !config.enabled) {
    return '';
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultDirectives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': isProduction 
      ? ["'self'", nonce ? `'nonce-${nonce}'` : '', "'strict-dynamic'"].filter(Boolean)
      : ["'self'", nonce ? `'nonce-${nonce}'` : '', "'unsafe-eval'"].filter(Boolean), // unsafe-eval only in dev
    'style-src': ["'self'", nonce ? `'nonce-${nonce}'` : '', "'unsafe-inline'"].filter(Boolean),
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'font-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'wss:', 'https:'],
    'media-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
  };
  
  // Add upgrade-insecure-requests in production
  if (isProduction) {
    defaultDirectives['upgrade-insecure-requests'] = [];
    defaultDirectives['block-all-mixed-content'] = [];
  }
  
  // Merge with custom directives
  const directives = { ...defaultDirectives, ...config.directives };
  
  // Add trusted hosts from environment
  if (process.env.CSP_TRUSTED_HOSTS) {
    const trustedHosts = process.env.CSP_TRUSTED_HOSTS.split(',');
    directives['script-src'].push(...trustedHosts);
    directives['style-src'].push(...trustedHosts);
    directives['connect-src'].push(...trustedHosts);
  }
  
  // Add report-uri if configured
  if (config.reportUri) {
    directives['report-uri'] = [config.reportUri];
  }
  
  // Build CSP string
  const cspString = Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) {
        return key;
      }
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
  
  return cspString;
}

/**
 * Build Permissions Policy
 */
function buildPermissionsPolicy(config: SecurityHeadersConfig['permissionsPolicy']): string {
  if (!config || !config.enabled) {
    return '';
  }
  
  const defaultDirectives: Record<string, string[]> = {
    'accelerometer': ['()'],
    'ambient-light-sensor': ['()'],
    'autoplay': ['(self)'],
    'battery': ['()'],
    'camera': ['()'],
    'display-capture': ['()'],
    'document-domain': ['()'],
    'encrypted-media': ['(self)'],
    'execution-while-not-rendered': ['()'],
    'execution-while-out-of-viewport': ['()'],
    'fullscreen': ['(self)'],
    'geolocation': ['()'],
    'gyroscope': ['()'],
    'keyboard-map': ['()'],
    'magnetometer': ['()'],
    'microphone': ['()'],
    'midi': ['()'],
    'navigation-override': ['()'],
    'payment': ['()'],
    'picture-in-picture': ['(self)'],
    'publickey-credentials-get': ['()'],
    'screen-wake-lock': ['()'],
    'sync-xhr': ['()'],
    'usb': ['()'],
    'web-share': ['()'],
    'xr-spatial-tracking': ['()'],
  };
  
  const directives = { ...defaultDirectives, ...config.directives };
  
  const policyString = Object.entries(directives)
    .map(([key, values]) => `${key}=${values.join(' ')}`)
    .join(', ');
  
  return policyString;
}

/**
 * Security headers middleware
 */
export function securityHeaders(customConfig?: SecurityHeadersConfig) {
  const config = configManager.loadConfig();
  
  const defaultConfig: SecurityHeadersConfig = {
    csp: {
      enabled: true,
      reportOnly: process.env.NODE_ENV === 'development',
      nonce: true,
      reportUri: '/api/csp-report',
    },
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameOptions: {
      enabled: true,
      action: 'DENY',
    },
    noSniff: true,
    xssProtection: false, // Disabled as CSP is better
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      enabled: true,
    },
    crossOrigin: {
      embedderPolicy: 'require-corp',
      openerPolicy: 'same-origin',
      resourcePolicy: 'same-origin',
    },
  };
  
  const mergedConfig = {
    ...defaultConfig,
    ...customConfig,
    csp: { ...defaultConfig.csp, ...customConfig?.csp },
    hsts: { ...defaultConfig.hsts, ...customConfig?.hsts },
    frameOptions: { ...defaultConfig.frameOptions, ...customConfig?.frameOptions },
    permissionsPolicy: { ...defaultConfig.permissionsPolicy, ...customConfig?.permissionsPolicy },
    crossOrigin: { ...defaultConfig.crossOrigin, ...customConfig?.crossOrigin },
  };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate CSP nonce if enabled
    let nonce: string | undefined;
    if (mergedConfig.csp?.nonce) {
      nonce = nonceManager.generateNonce();
      const requestId = `${req.ip}-${Date.now()}-${Math.random()}`;
      nonceManager.storeNonce(requestId, nonce);
      
      // Store nonce in res.locals for template use
      res.locals.cspNonce = nonce;
    }
    
    // Content Security Policy
    if (mergedConfig.csp?.enabled) {
      const cspHeader = mergedConfig.csp.reportOnly 
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
      
      const cspValue = buildCSP(mergedConfig.csp, nonce);
      if (cspValue) {
        res.setHeader(cspHeader, cspValue);
      }
    }
    
    // HTTP Strict Transport Security
    if (mergedConfig.hsts?.enabled && config.ssl.enabled) {
      const hstsValue = [
        `max-age=${mergedConfig.hsts.maxAge}`,
        mergedConfig.hsts.includeSubDomains && 'includeSubDomains',
        mergedConfig.hsts.preload && 'preload',
      ].filter(Boolean).join('; ');
      
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    
    // X-Frame-Options
    if (mergedConfig.frameOptions?.enabled) {
      res.setHeader('X-Frame-Options', mergedConfig.frameOptions.action || 'DENY');
    }
    
    // X-Content-Type-Options
    if (mergedConfig.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // X-XSS-Protection (for older browsers)
    if (mergedConfig.xssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    } else {
      res.setHeader('X-XSS-Protection', '0'); // Disable as CSP is better
    }
    
    // Referrer-Policy
    if (mergedConfig.referrerPolicy) {
      res.setHeader('Referrer-Policy', mergedConfig.referrerPolicy);
    }
    
    // Permissions-Policy
    if (mergedConfig.permissionsPolicy?.enabled) {
      const permissionsValue = buildPermissionsPolicy(mergedConfig.permissionsPolicy);
      if (permissionsValue) {
        res.setHeader('Permissions-Policy', permissionsValue);
      }
    }
    
    // Cross-Origin Headers
    if (mergedConfig.crossOrigin) {
      if (mergedConfig.crossOrigin.embedderPolicy) {
        res.setHeader('Cross-Origin-Embedder-Policy', mergedConfig.crossOrigin.embedderPolicy);
      }
      if (mergedConfig.crossOrigin.openerPolicy) {
        res.setHeader('Cross-Origin-Opener-Policy', mergedConfig.crossOrigin.openerPolicy);
      }
      if (mergedConfig.crossOrigin.resourcePolicy) {
        res.setHeader('Cross-Origin-Resource-Policy', mergedConfig.crossOrigin.resourcePolicy);
      }
    }
    
    // Additional security headers
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    
    // Remove insecure headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Custom headers
    if (mergedConfig.customHeaders) {
      for (const [key, value] of Object.entries(mergedConfig.customHeaders)) {
        res.setHeader(key, value);
      }
    }
    
    // Add security event ID for tracking
    res.setHeader('X-Request-ID', crypto.randomBytes(16).toString('hex'));
    
    next();
  };
}

/**
 * CSP violation report handler
 */
export async function handleCSPReport(req: Request, res: Response): Promise<void> {
  try {
    const report = req.body;
    
    // Validate report structure
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ error: 'Invalid report format' });
    }
    
    const cspReport = report['csp-report'] || report;
    
    // Log CSP violation
    console.warn('CSP Violation:', {
      documentUri: cspReport['document-uri'],
      violatedDirective: cspReport['violated-directive'],
      effectiveDirective: cspReport['effective-directive'],
      originalPolicy: cspReport['original-policy'],
      blockedUri: cspReport['blocked-uri'],
      statusCode: cspReport['status-code'],
      referrer: cspReport.referrer,
      scriptSample: cspReport['script-sample'],
      sourceFile: cspReport['source-file'],
      lineNumber: cspReport['line-number'],
      columnNumber: cspReport['column-number'],
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    
    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production' && process.env.MONITORING_ENDPOINT) {
      // Send to monitoring service asynchronously
      fetch(process.env.MONITORING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'csp-violation',
          report: cspReport,
          metadata: {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
          },
        }),
      }).catch(err => console.error('Failed to send CSP report to monitoring:', err));
    }
    
    // Return 204 No Content as per CSP reporting spec
    res.status(204).end();
  } catch (error) {
    console.error('Error handling CSP report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Report-To header configuration
 */
export function reportToHeader(): string {
  const endpoints = [
    {
      url: '/api/csp-report',
      priority: 1,
      weight: 1,
    },
  ];
  
  if (process.env.EXTERNAL_REPORT_URI) {
    endpoints.push({
      url: process.env.EXTERNAL_REPORT_URI,
      priority: 2,
      weight: 1,
    });
  }
  
  const reportTo = {
    group: 'csp-endpoint',
    max_age: 86400,
    endpoints,
  };
  
  return JSON.stringify(reportTo);
}

/**
 * Create a complete security headers middleware stack
 */
export function createSecurityMiddleware(customConfig?: SecurityHeadersConfig) {
  return [
    securityHeaders(customConfig),
  ];
}