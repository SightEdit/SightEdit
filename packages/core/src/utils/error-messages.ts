/**
 * Standardized error message formatting for consistent user experience
 */

export interface StandardizedError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  category?: 'validation' | 'network' | 'security' | 'permission' | 'runtime';
}

/**
 * Standardized error message templates
 */
export class ErrorMessages {
  // Validation errors
  static readonly VALIDATION_REQUIRED = (field: string): string => 
    `${field} is required`;
  
  static readonly VALIDATION_FORMAT = (field: string, format: string): string => 
    `${field} must be in ${format} format`;
  
  static readonly VALIDATION_LENGTH = (field: string, min?: number, max?: number): string => {
    if (min && max) return `${field} must be between ${min} and ${max} characters`;
    if (min) return `${field} must be at least ${min} characters`;
    if (max) return `${field} must be no more than ${max} characters`;
    return `${field} length is invalid`;
  };

  static readonly VALIDATION_RANGE = (field: string, min?: number, max?: number): string => {
    if (min && max) return `${field} must be between ${min} and ${max}`;
    if (min) return `${field} must be at least ${min}`;
    if (max) return `${field} must be no more than ${max}`;
    return `${field} value is out of range`;
  };

  static readonly VALIDATION_TYPE = (field: string, expectedType: string): string =>
    `${field} must be of type ${expectedType}`;

  // Network errors
  static readonly NETWORK_TIMEOUT = (timeout: number): string => 
    `Request timed out after ${timeout}ms`;
  
  static readonly NETWORK_CONNECTION_FAILED = (): string => 
    'Unable to connect to server. Please check your internet connection.';
  
  static readonly NETWORK_SERVER_ERROR = (statusCode?: number): string => 
    `Server error${statusCode ? ` (${statusCode})` : ''}. Please try again later.`;

  static readonly NETWORK_RATE_LIMITED = (): string => 
    'Too many requests. Please wait before trying again.';

  // Permission errors
  static readonly PERMISSION_DENIED = (action: string): string => 
    `Permission denied for action: ${action}`;
  
  static readonly PERMISSION_INSUFFICIENT_PRIVILEGES = (): string => 
    'You do not have sufficient privileges to perform this action';

  static readonly PERMISSION_AUTHENTICATION_REQUIRED = (): string => 
    'Authentication required to access this resource';

  // Security errors
  static readonly SECURITY_INVALID_TOKEN = (): string => 
    'Security token is invalid or expired';

  static readonly SECURITY_CSRF_TOKEN_MISMATCH = (): string => 
    'Security validation failed. Please refresh the page and try again.';

  static readonly SECURITY_SUSPICIOUS_ACTIVITY = (): string => 
    'Suspicious activity detected. Access has been restricted.';

  // File/Upload errors  
  static readonly FILE_TOO_LARGE = (maxSize: string): string => 
    `File is too large. Maximum size allowed is ${maxSize}`;

  static readonly FILE_INVALID_TYPE = (allowedTypes: string[]): string => 
    `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`;

  static readonly FILE_UPLOAD_FAILED = (): string => 
    'File upload failed. Please try again.';

  // General runtime errors
  static readonly RUNTIME_UNEXPECTED_ERROR = (): string => 
    'An unexpected error occurred. Please try again or contact support.';

  static readonly RUNTIME_OPERATION_FAILED = (operation: string): string => 
    `Failed to ${operation}. Please try again.`;

  static readonly RUNTIME_RESOURCE_NOT_FOUND = (resource: string): string => 
    `${resource} not found`;

  static readonly RUNTIME_RESOURCE_ALREADY_EXISTS = (resource: string): string => 
    `${resource} already exists`;

  /**
   * Creates a standardized error object
   */
  static format(
    code: string, 
    message: string, 
    details?: any, 
    category?: StandardizedError['category']
  ): StandardizedError {
    return {
      code: code.toUpperCase(),
      message,
      details,
      timestamp: new Date().toISOString(),
      category
    };
  }

  /**
   * Format validation error
   */
  static validationError(
    field: string, 
    reason: 'required' | 'format' | 'length' | 'range' | 'type',
    details?: any
  ): StandardizedError {
    let message: string;
    let code: string;

    switch (reason) {
      case 'required':
        message = this.VALIDATION_REQUIRED(field);
        code = 'FIELD_REQUIRED';
        break;
      case 'format':
        message = this.VALIDATION_FORMAT(field, details?.expectedFormat || 'valid');
        code = 'INVALID_FORMAT';
        break;
      case 'length':
        message = this.VALIDATION_LENGTH(field, details?.min, details?.max);
        code = 'INVALID_LENGTH';
        break;
      case 'range':
        message = this.VALIDATION_RANGE(field, details?.min, details?.max);
        code = 'OUT_OF_RANGE';
        break;
      case 'type':
        message = this.VALIDATION_TYPE(field, details?.expectedType || 'valid');
        code = 'INVALID_TYPE';
        break;
    }

    return this.format(code, message, details, 'validation');
  }

  /**
   * Format network error
   */
  static networkError(
    type: 'timeout' | 'connection' | 'server' | 'rate_limit',
    details?: any
  ): StandardizedError {
    let message: string;
    let code: string;

    switch (type) {
      case 'timeout':
        message = this.NETWORK_TIMEOUT(details?.timeout || 5000);
        code = 'NETWORK_TIMEOUT';
        break;
      case 'connection':
        message = this.NETWORK_CONNECTION_FAILED();
        code = 'CONNECTION_FAILED';
        break;
      case 'server':
        message = this.NETWORK_SERVER_ERROR(details?.statusCode);
        code = 'SERVER_ERROR';
        break;
      case 'rate_limit':
        message = this.NETWORK_RATE_LIMITED();
        code = 'RATE_LIMITED';
        break;
    }

    return this.format(code, message, details, 'network');
  }

  /**
   * Format permission error
   */
  static permissionError(
    type: 'denied' | 'insufficient' | 'authentication',
    details?: any
  ): StandardizedError {
    let message: string;
    let code: string;

    switch (type) {
      case 'denied':
        message = this.PERMISSION_DENIED(details?.action || 'this action');
        code = 'PERMISSION_DENIED';
        break;
      case 'insufficient':
        message = this.PERMISSION_INSUFFICIENT_PRIVILEGES();
        code = 'INSUFFICIENT_PRIVILEGES';
        break;
      case 'authentication':
        message = this.PERMISSION_AUTHENTICATION_REQUIRED();
        code = 'AUTHENTICATION_REQUIRED';
        break;
    }

    return this.format(code, message, details, 'permission');
  }

  /**
   * Format security error
   */
  static securityError(
    type: 'invalid_token' | 'csrf' | 'suspicious_activity',
    details?: any
  ): StandardizedError {
    let message: string;
    let code: string;

    switch (type) {
      case 'invalid_token':
        message = this.SECURITY_INVALID_TOKEN();
        code = 'INVALID_TOKEN';
        break;
      case 'csrf':
        message = this.SECURITY_CSRF_TOKEN_MISMATCH();
        code = 'CSRF_TOKEN_MISMATCH';
        break;
      case 'suspicious_activity':
        message = this.SECURITY_SUSPICIOUS_ACTIVITY();
        code = 'SUSPICIOUS_ACTIVITY';
        break;
    }

    return this.format(code, message, details, 'security');
  }

  /**
   * Get user-friendly error message based on error code
   */
  static getUserFriendlyMessage(error: StandardizedError): string {
    // Return generic messages for security-sensitive errors
    if (error.category === 'security') {
      return 'A security issue was detected. Please contact support if this continues.';
    }

    // For other categories, return the formatted message
    return error.message;
  }

  /**
   * Log error in standardized format
   */
  static logError(error: StandardizedError, context?: any): void {
    const logData = {
      ...error,
      context: context ? this.sanitizeLogContext(context) : undefined
    };

    if (error.category === 'security' || error.code.includes('SECURITY')) {
      // Security errors get special logging
      console.error('[SECURITY]', logData);
    } else {
      console.error('[ERROR]', logData);
    }
  }

  /**
   * Sanitize context data for logging (remove sensitive information)
   */
  private static sanitizeLogContext(context: any): any {
    if (!context || typeof context !== 'object') {
      return context;
    }

    const sanitized: any = {};
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'credential'];

    for (const [key, value] of Object.entries(context)) {
      // Skip sensitive keys
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 200) {
        // Truncate long strings
        sanitized[key] = value.substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}