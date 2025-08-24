/**
 * Secure Configuration Management System
 * Handles all environment variables and secrets securely
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Configuration schema validation
const ConfigSchema = z.object({
  // Server Configuration
  server: z.object({
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('0.0.0.0'),
    environment: z.enum(['development', 'staging', 'production']).default('production'),
    trustProxy: z.boolean().default(true),
  }),

  // Database Configuration
  database: z.object({
    type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlite']).default('postgres'),
    host: z.string(),
    port: z.number(),
    database: z.string(),
    username: z.string(),
    password: z.string(),
    ssl: z.object({
      enabled: z.boolean().default(true),
      rejectUnauthorized: z.boolean().default(true),
      ca: z.string().optional(),
      cert: z.string().optional(),
      key: z.string().optional(),
    }).optional(),
    pool: z.object({
      min: z.number().default(2),
      max: z.number().default(10),
      idleTimeoutMillis: z.number().default(30000),
    }).optional(),
  }),

  // JWT Configuration
  jwt: z.object({
    algorithm: z.enum(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']).default('RS256'),
    accessTokenExpiry: z.string().default('15m'),
    refreshTokenExpiry: z.string().default('7d'),
    issuer: z.string(),
    audience: z.array(z.string()),
    clockTolerance: z.number().default(30),
    privateKey: z.string(),
    publicKey: z.string(),
  }),

  // Security Configuration
  security: z.object({
    bcryptRounds: z.number().min(10).max(15).default(12),
    maxLoginAttempts: z.number().default(5),
    lockoutDuration: z.number().default(15), // minutes
    passwordMinLength: z.number().default(12),
    passwordMaxLength: z.number().default(128),
    passwordHistory: z.number().default(5),
    sessionTimeout: z.number().default(3600000), // 1 hour in ms
    requireEmailVerification: z.boolean().default(true),
    requireTwoFactor: z.boolean().default(false),
    allowedOrigins: z.array(z.string()).default([]),
    csrfSecret: z.string().min(64),
  }),

  // Rate Limiting
  rateLimit: z.object({
    login: z.object({
      windowMs: z.number().default(900000), // 15 minutes
      max: z.number().default(5),
    }),
    register: z.object({
      windowMs: z.number().default(3600000), // 1 hour
      max: z.number().default(3),
    }),
    api: z.object({
      windowMs: z.number().default(60000), // 1 minute
      max: z.number().default(100),
    }),
    passwordReset: z.object({
      windowMs: z.number().default(3600000), // 1 hour
      max: z.number().default(3),
    }),
  }),

  // Email Configuration
  email: z.object({
    enabled: z.boolean().default(false),
    host: z.string().optional(),
    port: z.number().optional(),
    secure: z.boolean().default(true),
    auth: z.object({
      user: z.string(),
      pass: z.string(),
    }).optional(),
    from: z.string().optional(),
  }),

  // Logging Configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'text']).default('json'),
    auditLog: z.boolean().default(true),
    securityLog: z.boolean().default(true),
    errorTracking: z.object({
      enabled: z.boolean().default(true),
      dsn: z.string().optional(), // Sentry DSN
    }),
  }),

  // SSL/TLS Configuration
  ssl: z.object({
    enabled: z.boolean().default(true),
    cert: z.string().optional(),
    key: z.string().optional(),
    ca: z.string().optional(),
    minVersion: z.enum(['TLSv1.2', 'TLSv1.3']).default('TLSv1.2'),
    ciphers: z.string().optional(),
  }),

  // Session Configuration
  session: z.object({
    secret: z.string().min(64),
    name: z.string().default('sid'),
    resave: z.boolean().default(false),
    saveUninitialized: z.boolean().default(false),
    cookie: z.object({
      secure: z.boolean().default(true),
      httpOnly: z.boolean().default(true),
      maxAge: z.number().default(3600000),
      sameSite: z.enum(['strict', 'lax', 'none']).default('strict'),
      domain: z.string().optional(),
    }),
  }),
});

export type SecureConfig = z.infer<typeof ConfigSchema>;

/**
 * Secure configuration loader with encryption support
 */
export class SecureConfigManager {
  private static instance: SecureConfigManager;
  private config: SecureConfig | null = null;
  private encryptionKey: Buffer;
  private configPath: string;

  private constructor() {
    // Generate or load encryption key for sensitive values
    this.encryptionKey = this.loadOrGenerateEncryptionKey();
    this.configPath = process.env.CONFIG_PATH || path.join(process.cwd(), '.env.encrypted');
  }

  public static getInstance(): SecureConfigManager {
    if (!SecureConfigManager.instance) {
      SecureConfigManager.instance = new SecureConfigManager();
    }
    return SecureConfigManager.instance;
  }

  /**
   * Load configuration from environment variables
   */
  public loadConfig(): SecureConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // Load from environment variables with validation
      const rawConfig = {
        server: {
          port: parseInt(process.env.PORT || '3000', 10),
          host: process.env.HOST || '0.0.0.0',
          environment: (process.env.NODE_ENV || 'production') as any,
          trustProxy: process.env.TRUST_PROXY === 'true',
        },
        database: {
          type: (process.env.DB_TYPE || 'postgres') as any,
          host: this.requireEnv('DB_HOST'),
          port: parseInt(this.requireEnv('DB_PORT'), 10),
          database: this.requireEnv('DB_NAME'),
          username: this.requireEnv('DB_USER'),
          password: this.decryptIfNeeded(this.requireEnv('DB_PASSWORD')),
          ssl: {
            enabled: process.env.DB_SSL !== 'false',
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
            ca: process.env.DB_SSL_CA,
            cert: process.env.DB_SSL_CERT,
            key: process.env.DB_SSL_KEY,
          },
          pool: {
            min: parseInt(process.env.DB_POOL_MIN || '2', 10),
            max: parseInt(process.env.DB_POOL_MAX || '10', 10),
            idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
          },
        },
        jwt: {
          algorithm: (process.env.JWT_ALGORITHM || 'RS256') as any,
          accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
          refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
          issuer: this.requireEnv('JWT_ISSUER'),
          audience: (process.env.JWT_AUDIENCE || '').split(',').filter(Boolean),
          clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '30', 10),
          privateKey: this.loadKey('JWT_PRIVATE_KEY'),
          publicKey: this.loadKey('JWT_PUBLIC_KEY'),
        },
        security: {
          bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
          maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
          lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '15', 10),
          passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10),
          passwordMaxLength: parseInt(process.env.PASSWORD_MAX_LENGTH || '128', 10),
          passwordHistory: parseInt(process.env.PASSWORD_HISTORY || '5', 10),
          sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000', 10),
          requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
          requireTwoFactor: process.env.REQUIRE_TWO_FACTOR === 'true',
          allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
          csrfSecret: this.generateOrLoadSecret('CSRF_SECRET', 64),
        },
        rateLimit: {
          login: {
            windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW || '900000', 10),
            max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
          },
          register: {
            windowMs: parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW || '3600000', 10),
            max: parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '3', 10),
          },
          api: {
            windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW || '60000', 10),
            max: parseInt(process.env.RATE_LIMIT_API_MAX || '100', 10),
          },
          passwordReset: {
            windowMs: parseInt(process.env.RATE_LIMIT_RESET_WINDOW || '3600000', 10),
            max: parseInt(process.env.RATE_LIMIT_RESET_MAX || '3', 10),
          },
        },
        email: {
          enabled: process.env.EMAIL_ENABLED === 'true',
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined,
          secure: process.env.EMAIL_SECURE !== 'false',
          auth: process.env.EMAIL_USER ? {
            user: process.env.EMAIL_USER,
            pass: this.decryptIfNeeded(process.env.EMAIL_PASS || ''),
          } : undefined,
          from: process.env.EMAIL_FROM,
        },
        logging: {
          level: (process.env.LOG_LEVEL || 'info') as any,
          format: (process.env.LOG_FORMAT || 'json') as any,
          auditLog: process.env.AUDIT_LOG !== 'false',
          securityLog: process.env.SECURITY_LOG !== 'false',
          errorTracking: {
            enabled: process.env.ERROR_TRACKING_ENABLED === 'true',
            dsn: process.env.SENTRY_DSN,
          },
        },
        ssl: {
          enabled: process.env.SSL_ENABLED !== 'false',
          cert: process.env.SSL_CERT_PATH ? fs.readFileSync(process.env.SSL_CERT_PATH, 'utf8') : undefined,
          key: process.env.SSL_KEY_PATH ? fs.readFileSync(process.env.SSL_KEY_PATH, 'utf8') : undefined,
          ca: process.env.SSL_CA_PATH ? fs.readFileSync(process.env.SSL_CA_PATH, 'utf8') : undefined,
          minVersion: (process.env.SSL_MIN_VERSION || 'TLSv1.2') as any,
          ciphers: process.env.SSL_CIPHERS,
        },
        session: {
          secret: this.generateOrLoadSecret('SESSION_SECRET', 64),
          name: process.env.SESSION_NAME || 'sid',
          resave: process.env.SESSION_RESAVE === 'true',
          saveUninitialized: process.env.SESSION_SAVE_UNINITIALIZED === 'true',
          cookie: {
            secure: process.env.SESSION_COOKIE_SECURE !== 'false',
            httpOnly: process.env.SESSION_COOKIE_HTTP_ONLY !== 'false',
            maxAge: parseInt(process.env.SESSION_COOKIE_MAX_AGE || '3600000', 10),
            sameSite: (process.env.SESSION_COOKIE_SAME_SITE || 'strict') as any,
            domain: process.env.SESSION_COOKIE_DOMAIN,
          },
        },
      };

      // Validate configuration
      this.config = ConfigSchema.parse(rawConfig);
      
      // Additional security checks
      this.validateSecuritySettings(this.config);

      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Configuration validation failed:', error.errors);
        throw new Error(`Invalid configuration: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Require environment variable or throw error
   */
  private requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Load or generate encryption key
   */
  private loadOrGenerateEncryptionKey(): Buffer {
    const keyPath = process.env.ENCRYPTION_KEY_PATH || path.join(process.cwd(), '.encryption.key');
    
    try {
      if (fs.existsSync(keyPath)) {
        const key = fs.readFileSync(keyPath);
        if (key.length !== 32) {
          throw new Error('Encryption key must be 32 bytes');
        }
        return key;
      }
    } catch (error) {
      console.warn('Failed to load encryption key, generating new one');
    }

    // Generate new key
    const newKey = crypto.randomBytes(32);
    
    // Save key securely (in production, use key management service)
    try {
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save encryption key:', error);
    }

    return newKey;
  }

  /**
   * Decrypt value if it's encrypted
   */
  private decryptIfNeeded(value: string): string {
    if (!value.startsWith('encrypted:')) {
      return value;
    }

    try {
      const encrypted = value.substring('encrypted:'.length);
      const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
      
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encryptedData = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt configuration value');
    }
  }

  /**
   * Encrypt sensitive value
   */
  public encryptValue(value: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Load RSA key from file or environment
   */
  private loadKey(envVar: string): string {
    const keyPath = process.env[`${envVar}_PATH`];
    if (keyPath && fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8');
    }

    const keyValue = process.env[envVar];
    if (keyValue) {
      // Handle base64 encoded keys
      if (keyValue.includes('BEGIN')) {
        return keyValue;
      }
      return Buffer.from(keyValue, 'base64').toString('utf8');
    }

    // Generate RSA key pair if not provided (development only)
    if (process.env.NODE_ENV === 'development') {
      console.warn(`${envVar} not provided, generating temporary key pair for development`);
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });
      return envVar.includes('PRIVATE') ? privateKey : publicKey;
    }

    throw new Error(`Required key ${envVar} is not configured`);
  }

  /**
   * Generate or load a secret
   */
  private generateOrLoadSecret(envVar: string, length: number): string {
    const value = process.env[envVar];
    if (value && value.length >= length) {
      return value;
    }

    // Generate secure random secret
    const secret = crypto.randomBytes(length).toString('hex');
    
    // Log warning in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`${envVar} not set or too short, using generated value: ${secret.substring(0, 10)}...`);
    } else {
      throw new Error(`${envVar} must be set and at least ${length} characters long`);
    }

    return secret;
  }

  /**
   * Validate security settings
   */
  private validateSecuritySettings(config: SecureConfig): void {
    // Ensure production has proper security settings
    if (config.server.environment === 'production') {
      if (!config.ssl.enabled) {
        throw new Error('SSL must be enabled in production');
      }
      if (!config.security.requireEmailVerification) {
        console.warn('Email verification should be enabled in production');
      }
      if (config.security.bcryptRounds < 12) {
        throw new Error('BCrypt rounds must be at least 12 in production');
      }
      if (!config.session.cookie.secure) {
        throw new Error('Secure cookies must be enabled in production');
      }
      if (config.session.cookie.sameSite !== 'strict') {
        console.warn('SameSite=strict is recommended for production');
      }
    }

    // Validate JWT configuration
    if (!['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'].includes(config.jwt.algorithm)) {
      throw new Error('JWT must use asymmetric algorithm (RS256, RS384, RS512, ES256, ES384, or ES512)');
    }

    // Validate allowed origins
    if (config.security.allowedOrigins.length === 0 && config.server.environment === 'production') {
      throw new Error('Allowed origins must be configured in production');
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): SecureConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }

  /**
   * Reload configuration
   */
  public reloadConfig(): void {
    this.config = null;
    this.loadConfig();
  }

  /**
   * Get sanitized configuration for logging (removes sensitive values)
   */
  public getSanitizedConfig(): any {
    const config = this.getConfig();
    const sanitized = JSON.parse(JSON.stringify(config));

    // Remove sensitive values
    delete sanitized.database.password;
    delete sanitized.jwt.privateKey;
    delete sanitized.jwt.publicKey;
    delete sanitized.security.csrfSecret;
    delete sanitized.session.secret;
    delete sanitized.email.auth;
    delete sanitized.ssl.key;
    delete sanitized.ssl.cert;

    return sanitized;
  }
}

// Export singleton instance
export const configManager = SecureConfigManager.getInstance();