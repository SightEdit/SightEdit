import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  roles?: string[];
  permissions?: string[];
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export class JWTAuth {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly expiresIn: number; // seconds
  private readonly refreshExpiresIn: number;

  constructor(options: {
    secret: string;
    issuer?: string;
    audience?: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
  }) {
    if (!options.secret || options.secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }

    this.secret = options.secret;
    this.issuer = options.issuer || 'sightedit';
    this.audience = options.audience || 'sightedit-api';
    this.expiresIn = options.expiresIn || 3600; // 1 hour
    this.refreshExpiresIn = options.refreshExpiresIn || 604800; // 7 days
  }

  /**
   * Generate JWT token
   */
  generateToken(user: AuthUser): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      iat: now,
      exp: now + this.expiresIn
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Store hash in database with expiration
    // This is a placeholder - implement actual storage
    const expiry = Date.now() + (this.refreshExpiresIn * 1000);
    
    return token;
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // SECURITY: Decode and validate header algorithm BEFORE signature verification
      let header: { alg: string; typ: string };
      try {
        header = JSON.parse(this.base64UrlDecode(encodedHeader));
      } catch (error) {
        console.error('Invalid JWT header');
        return null;
      }

      // CRITICAL: Reject "none" algorithm and validate algorithm matches expected
      if (!header.alg || header.alg.toLowerCase() === 'none') {
        console.error('JWT with "none" algorithm rejected');
        return null;
      }

      // Validate algorithm is HS256 (or whichever we're using)
      if (header.alg !== 'HS256') {
        console.error(`JWT algorithm ${header.alg} not allowed. Expected HS256.`);
        return null;
      }

      // Verify signature
      const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
      if (signature !== expectedSignature) {
        return null;
      }

      // Decode payload
      const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as JWTPayload;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return null;
      }

      return payload;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return null;
    }
  }

  /**
   * Express middleware for JWT authentication
   */
  middleware(options: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
  } = {}) {
    return async (req: Request & { user?: AuthUser }, res: Response, next: NextFunction) => {
      try {
        // Extract token from header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'No authorization token provided'
            });
          }
          return next();
        }

        const token = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : authHeader;

        // Verify token
        const payload = this.verifyToken(token);
        if (!payload) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'Invalid or expired token'
            });
          }
          return next();
        }

        // Check roles
        if (options.roles && options.roles.length > 0) {
          const hasRole = options.roles.some(role => 
            payload.roles?.includes(role)
          );
          if (!hasRole) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions'
            });
          }
        }

        // Check permissions
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = options.permissions.every(permission =>
            payload.permissions?.includes(permission)
          );
          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions'
            });
          }
        }

        // Attach user to request
        req.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          roles: payload.roles || [],
          permissions: payload.permissions || []
        };

        next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Authentication error'
        });
      }
    };
  }

  /**
   * Sign data with HMAC-SHA256
   */
  private sign(data: string): string {
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64');
    return this.base64UrlEscape(signature);
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    return this.base64UrlEscape(Buffer.from(str).toString('base64'));
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(str: string): string {
    const base64 = this.base64UrlUnescape(str);
    return Buffer.from(base64, 'base64').toString();
  }

  /**
   * Escape base64 for URL
   */
  private base64UrlEscape(str: string): string {
    return str.replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Unescape base64 from URL
   */
  private base64UrlUnescape(str: string): string {
    str += new Array(5 - str.length % 4).join('=');
    return str.replace(/-/g, '+')
      .replace(/_/g, '/');
  }
}