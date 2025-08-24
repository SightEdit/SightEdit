/**
 * Comprehensive Input Validation and XSS Prevention Middleware
 * Implements OWASP best practices for input validation and sanitization
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';
import * as xss from 'xss';

// XSS filter options for different contexts
const xssOptions = {
  strict: {
    whiteList: {}, // No tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  },
  html: {
    whiteList: {
      a: ['href', 'title', 'target'],
      b: [],
      strong: [],
      i: [],
      em: [],
      u: [],
      p: [],
      br: [],
      div: ['class'],
      span: ['class'],
      h1: [],
      h2: [],
      h3: [],
      h4: [],
      h5: [],
      h6: [],
      ul: [],
      ol: [],
      li: [],
      blockquote: [],
      code: [],
      pre: [],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
    onTag: (tag: string, html: string, options: any) => {
      // Additional tag validation
      if (tag === 'a') {
        // Validate URLs
        const href = options.href;
        if (href && !isValidUrl(href)) {
          return '';
        }
      }
      return undefined;
    },
  },
  markdown: {
    whiteList: {
      ...xssOptions.html.whiteList,
      img: ['src', 'alt', 'width', 'height'],
      table: [],
      thead: [],
      tbody: [],
      tr: [],
      th: [],
      td: [],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  },
};

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  // User input schemas
  email: z.string().email().max(254).transform(val => val.toLowerCase()),
  
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain special character'),
  
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscore, and hyphen'),
  
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),
  
  // Content schemas
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .transform(val => sanitizeText(val)),
  
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .transform(val => sanitizeText(val)),
  
  content: z.string()
    .max(50000, 'Content must be less than 50000 characters')
    .transform(val => sanitizeHTML(val)),
  
  // ID schemas
  uuid: z.string().uuid(),
  
  objectId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'),
  
  resourceId: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid resource ID format'),
  
  // File schemas
  filename: z.string()
    .max(255)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid filename')
    .refine(val => !val.includes('..'), 'Path traversal detected'),
  
  mimeType: z.string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\/+.-]*$/, 'Invalid MIME type'),
  
  // URL schemas
  url: z.string().url().max(2048),
  
  relativeUrl: z.string()
    .max(2048)
    .regex(/^\/[a-zA-Z0-9/_.-]*$/, 'Invalid relative URL'),
  
  // Numeric schemas
  positiveInt: z.number().int().positive(),
  
  pagination: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
    sort: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
  }),
  
  // Date schemas
  dateString: z.string().datetime(),
  
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }).refine(data => new Date(data.start) < new Date(data.end), {
    message: 'Start date must be before end date',
  }),
};

/**
 * Sanitize plain text (remove all HTML)
 */
function sanitizeText(input: string): string {
  // Remove all HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Escape special characters for safe display
  sanitized = validator.escape(sanitized);
  
  return sanitized;
}

/**
 * Sanitize HTML content
 */
function sanitizeHTML(input: string, options: 'strict' | 'html' | 'markdown' = 'html'): string {
  // First pass with DOMPurify
  let sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: Object.keys(xssOptions[options].whiteList),
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
    SAFE_FOR_XML: true,
    RETURN_TRUSTED_TYPE: false,
  });
  
  // Second pass with xss library for additional protection
  sanitized = xss.filterXSS(sanitized, xssOptions[options] as any);
  
  return sanitized;
}

/**
 * Validate URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow http(s) and relative URLs
    if (!['http:', 'https:', ''].includes(parsed.protocol)) {
      return false;
    }
    
    // Block javascript: and data: URLs
    if (url.toLowerCase().includes('javascript:') || url.toLowerCase().includes('data:')) {
      return false;
    }
    
    return true;
  } catch {
    // Check if it's a valid relative URL
    return /^\/[a-zA-Z0-9/_.-]*$/.test(url);
  }
}

/**
 * SQL injection prevention
 */
export function preventSQLInjection(input: string): string {
  // Remove or escape SQL meta-characters
  const sqlMetaChars = /['";\\]/g;
  let sanitized = input.replace(sqlMetaChars, '');
  
  // Block common SQL keywords in user input
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
    'ALTER', 'EXEC', 'EXECUTE', 'UNION', 'FROM', 'WHERE',
    'JOIN', 'SCRIPT', '--', '/*', '*/', 'xp_', 'sp_'
  ];
  
  const upperInput = sanitized.toUpperCase();
  for (const keyword of sqlKeywords) {
    if (upperInput.includes(keyword)) {
      console.warn('Potential SQL injection attempt detected:', { keyword, input });
      sanitized = sanitized.replace(new RegExp(keyword, 'gi'), '');
    }
  }
  
  return sanitized;
}

/**
 * NoSQL injection prevention
 */
export function preventNoSQLInjection(input: any): any {
  if (typeof input === 'string') {
    // Remove MongoDB operators
    if (input.startsWith('$')) {
      return '';
    }
    return input;
  }
  
  if (Array.isArray(input)) {
    return input.map(item => preventNoSQLInjection(item));
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Block keys starting with $ (MongoDB operators)
      if (!key.startsWith('$')) {
        sanitized[key] = preventNoSQLInjection(value);
      }
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Command injection prevention
 */
export function preventCommandInjection(input: string): string {
  // Remove shell meta-characters
  const shellMetaChars = /[;&|`$(){}[\]<>\\!\n\r]/g;
  return input.replace(shellMetaChars, '');
}

/**
 * Path traversal prevention
 */
export function preventPathTraversal(path: string): string {
  // Remove path traversal sequences
  let sanitized = path.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\\\/]+/g, '/');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Ensure path doesn't start with /
  if (sanitized.startsWith('/')) {
    sanitized = sanitized.substring(1);
  }
  
  return sanitized;
}

/**
 * LDAP injection prevention
 */
export function preventLDAPInjection(input: string): string {
  // Escape LDAP special characters
  const ldapChars: { [key: string]: string } = {
    '\\': '\\5c',
    '*': '\\2a',
    '(': '\\28',
    ')': '\\29',
    '\0': '\\00',
    '/': '\\2f',
  };
  
  return input.replace(/[\\*()\0/]/g, char => ldapChars[char] || char);
}

/**
 * XML injection prevention
 */
export function preventXMLInjection(input: string): string {
  // Escape XML entities
  const xmlEntities: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };
  
  return input.replace(/[&<>"']/g, char => xmlEntities[char] || char);
}

/**
 * Input validation middleware factory
 */
export function validateInput(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate and transform input
      const validated = await schema.parseAsync(req.body);
      
      // Replace request body with validated data
      req.body = validated;
      
      // Additional security checks
      req.body = preventNoSQLInjection(req.body);
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
      }
      
      console.error('Input validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Input validation failed',
      });
    }
  };
}

/**
 * Query parameter validation middleware
 */
export function validateQuery(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Query validation failed',
      });
    }
  };
}

/**
 * File upload validation middleware
 */
export function validateFileUpload(options: {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  required?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const files = req.files;
    
    if (!files || (Array.isArray(files) && files.length === 0)) {
      if (options.required) {
        return res.status(400).json({
          success: false,
          error: 'File upload required',
        });
      }
      return next();
    }
    
    const fileArray = Array.isArray(files) ? files : [files];
    
    for (const file of fileArray) {
      // Check file size
      if (options.maxSize && file.size > options.maxSize) {
        return res.status(400).json({
          success: false,
          error: `File ${file.name} exceeds maximum size of ${options.maxSize} bytes`,
        });
      }
      
      // Check MIME type
      if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `File type ${file.mimetype} not allowed`,
        });
      }
      
      // Check file extension
      if (options.allowedExtensions) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !options.allowedExtensions.includes(ext)) {
          return res.status(400).json({
            success: false,
            error: `File extension .${ext} not allowed`,
          });
        }
      }
      
      // Sanitize filename
      file.name = preventPathTraversal(file.name);
      
      // Additional validation for specific file types
      if (file.mimetype.startsWith('image/')) {
        // Could add image dimension validation here
      }
    }
    
    next();
  };
}

/**
 * Content-Type validation middleware
 */
export function validateContentType(allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type header required',
      });
    }
    
    const baseType = contentType.split(';')[0].trim();
    
    if (!allowedTypes.includes(baseType)) {
      return res.status(415).json({
        success: false,
        error: `Unsupported Content-Type: ${baseType}`,
        allowedTypes,
      });
    }
    
    next();
  };
}

/**
 * Comprehensive input sanitization middleware
 */
export function sanitizeAll() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query) as any;
    }
    
    // Sanitize route parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params) as any;
    }
    
    next();
  };
}

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeText(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Create validation schemas for common endpoints
 */
export const EndpointSchemas = {
  login: z.object({
    email: CommonSchemas.email,
    password: z.string().min(1, 'Password required'),
    rememberMe: z.boolean().optional(),
    twoFactorCode: z.string().length(6).optional(),
  }),
  
  register: z.object({
    email: CommonSchemas.email,
    password: CommonSchemas.password,
    confirmPassword: z.string(),
    name: CommonSchemas.name,
    acceptTerms: z.boolean().refine(val => val === true, 'You must accept terms'),
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  
  updateProfile: z.object({
    name: CommonSchemas.name.optional(),
    bio: CommonSchemas.description.optional(),
    avatar: CommonSchemas.url.optional(),
  }),
  
  createContent: z.object({
    title: CommonSchemas.title,
    content: CommonSchemas.content,
    tags: z.array(z.string().max(50)).max(10).optional(),
    published: z.boolean().default(false),
  }),
  
  search: z.object({
    q: z.string().min(1).max(200).transform(val => sanitizeText(val)),
    page: CommonSchemas.pagination.shape.page,
    limit: CommonSchemas.pagination.shape.limit,
    sort: CommonSchemas.pagination.shape.sort,
    order: CommonSchemas.pagination.shape.order,
  }),
};

/**
 * Export sanitization functions for direct use
 */
export {
  sanitizeText,
  sanitizeHTML,
  isValidUrl,
};