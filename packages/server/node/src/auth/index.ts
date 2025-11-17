import { Request, Response } from 'express';
import { JWTAuth, AuthUser } from './jwt';
import { OAuth2Auth, OAuth2Config } from './oauth2';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

export interface AuthConfig {
  jwt?: {
    secret: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
  };
  oauth2?: OAuth2Config;
  sessionSecret?: string;
  allowRegistration?: boolean;
  requireEmailVerification?: boolean;
}

export interface UserCredentials {
  email: string;
  password: string;
}

export interface UserRegistration extends UserCredentials {
  name: string;
  roles?: string[];
}

// In-memory user store (replace with database in production)
const users = new Map<string, {
  id: string;
  email: string;
  name: string;
  password: string;
  roles: string[];
  permissions: string[];
  emailVerified: boolean;
  createdAt: Date;
}>();

// In-memory refresh tokens (replace with Redis in production)
const refreshTokens = new Map<string, {
  userId: string;
  expiresAt: Date;
}>();

export class AuthHandler {
  private jwtAuth?: JWTAuth;
  private oauth2Auth?: OAuth2Auth;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;

    if (config.jwt) {
      this.jwtAuth = new JWTAuth(config.jwt);
    }

    if (config.oauth2) {
      this.oauth2Auth = new OAuth2Auth(config.oauth2);
    }
  }

  /**
   * Register new user
   */
  async register(req: Request, res: Response): Promise<void> {
    if (!this.config.allowRegistration) {
      return res.status(403).json({
        success: false,
        error: 'Registration is disabled'
      });
    }

    const { email, password, name, roles = ['user'] } = req.body as UserRegistration;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if user exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = crypto.randomBytes(16).toString('hex');
    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      roles,
      permissions: this.getPermissionsForRoles(roles),
      emailVerified: !this.config.requireEmailVerification,
      createdAt: new Date()
    };

    users.set(userId, user);

    // Send verification email if required
    if (this.config.requireEmailVerification) {
      await this.sendVerificationEmail(email, userId);
    }

    // Generate tokens
    if (this.jwtAuth) {
      const authUser: AuthUser = {
        id: userId,
        email,
        name,
        roles,
        permissions: user.permissions
      };

      const accessToken = this.jwtAuth.generateToken(authUser);
      const refreshToken = this.generateRefreshToken(userId);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: userId,
          email,
          name,
          roles,
          emailVerified: user.emailVerified
        }
      });
    } else {
      res.json({
        success: true,
        user: {
          id: userId,
          email,
          name,
          roles,
          emailVerified: user.emailVerified
        }
      });
    }
  }

  /**
   * Login with email and password
   */
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as UserCredentials;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check email verification
    if (this.config.requireEmailVerification && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        error: 'Email not verified'
      });
    }

    // SECURITY: Invalidate all existing refresh tokens to prevent session fixation
    // Remove all refresh tokens for this user
    const tokensToDelete: string[] = [];
    refreshTokens.forEach((tokenData, token) => {
      if (tokenData.userId === user.id) {
        tokensToDelete.push(token);
      }
    });

    tokensToDelete.forEach(token => refreshTokens.delete(token));

    // Log security event
    console.log(`Security: Invalidated ${tokensToDelete.length} existing refresh tokens for user ${user.id} upon login`);

    // Generate tokens
    if (this.jwtAuth) {
      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions
      };

      const accessToken = this.jwtAuth.generateToken(authUser);
      const refreshToken = this.generateRefreshToken(user.id);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles
        }
      });
    } else {
      // Session-based auth
      (req as any).session = { userId: user.id };
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles
        }
      });
    }
  }

  /**
   * Refresh access token
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }

    // Get user
    const user = users.get(tokenData.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new tokens
    if (this.jwtAuth) {
      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions
      };

      const accessToken = this.jwtAuth.generateToken(authUser);
      const newRefreshToken = this.generateRefreshToken(user.id);

      // Invalidate old refresh token
      refreshTokens.delete(refreshToken);

      res.json({
        success: true,
        accessToken,
        refreshToken: newRefreshToken
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'JWT not configured'
      });
    }
  }

  /**
   * Logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }

    // Clear session if exists
    if ((req as any).session) {
      (req as any).session = null;
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }

  /**
   * Get current user
   */
  async getMe(req: Request & { user?: AuthUser }, res: Response): Promise<void> {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const user = users.get(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }
    });
  }

  /**
   * OAuth2 handlers
   */
  async oauth2Login(provider: string, req: Request, res: Response): Promise<void> {
    if (!this.oauth2Auth) {
      return res.status(501).json({
        success: false,
        error: 'OAuth2 not configured'
      });
    }

    await this.oauth2Auth.initiateAuth(provider, req, res);
  }

  async oauth2Callback(provider: string, req: Request, res: Response): Promise<void> {
    if (!this.oauth2Auth) {
      return res.status(501).json({
        success: false,
        error: 'OAuth2 not configured'
      });
    }

    await this.oauth2Auth.handleCallback(provider, req, res);
  }

  /**
   * Middleware for authentication
   */
  authenticate(options: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
  } = {}) {
    if (this.jwtAuth) {
      return this.jwtAuth.middleware(options);
    }

    // Session-based auth fallback
    return (req: Request & { user?: AuthUser }, res: Response, next: Function) => {
      const session = (req as any).session;
      if (!session?.userId) {
        if (options.required) {
          return res.status(401).json({
            success: false,
            error: 'Not authenticated'
          });
        }
        return next();
      }

      const user = users.get(session.userId);
      if (!user) {
        if (options.required) {
          return res.status(401).json({
            success: false,
            error: 'User not found'
          });
        }
        return next();
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions
      };

      next();
    };
  }

  /**
   * Helper methods
   */
  private generateRefreshToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    refreshTokens.set(token, {
      userId,
      expiresAt
    });

    return token;
  }

  private getPermissionsForRoles(roles: string[]): string[] {
    const permissions: string[] = [];

    for (const role of roles) {
      switch (role) {
        case 'admin':
          permissions.push('read', 'write', 'delete', 'admin');
          break;
        case 'editor':
          permissions.push('read', 'write');
          break;
        case 'user':
          permissions.push('read');
          break;
      }
    }

    return [...new Set(permissions)];
  }

  private async sendVerificationEmail(email: string, userId: string): Promise<void> {
    // Implement email sending
    const verificationToken = crypto.randomBytes(32).toString('hex');
    console.log(`Verification email would be sent to ${email} with token: ${verificationToken}`);
  }
}