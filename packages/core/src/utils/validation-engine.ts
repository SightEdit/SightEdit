/**
 * Secure validation engine that replaces dangerous Function constructor usage
 * Provides safe, predefined validation patterns without code execution risks
 */

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'email' | 'url' | 
        'number' | 'min' | 'max' | 'custom' | 'date' | 'phone' | 'alphanumeric' |
        'creditCard' | 'ipAddress' | 'uuid' | 'json' | 'base64';
  value?: any;
  message?: string;
}

export interface ValidationSchema {
  rules: ValidationRule[];
  sanitize?: boolean;
  trim?: boolean;
  toLowerCase?: boolean;
  toUpperCase?: boolean;
}

export class ValidationEngine {
  private static readonly EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  private static readonly URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
  private static readonly PHONE_REGEX = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  private static readonly ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]+$/;
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private static readonly BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
  private static readonly IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // Credit card validation using Luhn algorithm
  private static isValidCreditCard(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    return sum % 10 === 0;
  }

  /**
   * Parse validation schema from string format (safe alternative to Function constructor)
   */
  static parseValidationString(validationStr: string): ValidationSchema | null {
    try {
      // Parse common validation patterns
      const schema: ValidationSchema = {
        rules: [],
        sanitize: true
      };

      // Check for required
      if (validationStr.includes('required')) {
        schema.rules.push({ type: 'required' });
      }

      // Check for email
      if (validationStr.includes('email')) {
        schema.rules.push({ type: 'email' });
      }

      // Check for URL
      if (validationStr.includes('url')) {
        schema.rules.push({ type: 'url' });
      }

      // Check for number validations
      const minMatch = validationStr.match(/min[:\s]*(\d+)/);
      if (minMatch) {
        schema.rules.push({ type: 'min', value: parseInt(minMatch[1], 10) });
      }

      const maxMatch = validationStr.match(/max[:\s]*(\d+)/);
      if (maxMatch) {
        schema.rules.push({ type: 'max', value: parseInt(maxMatch[1], 10) });
      }

      // Check for length validations
      const minLengthMatch = validationStr.match(/minLength[:\s]*(\d+)/);
      if (minLengthMatch) {
        schema.rules.push({ type: 'minLength', value: parseInt(minLengthMatch[1], 10) });
      }

      const maxLengthMatch = validationStr.match(/maxLength[:\s]*(\d+)/);
      if (maxLengthMatch) {
        schema.rules.push({ type: 'maxLength', value: parseInt(maxLengthMatch[1], 10) });
      }

      // Check for pattern (safely)
      const patternMatch = validationStr.match(/pattern[:\s]*\/([^\/]+)\//);
      if (patternMatch) {
        // Only allow safe, predefined patterns
        const safePatterns: Record<string, string> = {
          'alphanumeric': '^[a-zA-Z0-9]+$',
          'alpha': '^[a-zA-Z]+$',
          'numeric': '^[0-9]+$',
          'slug': '^[a-z0-9-]+$'
        };
        
        const patternKey = patternMatch[1].toLowerCase();
        if (safePatterns[patternKey]) {
          schema.rules.push({ 
            type: 'pattern', 
            value: new RegExp(safePatterns[patternKey])
          });
        }
      }

      return schema.rules.length > 0 ? schema : null;
    } catch (error) {
      console.warn('Failed to parse validation string:', error);
      return null;
    }
  }

  /**
   * Validate a value against a schema
   */
  static validate(value: any, schema: ValidationSchema): { 
    isValid: boolean; 
    errors: string[];
    sanitizedValue?: any;
  } {
    const errors: string[] = [];
    let sanitizedValue = value;

    // Pre-process value
    if (typeof sanitizedValue === 'string') {
      if (schema.trim) {
        sanitizedValue = sanitizedValue.trim();
      }
      if (schema.toLowerCase) {
        sanitizedValue = sanitizedValue.toLowerCase();
      }
      if (schema.toUpperCase) {
        sanitizedValue = sanitizedValue.toUpperCase();
      }
    }

    // Apply validation rules
    for (const rule of schema.rules) {
      switch (rule.type) {
        case 'required':
          if (!sanitizedValue || (typeof sanitizedValue === 'string' && !sanitizedValue.trim())) {
            errors.push(rule.message || 'This field is required');
          }
          break;

        case 'email':
          if (sanitizedValue && !this.EMAIL_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid email address');
          }
          break;

        case 'url':
          if (sanitizedValue && !this.URL_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid URL');
          }
          break;

        case 'phone':
          if (sanitizedValue && !this.PHONE_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid phone number');
          }
          break;

        case 'alphanumeric':
          if (sanitizedValue && !this.ALPHANUMERIC_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Only letters and numbers are allowed');
          }
          break;

        case 'creditCard':
          if (sanitizedValue && !this.isValidCreditCard(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid credit card number');
          }
          break;

        case 'ipAddress':
          if (sanitizedValue && !this.IP_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid IP address');
          }
          break;

        case 'uuid':
          if (sanitizedValue && !this.UUID_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid UUID');
          }
          break;

        case 'base64':
          if (sanitizedValue && !this.BASE64_REGEX.test(String(sanitizedValue))) {
            errors.push(rule.message || 'Please enter valid base64 encoded data');
          }
          break;

        case 'json':
          if (sanitizedValue) {
            try {
              JSON.parse(String(sanitizedValue));
            } catch {
              errors.push(rule.message || 'Please enter valid JSON');
            }
          }
          break;

        case 'number':
          if (sanitizedValue && isNaN(Number(sanitizedValue))) {
            errors.push(rule.message || 'Please enter a valid number');
          }
          break;

        case 'min':
          if (sanitizedValue !== undefined && sanitizedValue !== null) {
            const num = Number(sanitizedValue);
            if (!isNaN(num) && num < rule.value) {
              errors.push(rule.message || `Value must be at least ${rule.value}`);
            }
          }
          break;

        case 'max':
          if (sanitizedValue !== undefined && sanitizedValue !== null) {
            const num = Number(sanitizedValue);
            if (!isNaN(num) && num > rule.value) {
              errors.push(rule.message || `Value must be at most ${rule.value}`);
            }
          }
          break;

        case 'minLength':
          if (sanitizedValue && String(sanitizedValue).length < rule.value) {
            errors.push(rule.message || `Must be at least ${rule.value} characters`);
          }
          break;

        case 'maxLength':
          if (sanitizedValue && String(sanitizedValue).length > rule.value) {
            errors.push(rule.message || `Must be at most ${rule.value} characters`);
          }
          break;

        case 'pattern':
          if (sanitizedValue && rule.value instanceof RegExp) {
            if (!rule.value.test(String(sanitizedValue))) {
              errors.push(rule.message || 'Invalid format');
            }
          }
          break;

        case 'date':
          if (sanitizedValue) {
            const date = new Date(sanitizedValue);
            if (isNaN(date.getTime())) {
              errors.push(rule.message || 'Please enter a valid date');
            }
          }
          break;

        case 'custom':
          // Custom validation functions are not allowed for security
          // Use predefined validation types instead
          console.warn('Custom validation functions are not supported for security reasons');
          break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: schema.sanitize ? sanitizedValue : value
    };
  }

  /**
   * Create a validation schema from common use cases
   */
  static createSchema(type: 'email' | 'password' | 'username' | 'phone' | 'url' | 'creditCard'): ValidationSchema {
    switch (type) {
      case 'email':
        return {
          rules: [
            { type: 'required', message: 'Email is required' },
            { type: 'email', message: 'Please enter a valid email address' }
          ],
          sanitize: true,
          trim: true,
          toLowerCase: true
        };

      case 'password':
        return {
          rules: [
            { type: 'required', message: 'Password is required' },
            { type: 'minLength', value: 8, message: 'Password must be at least 8 characters' },
            { type: 'maxLength', value: 128, message: 'Password is too long' }
          ],
          sanitize: false
        };

      case 'username':
        return {
          rules: [
            { type: 'required', message: 'Username is required' },
            { type: 'minLength', value: 3, message: 'Username must be at least 3 characters' },
            { type: 'maxLength', value: 30, message: 'Username must be at most 30 characters' },
            { type: 'alphanumeric', message: 'Username can only contain letters and numbers' }
          ],
          sanitize: true,
          trim: true,
          toLowerCase: true
        };

      case 'phone':
        return {
          rules: [
            { type: 'required', message: 'Phone number is required' },
            { type: 'phone', message: 'Please enter a valid phone number' }
          ],
          sanitize: true,
          trim: true
        };

      case 'url':
        return {
          rules: [
            { type: 'required', message: 'URL is required' },
            { type: 'url', message: 'Please enter a valid URL' }
          ],
          sanitize: true,
          trim: true
        };

      case 'creditCard':
        return {
          rules: [
            { type: 'required', message: 'Credit card number is required' },
            { type: 'creditCard', message: 'Please enter a valid credit card number' }
          ],
          sanitize: true,
          trim: true
        };
    }
  }
}