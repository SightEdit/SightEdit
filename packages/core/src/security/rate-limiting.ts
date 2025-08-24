/**
 * Advanced Rate Limiting Middleware for SightEdit
 * Implements multiple rate limiting strategies to prevent abuse and ensure fair usage
 */

import { EventEmitter } from 'events';

export interface RateLimitConfig {
  // Basic rate limit settings
  windowMs?: number;              // Time window in milliseconds
  max?: number;                   // Max requests per window
  message?: string;               // Custom error message
  statusCode?: number;            // HTTP status code for limit exceeded
  
  // Advanced settings
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  skip?: (req: any) => boolean;
  
  // Sliding window settings
  slidingWindow?: boolean;
  windowSizeMs?: number;
  
  // Distributed settings
  store?: RateLimitStore;
  
  // DDoS protection
  ddosProtection?: {
    enabled: boolean;
    threshold: number;
    blockDurationMs: number;
    whitelistedIPs?: string[];
  };
  
  // Progressive penalties
  progressivePenalty?: {
    enabled: boolean;
    multiplier: number;
    maxPenalty: number;
  };
  
  // Burst handling
  burstProtection?: {
    enabled: boolean;
    burstLimit: number;
    burstWindowMs: number;
  };
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitData | null>;
  set(key: string, data: RateLimitData, ttlMs: number): Promise<void>;
  increment(key: string, windowMs: number): Promise<RateLimitData>;
  reset(key: string): Promise<void>;
  cleanup(): Promise<void>;
}

export interface RateLimitData {
  count: number;
  resetTime: number;
  firstRequest: number;
  lastRequest: number;
  penaltyMultiplier?: number;
  blocked?: boolean;
  blockUntil?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  penaltyApplied?: boolean;
  reason?: string;
}

/**
 * In-memory rate limit store with TTL support
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private data = new Map<string, RateLimitData>();
  private timers = new Map<string, NodeJS.Timeout>();

  async get(key: string): Promise<RateLimitData | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, data: RateLimitData, ttlMs: number): Promise<void> {
    this.data.set(key, data);
    this.setTTL(key, ttlMs);
  }

  async increment(key: string, windowMs: number): Promise<RateLimitData> {
    const now = Date.now();
    const existing = this.data.get(key);

    if (!existing || now >= existing.resetTime) {
      // Start new window
      const data: RateLimitData = {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
        lastRequest: now,
        penaltyMultiplier: existing?.penaltyMultiplier || 1
      };
      
      this.data.set(key, data);
      this.setTTL(key, windowMs);
      return data;
    }

    // Update existing window
    existing.count += 1;
    existing.lastRequest = now;
    this.data.set(key, existing);
    
    return existing;
  }

  async reset(key: string): Promise<void> {
    this.data.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    
    for (const [key, data] of this.data.entries()) {
      if (now >= data.resetTime && (!data.blockUntil || now >= data.blockUntil)) {
        await this.reset(key);
      }
    }
  }

  private setTTL(key: string, ttlMs: number): void {
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.data.delete(key);
      this.timers.delete(key);
    }, ttlMs);
    
    this.timers.set(key, timer);
  }
}

/**
 * Redis-based rate limit store for distributed systems
 */
export class RedisRateLimitStore implements RateLimitStore {
  private redis: any; // Redis client
  private keyPrefix: string;

  constructor(redis: any, keyPrefix = 'sightedit:ratelimit:') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  async get(key: string): Promise<RateLimitData | null> {
    const data = await this.redis.get(this.keyPrefix + key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, data: RateLimitData, ttlMs: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.redis.setex(fullKey, Math.ceil(ttlMs / 1000), JSON.stringify(data));
  }

  async increment(key: string, windowMs: number): Promise<RateLimitData> {
    const fullKey = this.keyPrefix + key;
    const now = Date.now();
    
    // Use Redis transaction for atomic operations
    const multi = this.redis.multi();
    const existing = await this.get(key);

    if (!existing || now >= existing.resetTime) {
      // Start new window
      const data: RateLimitData = {
        count: 1,
        resetTime: now + windowMs,
        firstRequest: now,
        lastRequest: now,
        penaltyMultiplier: existing?.penaltyMultiplier || 1
      };
      
      await this.set(key, data, windowMs);
      return data;
    }

    // Update existing window
    existing.count += 1;
    existing.lastRequest = now;
    await this.set(key, existing, existing.resetTime - now);
    
    return existing;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.keyPrefix + key);
  }

  async cleanup(): Promise<void> {
    // Redis handles TTL automatically
  }
}

/**
 * Advanced rate limiter with multiple protection strategies
 */
export class AdvancedRateLimiter extends EventEmitter {
  private config: Required<RateLimitConfig>;
  private store: RateLimitStore;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig = {}) {
    super();
    
    this.config = {
      windowMs: config.windowMs || 15 * 60 * 1000, // 15 minutes
      max: config.max || 100,
      message: config.message || 'Too many requests',
      statusCode: config.statusCode || 429,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      keyGenerator: config.keyGenerator || ((req: any) => req.ip || req.connection.remoteAddress),
      skip: config.skip || (() => false),
      slidingWindow: config.slidingWindow || false,
      windowSizeMs: config.windowSizeMs || this.config?.windowMs || 15 * 60 * 1000,
      store: config.store || new MemoryRateLimitStore(),
      ddosProtection: {
        enabled: config.ddosProtection?.enabled || true,
        threshold: config.ddosProtection?.threshold || 1000,
        blockDurationMs: config.ddosProtection?.blockDurationMs || 60 * 60 * 1000, // 1 hour
        whitelistedIPs: config.ddosProtection?.whitelistedIPs || []
      },
      progressivePenalty: {
        enabled: config.progressivePenalty?.enabled || true,
        multiplier: config.progressivePenalty?.multiplier || 2,
        maxPenalty: config.progressivePenalty?.maxPenalty || 8
      },
      burstProtection: {
        enabled: config.burstProtection?.enabled || true,
        burstLimit: config.burstProtection?.burstLimit || 20,
        burstWindowMs: config.burstProtection?.burstWindowMs || 1000 // 1 second
      }
    };

    this.store = this.config.store;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.store.cleanup().catch(err => {
        this.emit('error', err);
      });
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Check if request is allowed and update counters
   */
  async checkLimit(req: any): Promise<RateLimitResult> {
    // Skip if configured to do so
    if (this.config.skip(req)) {
      return {
        allowed: true,
        remaining: this.config.max,
        resetTime: Date.now() + this.config.windowMs
      };
    }

    const key = this.config.keyGenerator(req);
    const now = Date.now();

    // Check whitelist for DDoS protection
    if (this.config.ddosProtection.enabled && 
        this.config.ddosProtection.whitelistedIPs.includes(this.extractIP(req))) {
      return {
        allowed: true,
        remaining: this.config.max,
        resetTime: now + this.config.windowMs
      };
    }

    // Get current data
    let data = await this.store.get(key);

    // Handle blocked IPs
    if (data?.blocked && data.blockUntil && now < data.blockUntil) {
      this.emit('blocked', { key, req, reason: 'DDoS protection' });
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.resetTime,
        retryAfter: Math.ceil((data.blockUntil - now) / 1000),
        reason: 'IP temporarily blocked due to suspicious activity'
      };
    }

    // Check burst protection
    if (this.config.burstProtection.enabled) {
      const burstResult = await this.checkBurstLimit(key, req);
      if (!burstResult.allowed) {
        return burstResult;
      }
    }

    // Increment counter
    data = await this.store.increment(key, this.getEffectiveWindowMs(data));

    // Apply progressive penalty
    if (this.config.progressivePenalty.enabled && data.penaltyMultiplier) {
      const penalizedMax = Math.floor(this.config.max / data.penaltyMultiplier);
      if (data.count > penalizedMax) {
        data.penaltyMultiplier = Math.min(
          data.penaltyMultiplier * this.config.progressivePenalty.multiplier,
          this.config.progressivePenalty.maxPenalty
        );
        
        await this.store.set(key, data, data.resetTime - now);
        
        this.emit('penalty-applied', { key, req, multiplier: data.penaltyMultiplier });
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: data.resetTime,
          penaltyApplied: true,
          reason: 'Progressive penalty applied due to repeated violations'
        };
      }
    }

    // Check DDoS protection
    if (this.config.ddosProtection.enabled && 
        data.count > this.config.ddosProtection.threshold) {
      
      // Block the IP
      data.blocked = true;
      data.blockUntil = now + this.config.ddosProtection.blockDurationMs;
      await this.store.set(key, data, this.config.ddosProtection.blockDurationMs);
      
      this.emit('ddos-detected', { key, req, count: data.count });
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.resetTime,
        retryAfter: Math.ceil(this.config.ddosProtection.blockDurationMs / 1000),
        reason: 'DDoS protection activated - IP blocked'
      };
    }

    // Check rate limit
    const effectiveMax = this.getEffectiveMax(data);
    const allowed = data.count <= effectiveMax;
    const remaining = Math.max(0, effectiveMax - data.count);

    if (!allowed) {
      this.emit('rate-limited', { key, req, count: data.count, max: effectiveMax });
    }

    return {
      allowed,
      remaining,
      resetTime: data.resetTime,
      retryAfter: allowed ? undefined : Math.ceil((data.resetTime - now) / 1000)
    };
  }

  private async checkBurstLimit(key: string, req: any): Promise<RateLimitResult> {
    const burstKey = `${key}:burst`;
    const now = Date.now();
    const data = await this.store.increment(burstKey, this.config.burstProtection.burstWindowMs);

    if (data.count > this.config.burstProtection.burstLimit) {
      this.emit('burst-detected', { key, req, count: data.count });
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.resetTime,
        retryAfter: Math.ceil((data.resetTime - now) / 1000),
        reason: 'Burst limit exceeded'
      };
    }

    return {
      allowed: true,
      remaining: this.config.burstProtection.burstLimit - data.count,
      resetTime: data.resetTime
    };
  }

  private getEffectiveWindowMs(data: RateLimitData | null): number {
    if (this.config.slidingWindow && data) {
      // Sliding window: adjust window based on request pattern
      const timeSinceFirst = Date.now() - data.firstRequest;
      return Math.min(timeSinceFirst + this.config.windowSizeMs, this.config.windowMs);
    }
    
    return this.config.windowMs;
  }

  private getEffectiveMax(data: RateLimitData): number {
    if (this.config.progressivePenalty.enabled && data.penaltyMultiplier) {
      return Math.floor(this.config.max / data.penaltyMultiplier);
    }
    
    return this.config.max;
  }

  private extractIP(req: any): string {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           'unknown';
  }

  /**
   * Express.js middleware factory
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      try {
        const result = await this.checkLimit(req);
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.config.max);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetTime);
        
        if (!result.allowed) {
          if (result.retryAfter) {
            res.setHeader('Retry-After', result.retryAfter);
          }
          
          return res.status(this.config.statusCode).json({
            error: 'Rate limit exceeded',
            message: result.reason || this.config.message,
            retryAfter: result.retryAfter
          });
        }
        
        next();
      } catch (error) {
        this.emit('error', error);
        next(error);
      }
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetKey(key: string): Promise<void> {
    await this.store.reset(key);
    this.emit('key-reset', { key });
  }

  /**
   * Get current status for a key
   */
  async getStatus(key: string): Promise<RateLimitData | null> {
    return this.store.get(key);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Factory function for creating rate limiters with preset configurations
 */
export class RateLimitFactory {
  static createAPIRateLimiter(store?: RateLimitStore): AdvancedRateLimiter {
    return new AdvancedRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000,
      store,
      ddosProtection: {
        enabled: true,
        threshold: 10000,
        blockDurationMs: 60 * 60 * 1000 // 1 hour
      }
    });
  }

  static createAuthRateLimiter(store?: RateLimitStore): AdvancedRateLimiter {
    return new AdvancedRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Very strict for auth endpoints
      store,
      progressivePenalty: {
        enabled: true,
        multiplier: 4,
        maxPenalty: 16
      },
      ddosProtection: {
        enabled: true,
        threshold: 50,
        blockDurationMs: 24 * 60 * 60 * 1000 // 24 hours
      }
    });
  }

  static createFileUploadRateLimiter(store?: RateLimitStore): AdvancedRateLimiter {
    return new AdvancedRateLimiter({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50,
      store,
      burstProtection: {
        enabled: true,
        burstLimit: 5,
        burstWindowMs: 60 * 1000 // 1 minute
      }
    });
  }
}

// Export default factory instance
export const rateLimitFactory = new RateLimitFactory();