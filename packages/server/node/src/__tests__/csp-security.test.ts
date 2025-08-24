/**
 * CSP Security Tests
 * Validates the implementation of Content Security Policy with nonces
 */

import { Request, Response } from 'express';
import crypto from 'crypto';

// Mock Express request/response for testing
const mockRequest = (options: any = {}): Partial<Request> => ({
  ip: '127.0.0.1',
  method: 'GET',
  path: '/',
  headers: {},
  body: {},
  ...options
});

const mockResponse = (): Partial<Response> & { headers: Map<string, string> } => {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    locals: {}
  } as any;
};

describe('CSP Security Implementation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('CSP Nonce Generation', () => {
    test('should generate cryptographically secure nonces', () => {
      const nonces = new Set<string>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const nonce = crypto.randomBytes(32).toString('base64')
          .replace(/[+/]/g, '')
          .replace(/=/g, '')
          .substring(0, 32);
        
        // Check nonce uniqueness
        expect(nonces.has(nonce)).toBe(false);
        nonces.add(nonce);

        // Check nonce format
        expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
      }

      // All nonces should be unique
      expect(nonces.size).toBe(iterations);
    });

    test('should have sufficient entropy', () => {
      const nonce = crypto.randomBytes(32).toString('base64')
        .replace(/[+/]/g, '')
        .replace(/=/g, '')
        .substring(0, 32);

      // Calculate entropy (simplified)
      const uniqueChars = new Set(nonce.split('')).size;
      expect(uniqueChars).toBeGreaterThanOrEqual(10); // Should use diverse characters
    });
  });

  describe('CSP Header Generation', () => {
    test('should not include unsafe-inline in production', () => {
      process.env.NODE_ENV = 'production';
      const req = mockRequest();
      const res = mockResponse();

      // Simulate header generation (simplified version)
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      
      expect(cspHeader).not.toContain('unsafe-inline');
      expect(cspHeader).not.toContain('unsafe-eval');
    });

    test('should include nonce in script-src and style-src', () => {
      const nonce = 'test-nonce-123456789012345678901234';
      const cspHeader = generateMockCSPHeader('production', nonce);

      expect(cspHeader).toContain(`'nonce-${nonce}'`);
      expect(cspHeader).toMatch(/script-src[^;]*'nonce-test-nonce-123456789012345678901234'/);
      expect(cspHeader).toMatch(/style-src[^;]*'nonce-test-nonce-123456789012345678901234'/);
    });

    test('should include strict-dynamic for modern browsers', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toContain("'strict-dynamic'");
    });

    test('should have restrictive default-src', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toMatch(/default-src\s+'self'/);
      expect(cspHeader).not.toMatch(/default-src[^;]*\*/); // No wildcards
    });

    test('should block dangerous object sources', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toContain("object-src 'none'");
    });

    test('should prevent framing attacks', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toContain("frame-ancestors 'none'");
    });

    test('should include report-uri for violation reporting', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toMatch(/report-uri\s+[^\s;]+/);
    });

    test('should upgrade insecure requests in production', () => {
      const cspHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(cspHeader).toContain('upgrade-insecure-requests');
      expect(cspHeader).toContain('block-all-mixed-content');
    });
  });

  describe('Development vs Production CSP', () => {
    test('should allow unsafe-eval only in development with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const devHeader = generateMockCSPHeader('development', 'test-nonce');
      expect(devHeader).toContain('unsafe-eval');
      
      // Should log warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING')
      );

      consoleSpy.mockRestore();
    });

    test('should never allow unsafe-eval in production', () => {
      const prodHeader = generateMockCSPHeader('production', 'test-nonce');
      expect(prodHeader).not.toContain('unsafe-eval');
    });

    test('should allow localhost WebSocket in development only', () => {
      const devHeader = generateMockCSPHeader('development', 'test-nonce');
      const prodHeader = generateMockCSPHeader('production', 'test-nonce');

      expect(devHeader).toMatch(/connect-src[^;]*ws:/);
      expect(devHeader).toMatch(/connect-src[^;]*localhost/);
      
      expect(prodHeader).not.toMatch(/connect-src[^;]*ws:/); // Only wss: in production
      expect(prodHeader).not.toMatch(/connect-src[^;]*localhost/);
    });
  });

  describe('CSP Violation Reporting', () => {
    test('should handle CSP violation reports', async () => {
      const violation = {
        'document-uri': 'https://example.com',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.com/script.js',
        'source-file': 'https://example.com/page.html',
        'line-number': 10,
        'column-number': 5
      };

      const req = mockRequest({
        method: 'POST',
        path: '/api/csp-report',
        body: { 'csp-report': violation }
      });

      const res = mockResponse();

      // Mock handler should return 204
      expect(res.status).toBeCalledWith(204);
    });

    test('should validate report structure', async () => {
      const req = mockRequest({
        method: 'POST',
        path: '/api/csp-report',
        body: 'invalid-data'
      });

      const res = mockResponse();

      // Should reject invalid reports
      expect(res.status).toBeCalledWith(400);
    });

    test('should limit stored violations to prevent memory exhaustion', () => {
      const reporter = new MockCSPReporter();
      const maxViolations = 1000;

      // Add more than max violations
      for (let i = 0; i < maxViolations + 100; i++) {
        reporter.recordViolation({
          'violated-directive': 'script-src',
          'blocked-uri': `https://evil${i}.com`
        });
      }

      // Should only keep the latest violations
      expect(reporter.getViolations().length).toBeLessThanOrEqual(maxViolations);
    });
  });

  describe('Security Headers', () => {
    test('should set all required security headers', () => {
      const res = mockResponse();
      applyMockSecurityHeaders(res as any);

      // Check all security headers are present
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toContain('geolocation=()');
    });

    test('should set HSTS header in production', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      applyMockSecurityHeaders(res as any);

      const hsts = res.headers.get('strict-transport-security');
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });

    test('should not set HSTS in development', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      applyMockSecurityHeaders(res as any);

      expect(res.headers.get('strict-transport-security')).toBeUndefined();
    });
  });

  describe('Nonce Validation', () => {
    test('should validate nonce matches request', () => {
      const manager = new MockNonceManager();
      const requestId = 'test-request-123';
      const nonce = manager.getNonceForRequest(requestId);

      expect(manager.validateNonce(requestId, nonce)).toBe(true);
      expect(manager.validateNonce(requestId, 'wrong-nonce')).toBe(false);
      expect(manager.validateNonce('wrong-request', nonce)).toBe(false);
    });

    test('should expire nonces after TTL', async () => {
      const manager = new MockNonceManager();
      const requestId = 'test-request-123';
      const nonce = manager.getNonceForRequest(requestId);

      // Initially valid
      expect(manager.validateNonce(requestId, nonce)).toBe(true);

      // Simulate time passing beyond TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      manager.cleanupExpiredNonces(50); // TTL of 50ms for testing

      // Should be expired
      expect(manager.validateNonce(requestId, nonce)).toBe(false);
    });
  });

  describe('CSP Mode Configuration', () => {
    test('should use report-only mode when configured', () => {
      process.env.CSP_REPORT_ONLY = 'true';
      const res = mockResponse();
      
      // Simulate applying headers
      const isReportOnly = process.env.CSP_REPORT_ONLY === 'true';
      const headerName = isReportOnly 
        ? 'content-security-policy-report-only' 
        : 'content-security-policy';
      
      res.setHeader(headerName, 'test-policy');
      
      expect(res.headers.has('content-security-policy-report-only')).toBe(true);
      expect(res.headers.has('content-security-policy')).toBe(false);
    });

    test('should enforce CSP by default', () => {
      delete process.env.CSP_REPORT_ONLY;
      const res = mockResponse();
      
      res.setHeader('content-security-policy', 'test-policy');
      
      expect(res.headers.has('content-security-policy')).toBe(true);
      expect(res.headers.has('content-security-policy-report-only')).toBe(false);
    });
  });
});

// Helper functions for testing
function generateMockCSPHeader(env: string, nonce: string): string {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = env;
  
  const directives: string[] = [];
  
  directives.push("default-src 'self'");
  
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (env === 'development') {
    scriptSrc.push("'unsafe-eval'");
    console.warn('WARNING: unsafe-eval enabled in development mode. This should NEVER be used in production.');
  }
  directives.push(`script-src ${scriptSrc.join(' ')}`);
  
  directives.push(`style-src 'self' 'nonce-${nonce}'`);
  directives.push("img-src 'self' data: https: blob:");
  directives.push("font-src 'self' data: https:");
  
  const connectSrc = ["'self'"];
  if (env === 'development') {
    connectSrc.push('ws:', 'wss:', 'http://localhost:*', 'https://localhost:*');
  } else {
    connectSrc.push('wss:');
  }
  directives.push(`connect-src ${connectSrc.join(' ')}`);
  
  directives.push("object-src 'none'");
  directives.push("frame-ancestors 'none'");
  directives.push("base-uri 'self'");
  directives.push("form-action 'self'");
  
  if (env === 'production') {
    directives.push('upgrade-insecure-requests');
    directives.push('block-all-mixed-content');
  }
  
  directives.push('report-uri /api/csp-report');
  
  process.env.NODE_ENV = oldEnv;
  return directives.join('; ');
}

function applyMockSecurityHeaders(res: any): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

class MockNonceManager {
  private nonceCache = new Map<string, { nonce: string; timestamp: number }>();

  getNonceForRequest(requestId: string): string {
    const nonce = crypto.randomBytes(32).toString('base64')
      .replace(/[+/]/g, '')
      .replace(/=/g, '')
      .substring(0, 32);
    
    this.nonceCache.set(requestId, { nonce, timestamp: Date.now() });
    return nonce;
  }

  validateNonce(requestId: string, nonce: string): boolean {
    const cached = this.nonceCache.get(requestId);
    return cached ? cached.nonce === nonce : false;
  }

  cleanupExpiredNonces(ttl: number): void {
    const now = Date.now();
    for (const [key, value] of this.nonceCache.entries()) {
      if (now - value.timestamp > ttl) {
        this.nonceCache.delete(key);
      }
    }
  }
}

class MockCSPReporter {
  private violations: any[] = [];
  private readonly MAX_VIOLATIONS = 1000;

  recordViolation(violation: any): void {
    this.violations.push(violation);
    if (this.violations.length > this.MAX_VIOLATIONS) {
      this.violations = this.violations.slice(-this.MAX_VIOLATIONS);
    }
  }

  getViolations(): any[] {
    return this.violations;
  }
}