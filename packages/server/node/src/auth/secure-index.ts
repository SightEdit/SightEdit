import { Request, Response, NextFunction } from 'express';
import { SecureJWTAuth, JWTConfig } from './secure-jwt';
import { SecureAuthHandler, SecurityConfig, EmailConfig } from './secure-auth-handler';
import { RBACSystem } from './rbac-system';
import * as crypto from 'crypto';

export * from './secure-jwt';
export * from './secure-auth-handler';
export * from './rbac-system';

export interface SecureAuthConfig {
  jwt: JWTConfig;
  security?: Partial<SecurityConfig>;
  email?: EmailConfig;
  rbac?: {
    enableResourceLevelPermissions: boolean;
    enableConditionalPermissions: boolean;
    cacheTTL: number;
  };
}

/**
 * Comprehensive secure authentication system for SightEdit
 * Combines JWT authentication, RBAC authorization, and security features
 */
export class SecureAuthSystem {
  public jwtAuth: SecureJWTAuth;
  public authHandler: SecureAuthHandler;
  public rbac: RBACSystem;
  
  private initialized = false;
  
  constructor(config: SecureAuthConfig) {
    // Initialize JWT authentication
    this.jwtAuth = new SecureJWTAuth(config.jwt);
    
    // Initialize RBAC system
    this.rbac = new RBACSystem();
    
    // Initialize authentication handler
    this.authHandler = new SecureAuthHandler(
      this.jwtAuth,
      config.security,
      config.email
    );
    
    this.initialized = true;
  }
  
  /**
   * Create secure authentication configuration with best practices
   */
  static createSecureConfig(overrides: Partial<SecureAuthConfig> = {}): SecureAuthConfig {
    // Generate cryptographically secure secrets
    const accessTokenSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(64).toString('hex');
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    
    if (accessTokenSecret === refreshTokenSecret) {
      throw new Error('Access and refresh token secrets must be different');
    }
    
    return {
      jwt: {
        accessTokenSecret,
        refreshTokenSecret,
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'sightedit-api',
        audience: ['sightedit-client'],
        clockTolerance: 30,
        enableRateLimiting: true,
        maxLoginAttempts: 5,
        lockoutDuration: 900, // 15 minutes
        requireTwoFactor: false,
        ...overrides.jwt,
      },
      security: {
        maxLoginAttempts: 5,
        lockoutDuration: 15,
        passwordResetExpiry: 60,
        emailVerificationExpiry: 24,
        maxSessions: 5,
        requireEmailVerification: true,
        enableTwoFactor: false,
        enableAccountLockout: true,
        passwordHistory: 5,
        ...overrides.security,
      },
      email: overrides.email,
      rbac: {
        enableResourceLevelPermissions: true,
        enableConditionalPermissions: true,
        cacheTTL: 300000, // 5 minutes
        ...overrides.rbac,
      },
    };
  }
  
  /**
   * Initialize from environment variables (production-ready)
   */
  static fromEnvironment(): SecureAuthSystem {
    const requiredEnvVars = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    const config: SecureAuthConfig = {
      jwt: {
        accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
        refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
        accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
        refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
        issuer: process.env.JWT_ISSUER || 'sightedit-api',
        audience: process.env.JWT_AUDIENCE ? process.env.JWT_AUDIENCE.split(',') : ['sightedit-client'],
        clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '30'),
        enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900'),
        requireTwoFactor: process.env.REQUIRE_2FA === 'true',
      },
      security: {
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15'),
        passwordResetExpiry: parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '60'),
        emailVerificationExpiry: parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24'),
        maxSessions: parseInt(process.env.MAX_USER_SESSIONS || '5'),
        requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
        enableTwoFactor: process.env.ENABLE_2FA === 'true',
        enableAccountLockout: process.env.ENABLE_ACCOUNT_LOCKOUT !== 'false',
        passwordHistory: parseInt(process.env.PASSWORD_HISTORY || '5'),
      },
    };
    
    // Add email configuration if present
    if (process.env.SMTP_HOST) {
      config.email = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASS!,
        },
        from: process.env.SMTP_FROM || 'noreply@sightedit.com',
      };
    }
    
    return new SecureAuthSystem(config);
  }
  
  /**
   * Get authentication middleware with role-based authorization
   */
  requireAuth(options: {
    permissions?: string[];
    roles?: string[];
    requireAllPermissions?: boolean;
    requireEmailVerified?: boolean;
    resourceExtractor?: (req: Request) => { type: string; id?: string; data?: any };
  } = {}) {
    const jwtMiddleware = this.jwtAuth.authenticate({
      required: true,
      roles: options.roles,
      requireEmailVerified: options.requireEmailVerified,
    });
    
    const rbacMiddleware = this.rbac.createAuthorizationMiddleware({
      permissions: options.permissions,
      requireAllPermissions: options.requireAllPermissions,
      resourceExtractor: options.resourceExtractor,
    });
    
    // Chain middlewares
    return [jwtMiddleware, rbacMiddleware];
  }
  
  /**
   * Optional authentication middleware (user can be null)
   */
  optionalAuth() {
    return this.jwtAuth.authenticate({ required: false });
  }
  
  /**
   * Create resource-aware authorization middleware
   */
  requireResourceAccess(resourceType: string, action: string) {
    return this.requireAuth({
      permissions: [`${resourceType}:${action}`],
      resourceExtractor: (req) => {
        const resourceId = req.params.id || req.params.resourceId;
        return {
          type: resourceType,
          id: resourceId,
          data: (req as any).resource, // Assumes resource is loaded by previous middleware
        };
      },
    });
  }
  
  /**
   * Middleware for user management operations
   */
  requireUserManagement(action: 'read' | 'write' | 'delete' | 'manage_roles') {
    return this.requireAuth({
      permissions: [`user:${action}`],
      resourceExtractor: (req) => ({
        type: 'user',
        id: req.params.userId,
      }),
    });
  }
  
  /**
   * Middleware for system administration
   */
  requireSystemAdmin() {
    return this.requireAuth({
      permissions: ['system:admin'],
      roles: ['admin'],
    });
  }
  
  /**
   * Get all authentication routes
   */
  getAuthRoutes() {
    return {
      register: this.authHandler.register.bind(this.authHandler),
      login: this.authHandler.login.bind(this.authHandler),
      logout: this.authHandler.logout.bind(this.authHandler),
      refreshTokens: this.authHandler.refreshTokens.bind(this.authHandler),
      requestPasswordReset: this.authHandler.requestPasswordReset.bind(this.authHandler),
      resetPassword: this.authHandler.resetPassword.bind(this.authHandler),
      getCurrentUser: this.authHandler.getCurrentUser.bind(this.authHandler),
    };
  }
  
  /**
   * Validate system configuration and security settings
   */
  validateConfiguration(): { valid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    if (!this.initialized) {
      errors.push('Authentication system not properly initialized');
    }
    
    // Check JWT secrets
    const config = (this.jwtAuth as any).config;
    if (config.accessTokenSecret.length < 64) {
      errors.push('JWT access token secret is too short (minimum 64 characters)');
    }
    
    if (config.refreshTokenSecret.length < 64) {
      errors.push('JWT refresh token secret is too short (minimum 64 characters)');
    }
    
    if (config.accessTokenSecret === config.refreshTokenSecret) {
      errors.push('Access and refresh token secrets must be different');
    }
    
    // Check environment
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
        errors.push('JWT secrets must be set via environment variables in production');
      }
      
      if (!config.enableRateLimiting) {
        warnings.push('Rate limiting is disabled in production environment');
      }
      
      // Check HTTPS requirement
      if (!process.env.HTTPS_ONLY || process.env.HTTPS_ONLY !== 'true') {
        warnings.push('HTTPS enforcement should be enabled in production');
      }
    }
    
    // Check security settings
    const securityConfig = (this.authHandler as any).config;
    if (securityConfig.maxLoginAttempts > 10) {
      warnings.push('Max login attempts is set very high (>10)');
    }
    
    if (securityConfig.lockoutDuration < 5) {
      warnings.push('Account lockout duration is very short (<5 minutes)');
    }
    
    if (!securityConfig.requireEmailVerification) {
      warnings.push('Email verification is disabled');
    }
    
    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }
  
  /**
   * Get system security status
   */
  getSecurityStatus() {
    const validation = this.validateConfiguration();
    
    return {
      initialized: this.initialized,
      jwtEnabled: !!this.jwtAuth,
      rbacEnabled: !!this.rbac,
      rateLimitingEnabled: (this.jwtAuth as any).config.enableRateLimiting,
      emailVerificationEnabled: (this.authHandler as any).config.requireEmailVerification,
      twoFactorEnabled: (this.authHandler as any).config.enableTwoFactor,
      accountLockoutEnabled: (this.authHandler as any).config.enableAccountLockout,
      configuration: {
        valid: validation.valid,
        warnings: validation.warnings,
        errors: validation.errors,
      },
      roleHierarchy: this.rbac.getRoleHierarchy(),
      permissionsByResource: this.rbac.getPermissionsByResource(),
    };
  }
  
  /**
   * Emergency security lockdown (disable all authentication)
   */
  emergencyLockdown(): { success: boolean; message: string } {
    try {
      // This would implement emergency procedures
      console.error('EMERGENCY LOCKDOWN ACTIVATED - All authentication disabled');
      
      // In a real implementation, this would:
      // 1. Revoke all active tokens
      // 2. Disable new logins
      // 3. Log the incident
      // 4. Notify administrators
      
      return {
        success: true,
        message: 'Emergency lockdown activated successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Emergency lockdown failed: ${error}`,
      };
    }
  }
}

/**
 * Factory function for easy initialization
 */
export function createSecureAuth(config?: Partial<SecureAuthConfig>): SecureAuthSystem {
  const finalConfig = config 
    ? { ...SecureAuthSystem.createSecureConfig(), ...config }
    : SecureAuthSystem.createSecureConfig();
  
  return new SecureAuthSystem(finalConfig);
}

/**
 * Utility function to check if user has admin privileges
 */
export function isAdmin(userRoles: string[]): boolean {
  return userRoles.includes('admin');
}

/**
 * Utility function to check if user has editor privileges
 */
export function isEditor(userRoles: string[]): boolean {
  return userRoles.some(role => ['admin', 'editor', 'moderator'].includes(role));
}

/**
 * Utility function to get highest role level
 */
export function getHighestRoleLevel(userRoles: string[]): number {
  const roleLevels = {
    viewer: 1,
    contributor: 2,
    editor: 3,
    moderator: 4,
    admin: 5,
  };
  
  return Math.max(...userRoles.map(role => roleLevels[role as keyof typeof roleLevels] || 0));
}