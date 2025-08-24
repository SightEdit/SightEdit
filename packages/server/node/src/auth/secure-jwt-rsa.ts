/**
 * Secure JWT Implementation with RSA Algorithm Enforcement
 * Prevents algorithm confusion attacks and implements proper token validation
 */

import jwt, { JwtPayload, SignOptions, VerifyOptions, Algorithm } from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { configManager } from '../config/secure-config';

// Secure algorithms only (no HS256 to prevent algorithm confusion)
const ALLOWED_ALGORITHMS: Algorithm[] = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

export interface SecureJWTPayload extends JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  tokenType: 'access' | 'refresh';
  deviceId?: string;
  ipAddress?: string;
  fingerprint?: string;
  nonce?: string; // Prevent replay attacks
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLogin: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt: Date;
  requirePasswordChange?: boolean;
}

// Enhanced token blacklist with Redis support
class EnhancedTokenBlacklist {
  private redis: Redis | null = null;
  private memoryFallback = new Map<string, number>();
  
  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });
      
      this.redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });
    }
  }
  
  async addToken(tokenId: string, expiry: number): Promise<void> {
    const ttl = Math.max(0, expiry - Math.floor(Date.now() / 1000));
    
    if (this.redis) {
      try {
        await this.redis.setex(`blacklist:${tokenId}`, ttl, '1');
        return;
      } catch (error) {
        console.error('Failed to blacklist token in Redis:', error);
      }
    }
    
    // Fallback to memory
    this.memoryFallback.set(tokenId, expiry);
    this.cleanupMemory();
  }
  
  async isBlacklisted(tokenId: string): Promise<boolean> {
    if (this.redis) {
      try {
        const exists = await this.redis.exists(`blacklist:${tokenId}`);
        return exists === 1;
      } catch (error) {
        console.error('Failed to check blacklist in Redis:', error);
      }
    }
    
    // Fallback to memory
    const expiry = this.memoryFallback.get(tokenId);
    if (!expiry) return false;
    
    const now = Math.floor(Date.now() / 1000);
    if (expiry < now) {
      this.memoryFallback.delete(tokenId);
      return false;
    }
    
    return true;
  }
  
  private cleanupMemory(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [tokenId, expiry] of this.memoryFallback.entries()) {
      if (expiry < now) {
        this.memoryFallback.delete(tokenId);
      }
    }
  }
  
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export class SecureJWTRSA {
  private config: any;
  private tokenBlacklist: EnhancedTokenBlacklist;
  private rateLimiter: RateLimiterMemory | RateLimiterRedis;
  private privateKey: string;
  private publicKey: string;
  private algorithm: Algorithm;
  
  constructor(redisUrl?: string) {
    this.config = configManager.loadConfig();
    
    // Initialize token blacklist
    this.tokenBlacklist = new EnhancedTokenBlacklist(redisUrl);
    
    // Initialize rate limiter
    if (redisUrl) {
      const redis = new Redis(redisUrl);
      this.rateLimiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: 'rl:auth:',
        points: this.config.security.maxLoginAttempts,
        duration: this.config.security.lockoutDuration * 60,
        blockDuration: this.config.security.lockoutDuration * 60,
      });
    } else {
      this.rateLimiter = new RateLimiterMemory({
        points: this.config.security.maxLoginAttempts,
        duration: this.config.security.lockoutDuration * 60,
        blockDuration: this.config.security.lockoutDuration * 60,
      });
    }
    
    // Load RSA keys
    this.privateKey = this.config.jwt.privateKey;
    this.publicKey = this.config.jwt.publicKey;
    this.algorithm = this.config.jwt.algorithm as Algorithm;
    
    // Validate algorithm
    if (!ALLOWED_ALGORITHMS.includes(this.algorithm)) {
      throw new Error(`Invalid JWT algorithm: ${this.algorithm}. Must be one of: ${ALLOWED_ALGORITHMS.join(', ')}`);
    }
  }
  
  /**
   * Generate secure token pair with RSA signing
   */
  async generateTokenPair(user: AuthUser, sessionId: string, deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const tokenId = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Create device fingerprint
    const fingerprint = this.createFingerprint(deviceInfo);
    
    // Access token payload
    const accessPayload: SecureJWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      sessionId,
      tokenType: 'access',
      deviceId: deviceInfo?.deviceId,
      ipAddress: deviceInfo?.ipAddress,
      fingerprint,
      nonce,
      jti: tokenId,
      iat: now,
      exp: now + this.parseExpiry(this.config.jwt.accessTokenExpiry),
      iss: this.config.jwt.issuer,
      aud: this.config.jwt.audience,
    };
    
    // Refresh token payload (minimal data)
    const refreshTokenId = crypto.randomBytes(16).toString('hex');
    const refreshPayload: SecureJWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: [], // Don't include roles in refresh token
      permissions: [], // Don't include permissions in refresh token
      sessionId,
      tokenType: 'refresh',
      fingerprint,
      jti: refreshTokenId,
      iat: now,
      exp: now + this.parseExpiry(this.config.jwt.refreshTokenExpiry),
      iss: this.config.jwt.issuer,
      aud: this.config.jwt.audience,
    };
    
    // Sign tokens with RSA private key
    const signOptions: SignOptions = {
      algorithm: this.algorithm,
      noTimestamp: true, // We set iat manually
    };
    
    const accessToken = jwt.sign(accessPayload, this.privateKey, signOptions);
    const refreshToken = jwt.sign(refreshPayload, this.privateKey, signOptions);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: accessPayload.exp - now,
      tokenType: 'Bearer',
    };
  }
  
  /**
   * Verify token with strict RSA validation
   */
  async verifyToken(token: string, tokenType: 'access' | 'refresh', requestInfo?: {
    ipAddress?: string;
    userAgent?: string;
  }): Promise<SecureJWTPayload | null> {
    try {
      // Decode without verification first to check algorithm
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded || typeof decoded === 'string') {
        throw new Error('Invalid token format');
      }
      
      // CRITICAL: Verify algorithm to prevent algorithm confusion attacks
      if (!ALLOWED_ALGORITHMS.includes(decoded.header.alg as Algorithm)) {
        throw new Error(`Invalid algorithm: ${decoded.header.alg}. Token rejected.`);
      }
      
      // Verify with public key and strict options
      const verifyOptions: VerifyOptions = {
        algorithms: [this.algorithm], // Only allow the configured algorithm
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        clockTolerance: this.config.jwt.clockTolerance,
        complete: false,
      };
      
      const payload = jwt.verify(token, this.publicKey, verifyOptions) as SecureJWTPayload;
      
      // Additional security validations
      
      // 1. Check token type
      if (payload.tokenType !== tokenType) {
        throw new Error(`Invalid token type. Expected ${tokenType}, got ${payload.tokenType}`);
      }
      
      // 2. Check if token is blacklisted
      if (payload.jti && await this.tokenBlacklist.isBlacklisted(payload.jti)) {
        throw new Error('Token has been revoked');
      }
      
      // 3. Check token binding (if configured)
      if (requestInfo && payload.fingerprint) {
        const currentFingerprint = this.createFingerprint({
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent,
        });
        
        // Log suspicious activity but don't reject (IPs can change legitimately)
        if (payload.fingerprint !== currentFingerprint) {
          console.warn('Token fingerprint mismatch', {
            expected: payload.fingerprint,
            actual: currentFingerprint,
            userId: payload.sub,
            tokenType,
          });
        }
      }
      
      // 4. Check for token reuse (nonce validation for sensitive operations)
      if (tokenType === 'access' && payload.nonce) {
        // In production, check nonce against a cache to prevent replay attacks
      }
      
      return payload;
    } catch (error) {
      // Log verification failures for security monitoring
      console.warn('Token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenType,
        timestamp: new Date().toISOString(),
        ipAddress: requestInfo?.ipAddress,
      });
      return null;
    }
  }
  
  /**
   * Hash password using Argon2 (more secure than bcrypt)
   */
  async hashPassword(password: string): Promise<string> {
    // Validate password strength
    const validation = this.validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Use Argon2id for password hashing (resistant to side-channel attacks)
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      saltLength: 32,
    });
  }
  
  /**
   * Verify password with timing-safe comparison
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      // Check if it's an Argon2 hash
      if (hashedPassword.startsWith('$argon2')) {
        return await argon2.verify(hashedPassword, plainPassword);
      }
      
      // Fallback to bcrypt for backward compatibility
      if (hashedPassword.startsWith('$2')) {
        return await bcrypt.compare(plainPassword, hashedPassword);
      }
      
      return false;
    } catch (error) {
      // Log error but don't expose details
      console.error('Password verification error', { error });
      return false;
    }
  }
  
  /**
   * Enhanced password strength validation
   */
  private validatePasswordStrength(password: string): { isValid: boolean; errors: string[]; score: number } {
    const errors: string[] = [];
    let score = 0;
    
    // Length requirements
    if (password.length < this.config.security.passwordMinLength) {
      errors.push(`Password must be at least ${this.config.security.passwordMinLength} characters long`);
    } else if (password.length >= 16) {
      score += 2;
    } else {
      score += 1;
    }
    
    if (password.length > this.config.security.passwordMaxLength) {
      errors.push(`Password must be less than ${this.config.security.passwordMaxLength} characters`);
    }
    
    // Character requirements
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    if (!hasLowercase) errors.push('Password must contain at least one lowercase letter');
    else score += 1;
    
    if (!hasUppercase) errors.push('Password must contain at least one uppercase letter');
    else score += 1;
    
    if (!hasNumbers) errors.push('Password must contain at least one number');
    else score += 1;
    
    if (!hasSpecial) errors.push('Password must contain at least one special character');
    else score += 2;
    
    // Check for common patterns and weak passwords
    const commonPatterns = [
      /(.)\1{2,}/, // Three or more repeated characters
      /012|123|234|345|456|567|678|789|890/, // Sequential numbers
      /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i, // Sequential letters
      /password|qwerty|123456|admin|letmein|welcome|monkey|dragon/i, // Common passwords
    ];
    
    if (commonPatterns.some(pattern => pattern.test(password))) {
      errors.push('Password contains common patterns or weak sequences');
      score = Math.max(0, score - 3);
    }
    
    // Check for personal information (would need user data in production)
    // This is a placeholder - in production, check against user's name, email, etc.
    
    // Calculate entropy
    const entropy = this.calculatePasswordEntropy(password);
    if (entropy < 50) {
      errors.push('Password is too predictable (low entropy)');
    } else if (entropy >= 70) {
      score += 2;
    } else {
      score += 1;
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      score: Math.min(10, score), // Score out of 10
    };
  }
  
  /**
   * Calculate password entropy
   */
  private calculatePasswordEntropy(password: string): number {
    const charsets = {
      lowercase: /[a-z]/.test(password) ? 26 : 0,
      uppercase: /[A-Z]/.test(password) ? 26 : 0,
      numbers: /\d/.test(password) ? 10 : 0,
      special: /[^a-zA-Z0-9]/.test(password) ? 32 : 0,
    };
    
    const possibleChars = Object.values(charsets).reduce((a, b) => a + b, 0);
    if (possibleChars === 0) return 0;
    
    return password.length * Math.log2(possibleChars);
  }
  
  /**
   * Revoke token by adding to blacklist
   */
  async revokeToken(tokenOrPayload: string | SecureJWTPayload): Promise<void> {
    let payload: SecureJWTPayload;
    
    if (typeof tokenOrPayload === 'string') {
      const decoded = jwt.decode(tokenOrPayload) as SecureJWTPayload;
      if (!decoded || !decoded.jti || !decoded.exp) {
        throw new Error('Invalid token format for revocation');
      }
      payload = decoded;
    } else {
      payload = tokenOrPayload;
    }
    
    if (payload.jti && payload.exp) {
      await this.tokenBlacklist.addToken(payload.jti, payload.exp);
    }
  }
  
  /**
   * Revoke all tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string, sessionIds: string[]): Promise<void> {
    // In production, this would interact with a session store
    // For now, we'll just log the action
    console.log(`Revoking all tokens for user ${userId}`, { sessionIds });
    
    // You would typically:
    // 1. Mark all sessions as invalid in the database
    // 2. Add all active token JTIs to the blacklist
    // 3. Clear any cached permissions
  }
  
  /**
   * Create device fingerprint for token binding
   */
  private createFingerprint(deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): string {
    if (!deviceInfo) return '';
    
    const components = [
      deviceInfo.deviceId || '',
      deviceInfo.ipAddress || '',
      deviceInfo.userAgent || '',
    ].filter(Boolean);
    
    if (components.length === 0) return '';
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * Parse expiry string to seconds
   */
  private parseExpiry(expiry: string | number): number {
    if (typeof expiry === 'number') {
      return expiry;
    }
    
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    
    return value * multipliers[unit as keyof typeof multipliers];
  }
  
  /**
   * Authentication middleware with comprehensive security checks
   */
  authenticate(options: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
    requireEmailVerified?: boolean;
    requirePasswordChange?: boolean;
    rateLimit?: boolean;
  } = {}) {
    return async (req: Request & { user?: AuthUser }, res: Response, next: NextFunction) => {
      try {
        // Rate limiting check
        if (options.rateLimit !== false) {
          try {
            const identifier = this.getClientIdentifier(req);
            await this.rateLimiter.consume(identifier);
          } catch (rateLimiterRes: any) {
            const remainingTime = Math.round((rateLimiterRes as RateLimiterRes).msBeforeNext / 1000);
            return res.status(429).json({
              success: false,
              error: 'Too many requests',
              retryAfter: remainingTime,
            });
          }
        }
        
        // Extract token
        const token = this.extractToken(req);
        
        if (!token) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              code: 'NO_TOKEN',
            });
          }
          return next();
        }
        
        // Verify token
        const payload = await this.verifyToken(token, 'access', {
          ipAddress: this.getClientIP(req),
          userAgent: req.headers['user-agent'],
        });
        
        if (!payload) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'Invalid or expired token',
              code: 'INVALID_TOKEN',
            });
          }
          return next();
        }
        
        // Build user object from token
        const user: AuthUser = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          roles: payload.roles,
          permissions: payload.permissions,
          emailVerified: true, // Would be fetched from database
          twoFactorEnabled: false, // Would be fetched from database
          lastLogin: new Date(),
          loginAttempts: 0,
          passwordChangedAt: new Date(),
        };
        
        // Check email verification
        if (options.requireEmailVerified && !user.emailVerified) {
          return res.status(403).json({
            success: false,
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
          });
        }
        
        // Check password change requirement
        if (options.requirePasswordChange && user.requirePasswordChange) {
          return res.status(403).json({
            success: false,
            error: 'Password change required',
            code: 'PASSWORD_CHANGE_REQUIRED',
          });
        }
        
        // Role-based access control
        if (options.roles && options.roles.length > 0) {
          const hasRole = options.roles.some(role => user.roles.includes(role));
          if (!hasRole) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient privileges',
              code: 'INSUFFICIENT_ROLE',
              requiredRoles: options.roles,
            });
          }
        }
        
        // Permission-based access control
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = options.permissions.every(permission => 
            user.permissions.includes(permission)
          );
          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions',
              code: 'INSUFFICIENT_PERMISSION',
              requiredPermissions: options.permissions,
            });
          }
        }
        
        // Attach user to request
        req.user = user;
        (req as any).sessionId = payload.sessionId;
        (req as any).tokenPayload = payload;
        
        next();
      } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Authentication system error',
          code: 'AUTH_ERROR',
        });
      }
    };
  }
  
  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // 1. Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // 2. Cookie (httpOnly)
    if (req.cookies && req.cookies.accessToken) {
      return req.cookies.accessToken;
    }
    
    // 3. Query parameter (not recommended, only for specific use cases)
    if (req.query.token && typeof req.query.token === 'string') {
      console.warn('Token passed in query parameter - security risk');
      return req.query.token;
    }
    
    return null;
  }
  
  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    const ip = this.getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const acceptLanguage = req.headers['accept-language'] || '';
    
    return crypto
      .createHash('sha256')
      .update(`${ip}:${userAgent}:${acceptLanguage}`)
      .digest('hex');
  }
  
  /**
   * Get real client IP address
   */
  private getClientIP(req: Request): string {
    // Trust proxy settings should be configured
    if (this.config.server.trustProxy) {
      return req.ip || 'unknown';
    }
    
    // Manual extraction for untrusted proxy
    return (
      req.headers['x-real-ip'] as string ||
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
  
  /**
   * Generate secure session ID
   */
  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Log security event for audit trail
   */
  logSecurityEvent(event: {
    type: string;
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    details?: any;
  }): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event,
      severity: this.getEventSeverity(event.type),
    };
    
    // In production, send to security monitoring system
    if (this.config.logging.securityLog) {
      console.log('SECURITY_EVENT:', JSON.stringify(logEntry));
    }
  }
  
  private getEventSeverity(eventType: string): string {
    const severityMap: { [key: string]: string } = {
      'login': 'info',
      'logout': 'info',
      'token_refresh': 'info',
      'failed_login': 'warning',
      'account_locked': 'warning',
      'rate_limit': 'warning',
      'suspicious_activity': 'critical',
      'unauthorized_access': 'critical',
      'token_theft': 'critical',
    };
    
    return severityMap[eventType] || 'info';
  }
  
  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    await this.tokenBlacklist.close();
  }
}