import { HTMLSanitizer, JSONValidator, TextSanitizer, SanitizerConfig } from '../../utils/sanitizer';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  sanitize: jest.fn((html: string, options?: any) => {
    // Simple mock implementation for testing
    if (html.includes('<script>')) {
      return html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    }
    if (html.includes('javascript:')) {
      return html.replace(/javascript:[^"'\s]*/gi, '');
    }
    // Return the HTML as-is if no threats detected (for safe HTML test)
    return html;
  })
}));

describe('HTMLSanitizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitize', () => {
    it('should return empty string for invalid input', () => {
      expect(HTMLSanitizer.sanitize(null as any)).toBe('');
      expect(HTMLSanitizer.sanitize(undefined as any)).toBe('');
      expect(HTMLSanitizer.sanitize('')).toBe('');
      expect(HTMLSanitizer.sanitize(123 as any)).toBe('');
    });

    it('should sanitize basic HTML content', () => {
      const html = '<p>Safe content</p>';
      const result = HTMLSanitizer.sanitize(html);
      expect(result).toBe('<p>Safe content</p>');
    });

    it('should remove script tags', () => {
      const html = '<p>Safe content</p><script>alert("xss")</script>';
      const result = HTMLSanitizer.sanitize(html);
      expect(result).toBe('<p>Safe content</p>');
    });

    it('should remove javascript: protocols', () => {
      const html = '<a href="javascript:alert(\'xss\')">Click me</a>';
      const result = HTMLSanitizer.sanitize(html);
      expect(result).not.toContain('javascript:');
    });

    it('should enforce length limits', () => {
      const longHtml = 'x'.repeat(1000001);
      
      expect(() => HTMLSanitizer.sanitize(longHtml)).toThrow(
        'HTML content exceeds maximum length'
      );
    });

    it('should use custom length limits from config', () => {
      const config: SanitizerConfig = { maxLength: 100 };
      const html = 'x'.repeat(101);
      
      expect(() => HTMLSanitizer.sanitize(html, config)).toThrow(
        'HTML content exceeds maximum length of 100 characters'
      );
    });

    it('should throw in strict mode for obvious threats', () => {
      const maliciousHtml = '<script>alert("xss")</script>';
      
      expect(() => HTMLSanitizer.sanitize(maliciousHtml, undefined, true))
        .toThrow('HTML content contains obvious security threats');
    });

    it('should warn but not throw in non-strict mode for threats', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const maliciousHtml = '<script>alert("xss")</script>';
      
      const result = HTMLSanitizer.sanitize(maliciousHtml, undefined, false);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('potential security threats')
      );
      expect(result).toBeDefined();
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle sanitization errors gracefully', () => {
      const DOMPurify = require('dompurify');
      DOMPurify.sanitize.mockImplementation(() => {
        throw new Error('Sanitization failed');
      });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = HTMLSanitizer.sanitize('<p>Test content</p>');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'HTML sanitization failed:',
        expect.any(Error)
      );
      expect(result).toBe('Test content'); // Should fall back to text content
      
      consoleErrorSpy.mockRestore();
    });

    it('should use custom config for allowed tags and attributes', () => {
      const config: SanitizerConfig = {
        allowedTags: ['p', 'b'],
        allowedAttributes: { 'p': ['class'] }
      };
      
      const result = HTMLSanitizer.sanitize('<p class="test">Content</p>', config);
      
      expect(result).toContain('Content');
    });
  });

  describe('sanitizeUserContent', () => {
    it('should use strict mode by default', () => {
      const maliciousHtml = '<script>alert("xss")</script><p>Safe content</p>';
      
      expect(() => HTMLSanitizer.sanitizeUserContent(maliciousHtml))
        .toThrow('HTML content contains obvious security threats');
    });

    it('should enforce stricter limits for user content', () => {
      const longContent = 'x'.repeat(10001);
      
      expect(() => HTMLSanitizer.sanitizeUserContent(longContent))
        .toThrow('HTML content exceeds maximum length of 10000 characters');
    });
  });

  describe('extractTextContent', () => {
    beforeEach(() => {
      // Mock DOM APIs
      const mockElement = {
        innerHTML: '',
        textContent: '',
        innerText: ''
      };
      
      jest.spyOn(document, 'createElement').mockReturnValue(mockElement as any);
    });

    it('should extract text content from HTML', () => {
      const mockElement = document.createElement('div');
      mockElement.textContent = 'Pure text content';
      
      const result = HTMLSanitizer.extractTextContent('<p>Pure text content</p>');
      
      expect(result).toBe('Pure text content');
    });

    it('should fall back to innerText if textContent is not available', () => {
      const mockElement = {
        innerHTML: '<p>Test</p>',
        textContent: null,
        innerText: 'Test'
      };
      
      jest.spyOn(document, 'createElement').mockReturnValue(mockElement as any);
      
      const result = HTMLSanitizer.extractTextContent('<p>Test</p>');
      
      expect(result).toBe('Test');
    });

    it('should return empty string if no text content', () => {
      const mockElement = {
        innerHTML: '<img src="test.jpg">',
        textContent: null,
        innerText: ''
      };
      
      jest.spyOn(document, 'createElement').mockReturnValue(mockElement as any);
      
      const result = HTMLSanitizer.extractTextContent('<img src="test.jpg">');
      
      expect(result).toBe('');
    });
  });

  describe('isHtmlSafe', () => {
    it("should return true for safe HTML", () => {
      // Reset the DOMPurify mock to ensure clean state
      const DOMPurify = require('dompurify');
      DOMPurify.sanitize.mockImplementation((html: string) => html);
      
      const safeHtml = "<p>Safe content</p>";
      
      expect(HTMLSanitizer.isHtmlSafe(safeHtml)).toBe(true);
    });
    it('should return false for unsafe HTML', () => {
      const DOMPurify = require('dompurify');
      DOMPurify.sanitize.mockReturnValue('<p>Sanitized content</p>');
      
      const unsafeHtml = '<script>alert("xss")</script><p>Content</p>';
      
      expect(HTMLSanitizer.isHtmlSafe(unsafeHtml)).toBe(false);
    });

    it('should return false if sanitization throws', () => {
      const invalidHtml = 'x'.repeat(1000001);
      
      expect(HTMLSanitizer.isHtmlSafe(invalidHtml)).toBe(false);
    });

    it('should respect strict mode', () => {
      const html = '<script>alert("test")</script>';
      
      expect(HTMLSanitizer.isHtmlSafe(html, false)).toBe(false);
      expect(HTMLSanitizer.isHtmlSafe(html, true)).toBe(false);
    });
  });

  describe('threat detection', () => {
    it('should detect script tags', () => {
      const threats = [
        '<script>alert("xss")</script>',
        '<SCRIPT>alert("xss")</SCRIPT>',
        '<script src="evil.js"></script>'
      ];
      
      threats.forEach(threat => {
        expect(HTMLSanitizer['hasObviousThreat'](threat)).toBe(true);
      });
    });

    it('should detect javascript protocols', () => {
      const threats = [
        'javascript:alert("xss")',
        'JAVASCRIPT:void(0)',
        'vbscript:msgbox("xss")'
      ];
      
      threats.forEach(threat => {
        expect(HTMLSanitizer['hasObviousThreat'](threat)).toBe(true);
      });
    });

    it('should detect event handlers', () => {
      const threats = [
        '<img onerror="alert(1)" src="x">',
        '<div onclick="evil()">',
        '<body onload="malicious()">'
      ];
      
      threats.forEach(threat => {
        expect(HTMLSanitizer['hasObviousThreat'](threat)).toBe(true);
      });
    });

    it('should detect dangerous elements', () => {
      const threats = [
        '<iframe src="evil.html"></iframe>',
        '<object data="malware.swf"></object>',
        '<embed src="plugin.exe">',
        '<form action="evil.com"></form>',
        '<input type="password">',
        '<meta http-equiv="refresh">',
        '<link rel="stylesheet" href="evil.css">',
        '<style>body{background:url(javascript:alert(1))}</style>'
      ];
      
      threats.forEach(threat => {
        expect(HTMLSanitizer['hasObviousThreat'](threat)).toBe(true);
      });
    });

    it('should not flag safe content', () => {
      const safeContent = [
        '<p>Normal paragraph</p>',
        '<a href="https://example.com">Safe link</a>',
        '<img src="https://example.com/image.jpg" alt="Safe image">',
        '<div class="container">Content</div>'
      ];
      
      safeContent.forEach(content => {
        expect(HTMLSanitizer['hasObviousThreat'](content)).toBe(false);
      });
    });
  });

  describe('dangerous protocol detection', () => {
    it('should detect dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'about:blank',
        'chrome://settings',
        'chrome-extension://abc123/popup.html'
      ];
      
      dangerousUrls.forEach(url => {
        expect(HTMLSanitizer['hasDangerousProtocol'](url)).toBe(true);
      });
    });

    it('should allow safe protocols', () => {
      const safeUrls = [
        'https://example.com',
        'http://example.com',
        'mailto:test@example.com',
        'tel:+1234567890',
        '/relative/path',
        '#anchor',
        'ftp://example.com/file.txt'
      ];
      
      safeUrls.forEach(url => {
        expect(HTMLSanitizer['hasDangerousProtocol'](url)).toBe(false);
      });
    });

    it('should handle invalid URLs gracefully', () => {
      expect(HTMLSanitizer['hasDangerousProtocol']('')).toBe(false);
      expect(HTMLSanitizer['hasDangerousProtocol'](null as any)).toBe(false);
      expect(HTMLSanitizer['hasDangerousProtocol'](undefined as any)).toBe(false);
    });
  });

  describe('post-processing', () => {
    it('should remove dangerous protocols from attributes', () => {
      const html = '<a href="javascript:alert(1)">Link</a><img src="vbscript:evil()">';
      
      const result = HTMLSanitizer['postProcessSanitized'](html, HTMLSanitizer['DEFAULT_CONFIG']);
      
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('vbscript:');
    });

    it('should remove CSS expressions', () => {
      const html = '<div style="width: expression(alert(1))">Content</div>';
      
      const result = HTMLSanitizer['postProcessSanitized'](html, HTMLSanitizer['DEFAULT_CONFIG']);
      
      expect(result).not.toContain('expression(');
    });

    it('should remove remaining script tags', () => {
      const html = '<p>Content</p><script>alert(1)</script>';
      
      const result = HTMLSanitizer['postProcessSanitized'](html, HTMLSanitizer['DEFAULT_CONFIG']);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Content</p>');
    });
  });
});

describe('JSONValidator', () => {
  describe('validate', () => {
    it('should validate simple valid JSON', () => {
      const validJson = '{"name": "John", "age": 30}';
      
      const result = JSONValidator.validate(validJson);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toEqual({ name: "John", age: 30 });
    });

    it('should reject JSON that is too large', () => {
      const largeJson = '{"data": "' + 'x'.repeat(100000) + '"}';
      
      const result = JSONValidator.validate(largeJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('JSON too large');
    });

    it('should reject malformed JSON', () => {
      const invalidJson = '{"name": John, "age": 30}'; // Missing quotes
      
      const result = JSONValidator.validate(invalidJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unexpected token');
    });

    it('should reject deeply nested JSON', () => {
      let deepJson = '';
      for (let i = 0; i < 15; i++) {
        deepJson += '{"level' + i + '":';
      }
      deepJson += '"value"';
      for (let i = 0; i < 15; i++) {
        deepJson += '}';
      }
      
      const result = JSONValidator.validate(deepJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('JSON too deeply nested');
    });

    it('should reject objects with too many keys', () => {
      const manyKeys: Record<string, string> = {};
      for (let i = 0; i < 1001; i++) {
        manyKeys[`key${i}`] = `value${i}`;
      }
      
      const result = JSONValidator.validate(JSON.stringify(manyKeys));
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Too many object keys');
    });

    it('should reject arrays that are too large', () => {
      const largeArray = new Array(1001).fill('item');
      
      const result = JSONValidator.validate(JSON.stringify(largeArray));
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Array too large');
    });

    it('should reject strings that are too long', () => {
      const longString = 'x'.repeat(10001);
      
      const result = JSONValidator.validate(JSON.stringify({ data: longString }));
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('String too long');
    });

    it('should reject strings with dangerous content', () => {
      const dangerousStrings = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>'
      ];
      
      dangerousStrings.forEach(dangerous => {
        const result = JSONValidator.validate(JSON.stringify({ content: dangerous }));
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Potentially dangerous string content');
      });
    });

    it('should reject invalid numbers', () => {
      const invalidNumbers = [Infinity, -Infinity, NaN];
      
      invalidNumbers.forEach(num => {
        const result = JSONValidator.validate(JSON.stringify({ value: num }));
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid number');
      });
    });

    it('should reject invalid object keys', () => {
      const invalidKeyJson = JSON.stringify({ ['x'.repeat(101)]: 'value' });
      
      const result = JSONValidator.validate(invalidKeyJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid object key');
    });

    it('should validate complex but safe JSON', () => {
      const complexJson = {
        user: {
          name: "John Doe",
          age: 30,
          hobbies: ["reading", "coding", "swimming"],
          address: {
            street: "123 Main St",
            city: "Anytown",
            country: "USA"
          }
        },
        metadata: {
          created: "2023-01-01",
          version: 1.2
        }
      };
      
      const result = JSONValidator.validate(JSON.stringify(complexJson));
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toEqual(complexJson);
    });

    it('should handle null and primitive values', () => {
      const primitives = [null, true, false, 42, "string"];
      
      primitives.forEach(primitive => {
        const result = JSONValidator.validate(JSON.stringify(primitive));
        
        expect(result.isValid).toBe(true);
        expect(result.sanitized).toEqual(primitive);
      });
    });
  });
});

describe('TextSanitizer', () => {
  describe('sanitizeText', () => {
    it('should remove control characters', () => {
      const textWithControls = 'Normal text\x00\x01\x1F\x7F with controls';
      
      const result = TextSanitizer.sanitizeText(textWithControls);
      
      expect(result).toBe('Normal text with controls');
    });

    it('should remove script tags from text', () => {
      const textWithScript = 'Safe text <script>alert("xss")</script> more text';
      
      const result = TextSanitizer.sanitizeText(textWithScript);
      
      expect(result).toBe('Safe text  more text');
    });

    it('should remove javascript protocols', () => {
      const textWithJs = 'Visit javascript:alert("evil") for more info';
      
      const result = TextSanitizer.sanitizeText(textWithJs);
      
      expect(result).toBe('Visit  for more info');
    });

    it('should trim whitespace', () => {
      const textWithWhitespace = '  \n\t  Trimmed text  \n\t  ';
      
      const result = TextSanitizer.sanitizeText(textWithWhitespace);
      
      expect(result).toBe('Trimmed text');
    });

    it('should handle empty or invalid input', () => {
      expect(TextSanitizer.sanitizeText('')).toBe('');
      expect(TextSanitizer.sanitizeText('   ')).toBe('');
    });
  });

  describe('validateUrl', () => {
    it('should validate safe URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com/path',
        'ftp://ftp.example.com/file.txt',
        'ftps://secure.example.com/file.txt'
      ];
      
      validUrls.forEach(url => {
        expect(TextSanitizer.validateUrl(url)).toBe(true);
      });
    });

    it('should reject dangerous URLs', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd'
      ];
      
      dangerousUrls.forEach(url => {
        expect(TextSanitizer.validateUrl(url)).toBe(false);
      });
    });

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
        '',
        'http://[invalid'
      ];
      
      malformedUrls.forEach(url => {
        expect(TextSanitizer.validateUrl(url)).toBe(false);
      });
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com'
      ];
      
      validEmails.forEach(email => {
        expect(TextSanitizer.validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user..double.dot@example.com',
        'user@example',
        'user name@example.com', // Space
        'user@example.com.', // Trailing dot
        'x'.repeat(250) + '@example.com' // Too long
      ];
      
      invalidEmails.forEach(email => {
        expect(TextSanitizer.validateEmail(email)).toBe(false);
      });
    });

    it('should enforce length limits', () => {
      const longEmail = 'x'.repeat(250) + '@example.com';
      
      expect(TextSanitizer.validateEmail(longEmail)).toBe(false);
    });
  });
});