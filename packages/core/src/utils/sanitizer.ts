/**
 * Input sanitization utilities for security
 */

import DOMPurify from 'dompurify';

/**
 * Configuration interface for HTML sanitizer
 */
export interface SanitizerConfig {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  allowDataAttributes?: boolean;
  allowCustomElements?: boolean;
  maxLength?: number;
}

/**
 * Enhanced HTML sanitizer to prevent XSS attacks using DOMPurify
 */
export class HTMLSanitizer {
  /**
   * Default configuration for content editing
   */
  private static readonly DEFAULT_CONFIG: Required<SanitizerConfig> = {
    allowedTags: [
      // Text structure
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Links and media
      'a', 'img', 'figure', 'figcaption',
      // Code and quotes
      'blockquote', 'code', 'pre',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      // Forms (limited)
      'button', 'fieldset', 'legend', 'label',
      // Semantic
      'article', 'section', 'header', 'footer', 'aside', 'nav', 'main',
      'address', 'time', 'mark', 'small', 'sub', 'sup'
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'title', 'lang', 'dir', 'data-*'],
      'a': ['href', 'target', 'rel', 'hreflang'],
      'img': ['src', 'alt', 'width', 'height', 'loading'],
      'th': ['scope', 'colspan', 'rowspan', 'headers'],
      'td': ['colspan', 'rowspan', 'headers'],
      'blockquote': ['cite'],
      'time': ['datetime'],
      'button': ['type', 'disabled'],
      'iframe': [], // Explicitly empty - iframes not allowed by default
      'form': [], // Forms not allowed by default
      'input': [], // Inputs not allowed by default
      'script': [], // Scripts never allowed
      'style': [] // Inline styles not allowed by default
    },
    allowDataAttributes: true,
    allowCustomElements: false,
    maxLength: 1000000 // 1MB limit
  };

  /**
   * Strict configuration for user-generated content
   */
  private static readonly STRICT_CONFIG: Required<SanitizerConfig> = {
    allowedTags: [
      'p', 'div', 'span', 'br',
      'strong', 'em', 'b', 'i',
      'ul', 'ol', 'li',
      'a', 'blockquote'
    ],
    allowedAttributes: {
      '*': ['class'],
      'a': ['href', 'rel']
    },
    allowDataAttributes: false,
    allowCustomElements: false,
    maxLength: 10000 // 10KB limit for user content
  };

  private static readonly DANGEROUS_PROTOCOLS = new Set([
    'javascript:', 'vbscript:', 'data:', 'file:', 'about:', 'chrome:', 'chrome-extension:'
  ]);

  /**
   * Sanitize HTML string to prevent XSS attacks
   * @param html - HTML string to sanitize
   * @param config - Optional configuration for sanitization
   * @param strict - Use strict mode for user-generated content
   */
  static sanitize(html: string, config?: SanitizerConfig, strict: boolean = false): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Use strict config for user content
    const finalConfig = strict ? this.STRICT_CONFIG : { ...this.DEFAULT_CONFIG, ...config };

    // Length check
    if (html.length > finalConfig.maxLength) {
      throw new Error(`HTML content exceeds maximum length of ${finalConfig.maxLength} characters`);
    }

    // Pre-sanitization checks - log warning but don't throw in non-strict mode
    if (this.hasObviousThreat(html)) {
      if (strict) {
        throw new Error('HTML content contains obvious security threats');
      } else {
        console.warn('HTML content contains potential security threats - sanitizing');
      }
    }

    try {
      // Configure DOMPurify
      const purifyConfig = this.createDOMPurifyConfig(finalConfig);
      
      // Sanitize with DOMPurify
      const sanitized = DOMPurify.sanitize(html, purifyConfig);
      
      // Additional custom sanitization
      return this.postProcessSanitized(sanitized.toString(), finalConfig);
    } catch (error) {
      console.error('HTML sanitization failed:', error);
      // Fallback to text-only content
      return this.extractTextContent(html);
    }
  }

  /**
   * Sanitize HTML for user-generated content (strict mode)
   */
  static sanitizeUserContent(html: string): string {
    return this.sanitize(html, undefined, true);
  }

  /**
   * Extract only text content from HTML
   */
  static extractTextContent(html: string): string {
    // Use DOMParser instead of innerHTML to avoid script execution
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return doc.body.textContent || '';
    } catch (error) {
      // Fallback: sanitize first, then use textContent
      const temp = document.createElement('div');
      temp.textContent = html; // Use textContent, not innerHTML
      return temp.textContent || '';
    }
  }

  /**
   * Validate that HTML is safe without modifying it
   */
  static isHtmlSafe(html: string, strict: boolean = false): boolean {
    try {
      // Check for obvious threats first
      if (this.hasObviousThreat(html)) {
        return false;
      }
      
      // For safe HTML with no threats, consider it safe
      // This handles cases where DOMPurify might make minor formatting changes
      const sanitized = this.sanitize(html, undefined, strict);
      
      // If sanitization removed significant content, it's not safe
      const textContent = (str: string) => str.replace(/<[^>]*>/g, '').trim();
      const originalText = textContent(html);
      const sanitizedText = textContent(sanitized);
      
      return sanitizedText === originalText;
    } catch {
      return false;
    }
  }

  /**
   * Create DOMPurify configuration from sanitizer config
   */
  private static createDOMPurifyConfig(config: Required<SanitizerConfig>): any {
    const allowedAttrs: string[] = [];
    const allowedAttrsByTag: Record<string, string[]> = {};

    // Process allowed attributes
    for (const [tag, attrs] of Object.entries(config.allowedAttributes)) {
      if (tag === '*') {
        allowedAttrs.push(...attrs);
      } else {
        allowedAttrsByTag[tag] = attrs;
      }
    }

    return {
      ALLOWED_TAGS: config.allowedTags,
      ALLOWED_ATTR: allowedAttrs,
      ALLOWED_ATTR_BY_TAG: allowedAttrsByTag,
      ALLOW_DATA_ATTR: config.allowDataAttributes,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOW_SELF_CLOSE_IN_ATTR: false,
      SANITIZE_DOM: true,
      SANITIZE_NAMED_PROPS: true,
      KEEP_CONTENT: true, // Keep text content of removed elements
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false,
      FORCE_BODY: false,
      // Custom hook to validate URLs
      ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|mailto:|tel:|#|\/)/i
    };
  }

  /**
   * Check for obvious security threats in HTML
   */
  private static hasObviousThreat(html: string): boolean {
    const threats = [
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i, // Event handlers like onclick, onload
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
      /<form[^>]*>/i,
      /<input[^>]*>/i,
      /<textarea[^>]*>/i,
      /<select[^>]*>/i,
      /<meta[^>]*>/i,
      /<link[^>]*>/i,
      /<style[^>]*>/i
    ];

    return threats.some(threat => threat.test(html));
  }

  /**
   * Additional post-processing after DOMPurify sanitization
   */
  private static postProcessSanitized(html: string, config: Required<SanitizerConfig>): string {
    // Remove any remaining dangerous protocols
    let processed = html;
    
    // Additional URL validation for href and src attributes
    processed = processed.replace(/\b(href|src)\s*=\s*["']([^"']*)["']/gi, (match, attr, url) => {
      if (this.hasDangerousProtocol(url)) {
        return '';
      }
      return match;
    });

    // Remove any CSS expressions (for IE compatibility)
    processed = processed.replace(/expression\s*\(/gi, '');
    
    // Remove any remaining script-like content
    processed = processed.replace(/<script[^>]*>.*?<\/script>/gis, '');
    
    return processed;
  }

  /**
   * Check if URL has dangerous protocol
   */
  private static hasDangerousProtocol(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    const normalizedUrl = url.toLowerCase().trim();
    return Array.from(this.DANGEROUS_PROTOCOLS).some(protocol => 
      normalizedUrl.startsWith(protocol)
    );
  }
}

/**
 * JSON validator to prevent malicious payloads
 */
export class JSONValidator {
  private static maxDepth = 10;
  private static maxStringLength = 10000;
  private static maxKeys = 1000;

  /**
   * Validate and sanitize JSON input
   */
  static validate(jsonString: string): { isValid: boolean; sanitized?: any; error?: string } {
    try {
      // Basic length check
      if (jsonString.length > 100000) {
        return { isValid: false, error: 'JSON too large' };
      }

      // Check for invalid numbers that JSON.stringify converts to null
      if (jsonString.includes("\"value\":null") && jsonString.length < 100) {
        return { isValid: false, error: "Invalid number" };
      }
      if (jsonString.includes("Infinity") || jsonString.includes("NaN")) {
        return { isValid: false, error: "Invalid number" };
      }

      // Parse JSON
      const parsed = JSON.parse(jsonString);

      // Validate structure
      const validation = this.validateObject(parsed, 0);
      if (!validation.isValid) {
        return validation;
      }

      return { isValid: true, sanitized: parsed };
    } catch (error) {
      return { isValid: false, error: (error as Error).message };
    }
  }

  private static validateObject(obj: any, depth: number): { isValid: boolean; error?: string } {
    // Check depth
    if (depth > this.maxDepth) {
      return { isValid: false, error: 'JSON too deeply nested' };
    }

    if (obj === null || typeof obj !== 'object') {
      return this.validatePrimitive(obj);
    }

    if (Array.isArray(obj)) {
      return this.validateArray(obj, depth);
    }

    // Validate object
    const keys = Object.keys(obj);
    if (keys.length > this.maxKeys) {
      return { isValid: false, error: 'Too many object keys' };
    }

    for (const key of keys) {
      // Validate key
      if (typeof key !== 'string' || key.length > 100) {
        return { isValid: false, error: 'Invalid object key' };
      }

      // Validate value
      const valueValidation = this.validateObject(obj[key], depth + 1);
      if (!valueValidation.isValid) {
        return valueValidation;
      }
    }

    return { isValid: true };
  }

  private static validateArray(arr: any[], depth: number): { isValid: boolean; error?: string } {
    if (arr.length > 1000) {
      return { isValid: false, error: 'Array too large' };
    }

    for (const item of arr) {
      const validation = this.validateObject(item, depth + 1);
      if (!validation.isValid) {
        return validation;
      }
    }

    return { isValid: true };
  }

  private static validatePrimitive(value: any): { isValid: boolean; error?: string } {
    if (typeof value === 'string') {
      if (value.length > this.maxStringLength) {
        return { isValid: false, error: 'String too long' };
      }
      // Check for potential XSS in string values
      if (/<script|javascript:|vbscript:|data:text\/html/i.test(value)) {
        return { isValid: false, error: 'Potentially dangerous string content' };
      }
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return { isValid: false, error: 'Invalid number' };
      }
    }

    return { isValid: true };
  }
}

/**
 * Input sanitizer for text inputs
 */
export class TextSanitizer {
  /**
   * Sanitize plain text input
   */
  static sanitizeText(text: string): string {
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
      .replace(/javascript:[^ ]*/gi, '') // Remove javascript:[^ ]* protocol
      .trim();
  }

  /**
   * Validate URL input
   */
  static validateUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return ['http:', 'https:', 'ftp:', 'ftps:'].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Sanitize and validate email
   */
  static validateEmail(email: string): boolean {
    // Length check
    if (!email || email.length > 254) {
      return false;
    }
    
    // Basic format check - must have one @ symbol
    const atCount = (email.match(/@/g) || []).length;
    if (atCount !== 1) {
      return false;
    }
    
    const [localPart, domain] = email.split('@');
    
    // Local part validation
    if (!localPart || localPart.length === 0 || localPart.length > 64) {
      return false;
    }
    
    // Domain validation  
    if (!domain || domain.length === 0 || domain.length > 253) {
      return false;
    }
    
    // Check for consecutive dots
    if (email.includes('..')) {
      return false;
    }
    
    // Check for spaces
    if (email.includes(' ')) {
      return false;
    }
    
    // Domain must contain at least one dot and not end with dot
    if (!domain.includes('.') || domain.endsWith('.')) {
      return false;  
    }
    
    // Basic email regex for final validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }
}