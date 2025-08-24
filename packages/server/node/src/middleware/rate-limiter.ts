/**
 * Comprehensive Rate Limiting Middleware
 * Implements multi-tier rate limiting with DDoS protection
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterAbstract, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { configManager } from '../config/secure-config';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response, next: NextFunction, options: RateLimiterRes) => void;
}

export interface DynamicRateLimitConfig extends RateLimitConfig {
  tiers?: {
    authenticated?: RateLimitConfig;
    premium?: RateLimitConfig;
    admin?: RateLimitConfig;
  };
}

/**
 * Multi-layer rate limiting system
 */
export class EnhancedRateLimiter {
  private limiter: RateLimiterAbstract;
  private bruteForceProtection: RateLimiterAbstract;
  private ddosProtection: RateLimiterAbstract;
  private config: any;
  private redis: Redis | null = null;
  
  constructor(redisUrl?: string) {
    this.config = configManager.loadConfig();
    
    // Initialize Redis if available
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });
      
      this.redis.on('error', (err) => {
        console.error('Redis rate limiter error:', err);
      });
    }
    
    // Initialize rate limiters
    this.limiter = this.createLimiter('general', this.config.rateLimit.api);
    this.bruteForceProtection = this.createLimiter('brute', {
      windowMs: 900000, // 15 minutes
      max: 10, // Max consecutive failures
    });
    this.ddosProtection = this.createLimiter('ddos', {
      windowMs: 1000, // 1 second
      max: 50, // Max requests per second
    });
  }
  
  /**
   * Create a rate limiter instance
   */
  private createLimiter(keyPrefix: string, config: RateLimitConfig): RateLimiterAbstract {
    const points = config.max;
    const duration = Math.floor(config.windowMs / 1000);
    
    if (this.redis) {
      return new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `rl:${keyPrefix}:`,
        points,
        duration,
        blockDuration: duration,
        execEvenly: false,
      });
    }
    
    return new RateLimiterMemory({
      keyPrefix: `rl:${keyPrefix}:`,
      points,
      duration,
      blockDuration: duration,
      execEvenly: false,
    });
  }
  
  /**
   * General API rate limiting middleware
   */
  apiLimiter(customConfig?: Partial<RateLimitConfig>) {
    const config = {
      ...this.config.rateLimit.api,
      ...customConfig,
    };
    
    return this.createMiddleware(this.limiter, config);
  }
  
  /**
   * Login endpoint rate limiting
   */
  loginLimiter() {
    const config = this.config.rateLimit.login;
    const limiter = this.createLimiter('login', config);
    
    return this.createMiddleware(limiter, {
      ...config,
      message: 'Too many login attempts. Please try again later.',
      keyGenerator: (req: Request) => {
        // Key by IP + username for more granular control
        const username = req.body?.email || req.body?.username || '';
        return this.hashKey(`${this.getClientIP(req)}:${username}`);
      },
    });
  }
  
  /**
   * Registration endpoint rate limiting
   */
  registrationLimiter() {
    const config = this.config.rateLimit.register;
    const limiter = this.createLimiter('register', config);
    
    return this.createMiddleware(limiter, {
      ...config,
      message: 'Too many registration attempts. Please try again later.',
      keyGenerator: (req: Request) => {
        // Key by IP + email
        const email = req.body?.email || '';
        return this.hashKey(`${this.getClientIP(req)}:${email}`);
      },
    });
  }
  
  /**
   * Password reset rate limiting
   */
  passwordResetLimiter() {
    const config = this.config.rateLimit.passwordReset;
    const limiter = this.createLimiter('reset', config);
    
    return this.createMiddleware(limiter, {
      ...config,
      message: 'Too many password reset attempts. Please try again later.',
      keyGenerator: (req: Request) => {
        // Key by IP + email
        const email = req.body?.email || '';
        return this.hashKey(`${this.getClientIP(req)}:${email}`);
      },
    });
  }
  
  /**
   * DDoS protection middleware
   */
  ddosProtectionMiddleware() {
    return this.createMiddleware(this.ddosProtection, {
      windowMs: 1000,
      max: 50,
      message: 'Request rate exceeded. Please slow down.',
      handler: (req, res, next, options) => {
        // Log potential DDoS attack
        console.error('Potential DDoS attack detected', {
          ip: this.getClientIP(req),
          userAgent: req.headers['user-agent'],
          path: req.path,
          remainingPoints: options.remainingPoints,
        });
        
        // Return 503 Service Unavailable for DDoS
        res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable',
          retryAfter: Math.round(options.msBeforeNext / 1000),
        });
      },
    });
  }
  
  /**
   * Brute force protection middleware
   */
  bruteForceProtection(action: string = 'default') {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = this.hashKey(`${action}:${this.getClientIP(req)}`);
      
      try {
        // Check if already blocked
        const retrySecs = await this.bruteForceProtection.get(key);
        
        if (retrySecs && retrySecs.consumedPoints >= 10) {
          const retryAfter = Math.round(retrySecs.msBeforeNext / 1000) || 60;
          
          // Log brute force attempt
          console.warn('Brute force attack detected', {
            action,
            ip: this.getClientIP(req),
            userAgent: req.headers['user-agent'],
            attempts: retrySecs.consumedPoints,
          });
          
          return res.status(429).json({
            success: false,
            error: 'Too many failed attempts. Account temporarily locked.',
            retryAfter,
          });
        }
        
        // Attach functions to track success/failure
        (req as any).rateLimiter = {
          success: async () => {
            // Reset on successful action
            await this.bruteForceProtection.delete(key);
          },
          failure: async () => {
            // Increment failure counter
            try {
              await this.bruteForceProtection.consume(key);
            } catch (rlRejected) {
              // Already rate limited
            }
          },
        };
        
        next();
      } catch (error) {
        console.error('Brute force protection error:', error);
        next(); // Fail open for availability
      }
    };
  }
  
  /**
   * Dynamic rate limiting based on user tier
   */
  dynamicLimiter(baseConfig: DynamicRateLimitConfig) {
    return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
      // Determine user tier
      let config = baseConfig;
      
      if (req.user) {
        if (req.user.roles?.includes('admin') && baseConfig.tiers?.admin) {
          config = { ...baseConfig, ...baseConfig.tiers.admin };
        } else if (req.user.roles?.includes('premium') && baseConfig.tiers?.premium) {
          config = { ...baseConfig, ...baseConfig.tiers.premium };
        } else if (baseConfig.tiers?.authenticated) {
          config = { ...baseConfig, ...baseConfig.tiers.authenticated };
        }
      }
      
      const limiter = this.createLimiter(`dynamic:${req.path}`, config);
      const middleware = this.createMiddleware(limiter, config);
      
      middleware(req, res, next);
    };
  }
  
  /**
   * Sliding window rate limiter
   */
  slidingWindowLimiter(config: RateLimitConfig) {
    const limiter = new RateLimiterMemory({
      points: config.max,
      duration: Math.floor(config.windowMs / 1000),
      execEvenly: true, // Spread requests evenly
    });
    
    return this.createMiddleware(limiter, config);
  }
  
  /**
   * Create rate limiting middleware
   */
  private createMiddleware(limiter: RateLimiterAbstract, config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Check if should skip
      if (config.skip && config.skip(req)) {
        return next();
      }
      
      // Generate key
      const key = config.keyGenerator 
        ? config.keyGenerator(req)
        : this.getDefaultKey(req);
      
      try {
        const rateLimiterRes = await limiter.consume(key);
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', config.max.toString());
        res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints.toString());
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
        
        // Track successful request if configured
        if (config.skipSuccessfulRequests) {
          res.on('finish', async () => {
            if (res.statusCode < 400) {
              try {
                await limiter.reward(key, 1);
              } catch (error) {
                // Ignore reward errors
              }
            }
          });
        }
        
        next();
      } catch (rateLimiterRes: any) {
        // Set rate limit headers even on rejection
        res.setHeader('X-RateLimit-Limit', config.max.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
        res.setHeader('Retry-After', Math.round(rateLimiterRes.msBeforeNext / 1000).toString());
        
        // Custom handler
        if (config.handler) {
          return config.handler(req, res, next, rateLimiterRes);
        }
        
        // Default response
        res.status(429).json({
          success: false,
          error: config.message || 'Too many requests',
          retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000),
        });
      }
    };
  }
  
  /**
   * Get default rate limit key
   */
  private getDefaultKey(req: Request): string {
    const user = (req as any).user;
    
    if (user && user.id) {
      // Authenticated user - key by user ID
      return `user:${user.id}`;
    }
    
    // Anonymous user - key by IP
    return `ip:${this.getClientIP(req)}`;
  }
  
  /**
   * Get client IP address
   */
  private getClientIP(req: Request): string {
    const config = configManager.getConfig();
    
    if (config.server.trustProxy) {
      return req.ip || 'unknown';
    }
    
    return (
      req.headers['x-real-ip'] as string ||
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
  
  /**
   * Hash key for storage
   */
  private hashKey(key: string): string {
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 32);
  }
  
  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<void> {
    try {
      await this.limiter.delete(key);
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
    }
  }
  
  /**
   * Get current consumption for a key
   */
  async getConsumption(key: string): Promise<RateLimiterRes | null> {
    try {
      return await this.limiter.get(key);
    } catch (error) {
      console.error('Failed to get rate limit consumption:', error);
      return null;
    }
  }
  
  /**
   * Clean up connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

/**
 * Create rate limiting middleware instances
 */
export function createRateLimiters(redisUrl?: string) {
  const rateLimiter = new EnhancedRateLimiter(redisUrl);
  
  return {
    // DDoS Protection (apply first)
    ddosProtection: rateLimiter.ddosProtectionMiddleware(),
    
    // General API limits
    apiLimiter: rateLimiter.apiLimiter(),
    strictApiLimiter: rateLimiter.apiLimiter({ max: 50, windowMs: 60000 }),
    
    // Authentication endpoints
    loginLimiter: rateLimiter.loginLimiter(),
    registrationLimiter: rateLimiter.registrationLimiter(),
    passwordResetLimiter: rateLimiter.passwordResetLimiter(),
    
    // Brute force protection
    bruteForceProtection: rateLimiter.bruteForceProtection,
    
    // Dynamic limiter for different user tiers
    dynamicLimiter: rateLimiter.dynamicLimiter.bind(rateLimiter),
    
    // Sliding window for smooth rate limiting
    slidingWindowLimiter: rateLimiter.slidingWindowLimiter.bind(rateLimiter),
    
    // Utility functions
    reset: rateLimiter.reset.bind(rateLimiter),
    getConsumption: rateLimiter.getConsumption.bind(rateLimiter),
    close: rateLimiter.close.bind(rateLimiter),
  };
}

/**
 * Express rate limit middleware factory
 */
export function rateLimitMiddleware(config: RateLimitConfig): (req: Request, res: Response, next: NextFunction) => void {
  const rateLimiter = new EnhancedRateLimiter();
  return rateLimiter.apiLimiter(config);
}