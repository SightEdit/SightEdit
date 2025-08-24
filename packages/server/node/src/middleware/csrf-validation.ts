/**
 * Server-side CSRF validation middleware for SightEdit
 * Integrates with client-side CSRF protection to provide complete protection
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface CSRFValidationConfig {
  tokenName?: string;
  headerName?: string;
  cookieName?: string;
  secretKey?: string;
  excludePaths?: string[];
  excludeMethods?: string[];
  onValidationError?: (req: Request, res: Response, error: string) => void;
}

export interface CSRFRequest extends Request {
  csrfToken?: string;
  csrfValid?: boolean;
}

export class ServerCSRFValidation {
  private config: Required<CSRFValidationConfig>;
  private secret: string;

  constructor(config: CSRFValidationConfig = {}) {
    this.config = {
      tokenName: config.tokenName || 'csrfToken',
      headerName: config.headerName || 'x-csrf-token',
      cookieName: config.cookieName || 'csrf-token',
      secretKey: config.secretKey || process.env.CSRF_SECRET || crypto.randomBytes(64).toString('hex'),
      excludePaths: config.excludePaths || [],
      excludeMethods: config.excludeMethods || ['GET', 'HEAD', 'OPTIONS'],
      onValidationError: config.onValidationError || this.defaultErrorHandler
    };

    this.secret = this.config.secretKey;

    if (this.secret.length < 32) {
      throw new Error('CSRF secret must be at least 32 characters long');
    }
  }

  /**
   * Generate a CSRF token for the current session
   */
  generateToken(sessionId?: string): string {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const payload = `${sessionId || 'anonymous'}.${timestamp}.${randomBytes}`;
    
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');
    
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
    return token;
  }

  /**
   * Validate a CSRF token
   */
  validateToken(token: string, sessionId?: string): { valid: boolean; reason?: string } {
    try {
      if (!token) {
        return { valid: false, reason: 'Token is required' };
      }

      // Decode the token
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split('.');
      
      if (parts.length !== 4) {
        return { valid: false, reason: 'Invalid token format' };
      }

      const [tokenSessionId, timestamp, randomBytes, signature] = parts;
      
      // Verify session ID matches (if provided)
      if (sessionId && tokenSessionId !== sessionId && tokenSessionId !== 'anonymous') {
        return { valid: false, reason: 'Session mismatch' };
      }

      // Check token age (valid for 1 hour)
      const tokenTime = parseInt(timestamp, 10);
      const currentTime = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour
      
      if (currentTime - tokenTime > maxAge) {
        return { valid: false, reason: 'Token expired' };
      }

      // Verify signature using timing-safe comparison
      const payload = `${tokenSessionId}.${timestamp}.${randomBytes}`;
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');
      
      const isValid = this.timingSafeEqual(signature, expectedSignature);
      
      if (!isValid) {
        return { valid: false, reason: 'Invalid signature' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Token validation failed' };
    }
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Express middleware for CSRF validation
   */
  middleware() {
    return (req: CSRFRequest, res: Response, next: NextFunction) => {
      // Skip validation for excluded methods
      if (this.config.excludeMethods.includes(req.method)) {
        return next();
      }

      // Skip validation for excluded paths
      if (this.config.excludePaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Extract token from header, body, or query
      const token = this.extractToken(req);
      
      if (!token) {
        return this.config.onValidationError(req, res, 'CSRF token is required');
      }

      // Extract session ID (from session, user ID, or IP as fallback)
      const sessionId = this.extractSessionId(req);
      
      // Validate the token
      const validation = this.validateToken(token, sessionId);
      
      if (!validation.valid) {
        return this.config.onValidationError(req, res, validation.reason || 'Invalid CSRF token');
      }

      // Mark request as validated
      req.csrfToken = token;
      req.csrfValid = true;
      
      next();
    };
  }

  /**
   * Extract CSRF token from request
   */
  private extractToken(req: Request): string | null {
    // Try header first
    let token = req.headers[this.config.headerName] as string;
    
    if (!token) {
      // Try body
      token = req.body?.[this.config.tokenName];
    }
    
    if (!token) {
      // Try query parameter
      token = req.query[this.config.tokenName] as string;
    }
    
    return token || null;
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(req: Request): string {
    // Try session first
    if ((req as any).session?.id) {
      return (req as any).session.id;
    }
    
    // Try user ID
    if ((req as any).user?.id) {
      return (req as any).user.id.toString();
    }
    
    // Fallback to IP address
    return req.ip || req.connection.remoteAddress || 'anonymous';
  }

  /**
   * Default error handler
   */
  private defaultErrorHandler(req: Request, res: Response, error: string): void {
    res.status(403).json({
      success: false,
      error: 'CSRF validation failed',
      message: error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Generate token endpoint handler
   */
  tokenEndpoint() {
    return (req: CSRFRequest, res: Response) => {
      const sessionId = this.extractSessionId(req);
      const token = this.generateToken(sessionId);
      
      // Set token in cookie for additional security
      res.cookie(this.config.cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });
      
      res.json({
        success: true,
        token,
        expiresIn: 60 * 60 * 1000 // 1 hour
      });
    };
  }

  /**
   * Get middleware for token generation endpoint
   */
  tokenGenerationMiddleware() {
    return (req: CSRFRequest, res: Response, next: NextFunction) => {
      const sessionId = this.extractSessionId(req);
      const token = this.generateToken(sessionId);
      
      // Add token to response headers
      res.setHeader('X-CSRF-Token', token);
      
      // Make token available to request
      req.csrfToken = token;
      
      next();
    };
  }
}

// Export default instance
let defaultCSRFValidation: ServerCSRFValidation | null = null;

export function getServerCSRFValidation(config?: CSRFValidationConfig): ServerCSRFValidation {
  if (!defaultCSRFValidation) {
    defaultCSRFValidation = new ServerCSRFValidation(config);
  }
  return defaultCSRFValidation;
}

/**
 * Quick setup middleware for common use cases
 */
export function createCSRFProtection(config?: CSRFValidationConfig) {
  const csrf = new ServerCSRFValidation(config);
  
  return {
    validation: csrf.middleware(),
    tokenGeneration: csrf.tokenGenerationMiddleware(),
    tokenEndpoint: csrf.tokenEndpoint(),
    generateToken: (sessionId?: string) => csrf.generateToken(sessionId),
    validateToken: (token: string, sessionId?: string) => csrf.validateToken(token, sessionId)
  };
}