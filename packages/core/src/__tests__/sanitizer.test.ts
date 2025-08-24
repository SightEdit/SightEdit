import { HTMLSanitizer, JSONValidator, TextSanitizer } from '../utils/sanitizer';

describe('HTMLSanitizer', () => {
  test('should sanitize dangerous script tags', () => {
    const maliciousHTML = '<div>Safe content</div><script>alert("XSS")</script>';
    const sanitized = HTMLSanitizer.sanitize(maliciousHTML);
    expect(sanitized).not.toContain('<script');
    expect(sanitized).toContain('Safe content');
  });

  test('should remove dangerous protocols', () => {
    const maliciousHTML = '<a href="javascript:alert(\'XSS\')">Link</a>';
    const sanitized = HTMLSanitizer.sanitize(maliciousHTML);
    expect(sanitized).not.toContain('javascript:');
  });

  test('should preserve safe HTML elements', () => {
    const safeHTML = '<div class="container"><p><strong>Bold text</strong></p></div>';
    const sanitized = HTMLSanitizer.sanitize(safeHTML);
    expect(sanitized).toContain('div');
    expect(sanitized).toContain('strong');
    expect(sanitized).toContain('Bold text');
  });

  test('should remove disallowed attributes', () => {
    const htmlWithBadAttrs = '<div onload="alert(\'XSS\')" data-custom="safe">Content</div>';
    const sanitized = HTMLSanitizer.sanitize(htmlWithBadAttrs);
    expect(sanitized).not.toContain('onload');
    expect(sanitized).toContain('data-custom');
  });
});

describe('JSONValidator', () => {
  test('should validate correct JSON', () => {
    const validJSON = '{"name": "test", "value": 123}';
    const result = JSONValidator.validate(validJSON);
    expect(result.isValid).toBe(true);
    expect(result.sanitized).toEqual({ name: 'test', value: 123 });
  });

  test('should reject malicious JSON strings', () => {
    const maliciousJSON = '{"script": "<script>alert(\'XSS\')</script>"}';
    const result = JSONValidator.validate(maliciousJSON);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('dangerous');
  });

  test('should reject JSON that is too large', () => {
    const largeJSON = JSON.stringify({ data: 'x'.repeat(50000) });
    const result = JSONValidator.validate(largeJSON);
    expect(result.isValid).toBe(false);
  });

  test('should reject deeply nested JSON', () => {
    let deepJSON = '{"a":';
    for (let i = 0; i < 15; i++) {
      deepJSON += '{"b":';
    }
    deepJSON += '1';
    for (let i = 0; i < 15; i++) {
      deepJSON += '}';
    }
    deepJSON += '}';
    
    const result = JSONValidator.validate(deepJSON);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('deeply nested');
  });
});

describe('TextSanitizer', () => {
  test('should remove script tags from text', () => {
    const maliciousText = 'Normal text <script>alert("XSS")</script> more text';
    const sanitized = TextSanitizer.sanitizeText(maliciousText);
    expect(sanitized).not.toContain('<script');
    expect(sanitized).toContain('Normal text');
    expect(sanitized).toContain('more text');
  });

  test('should validate URLs correctly', () => {
    expect(TextSanitizer.validateUrl('https://example.com')).toBe(true);
    expect(TextSanitizer.validateUrl('http://example.com')).toBe(true);
    expect(TextSanitizer.validateUrl('javascript:alert("XSS")')).toBe(false);
    expect(TextSanitizer.validateUrl('not-a-url')).toBe(false);
  });

  test('should validate emails correctly', () => {
    expect(TextSanitizer.validateEmail('test@example.com')).toBe(true);
    expect(TextSanitizer.validateEmail('invalid-email')).toBe(false);
    expect(TextSanitizer.validateEmail('test@')).toBe(false);
  });

  test('should remove control characters', () => {
    const textWithControls = 'Normal\x00text\x08with\x0Bcontrols';
    const sanitized = TextSanitizer.sanitizeText(textWithControls);
    expect(sanitized).toBe('Normaltextwithcontrols');
  });
});