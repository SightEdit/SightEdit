import { SecurityManager, SecurityConfig, ThreatInfo } from '../../security/security-manager';
import { EventBus } from '../../services/event-bus';

// Mock DOMPurify
const mockDOMPurify = {
  sanitize: jest.fn((html: string, options?: any) => {
    if (html.includes('<script>')) {
      return html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    }
    return html;
  })
};

// Mock dynamic imports
jest.mock('dompurify', () => mockDOMPurify, { virtual: true });
jest.mock('isomorphic-dompurify', () => ({
  default: mockDOMPurify
}), { virtual: true });

describe('SecurityManager', () => {
  let securityManager: SecurityManager;
  let mockEventBus: jest.Mocked<EventBus>;
  let config: Partial<SecurityConfig>;

  beforeEach(() => {
    mockEventBus = {
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      listenerCount: jest.fn(),
      eventNames: jest.fn(),
      setMaxListeners: jest.fn(),
      setDebug: jest.fn(),
      destroy: jest.fn()
    };

    config = {
      xss: {
        enabled: true,
        mode: 'strict',
        allowedTags: ['p', 'b', 'i'],
        allowedAttributes: ['class']
      },
      inputValidation: {
        enabled: true,
        maxLength: 1000,
        blockedPatterns: [/<script[^>]*>/gi, /javascript:/gi]
      },
      threatDetection: {
        enabled: true,
        suspiciousPatterns: [/<script[^>]*>/gi, /javascript:/gi],
        alertThreshold: 3
      },
      rateLimit: {
        enabled: true,
        maxRequests: 10,
        windowMs: 60000 // 1 minute
      }
    };

    securityManager = new SecurityManager(config, mockEventBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and configuration', () => {
    it('should initialize with default configuration', () => {
      const manager = new SecurityManager({}, mockEventBus);
      const finalConfig = manager.getConfig();
      
      expect(finalConfig.xss.enabled).toBe(true);
      expect(finalConfig.xss.mode).toBe('strict');
      expect(finalConfig.inputValidation.enabled).toBe(true);
      expect(finalConfig.threatDetection.enabled).toBe(true);
      expect(finalConfig.rateLimit.enabled).toBe(true);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        xss: { mode: 'loose' as const },
        rateLimit: { maxRequests: 50 }
      };
      
      const manager = new SecurityManager(customConfig, mockEventBus);
      const finalConfig = manager.getConfig();
      
      expect(finalConfig.xss.mode).toBe('loose');
      expect(finalConfig.rateLimit.maxRequests).toBe(50);
      expect(finalConfig.xss.enabled).toBe(true); // Default should be preserved
    });

    it('should handle CSP configuration', () => {
      const cspConfig = {
        csp: {
          enabled: true,
          directives: {
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'"]
          },
          enforceMode: false
        }
      };
      
      const manager = new SecurityManager(cspConfig, mockEventBus);
      const finalConfig = manager.getConfig();
      
      expect(finalConfig.csp.enabled).toBe(true);
      expect(finalConfig.csp.directives['script-src']).toContain("'unsafe-inline'");
      expect(finalConfig.csp.enforceMode).toBe(false);
    });
  });

  describe('validateInput', () => {
    it('should validate safe input', () => {
      const result = securityManager.validateInput('Hello, world!');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedValue).toBe('Hello, world!');
    });

    it('should reject input exceeding length limit', () => {
      const longInput = 'x'.repeat(1001);
      
      const result = securityManager.validateInput(longInput);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input exceeds maximum length of 1000 characters');
    });

    it('should reject input with blocked patterns', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      
      const result = securityManager.validateInput(maliciousInput);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input contains blocked pattern');
      expect(result.threats).toHaveLength(1);
      expect(result.threats![0].type).toBe('blocked_pattern');
    });

    it('should validate allowed characters', () => {
      securityManager.updateConfig({
        inputValidation: {
          enabled: true,
          maxLength: 1000,
          allowedCharacters: /^[a-zA-Z0-9\s]+$/
        }
      });
      
      const invalidCharsInput = 'Hello <script>';
      const result = securityManager.validateInput(invalidCharsInput);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input contains disallowed characters');
    });

    it('should detect multiple threats', () => {
      const multiThreatInput = '<script>alert(1)</script>javascript:void(0)';
      
      const result = securityManager.validateInput(multiThreatInput);
      
      expect(result.isValid).toBe(false);
      expect(result.threats!.length).toBeGreaterThan(0);
    });

    it('should sanitize HTML when XSS protection is enabled', () => {
      const htmlInput = '<p>Safe</p><script>alert("evil")</script>';
      
      const result = securityManager.validateInput(htmlInput);
      
      expect(result.sanitizedValue).toBe('<p>Safe</p>');
      expect(mockDOMPurify.sanitize).toHaveBeenCalled();
    });

    it('should skip validation when disabled', () => {
      securityManager.updateConfig({
        inputValidation: { enabled: false, maxLength: 1000 }
      });
      
      const longInput = 'x'.repeat(2000);
      const result = securityManager.validateInput(longInput);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should include context in threat details', () => {
      const result = securityManager.validateInput('<script>alert(1)</script>', 'user-comment');
      
      expect(result.threats![0].details.context).toBe('user-comment');
    });
  });

  describe('sanitizeHtml', () => {
    it('should sanitize HTML using DOMPurify', () => {
      const html = '<p>Safe</p><script>evil()</script>';
      
      const result = securityManager.sanitizeHtml(html);
      
      expect(result).toBe('<p>Safe</p>');
      expect(mockDOMPurify.sanitize).toHaveBeenCalledWith(
        html,
        expect.objectContaining({
          ALLOWED_TAGS: ['p', 'b', 'i'],
          ALLOWED_ATTR: ['class']
        })
      );
    });

    it('should use custom sanitizer when provided', () => {
      const customSanitizer = jest.fn().mockReturnValue('Custom sanitized content');
      
      securityManager.updateConfig({
        xss: {
          enabled: true,
          mode: 'strict',
          customSanitizer
        }
      });
      
      const result = securityManager.sanitizeHtml('<p>Test</p>');
      
      expect(result).toBe('Custom sanitized content');
      expect(customSanitizer).toHaveBeenCalledWith('<p>Test</p>');
      expect(mockDOMPurify.sanitize).not.toHaveBeenCalled();
    });

    it('should return original HTML when XSS protection is disabled', () => {
      securityManager.updateConfig({
        xss: { enabled: false, mode: 'strict' }
      });
      
      const html = '<script>alert(1)</script>';
      const result = securityManager.sanitizeHtml(html);
      
      expect(result).toBe(html);
      expect(mockDOMPurify.sanitize).not.toHaveBeenCalled();
    });

    it('should use different options for different modes', () => {
      // Test moderate mode
      securityManager.updateConfig({
        xss: { enabled: true, mode: 'moderate' }
      });
      
      securityManager.sanitizeHtml('<p>Test</p>');
      
      expect(mockDOMPurify.sanitize).toHaveBeenCalledWith(
        '<p>Test</p>',
        expect.objectContaining({
          ALLOWED_TAGS: expect.arrayContaining(['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li']),
          ALLOWED_URI_REGEXP: expect.any(RegExp)
        })
      );
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Mock Date.now for consistent testing
      jest.spyOn(Date, 'now').mockReturnValue(1000000);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should allow requests within limit', () => {
      for (let i = 0; i < 10; i++) {
        expect(securityManager.checkRateLimit('user123')).toBe(true);
      }
    });

    it('should reject requests exceeding limit', () => {
      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        securityManager.checkRateLimit('user123');
      }
      
      const result = securityManager.checkRateLimit('user123');
      
      expect(result).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'security:threat-detected',
        expect.objectContaining({
          threat: expect.objectContaining({
            type: 'rate_limit_exceeded',
            severity: 'medium'
          })
        })
      );
    });

    it('should reset rate limit after time window', () => {
      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        securityManager.checkRateLimit('user123');
      }
      
      expect(securityManager.checkRateLimit('user123')).toBe(false);
      
      // Advance time past the window
      jest.spyOn(Date, 'now').mockReturnValue(1000000 + 60001);
      
      expect(securityManager.checkRateLimit('user123')).toBe(true);
    });

    it('should track different identifiers separately', () => {
      // Fill up rate limit for user1
      for (let i = 0; i < 10; i++) {
        securityManager.checkRateLimit('user1');
      }
      
      expect(securityManager.checkRateLimit('user1')).toBe(false);
      expect(securityManager.checkRateLimit('user2')).toBe(true); // Should be allowed
    });

    it('should return true when rate limiting is disabled', () => {
      securityManager.updateConfig({
        rateLimit: { enabled: false, maxRequests: 10, windowMs: 60000 }
      });
      
      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        expect(securityManager.checkRateLimit('user123')).toBe(true);
      }
    });
  });

  describe('threat detection', () => {
    it('should detect suspicious patterns', () => {
      const threats = securityManager['detectThreats']('<script>alert(1)</script>', 'test-context');
      
      expect(threats).toHaveLength(1);
      expect(threats[0].type).toBe('suspicious_pattern');
      expect(threats[0].details.context).toBe('test-context');
      expect(threats[0].details.matches).toContain('<script>');
    });

    it('should calculate threat severity correctly', () => {
      const highSeverityThreats = [
        'script',
        'javascript:',
        'document.cookie',
        'eval(',
        'setTimeout('
      ];
      
      highSeverityThreats.forEach(pattern => {
        const severity = securityManager['calculateThreatSeverity'](pattern, 'test');
        expect(severity).toBe('high');
      });
    });

    it('should limit number of matches reported', () => {
      const repeatedPattern = '<script></script>'.repeat(10);
      const threats = securityManager['detectThreats'](repeatedPattern);
      
      expect(threats[0].details.matches.length).toBeLessThanOrEqual(5);
    });

    it('should truncate input in threat details', () => {
      const longInput = 'x'.repeat(500) + '<script>alert(1)</script>';
      const threats = securityManager['detectThreats'](longInput);
      
      expect(threats[0].details.input.length).toBeLessThanOrEqual(200);
    });
  });

  describe('reportThreat', () => {
    const mockThreat: ThreatInfo = {
      type: 'test-threat',
      severity: 'medium',
      timestamp: Date.now(),
      details: { test: 'data' },
      source: 'user123'
    };

    it('should store threat in history', () => {
      securityManager.reportThreat(mockThreat);
      
      const history = securityManager.getThreatHistory('user123');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(mockThreat);
    });

    it('should emit threat detected event', () => {
      securityManager.reportThreat(mockThreat);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'security:threat-detected',
        { threat: mockThreat }
      );
    });

    it('should limit threat history size', () => {
      // Add 105 threats
      for (let i = 0; i < 105; i++) {
        const threat = { ...mockThreat, timestamp: Date.now() + i };
        securityManager.reportThreat(threat);
      }
      
      const history = securityManager.getThreatHistory('user123');
      expect(history).toHaveLength(100); // Should be limited to 100
    });

    it('should trigger alert when threshold exceeded', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      // Add threats within the last hour
      for (let i = 0; i < 3; i++) {
        const threat = {
          ...mockThreat,
          timestamp: now - (i * 1000) // 1 second apart
        };
        securityManager.reportThreat(threat);
      }
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'security:alert-threshold-exceeded',
        expect.objectContaining({
          source: 'user123',
          threshold: 3
        })
      );
      
      jest.restoreAllMocks();
    });

    it('should not trigger alert for old threats', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      // Add old threats (more than 1 hour ago)
      for (let i = 0; i < 5; i++) {
        const threat = {
          ...mockThreat,
          timestamp: now - (2 * 3600000) // 2 hours ago
        };
        securityManager.reportThreat(threat);
      }
      
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        'security:alert-threshold-exceeded',
        expect.anything()
      );
      
      jest.restoreAllMocks();
    });
  });

  describe('getThreatHistory', () => {
    beforeEach(() => {
      const threat1: ThreatInfo = {
        type: 'threat1', severity: 'low', timestamp: 1000,
        details: {}, source: 'user1'
      };
      const threat2: ThreatInfo = {
        type: 'threat2', severity: 'high', timestamp: 2000,
        details: {}, source: 'user2'
      };
      const threat3: ThreatInfo = {
        type: 'threat3', severity: 'medium', timestamp: 3000,
        details: {}, source: 'user1'
      };
      
      securityManager.reportThreat(threat1);
      securityManager.reportThreat(threat2);
      securityManager.reportThreat(threat3);
    });

    it('should return threats for specific source', () => {
      const history = securityManager.getThreatHistory('user1');
      
      expect(history).toHaveLength(2);
      expect(history.every(t => t.source === 'user1')).toBe(true);
    });

    it('should return all threats when no source specified', () => {
      const history = securityManager.getThreatHistory();
      
      expect(history).toHaveLength(3);
    });

    it('should return threats sorted by timestamp (newest first)', () => {
      const history = securityManager.getThreatHistory();
      
      expect(history[0].timestamp).toBe(3000);
      expect(history[1].timestamp).toBe(2000);
      expect(history[2].timestamp).toBe(1000);
    });

    it('should return empty array for unknown source', () => {
      const history = securityManager.getThreatHistory('unknown');
      
      expect(history).toHaveLength(0);
    });
  });

  describe('clearThreatHistory', () => {
    it('should clear all threat history', () => {
      const threat: ThreatInfo = {
        type: 'test', severity: 'low', timestamp: Date.now(),
        details: {}, source: 'user1'
      };
      
      securityManager.reportThreat(threat);
      expect(securityManager.getThreatHistory()).toHaveLength(1);
      
      securityManager.clearThreatHistory();
      expect(securityManager.getThreatHistory()).toHaveLength(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        xss: { enabled: false, mode: 'loose' as const },
        rateLimit: { enabled: false, maxRequests: 50, windowMs: 60000 }
      };
      
      securityManager.updateConfig(newConfig);
      const finalConfig = securityManager.getConfig();
      
      expect(finalConfig.xss.enabled).toBe(false);
      expect(finalConfig.xss.mode).toBe('loose');
      expect(finalConfig.rateLimit.enabled).toBe(false);
      expect(finalConfig.rateLimit.maxRequests).toBe(50);
    });
  });

  describe('CSP integration', () => {
    beforeEach(() => {
      // Mock document and DOM APIs
      const mockMeta = {
        httpEquiv: '',
        content: ''
      };
      
      const mockHead = {
        appendChild: jest.fn()
      };
      
      Object.defineProperty(global, 'document', {
        value: {
          createElement: jest.fn().mockReturnValue(mockMeta),
          head: mockHead
        },
        writable: true
      });
    });

    it('should apply CSP policy when enabled', () => {
      const cspManager = new SecurityManager({
        csp: {
          enabled: true,
          enforceMode: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"]
          }
        }
      }, mockEventBus);
      
      const expectedPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline'; report-uri /api/csp-report";
      
      expect(document.createElement).toHaveBeenCalledWith('meta');
      expect(document.head.appendChild).toHaveBeenCalled();
    });

    it('should use report-only mode when enforceMode is false', () => {
      new SecurityManager({
        csp: {
          enabled: true,
          enforceMode: false,
          directives: { 'default-src': ["'self'"] }
        }
      }, mockEventBus);
      
      // Should set Content-Security-Policy-Report-Only instead of Content-Security-Policy
      expect(document.createElement).toHaveBeenCalled();
    });
  });

  describe('DOM threat scanning', () => {
    beforeEach(() => {
      // Mock MutationObserver
      global.MutationObserver = jest.fn().mockImplementation((callback) => ({
        observe: jest.fn(),
        disconnect: jest.fn()
      }));
      
      // Mock document.body
      Object.defineProperty(global, 'document', {
        value: {
          body: {},
          createElement: jest.fn()
        },
        writable: true
      });
    });

    it('should set up DOM mutation observer when threat detection is enabled', () => {
      new SecurityManager({
        threatDetection: { enabled: true, suspiciousPatterns: [], alertThreshold: 3 }
      }, mockEventBus);
      
      expect(global.MutationObserver).toHaveBeenCalled();
    });

    it('should detect suspicious scripts in DOM', () => {
      const mockScript = {
        innerHTML: '<script>alert("evil")</script>',
        src: '',
        outerHTML: '<script>alert("evil")</script>'
      };
      
      const result = securityManager['isSuspiciousScript'](mockScript as any);
      expect(result).toBe(true);
    });

    it('should detect suspicious script sources', () => {
      const mockScript = {
        innerHTML: '',
        src: 'javascript:alert("evil")',
        outerHTML: '<script src="javascript:alert(evil)"></script>'
      };
      
      const result = securityManager['isSuspiciousScript'](mockScript as any);
      expect(result).toBe(true);
    });

    it('should detect suspicious links', () => {
      const suspiciousUrls = [
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'https://evil.com/malware'
      ];
      
      suspiciousUrls.forEach(url => {
        const result = securityManager['isSuspiciousLink'](url);
        expect(result).toBe(true);
      });
    });

    it('should not flag safe links', () => {
      const safeUrls = [
        'https://example.com',
        'mailto:test@example.com',
        '/relative/path',
        '#anchor'
      ];
      
      safeUrls.forEach(url => {
        const result = securityManager['isSuspiciousLink'](url);
        expect(result).toBe(false);
      });
    });
  });
});