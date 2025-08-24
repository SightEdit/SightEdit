import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

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
}

export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string | number;
  refreshTokenExpiry: string | number;
  issuer: string;
  audience: string[];
  clockTolerance: number;
  enableRateLimiting: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireTwoFactor: boolean;
}

export interface LoginAttempt {
  userId?: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
  failureReason?: string;
}

// Secure token blacklist for logout and revocation
class TokenBlacklist {
  private blacklistedTokens = new Set<string>();
  private tokenExpiry = new Map<string, number>();
  
  addToken(tokenId: string, expiry: number): void {
    this.blacklistedTokens.add(tokenId);
    this.tokenExpiry.set(tokenId, expiry);
    
    // Clean up expired tokens periodically
    this.cleanup();
  }
  
  isBlacklisted(tokenId: string): boolean {
    return this.blacklistedTokens.has(tokenId);
  }
  
  private cleanup(): void {
    const now = Date.now() / 1000;
    for (const [tokenId, expiry] of this.tokenExpiry.entries()) {
      if (expiry < now) {
        this.blacklistedTokens.delete(tokenId);
        this.tokenExpiry.delete(tokenId);
      }
    }
  }
}

export class SecureJWTAuth {
  private config: JWTConfig;
  private tokenBlacklist = new TokenBlacklist();
  private rateLimiter: RateLimiterMemory;
  private readonly BCRYPT_ROUNDS = 12;
  
  constructor(config: Partial<JWTConfig>) {
    this.config = this.validateAndMergeConfig(config);
    
    // Initialize rate limiter
    this.rateLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => this.getClientIdentifier(req),
      points: this.config.maxLoginAttempts,
      duration: this.config.lockoutDuration,
      blockDuration: this.config.lockoutDuration,
    });
  }
  
  private validateAndMergeConfig(config: Partial<JWTConfig>): JWTConfig {
    // Validate critical security parameters
    if (!config.accessTokenSecret || config.accessTokenSecret.length < 64) {
      throw new Error('Access token secret must be at least 64 characters (512 bits)');
    }
    
    if (!config.refreshTokenSecret || config.refreshTokenSecret.length < 64) {
      throw new Error('Refresh token secret must be at least 64 characters (512 bits)');
    }
    
    if (config.accessTokenSecret === config.refreshTokenSecret) {
      throw new Error('Access and refresh token secrets must be different');
    }
    
    return {
      accessTokenSecret: config.accessTokenSecret,
      refreshTokenSecret: config.refreshTokenSecret,
      accessTokenExpiry: config.accessTokenExpiry || '15m', // Short-lived access tokens
      refreshTokenExpiry: config.refreshTokenExpiry || '7d',
      issuer: config.issuer || 'sightedit-api',
      audience: config.audience || ['sightedit-client'],
      clockTolerance: config.clockTolerance || 30, // 30 seconds
      enableRateLimiting: config.enableRateLimiting ?? true,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 900, // 15 minutes
      requireTwoFactor: config.requireTwoFactor || false,
    };
  }
  
  /**
   * Generate cryptographically secure access token
   */
  async generateAccessToken(user: AuthUser, sessionId: string, deviceInfo?: { deviceId?: string; ipAddress?: string }): Promise<string> {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    
    const payload: SecureJWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      sessionId,
      tokenType: 'access',
      deviceId: deviceInfo?.deviceId,
      ipAddress: deviceInfo?.ipAddress,
      jti: tokenId, // JWT ID for blacklisting
      iat: now,
      exp: this.getExpiryTimestamp(this.config.accessTokenExpiry, now),
      iss: this.config.issuer,
      aud: this.config.audience,
    };
    
    const signOptions: SignOptions = {
      algorithm: 'HS256',
      noTimestamp: true, // We set iat manually
    };
    
    return jwt.sign(payload, this.config.accessTokenSecret, signOptions);
  }
  
  /**
   * Generate secure refresh token
   */
  async generateRefreshToken(user: AuthUser, sessionId: string): Promise<string> {
    const tokenId = crypto.randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    
    const payload: SecureJWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      sessionId,
      tokenType: 'refresh',
      jti: tokenId,
      iat: now,
      exp: this.getExpiryTimestamp(this.config.refreshTokenExpiry, now),
      iss: this.config.issuer,
      aud: this.config.audience,
    };
    
    return jwt.sign(payload, this.config.refreshTokenSecret, {
      algorithm: 'HS256',
      noTimestamp: true,
    });
  }
  
  /**
   * Verify access token with comprehensive security checks
   */
  async verifyAccessToken(token: string, ipAddress?: string): Promise<SecureJWTPayload | null> {
    try {
      const verifyOptions: VerifyOptions = {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockTolerance,
        complete: false,
      };
      
      const payload = jwt.verify(token, this.config.accessTokenSecret, verifyOptions) as SecureJWTPayload;
      
      // Verify token type
      if (payload.tokenType !== 'access') {
        throw new Error('Invalid token type');
      }
      
      // Check if token is blacklisted
      if (payload.jti && this.tokenBlacklist.isBlacklisted(payload.jti)) {
        throw new Error('Token has been revoked');
      }
      
      // IP address validation (optional but recommended)
      if (ipAddress && payload.ipAddress && payload.ipAddress !== ipAddress) {
        // Log suspicious activity but don't reject (IP can change legitimately)
        console.warn('Token used from different IP address', {
          tokenIp: payload.ipAddress,
          requestIp: ipAddress,
          userId: payload.sub,
        });
      }
      
      return payload;
    } catch (error) {
      // Log failed verification attempts for security monitoring
      console.warn('Access token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        ipAddress,
      });
      return null;
    }
  }
  
  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<SecureJWTPayload | null> {
    try {
      const verifyOptions: VerifyOptions = {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockTolerance,
      };
      
      const payload = jwt.verify(token, this.config.refreshTokenSecret, verifyOptions) as SecureJWTPayload;
      
      if (payload.tokenType !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      if (payload.jti && this.tokenBlacklist.isBlacklisted(payload.jti)) {
        throw new Error('Refresh token has been revoked');
      }
      
      return payload;
    } catch (error) {
      console.warn('Refresh token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }
  
  /**
   * Hash password with strong parameters
   */
  async hashPassword(password: string): Promise<string> {
    // Validate password strength
    const validation = this.validatePasswordStrength(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    return await bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }
  
  /**
   * Verify password with constant-time comparison
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      // Log error but don't expose details
      console.error('Password verification error', { error });
      return false;
    }
  }
  
  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one digit');
    }
    
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }
    
    // Check for common patterns
    const commonPatterns = [
      /(..).*\1/i, // Repeated characters
      /012|123|234|345|456|567|678|789|890/i, // Sequential numbers
      /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i, // Sequential letters
    ];
    
    if (commonPatterns.some(pattern => pattern.test(password))) {
      errors.push('Password contains common patterns and is predictable');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Revoke token by adding to blacklist
   */
  async revokeToken(tokenOrPayload: string | SecureJWTPayload): Promise<void> {
    let payload: SecureJWTPayload;
    
    if (typeof tokenOrPayload === 'string') {
      // Decode without verification to get expiry
      const decoded = jwt.decode(tokenOrPayload) as SecureJWTPayload;
      if (!decoded || !decoded.jti || !decoded.exp) {
        throw new Error('Invalid token format for revocation');
      }
      payload = decoded;
    } else {
      payload = tokenOrPayload;
    }
    
    if (payload.jti && payload.exp) {
      this.tokenBlacklist.addToken(payload.jti, payload.exp);
    }
  }
  
  /**
   * Authentication middleware with comprehensive security checks
   */
  authenticate(options: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
    requireEmailVerified?: boolean;
    allowRefreshToken?: boolean;
  } = {}) {
    return async (req: Request & { user?: AuthUser }, res: Response, next: NextFunction) => {
      try {
        // Rate limiting check
        if (this.config.enableRateLimiting) {
          try {
            await this.rateLimiter.consume(this.getClientIdentifier(req));
          } catch (rateLimiterRes: any) {
            const remainingTime = Math.round((rateLimiterRes as RateLimiterRes).msBeforeNext / 1000);
            return res.status(429).json({
              success: false,
              error: 'Rate limit exceeded',
              retryAfter: remainingTime,
            });
          }
        }
        
        // Extract token from Authorization header or cookies
        const token = this.extractToken(req);
        
        if (!token) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'Authentication token required',
            });
          }
          return next();
        }
        
        // Verify token
        const payload = await this.verifyAccessToken(token, this.getClientIP(req));
        
        if (!payload) {
          if (options.required) {
            return res.status(401).json({
              success: false,
              error: 'Invalid or expired authentication token',
            });
          }
          return next();
        }
        
        // Convert payload to AuthUser (this would typically involve a database lookup)
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
          passwordChangedAt: new Date(), // Would be fetched from database
        };
        
        // Email verification check
        if (options.requireEmailVerified && !user.emailVerified) {
          return res.status(403).json({
            success: false,
            error: 'Email verification required',
          });
        }
        
        // Role-based access control
        if (options.roles && options.roles.length > 0) {
          const hasRole = options.roles.some(role => user.roles.includes(role));
          if (!hasRole) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient role privileges',
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
              requiredPermissions: options.permissions,
            });
          }
        }
        
        // Attach user and session info to request
        req.user = user;
        (req as any).sessionId = payload.sessionId;
        (req as any).tokenPayload = payload;
        
        next();
      } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Authentication system error',
        });
      }
    };
  }
  
  /**
   * Extract token from request (Authorization header or httpOnly cookie)
   */
  private extractToken(req: Request): string | null {
    // Try Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Try httpOnly cookie as fallback
    if (req.cookies && req.cookies.accessToken) {
      return req.cookies.accessToken;
    }
    
    return null;
  }
  
  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    // Combine IP address and user agent for more accurate rate limiting
    const ip = this.getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
  }
  
  /**
   * Get client IP address with proxy support
   */
  private getClientIP(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }
  
  /**
   * Calculate expiry timestamp
   */
  private getExpiryTimestamp(expiry: string | number, now: number): number {
    if (typeof expiry === 'number') {
      return now + expiry;
    }
    
    // Parse string format (e.g., '15m', '1h', '7d')
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
    
    return now + (value * multipliers[unit as keyof typeof multipliers]);
  }
  
  /**
   * Generate secure session ID
   */
  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Log security events for monitoring
   */
  logSecurityEvent(event: {
    type: 'login' | 'logout' | 'token_refresh' | 'failed_login' | 'rate_limit' | 'suspicious_activity';
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }): void {
    const logEntry = {
      ...event,
      timestamp: new Date().toISOString(),
      severity: this.getEventSeverity(event.type),
    };
    
    // In production, this would be sent to a security monitoring system
    console.log('SECURITY_EVENT:', JSON.stringify(logEntry));
  }
  
  private getEventSeverity(eventType: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap = {
      login: 'low',
      logout: 'low',
      token_refresh: 'low',
      failed_login: 'medium',
      rate_limit: 'high',
      suspicious_activity: 'critical',
    } as const;
    
    return severityMap[eventType as keyof typeof severityMap] || 'medium';
  }
}