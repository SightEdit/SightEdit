/**
 * Safe JSON parsing utilities to prevent application crashes from malformed data
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface JSONValidationOptions {
  maxSize?: number; // Maximum string length
  maxDepth?: number; // Maximum nesting depth
  allowedTypes?: string[]; // Allowed top-level types
  requireSchema?: boolean; // Require specific schema validation
}

/**
 * Safe JSON Parser with comprehensive validation
 */
export class SafeJSONParser {
  private static readonly DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB
  private static readonly DEFAULT_MAX_DEPTH = 10;
  private static readonly DEFAULT_ALLOWED_TYPES = ['object', 'array', 'string', 'number', 'boolean'];

  /**
   * Safely parse JSON string with validation and error handling
   */
  static parse<T = any>(
    jsonString: string, 
    defaultValue?: T, 
    options: JSONValidationOptions = {}
  ): T {
    // Validate input parameters
    if (!jsonString || typeof jsonString !== 'string') {
      if (defaultValue !== undefined) return defaultValue;
      throw new ValidationError('Invalid JSON string provided: must be a non-empty string');
    }

    // Check size limits to prevent DoS attacks
    const maxSize = options.maxSize || this.DEFAULT_MAX_SIZE;
    if (jsonString.length > maxSize) {
      if (defaultValue !== undefined) return defaultValue;
      throw new ValidationError(`JSON string too large: ${jsonString.length} bytes exceeds limit of ${maxSize}`);
    }

    // Sanitize string - remove null bytes and control characters
    const sanitizedString = this.sanitizeJSONString(jsonString);
    
    try {
      const parsed = JSON.parse(sanitizedString);
      
      // Validate parsed result
      this.validateParsedJSON(parsed, options);
      
      // Return parsed result or default if null/undefined
      return parsed !== null && parsed !== undefined 
        ? parsed 
        : (defaultValue !== undefined ? defaultValue : parsed);
        
    } catch (error) {
      // Log parsing error securely (no sensitive data)
      console.warn('[SafeJSON] Parsing failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stringLength: jsonString.length,
        firstChars: jsonString.substring(0, 50) + (jsonString.length > 50 ? '...' : '')
      });

      if (defaultValue !== undefined) {
        return defaultValue;
      }
      
      // Re-throw with sanitized error message
      if (error instanceof SyntaxError) {
        throw new ValidationError(`JSON parsing failed: Invalid JSON syntax`);
      }
      
      throw error;
    }
  }

  /**
   * Parse JSON with schema validation
   */
  static parseWithSchema<T = any>(
    jsonString: string,
    schema: (value: any) => value is T,
    defaultValue?: T,
    options: JSONValidationOptions = {}
  ): T {
    const parsed = this.parse(jsonString, undefined, options);
    
    if (!schema(parsed)) {
      if (defaultValue !== undefined) return defaultValue;
      throw new ValidationError('Parsed JSON does not match expected schema');
    }
    
    return parsed;
  }

  /**
   * Parse JSON array with validation
   */
  static parseArray<T = any>(
    jsonString: string,
    itemValidator?: (item: any) => item is T,
    defaultValue: T[] = [],
    options: JSONValidationOptions = {}
  ): T[] {
    const parsed = this.parse(jsonString, defaultValue, {
      ...options,
      allowedTypes: ['array']
    });

    if (!Array.isArray(parsed)) {
      return defaultValue;
    }

    // Validate array items if validator provided
    if (itemValidator) {
      const validItems = parsed.filter(itemValidator);
      
      // If some items are invalid, log warning but continue with valid items
      if (validItems.length !== parsed.length) {
        console.warn(`[SafeJSON] Array validation: ${parsed.length - validItems.length} invalid items filtered out`);
      }
      
      return validItems;
    }

    return parsed;
  }

  /**
   * Try parsing JSON, return null if failed (never throws)
   */
  static tryParse<T = any>(jsonString: string, options: JSONValidationOptions = {}): T | null {
    try {
      return this.parse<T>(jsonString, undefined, options);
    } catch {
      return null;
    }
  }

  /**
   * Silent try parsing JSON for type detection - never logs warnings
   */
  static tryParseSilent<T = any>(jsonString: string, options: JSONValidationOptions = {}): T | null {
    if (!jsonString || typeof jsonString !== 'string') {
      return null;
    }

    const maxSize = options.maxSize || this.DEFAULT_MAX_SIZE;
    if (jsonString.length > maxSize) {
      return null;
    }

    const sanitizedString = this.sanitizeJSONString(jsonString);
    
    try {
      const parsed = JSON.parse(sanitizedString);
      this.validateParsedJSON(parsed, options);
      return parsed !== null && parsed !== undefined ? parsed : null;
    } catch {
      // Silent failure - no logging for type detection
      return null;
    }
  }

  /**
   * Stringify with safety checks
   */
  static stringify(
    value: any, 
    replacer?: (key: string, value: any) => any,
    space?: string | number
  ): string {
    try {
      // Check for circular references and sanitize
      const sanitized = this.sanitizeForStringify(value);
      
      return JSON.stringify(sanitized, replacer, space);
    } catch (error) {
      console.error('[SafeJSON] Stringify failed:', error);
      throw new ValidationError('JSON stringify failed: Unable to serialize object');
    }
  }

  /**
   * Sanitizes JSON string by removing dangerous characters
   */
  private static sanitizeJSONString(jsonString: string): string {
    return jsonString
      // Replace null byte escape sequences in strings with empty string
      .replace(/\\x00/g, '')
      .replace(/\\u0000/g, '')
      // Remove actual null bytes and control characters (except newlines, tabs, carriage returns)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove potential Unicode issues
      .replace(/\uFEFF/g, ''); // Byte Order Mark
  }

  /**
   * Validates parsed JSON structure
   */
  private static validateParsedJSON(parsed: any, options: JSONValidationOptions): void {
    const { maxDepth = this.DEFAULT_MAX_DEPTH, allowedTypes = this.DEFAULT_ALLOWED_TYPES } = options;

    // Check type restrictions
    if (allowedTypes.length > 0) {
      const type = Array.isArray(parsed) ? 'array' : typeof parsed;
      if (!allowedTypes.includes(type)) {
        throw new ValidationError(`JSON type '${type}' not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      }
    }

    // Check nesting depth to prevent stack overflow
    if (maxDepth > 0) {
      this.checkDepth(parsed, maxDepth, 0);
    }
  }

  /**
   * Recursively checks object depth
   */
  private static checkDepth(obj: any, maxDepth: number, currentDepth: number): void {
    if (currentDepth > maxDepth) {
      throw new ValidationError(`JSON nesting too deep: exceeds maximum depth of ${maxDepth}`);
    }

    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          this.checkDepth(obj[key], maxDepth, currentDepth + 1);
        }
      }
    }
  }

  /**
   * Sanitizes object for stringification (handles circular references)
   */
  private static sanitizeForStringify(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Handle circular references
    if (seen.has(obj)) {
      return '[Circular Reference]';
    }

    seen.add(obj);

    if (Array.isArray(obj)) {
      const result = obj.map(item => this.sanitizeForStringify(item, seen));
      seen.delete(obj);
      return result;
    }

    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Skip functions and undefined values
        if (typeof obj[key] === 'function') {
          result[key] = '[Function]';
        } else if (obj[key] === undefined) {
          // Skip undefined values
          continue;
        } else {
          result[key] = this.sanitizeForStringify(obj[key], seen);
        }
      }
    }

    seen.delete(obj);
    return result;
  }
}

/**
 * Common JSON validation schemas
 */
export const JSONSchemas = {
  /**
   * Validates object has required string properties
   */
  requireStringFields: (fields: string[]) => (value: any): value is Record<string, string> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    
    return fields.every(field => 
      field in value && typeof value[field] === 'string' && value[field].length > 0
    );
  },

  /**
   * Validates object has numeric properties
   */
  requireNumberFields: (fields: string[]) => (value: any): value is Record<string, number> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    
    return fields.every(field => 
      field in value && typeof value[field] === 'number' && !isNaN(value[field])
    );
  },

  /**
   * Validates array of specific type
   */
  arrayOf: <T>(itemValidator: (item: any) => item is T) => (value: any): value is T[] => {
    if (!Array.isArray(value)) return false;
    return value.every(itemValidator);
  },

  /**
   * Basic object validator
   */
  isObject: (value: any): value is Record<string, any> => {
    return value && typeof value === 'object' && !Array.isArray(value);
  },

  /**
   * Non-empty string validator
   */
  isNonEmptyString: (value: any): value is string => {
    return typeof value === 'string' && value.length > 0;
  }
};

/**
 * Convenience function for safe parsing with common defaults
 */
export function safeParseJSON<T = any>(
  jsonString: string, 
  defaultValue?: T
): T | undefined {
  return SafeJSONParser.tryParse<T>(jsonString) ?? defaultValue;
}