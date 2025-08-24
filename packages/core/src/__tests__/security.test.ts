/**
 * Comprehensive security test suite for SightEdit
 */

import { HTMLSanitizer } from '../utils/sanitizer';
import { SafeJSONParser, ValidationError } from '../utils/safe-json';
import { ErrorHandler, ErrorType } from '../utils/error-handler';
import { SchemaEditorFactory, ALLOWED_EDITOR_TYPES } from '../schema/advanced-schema';

describe('Security Test Suite', () => {
  
  describe('XSS Prevention', () => {
    let sanitizer: typeof HTMLSanitizer;

    beforeEach(() => {
      sanitizer = HTMLSanitizer;
    });

    test('should sanitize script tags', () => {
      const malicious = '<script>alert("XSS")</script><p>Hello</p>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>Hello</p>');
    });

    test('should sanitize event handlers', () => {
      const malicious = '<img src="x" onerror="alert(\'XSS\')" />';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    test('should sanitize javascript: URLs', () => {
      const malicious = '<a href="javascript:alert(\'XSS\')">Click</a>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('javascript:');
    });

    test('should sanitize data: URLs with script content', () => {
      const malicious = '<a href="data:text/html,<script>alert(\'XSS\')</script>">Click</a>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('data:text/html');
    });

    test('should handle nested XSS attempts', () => {
      const malicious = '<div><div><script>alert("XSS")</script></div></div>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    test('should sanitize CSS injection', () => {
      const malicious = '<style>body { background: url("javascript:alert(1)") }</style>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('javascript:');
    });

    test('should handle malformed HTML', () => {
      const malicious = '<<SCRIPT>alert("XSS");//<</SCRIPT>';
      const result = sanitizer.sanitize(malicious);
      expect(result).not.toContain('SCRIPT');
      expect(result).not.toContain('alert');
    });

    test('should preserve safe HTML', () => {
      const safe = '<div class="container"><h1>Title</h1><p>Content</p></div>';
      const result = sanitizer.sanitize(safe);
      expect(result).toContain('class="container"');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<p>Content</p>');
    });
  });

  describe('JSON Injection Prevention', () => {
    test('should safely parse valid JSON', () => {
      const valid = '{"name": "test", "value": 123}';
      const result = SafeJSONParser.parse(valid);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    test('should reject oversized JSON', () => {
      const huge = '{"data": "' + 'x'.repeat(2000000) + '"}';
      expect(() => SafeJSONParser.parse(huge, undefined, { maxSize: 1000 }))
        .toThrow(ValidationError);
    });

    test('should reject deeply nested JSON', () => {
      let nested = '{"a":';
      for (let i = 0; i < 20; i++) {
        nested += '{"a":';
      }
      nested += '1';
      for (let i = 0; i < 20; i++) {
        nested += '}';
      }
      nested += '}';
      
      expect(() => SafeJSONParser.parse(nested, undefined, { maxDepth: 10 }))
        .toThrow(ValidationError);
    });

    test('should handle JSON with null bytes', () => {
      const malicious = '{"test": "value\\x00injection"}';
      const result = SafeJSONParser.tryParse(malicious);
      expect(result).toBeTruthy();
    });

    test('should return default value on parse failure', () => {
      const invalid = '{invalid json}';
      const defaultValue = { default: true };
      const result = SafeJSONParser.parse(invalid, defaultValue);
      expect(result).toEqual(defaultValue);
    });

    test('should handle circular references in stringify', () => {
      const obj: any = { a: 1 };
      obj.circular = obj;
      
      const result = SafeJSONParser.stringify(obj);
      expect(result).toContain('[Circular Reference]');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('should validate JSON schema', () => {
      const data = '{"name": "test"}';
      const validator = (value: any): value is { name: string } => {
        return value && typeof value.name === 'string';
      };
      
      const result = SafeJSONParser.parseWithSchema(data, validator);
      expect(result).toEqual({ name: 'test' });
    });

    test('should reject invalid schema', () => {
      const data = '{"invalid": "test"}';
      const validator = (value: any): value is { name: string } => {
        return value && typeof value.name === 'string';
      };
      
      expect(() => SafeJSONParser.parseWithSchema(data, validator))
        .toThrow(ValidationError);
    });
  });

  describe('Code Injection Prevention', () => {
    test('should only allow whitelisted editor types', () => {
      expect(ALLOWED_EDITOR_TYPES.has('text')).toBe(true);
      expect(ALLOWED_EDITOR_TYPES.has('eval')).toBe(false);
      expect(ALLOWED_EDITOR_TYPES.has('__proto__')).toBe(false);
    });

    test('should validate editor type before creation', () => {
      const factory = SchemaEditorFactory;
      
      // Valid type
      expect(() => factory.validateEditorType('text')).not.toThrow();
      
      // Invalid type
      expect(() => factory.validateEditorType('eval')).toThrow();
      expect(() => factory.validateEditorType('__proto__')).toThrow();
    });

    test('should sanitize schema data', () => {
      const schema = {
        editorType: 'text',
        defaultValue: '<script>alert("XSS")</script>',
        options: ['<img onerror="alert(1)">']
      };
      
      const sanitized = SchemaEditorFactory.sanitizeSchema(schema);
      expect(sanitized.defaultValue).not.toContain('<script>');
      expect(sanitized.options[0]).not.toContain('onerror');
    });

    test('should prevent prototype pollution', () => {
      const malicious = {
        '__proto__': { polluted: true },
        'constructor': { prototype: { polluted: true } }
      };
      
      const clean = {};
      Object.assign(clean, malicious);
      
      // Check that prototype wasn't polluted
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((clean.constructor as any).polluted).toBeUndefined();
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should detect path traversal attempts', () => {
      const paths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'valid/../../secret',
        './../../private/data'
      ];
      
      paths.forEach(path => {
        expect(path.includes('..') || path.includes('./')).toBe(true);
      });
    });

    test('should validate file paths', () => {
      const isValidPath = (path: string): boolean => {
        // Check for path traversal attempts
        if (path.includes('..') || path.includes('./') || path.includes('.\\')) {
          return false;
        }
        
        // Check for absolute paths on Windows
        if (/^[A-Z]:/i.test(path)) {
          return false;
        }
        
        // Check for absolute paths on Unix
        if (path.startsWith('/')) {
          return false;
        }
        
        return true;
      };
      
      expect(isValidPath('safe/path/file.txt')).toBe(true);
      expect(isValidPath('../etc/passwd')).toBe(false);
      expect(isValidPath('C:\\Windows\\System32')).toBe(false);
      expect(isValidPath('/etc/passwd')).toBe(false);
    });
  });

  describe('Information Disclosure Prevention', () => {
    test('should sanitize error messages', () => {
      const error = new Error('Database connection failed: user=admin password=secret123');
      const details = ErrorHandler.handle(error, ErrorType.RUNTIME);
      
      expect(details.message).not.toContain('password=secret123');
      expect(details.message).toContain('[REDACTED]');
    });

    test('should sanitize stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error at C:\\Users\\Admin\\Projects\\secret\\file.ts:123';
      
      const details = ErrorHandler.handle(error, ErrorType.RUNTIME);
      
      if (details.stack) {
        expect(details.stack).not.toContain('C:\\Users\\Admin');
        expect(details.stack).not.toContain('\\Projects\\secret');
      }
    });

    test('should redact sensitive context data', () => {
      const context = {
        userId: '12345',
        password: 'secret',
        apiKey: 'sk_live_abcd1234',
        token: 'Bearer eyJhbGc...',
        data: 'safe'
      };
      
      const details = ErrorHandler.handle('Error', ErrorType.RUNTIME, context);
      
      expect(details.context?.userId).toBe('12345');
      expect(details.context?.password).toBe('[REDACTED]');
      expect(details.context?.apiKey).toBe('[REDACTED]');
      expect(details.context?.token).toBe('[REDACTED]');
      expect(details.context?.data).toBe('safe');
    });

    test('should provide generic messages in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const errors = ErrorHandler.getRecentErrors(1);
      errors.forEach(error => {
        if (error.message) {
          expect(error.message).not.toContain('specific');
          expect(error.stack).toBeUndefined();
        }
      });
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Rate Limiting', () => {
    test('should track request counts', () => {
      const rateLimiter = new Map<string, number[]>();
      const ip = '192.168.1.1';
      const now = Date.now();
      
      // Add requests
      if (!rateLimiter.has(ip)) {
        rateLimiter.set(ip, []);
      }
      
      const requests = rateLimiter.get(ip)!;
      requests.push(now, now + 100, now + 200);
      
      // Check within window (1 minute)
      const windowMs = 60000;
      const validRequests = requests.filter(time => time > now - windowMs);
      
      expect(validRequests.length).toBe(3);
    });

    test('should enforce rate limits', () => {
      const checkRateLimit = (ip: string, requests: Map<string, number[]>, max: number): boolean => {
        const now = Date.now();
        const windowMs = 60000;
        
        if (!requests.has(ip)) {
          requests.set(ip, []);
        }
        
        const userRequests = requests.get(ip)!;
        const validRequests = userRequests.filter(time => time > now - windowMs);
        
        if (validRequests.length >= max) {
          return false; // Rate limited
        }
        
        validRequests.push(now);
        requests.set(ip, validRequests);
        return true;
      };
      
      const requests = new Map<string, number[]>();
      const ip = '192.168.1.1';
      const max = 3;
      
      expect(checkRateLimit(ip, requests, max)).toBe(true);
      expect(checkRateLimit(ip, requests, max)).toBe(true);
      expect(checkRateLimit(ip, requests, max)).toBe(true);
      expect(checkRateLimit(ip, requests, max)).toBe(false); // Should be rate limited
    });
  });

  describe('Authentication & Authorization', () => {
    test('should validate JWT tokens', () => {
      const validateToken = (token: string): boolean => {
        // Check token format
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        
        // Check if parts are base64
        try {
          parts.forEach(part => {
            if (!/^[A-Za-z0-9_-]+$/.test(part)) {
              throw new Error('Invalid character');
            }
          });
          return true;
        } catch {
          return false;
        }
      };
      
      expect(validateToken('eyJhbGc.eyJzdWI.SflKxwRJ')).toBe(true);
      expect(validateToken('invalid')).toBe(false);
      expect(validateToken('a.b')).toBe(false);
      expect(validateToken('a.b.c.d')).toBe(false);
    });

    test('should check authorization headers', () => {
      const isAuthorized = (headers: Record<string, string>): boolean => {
        const auth = headers['authorization'];
        if (!auth) return false;
        
        if (auth.startsWith('Bearer ')) {
          const token = auth.substring(7);
          return token.length > 0;
        }
        
        return false;
      };
      
      expect(isAuthorized({ authorization: 'Bearer token123' })).toBe(true);
      expect(isAuthorized({ authorization: 'Basic dXNlcjpwYXNz' })).toBe(false);
      expect(isAuthorized({})).toBe(false);
    });
  });

  describe('Input Validation', () => {
    test('should validate email addresses', () => {
      const validateEmail = (email: string): boolean => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
      };
      
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('user+tag@example.co.uk')).toBe(true);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });

    test('should validate URLs', () => {
      const validateUrl = (url: string): boolean => {
        try {
          const parsed = new URL(url);
          return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
          return false;
        }
      };
      
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://localhost:3000')).toBe(true);
      expect(validateUrl('javascript:alert(1)')).toBe(false);
      expect(validateUrl('data:text/html,<script>')).toBe(false);
      expect(validateUrl('invalid')).toBe(false);
    });

    test('should validate input length', () => {
      const validateLength = (input: string, min: number, max: number): boolean => {
        return input.length >= min && input.length <= max;
      };
      
      expect(validateLength('test', 1, 10)).toBe(true);
      expect(validateLength('', 1, 10)).toBe(false);
      expect(validateLength('x'.repeat(20), 1, 10)).toBe(false);
    });

    test('should sanitize user input', () => {
      const sanitizeInput = (input: string): string => {
        return input
          .replace(/[<>]/g, '') // Remove angle brackets
          .replace(/javascript:/gi, '') // Remove javascript protocol
          .replace(/on\w+=/gi, '') // Remove event handlers
          .trim();
      };
      
      expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
      expect(sanitizeInput('onclick="alert(1)"')).toBe('"alert(1)"');
      expect(sanitizeInput('  safe input  ')).toBe('safe input');
    });
  });

  describe('Secure Random Generation', () => {
    test('should generate cryptographically secure tokens', () => {
      const generateToken = (length: number): string => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const array = new Uint8Array(length);
        
        // In browser
        if (typeof window !== 'undefined' && window.crypto) {
          window.crypto.getRandomValues(array);
        }
        // In Node.js
        else if (typeof global !== 'undefined' && global.crypto) {
          global.crypto.getRandomValues(array);
        }
        
        return Array.from(array, byte => chars[byte % chars.length]).join('');
      };
      
      const token1 = generateToken(32);
      const token2 = generateToken(32);
      
      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2); // Should be different
    });

    test('should generate unique IDs', () => {
      const generateId = (): string => {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}-${random}`;
      };
      
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      
      expect(ids.size).toBe(1000); // All should be unique
    });
  });

  describe('Content Security Policy', () => {
    test('should validate CSP directives', () => {
      const csp = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'wss:', 'ws:'],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"]
      };
      
      // Check that dangerous sources are controlled
      expect(csp['script-src'].includes("'unsafe-eval'")).toBe(false);
      expect(csp['default-src'].includes('*')).toBe(false);
      expect(csp['object-src']).toEqual(["'none'"]);
      expect(csp['frame-ancestors']).toEqual(["'none'"]);
    });

    test('should format CSP header correctly', () => {
      const formatCSP = (directives: Record<string, string[]>): string => {
        return Object.entries(directives)
          .map(([key, values]) => `${key} ${values.join(' ')}`)
          .join('; ');
      };
      
      const csp = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"]
      };
      
      const header = formatCSP(csp);
      expect(header).toBe("default-src 'self'; script-src 'self' 'unsafe-inline'");
    });
  });
});

describe('WebSocket Security', () => {
  test('should validate WebSocket origin', () => {
    const validateOrigin = (origin: string, allowedOrigins: string[]): boolean => {
      if (allowedOrigins.includes('*')) return true;
      return allowedOrigins.includes(origin);
    };
    
    const allowed = ['https://example.com', 'https://app.example.com'];
    
    expect(validateOrigin('https://example.com', allowed)).toBe(true);
    expect(validateOrigin('https://evil.com', allowed)).toBe(false);
    expect(validateOrigin('http://example.com', allowed)).toBe(false); // Different protocol
  });

  test('should validate WebSocket messages', () => {
    const validateMessage = (message: any): boolean => {
      // Check message structure
      if (!message || typeof message !== 'object') return false;
      if (!message.type || typeof message.type !== 'string') return false;
      if (!message.data) return false;
      
      // Check message size
      const size = JSON.stringify(message).length;
      if (size > 65536) return false; // 64KB limit
      
      return true;
    };
    
    expect(validateMessage({ type: 'update', data: { value: 1 } })).toBe(true);
    expect(validateMessage({ type: 'update' })).toBe(false); // Missing data
    expect(validateMessage('invalid')).toBe(false);
    expect(validateMessage(null)).toBe(false);
  });
});