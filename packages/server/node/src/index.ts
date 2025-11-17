import express, { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { DatabaseConfig, createDatabaseStorage } from './storage/DatabaseStorage';
import { SecureAuthHandler, UserData, SecurityConfig, EmailConfig } from './auth/secure-auth-handler';
import { SecureJWTAuth, JWTConfig } from './auth/secure-jwt';
import { ServerCSRFValidation, createCSRFProtection } from './middleware/csrf-validation';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import multer from 'multer';
import sharp from 'sharp';
import { createServer } from 'https';
import { readFileSync } from 'fs';

export interface ProductionServerConfig {
  // Server configuration
  port?: number;
  host?: string;
  environment?: 'development' | 'production' | 'staging';
  
  // HTTPS configuration
  https?: {
    enabled: boolean;
    cert?: string;
    key?: string;
    certPath?: string;
    keyPath?: string;
  };
  
  // Storage configuration
  storage?: 'memory' | 'file' | 'database' | StorageAdapter;
  storagePath?: string;
  databaseConfig?: DatabaseConfig;
  
  // Authentication & Security
  jwt: JWTConfig;
  security: SecurityConfig;
  emailConfig?: EmailConfig;
  
  // CSRF Protection
  csrf: {
    enabled: boolean;
    secretKey?: string;
    excludePaths?: string[];
    excludeMethods?: string[];
  };
  
  // CORS configuration
  cors?: {
    enabled: boolean;
    origins?: string[];
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
  };
  
  // Rate limiting
  rateLimit?: {
    enabled: boolean;
    windowMs?: number;
    max?: number;
    message?: string;
    skipSuccessfulRequests?: boolean;
  };
  
  // Health check configuration
  healthCheck?: {
    enabled?: boolean;
    endpoint?: string;
    includeSystemInfo?: boolean;
    includeStorageInfo?: boolean;
    includeDependencies?: boolean;
    customChecks?: Array<() => Promise<HealthCheckResult>>;
  };
  
  // Logging and monitoring
  logging?: {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'text';
    destination?: string;
  };
  
  // Compression
  compression?: {
    enabled: boolean;
    level?: number;
    threshold?: string;
  };
  
  // File upload limits
  fileUpload?: {
    maxSize: number;
    maxFiles: number;
    allowedTypes: string[];
    uploadPath?: string;
  };
  
  // Request body limits
  bodyLimit?: {
    json: string;
    urlencoded: string;
  };
  
  // Hooks
  beforeSave?: (data: SaveData) => SaveData | Promise<SaveData>;
  afterSave?: (data: SaveData, result: any) => void | Promise<void>;
  onError?: (error: Error, req: Request) => void;
}

export interface SightEditHandlerOptions {
  storage?: 'memory' | 'file' | 'database' | StorageAdapter;
  storagePath?: string;
  databaseConfig?: DatabaseConfig;
  auth?: (req: Request) => boolean | Promise<boolean>;
  beforeSave?: (data: SaveData) => SaveData | Promise<SaveData>;
  afterSave?: (data: SaveData, result: any) => void | Promise<void>;
  cors?: boolean | CorsOptions;
  rateLimit?: RateLimitOptions;
  healthCheck?: HealthCheckOptions;
}

export interface HealthCheckOptions {
  enabled?: boolean;
  endpoint?: string;
  includeSystemInfo?: boolean;
  includeStorageInfo?: boolean;
  includeDependencies?: boolean;
  customChecks?: Array<() => Promise<HealthCheckResult>>;
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheckResult[];
  system?: {
    platform: string;
    arch: string;
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    loadAverage: number[];
    freeMemory: number;
    totalMemory: number;
  };
  storage?: {
    type: string;
    connected: boolean;
    responseTime: number;
    details?: Record<string, any>;
  };
  dependencies?: HealthCheckResult[];
}

export interface SaveData {
  sight: string;
  value: any;
  id?: string;
  type: string;
  context?: Record<string, any>;
  timestamp?: number;
}

export interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  data: SaveData;
}

export interface StorageAdapter {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
}

class MemoryStorage implements StorageAdapter {
  private data = new Map<string, any>();

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.data.keys());
    if (prefix) {
      return keys.filter(key => key.startsWith(prefix));
    }
    return keys;
  }
}

/**
 * Secure file storage implementation with path injection protection
 */
class FileStorage implements StorageAdapter {
  private fs: any;
  private readonly basePath: string;
  private readonly MAX_KEY_LENGTH = 200;
  private readonly ALLOWED_KEY_PATTERN = /^[a-zA-Z0-9_:.-]+$/;
  
  constructor(basePath: string) {
    // Validate and normalize base path
    this.basePath = path.resolve(basePath);
    
    // Security check - ensure base path is not sensitive system directory
    if (this.isSystemPath(this.basePath)) {
      throw new Error('Storage path cannot be in system directories');
    }
    
    // Dynamic imports to avoid bundling issues
    this.fs = require('fs').promises;
    this.ensureDirectory();
  }
  
  /**
   * Checks if path is a sensitive system directory
   */
  private isSystemPath(dirPath: string): boolean {
    const normalizedPath = path.normalize(dirPath).toLowerCase();
    const systemPaths = [
      '/etc', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/sys', '/proc',
      'c:\\windows', 'c:\\program files', 'c:\\program files (x86)',
      '/system', '/library', '/applications'
    ];
    
    return systemPaths.some(sysPath => 
      normalizedPath.startsWith(sysPath) || 
      normalizedPath.includes(sysPath)
    );
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await this.fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  /**
   * Comprehensive key sanitization with security validation
   */
  private sanitizeKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }
    
    // Length validation
    if (key.length > this.MAX_KEY_LENGTH) {
      throw new Error(`Key too long: maximum ${this.MAX_KEY_LENGTH} characters`);
    }
    
    // Pattern validation
    if (!this.ALLOWED_KEY_PATTERN.test(key)) {
      throw new Error('Key contains invalid characters. Use only alphanumeric, underscore, colon, dot, and hyphen.');
    }
    
    // Path traversal protection
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new Error('Key cannot contain path traversal sequences');
    }
    
    // Additional security checks
    const lowerKey = key.toLowerCase();
    const dangerousPatterns = [
      'con', 'prn', 'aux', 'nul', // Windows reserved names
      'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
      'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
    ];
    
    if (dangerousPatterns.some(pattern => lowerKey === pattern || lowerKey.startsWith(pattern + '.'))) {
      throw new Error('Key uses reserved system name');
    }
    
    return key;
  }

  /**
   * Generate secure file path with validation
   */
  private getFilePath(key: string): string {
    const sanitized = this.sanitizeKey(key);
    const fileName = `${sanitized}.json`;
    const fullPath = path.join(this.basePath, fileName);
    
    // Security validation - ensure resolved path is within base directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBasePath = path.resolve(this.basePath);
    
    if (!resolvedPath.startsWith(resolvedBasePath + path.sep) && resolvedPath !== resolvedBasePath) {
      throw new Error('Path traversal attempt detected');
    }
    
    return fullPath;
  }

  async get(key: string): Promise<any> {
    try {
      const filePath = this.getFilePath(key);
      
      // Additional security check - verify file is within allowed directory
      await this.validateFileAccess(filePath);
      
      const data = await this.fs.readFile(filePath, 'utf8');
      
      // Validate JSON before parsing
      const parsed = JSON.parse(data);
      
      // Basic structure validation
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
      
      throw new Error('Invalid data format in storage file');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      if (error.name === 'SyntaxError') {
        throw new Error('Corrupted data file detected');
      }
      throw error;
    }
  }

  async set(key: string, value: any): Promise<void> {
    const filePath = this.getFilePath(key);
    
    // Security validation
    await this.validateFileAccess(filePath);
    
    // Validate and sanitize data before storage
    const sanitizedValue = this.sanitizeValue(value);
    const data = JSON.stringify(sanitizedValue, null, 2);
    
    // Size limit check (prevent disk space exhaustion)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (Buffer.byteLength(data, 'utf8') > maxFileSize) {
      throw new Error('Data too large for storage');
    }
    
    // Write to temporary file first, then atomically move
    const tempPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    
    try {
      await this.fs.writeFile(tempPath, data, 'utf8');
      await this.fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await this.fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      
      // Security validation
      await this.validateFileAccess(filePath);
      
      await this.fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      const files = await this.fs.readdir(this.basePath);
      const jsonFiles = files
        .filter((file: string) => {
          // Additional security check - ensure file name is safe
          return file.endsWith('.json') && 
                 this.ALLOWED_KEY_PATTERN.test(file.slice(0, -5)) &&
                 !file.includes('..');
        })
        .map((file: string) => file.slice(0, -5)); // Remove .json extension
      
      if (prefix) {
        try {
          const sanitizedPrefix = this.sanitizeKey(prefix);
          return jsonFiles.filter((file: string) => file.startsWith(sanitizedPrefix));
        } catch (error) {
          console.warn('Invalid prefix provided to list operation:', error);
          return [];
        }
      }
      
      return jsonFiles;
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }
  
  /**
   * Validates file access is within allowed boundaries
   */
  private async validateFileAccess(filePath: string): Promise<void> {
    // Use realpath to resolve symlinks and get actual path
    let resolvedPath: string;
    try {
      resolvedPath = await this.fs.realpath(filePath);
    } catch (error) {
      // File doesn't exist yet (new file) - use resolve instead
      resolvedPath = path.resolve(filePath);
    }

    const resolvedBasePath = await this.fs.realpath(this.basePath);

    // Ensure path is within base directory with proper separator check
    const normalizedPath = resolvedPath + path.sep;
    const normalizedBase = resolvedBasePath + path.sep;

    if (!normalizedPath.startsWith(normalizedBase) && resolvedPath !== resolvedBasePath) {
      throw new Error('File access denied: path outside storage directory');
    }

    // Additional check - ensure we're not accessing hidden/system files
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.')) {
      throw new Error('Access to hidden files not allowed');
    }
  }
  
  /**
   * Sanitizes value object to prevent injection attacks
   */
  private sanitizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === 'string') {
      // Remove potentially dangerous script content
      return value
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, ''); // Remove event handlers
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }
    
    if (typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitize object keys
        const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        sanitized[cleanKey] = this.sanitizeValue(val);
      }
      return sanitized;
    }
    
    return value;
  }
}

/**
 * Create a production-ready SightEdit server
 * Integrates all security, performance, and monitoring components
 */
export class ProductionSightEditServer {
  private app: Express;
  private server: any;
  private config: ProductionServerConfig;
  private jwtAuth: SecureJWTAuth;
  private authHandler: SecureAuthHandler;
  private csrf: any;
  private storage: StorageAdapter;
  private metrics: SystemMetrics;
  
  constructor(config: ProductionServerConfig) {
    this.config = this.validateAndMergeConfig(config);
    this.app = express();
    this.metrics = SystemMetrics.getInstance();
    
    // Initialize authentication
    this.jwtAuth = new SecureJWTAuth(this.config.jwt);
    this.authHandler = new SecureAuthHandler(
      this.jwtAuth,
      this.config.security,
      this.config.emailConfig
    );
    
    // Initialize CSRF protection
    this.csrf = createCSRFProtection({
      secretKey: this.config.csrf.secretKey,
      excludePaths: this.config.csrf.excludePaths,
      excludeMethods: this.config.csrf.excludeMethods
    });
    
    // Initialize storage
    this.storage = this.createStorage();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }
  
  private validateAndMergeConfig(config: ProductionServerConfig): ProductionServerConfig {
    if (!config.jwt) {
      throw new Error('JWT configuration is required');
    }
    
    if (!config.security) {
      throw new Error('Security configuration is required');
    }
    
    return {
      port: 3000,
      host: '0.0.0.0',
      environment: 'production',
      https: {
        enabled: process.env.NODE_ENV === 'production',
        cert: process.env.HTTPS_CERT,
        key: process.env.HTTPS_KEY,
        certPath: process.env.HTTPS_CERT_PATH || './certs/cert.pem',
        keyPath: process.env.HTTPS_KEY_PATH || './certs/key.pem'
      },
      storage: 'memory',
      csrf: {
        enabled: true,
        excludePaths: ['/health', '/metrics'],
        excludeMethods: ['GET', 'HEAD', 'OPTIONS']
      },
      cors: {
        enabled: true,
        origins: ['http://localhost:3000', 'https://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token']
      },
      rateLimit: {
        enabled: true,
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // requests per window
        skipSuccessfulRequests: true
      },
      healthCheck: {
        enabled: true,
        endpoint: '/health',
        includeSystemInfo: config.environment === 'development',
        includeStorageInfo: true,
        includeDependencies: false
      },
      logging: {
        level: config.environment === 'development' ? 'debug' : 'info',
        format: 'json',
        destination: process.env.LOG_FILE
      },
      compression: {
        enabled: true,
        level: 6,
        threshold: '1kb'
      },
      fileUpload: {
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        allowedTypes: [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav',
          'application/pdf', 'text/plain'
        ],
        uploadPath: config.storagePath || './uploads'
      },
      bodyLimit: {
        json: '10mb',
        urlencoded: '10mb'
      },
      ...config
    };
  }
  
  private setupMiddleware(): void {
    // Request logging and metrics
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      // Log request
      console.log(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      // Track response time
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const isError = res.statusCode >= 400;
        this.metrics.recordRequest(responseTime, isError);
        
        if (this.config.logging?.level === 'debug' || isError) {
          console.log(`${req.method} ${req.path} - ${res.statusCode}`, {
            responseTime: `${responseTime}ms`,
            contentLength: res.get('Content-Length'),
            error: isError
          });
        }
      });
      
      next();
    });
    
    // Security headers with Helmet
    this.app.use(helmet({
      contentSecurityPolicy: false, // We handle CSP ourselves
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: false, // CSP is better
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      }
    }));
    
    // CORS
    if (this.config.cors?.enabled) {
      this.app.use(cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (this.config.cors!.origins!.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'), false);
          }
        },
        credentials: this.config.cors.credentials,
        methods: this.config.cors.methods,
        allowedHeaders: this.config.cors.allowedHeaders
      }));
    }
    
    // Rate limiting
    if (this.config.rateLimit?.enabled) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimit.windowMs!,
        max: this.config.rateLimit.max!,
        message: this.config.rateLimit.message || 'Too many requests',
        skipSuccessfulRequests: this.config.rateLimit.skipSuccessfulRequests,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          this.jwtAuth.logSecurityEvent({
            type: 'rate_limit',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            details: { path: req.path, method: req.method }
          });
          
          res.status(429).json({
            success: false,
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(this.config.rateLimit!.windowMs! / 1000)
          });
        }
      });
      
      this.app.use('/api/', limiter);
    }
    
    // Compression
    if (this.config.compression?.enabled) {
      this.app.use(compression({
        level: this.config.compression.level,
        threshold: this.config.compression.threshold
      }));
    }
    
    // Body parsing
    this.app.use(express.json({ limit: this.config.bodyLimit?.json }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: this.config.bodyLimit?.urlencoded 
    }));
    this.app.use(cookieParser());
    
    // Content Security Policy with nonces
    this.app.use((req, res, next) => {
      applySecurityHeaders(req, res);
      next();
    });
    
    // CSRF Protection (applied after body parsing)
    if (this.config.csrf.enabled) {
      // Token generation endpoint (before validation)
      this.app.get('/api/csrf-token', this.csrf.tokenEndpoint());
      
      // Apply CSRF validation to state-changing requests
      this.app.use(this.csrf.validation);
    }
    
    // Authentication middleware setup
    this.app.use('/api/auth/', (req, res, next) => {
      // Skip auth middleware for auth routes
      next();
    });
  }
  
  private setupRoutes(): void {
    // Health check routes
    if (this.config.healthCheck?.enabled) {
      const endpoint = this.config.healthCheck.endpoint || '/health';
      this.app.get(endpoint, (req, res) => handleHealthCheck(req, res, this.storage, {
        healthCheck: this.config.healthCheck
      }));
      this.app.head(endpoint, (req, res) => handleHealthCheckHead(req, res, this.storage, {
        healthCheck: this.config.healthCheck
      }));
    }
    
    // Metrics endpoint
    this.app.get('/metrics', (req, res) => handleMetrics(req, res, this.storage, {}));
    this.app.get('/api/status', (req, res) => handleStatus(req, res, this.storage, {}));
    
    // CSP violation reporting
    this.app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), handleCSPReport);
    this.app.get('/api/csp-stats', handleCSPStats);
    
    // Authentication routes
    this.app.post('/api/auth/register', this.authHandler.register.bind(this.authHandler));
    this.app.post('/api/auth/login', this.authHandler.login.bind(this.authHandler));
    this.app.post('/api/auth/refresh', this.authHandler.refreshTokens.bind(this.authHandler));
    this.app.post('/api/auth/logout', 
      this.authHandler.createAuthMiddleware({ required: true }),
      this.authHandler.logout.bind(this.authHandler)
    );
    this.app.post('/api/auth/forgot-password', this.authHandler.requestPasswordReset.bind(this.authHandler));
    this.app.post('/api/auth/reset-password', this.authHandler.resetPassword.bind(this.authHandler));
    this.app.get('/api/auth/me', 
      this.authHandler.createAuthMiddleware({ required: true }),
      this.authHandler.getCurrentUser.bind(this.authHandler)
    );
    
    // SightEdit API routes with authentication
    const authMiddleware = this.authHandler.createAuthMiddleware({
      required: true,
      permissions: ['write'],
      requireEmailVerified: this.config.security.requireEmailVerification
    });
    
    this.app.post('/api/save', authMiddleware, (req, res) => 
      handleSave(req, res, this.storage, {
        beforeSave: this.config.beforeSave,
        afterSave: this.config.afterSave
      })
    );
    
    this.app.post('/api/batch', authMiddleware, (req, res) => 
      handleBatch(req, res, this.storage, {
        beforeSave: this.config.beforeSave,
        afterSave: this.config.afterSave
      })
    );
    
    this.app.get('/api/schema/:sight', 
      this.authHandler.createAuthMiddleware({ required: true, permissions: ['read'] }),
      (req, res) => handleSchema(req, res, this.storage)
    );
    
    this.app.post('/api/upload',
      authMiddleware,
      this.createUploadMiddleware(),
      (req, res) => handleUpload(req, res, this.storage, {
        storagePath: this.config.fileUpload?.uploadPath,
        afterSave: this.config.afterSave
      })
    );
    
    // Serve uploaded files (with authentication for security)
    this.app.get('/uploads/*', 
      this.authHandler.createAuthMiddleware({ required: true, permissions: ['read'] }),
      (req, res) => {
        const filename = req.path.replace('/uploads/', '');
        const uploadDir = this.config.fileUpload?.uploadPath || './uploads';
        
        // Security: prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
          return res.status(400).json({
            success: false,
            error: 'Invalid file path'
          });
        }
        
        const filepath = path.join(uploadDir, filename);
        res.sendFile(path.resolve(filepath), (err) => {
          if (err) {
            res.status(404).json({
              success: false,
              error: 'File not found'
            });
          }
        });
      }
    );
  }
  
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });
    
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      const statusCode = error.status || error.statusCode || 500;
      const isDevelopment = this.config.environment === 'development';
      
      // Log error
      console.error('Unhandled server error:', {
        error: error.message,
        stack: isDevelopment ? error.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      // Track error metrics
      this.metrics.recordRequest(0, true);
      
      // Log security event for certain errors
      if (statusCode === 401 || statusCode === 403) {
        this.jwtAuth.logSecurityEvent({
          type: 'suspicious_activity',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: {
            error: error.message,
            path: req.path,
            method: req.method,
            statusCode
          }
        });
      }
      
      // Call user-defined error handler
      if (this.config.onError) {
        try {
          this.config.onError(error, req);
        } catch (handlerError) {
          console.error('Error in user-defined error handler:', handlerError);
        }
      }
      
      // Send error response
      res.status(statusCode).json({
        success: false,
        error: isDevelopment ? error.message : 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        ...(isDevelopment && { stack: error.stack })
      });
    });
  }
  
  private createStorage(): StorageAdapter {
    if (typeof this.config.storage === 'object' && this.config.storage !== null) {
      return this.config.storage;
    }
    
    switch (this.config.storage) {
      case 'file':
        return new FileStorage(this.config.storagePath || './sightedit-data');
      case 'database':
        if (!this.config.databaseConfig) {
          throw new Error('Database storage requires databaseConfig option');
        }
        return createDatabaseStorage(this.config.databaseConfig);
      case 'memory':
      default:
        return new MemoryStorage();
    }
  }
  
  private createUploadMiddleware() {
    const uploadStorage = multer.memoryStorage();
    
    return multer({
      storage: uploadStorage,
      limits: {
        fileSize: this.config.fileUpload!.maxSize,
        files: this.config.fileUpload!.maxFiles
      },
      fileFilter: (req, file, cb) => {
        if (this.config.fileUpload!.allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed`));
        }
      }
    }).array('files', this.config.fileUpload!.maxFiles);
  }
  
  /**
   * Start the server
   */
  async start(): Promise<void> {
    const port = this.config.port!;
    const host = this.config.host!;
    
    try {
      if (this.config.https?.enabled) {
        // HTTPS server
        let cert: string, key: string;
        
        if (this.config.https.cert && this.config.https.key) {
          cert = this.config.https.cert;
          key = this.config.https.key;
        } else {
          cert = readFileSync(this.config.https.certPath!, 'utf8');
          key = readFileSync(this.config.https.keyPath!, 'utf8');
        }
        
        this.server = createServer({ cert, key }, this.app);
      } else {
        // HTTP server
        this.server = this.app;
      }
      
      await new Promise<void>((resolve, reject) => {
        this.server.listen(port, host, () => {
          const protocol = this.config.https?.enabled ? 'https' : 'http';
          console.log(`SightEdit Production Server started`);
          console.log(`🚀 Server running at ${protocol}://${host}:${port}`);
          console.log(`📊 Health check: ${protocol}://${host}:${port}${this.config.healthCheck?.endpoint || '/health'}`);
          console.log(`📈 Metrics: ${protocol}://${host}:${port}/metrics`);
          console.log(`🔒 Environment: ${this.config.environment}`);
          console.log(`💾 Storage: ${this.config.storage}`);
          resolve();
        });
        
        this.server.on('error', reject);
      });
      
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }
  
  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          console.log('Server stopped gracefully');
          resolve();
        });
      });
    }
  }
  
  /**
   * Get the Express app instance
   */
  getApp(): Express {
    return this.app;
  }
  
  /**
   * Get server metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }
}

export function sightEditHandler(options: SightEditHandlerOptions = {}): RequestHandler {
  const storage = createStorage(options);
  const rateLimitMap = new Map<string, number[]>();
  const metrics = SystemMetrics.getInstance();

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let isError = false;
    
    // Add response time tracking
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      isError = res.statusCode >= 400;
      metrics.recordRequest(responseTime, isError);
    });
    
    try {
      // CORS handling
      if (options.cors) {
        applyCors(req, res, options.cors);
      }

      // Content Security Policy headers with nonce
      applySecurityHeaders(req, res);

      // Handle preflight
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }

      // Rate limiting
      if (options.rateLimit && !checkRateLimit(req, rateLimitMap, options.rateLimit)) {
        return res.status(429).json({
          success: false,
          error: options.rateLimit.message || 'Too many requests'
        });
      }

      // Serve static uploaded files
      if (path.startsWith('/uploads/') && req.method === 'GET') {
        const uploadDir = options.storagePath || './uploads';
        const filename = path.replace('/uploads/', '');
        
        // Security: prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
          return res.status(400).json({
            success: false,
            error: 'Invalid file path'
          });
        }
        
        const filepath = path.join(uploadDir, filename);
        
        try {
          const stats = await fs.stat(filepath);
          if (!stats.isFile()) {
            throw new Error('Not a file');
          }
          
          const fileContent = await fs.readFile(filepath);
          const mimeType = getMimeType(filename);
          
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Length', stats.size.toString());
          res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
          res.send(fileContent);
          return;
        } catch (error) {
          return res.status(404).json({
            success: false,
            error: 'File not found'
          });
        }
      }

      // Authentication
      if (options.auth) {
        const authorized = await options.auth(req);
        if (!authorized) {
          return res.status(401).json({
            success: false,
            error: 'Unauthorized'
          });
        }
      }

      // Route handling
      const path = req.path || req.url;
      
      // Handle CSP violation reports
      if (path === '/api/csp-report' && req.method === 'POST') {
        await handleCSPReport(req, res);
      } else if (path === '/api/csp-stats' && req.method === 'GET') {
        await handleCSPStats(req, res);
      } else if (path === '/save' && req.method === 'POST') {
        await handleSave(req, res, storage, options);
      } else if (path === '/batch' && req.method === 'POST') {
        await handleBatch(req, res, storage, options);
      } else if (path.startsWith('/schema/') && req.method === 'GET') {
        await handleSchema(req, res, storage);
      } else if (path === '/upload' && req.method === 'POST') {
        await handleUpload(req, res, storage, options);
      } else if (path === '/health' && req.method === 'GET') {
        await handleHealthCheck(req, res, storage, options);
      } else if (path === '/health' && req.method === 'HEAD') {
        await handleHealthCheckHead(req, res, storage, options);
      } else if (path === '/metrics' && req.method === 'GET') {
        await handleMetrics(req, res, storage, options);
      } else if (path === '/status' && req.method === 'GET') {
        await handleStatus(req, res, storage, options);
      } else {
        res.status(404).json({
          success: false,
          error: 'Not found'
        });
      }
    } catch (error) {
      console.error('SightEdit handler error:', error);
      const responseTime = Date.now() - startTime;
      metrics.recordRequest(responseTime, true);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}

async function handleSave(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  let data: SaveData = req.body;
  
  // Input validation and sanitization
  if (!data || typeof data !== 'object') {
    res.status(400).json({
      success: false,
      error: 'Invalid request body'
    });
    return;
  }
  
  if (!data.sight || typeof data.sight !== 'string' || data.value === undefined) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: sight and value'
    });
    return;
  }
  
  // Validate sight identifier format to prevent injection
  if (!isValidSightIdentifier(data.sight)) {
    res.status(400).json({
      success: false,
      error: 'Invalid sight identifier format'
    });
    return;
  }
  
  // Sanitize input data
  data = sanitizeInputData(data);

  if (options.beforeSave) {
    data = await options.beforeSave(data);
  }

  data.timestamp = Date.now();
  
  const key = generateKey(data);
  await storage.set(key, data);

  if (options.afterSave) {
    await options.afterSave(data, { key });
  }

  res.json({
    success: true,
    data: data.value,
    version: data.timestamp
  });
}

async function handleBatch(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  const { operations } = req.body;
  
  if (!Array.isArray(operations)) {
    res.status(400).json({
      success: false,
      error: 'Operations must be an array'
    });
    return;
  }

  const results = [];
  
  for (const operation of operations) {
    try {
      const key = generateKey(operation.data);
      
      switch (operation.type) {
        case 'create':
        case 'update':
          await storage.set(key, operation.data);
          results.push({ success: true });
          break;
        case 'delete':
          await storage.delete(key);
          results.push({ success: true });
          break;
        default:
          results.push({ success: false, error: 'Invalid operation type' });
      }
    } catch (error) {
      results.push({ success: false, error: String(error) });
    }
  }

  res.json({
    success: true,
    results
  });
}

async function handleSchema(
  req: Request,
  res: Response,
  storage: StorageAdapter
): Promise<void> {
  const urlPath = req.path || req.url || '';
  
  // Extract and validate sight parameter from URL
  const sight = extractSightFromPath(urlPath);
  
  if (!sight || !isValidSightIdentifier(sight)) {
    res.status(400).json({
      success: false,
      error: 'Invalid sight identifier'
    });
    return;
  }
  
  try {
    // Try to get stored schema first
    const schemaKey = `_schema:${sight}`;
    const storedSchema = await storage.get(schemaKey);
  
    if (storedSchema) {
      res.json(storedSchema);
      return;
    }
    
    // Return default schema
    res.json({
      type: 'text',
      label: sight,
      placeholder: `Enter ${sight}`
    });
  } catch (error) {
    console.error('Error handling schema request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve schema'
    });
  }
}

/**
 * Multer configuration for file uploads
 */
const uploadStorage = multer.memoryStorage();

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

async function handleUpload(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  // Use multer to handle multipart/form-data
  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: 'File too large. Maximum size is 10MB'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: 'Too many files. Maximum is 10 files per request'
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        error: err.message || 'Upload failed'
      });
    }

    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      const uploadResults = [];
      const uploadDir = options.storagePath || './uploads';
      
      // Ensure upload directory exists
      await fs.mkdir(uploadDir, { recursive: true });

      for (const file of files) {
        try {
          // Generate unique filename
          const timestamp = Date.now();
          const random = crypto.randomBytes(8).toString('hex');
          const extension = path.extname(file.originalname);
          const filename = `${timestamp}-${random}${extension}`;
          const filepath = path.join(uploadDir, filename);

          // Process images
          if (file.mimetype.startsWith('image/')) {
            // Resize and optimize images
            const imageBuffer = await processImage(file.buffer, file.mimetype);
            
            // Save processed image
            await fs.writeFile(filepath, imageBuffer);
            
            // Generate thumbnail
            const thumbnailFilename = `${timestamp}-${random}-thumb${extension}`;
            const thumbnailPath = path.join(uploadDir, thumbnailFilename);
            const thumbnailBuffer = await sharp(file.buffer)
              .resize(200, 200, { fit: 'cover' })
              .toBuffer();
            await fs.writeFile(thumbnailPath, thumbnailBuffer);

            // Get image metadata
            const metadata = await sharp(imageBuffer).metadata();

            uploadResults.push({
              success: true,
              originalName: file.originalname,
              filename: filename,
              thumbnailFilename: thumbnailFilename,
              url: `/uploads/${filename}`,
              thumbnailUrl: `/uploads/${thumbnailFilename}`,
              mimetype: file.mimetype,
              size: file.size,
              width: metadata.width,
              height: metadata.height,
              format: metadata.format
            });
          } else {
            // Save non-image files directly
            await fs.writeFile(filepath, file.buffer);
            
            uploadResults.push({
              success: true,
              originalName: file.originalname,
              filename: filename,
              url: `/uploads/${filename}`,
              mimetype: file.mimetype,
              size: file.size
            });
          }

          // Store file metadata in storage
          await storage.set(`file:${filename}`, {
            originalName: file.originalname,
            filename: filename,
            mimetype: file.mimetype,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            uploadedBy: (req as any).user?.id || 'anonymous'
          });

        } catch (fileError) {
          uploadResults.push({
            success: false,
            originalName: file.originalname,
            error: `Failed to process ${file.originalname}: ${fileError}`
          });
        }
      }

      res.json({
        success: true,
        files: uploadResults
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during upload'
      });
    }
  });
}

/**
 * Process and optimize images
 */
/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

async function processImage(buffer: Buffer, mimetype: string): Promise<Buffer> {
  let processor = sharp(buffer);
  
  // Auto-rotate based on EXIF data
  processor = processor.rotate();
  
  // Convert to appropriate format and optimize
  switch (mimetype) {
    case 'image/jpeg':
      processor = processor.jpeg({ 
        quality: 85, 
        progressive: true,
        mozjpeg: true 
      });
      break;
    case 'image/png':
      processor = processor.png({ 
        quality: 85,
        compressionLevel: 9,
        adaptiveFiltering: true
      });
      break;
    case 'image/webp':
      processor = processor.webp({ 
        quality: 85,
        lossless: false
      });
      break;
    case 'image/gif':
      // Keep GIF as is (animated GIFs)
      return buffer;
    default:
      // Convert to JPEG for unknown formats
      processor = processor.jpeg({ quality: 85 });
  }
  
  // Resize if too large (max 2000px on longest side)
  const metadata = await processor.metadata();
  if (metadata.width && metadata.height) {
    const maxDimension = Math.max(metadata.width, metadata.height);
    if (maxDimension > 2000) {
      const scale = 2000 / maxDimension;
      processor = processor.resize(
        Math.round(metadata.width * scale),
        Math.round(metadata.height * scale),
        { fit: 'inside', withoutEnlargement: true }
      );
    }
  }
  
  return processor.toBuffer();
}

function createStorage(options: SightEditHandlerOptions): StorageAdapter {
  if (typeof options.storage === 'object' && options.storage !== null) {
    return options.storage;
  }
  
  switch (options.storage) {
    case 'file':
      return new FileStorage(options.storagePath || './sightedit-data');
    case 'database':
      if (!options.databaseConfig) {
        throw new Error('Database storage requires databaseConfig option');
      }
      return createDatabaseStorage(options.databaseConfig);
    case 'memory':
    default:
      return new MemoryStorage();
  }
}

function generateKey(data: SaveData): string {
  const parts = [data.sight];
  
  if (data.context?.recordId) {
    parts.push(data.context.recordId);
  }
  
  if (data.id) {
    parts.push(data.id);
  }
  
  return parts.join(':');
}

/**
 * Validates sight identifier format for security
 */
function isValidSightIdentifier(sight: string): boolean {
  if (!sight || typeof sight !== 'string') {
    return false;
  }
  
  // Length check
  if (sight.length === 0 || sight.length > 100) {
    return false;
  }
  
  // Format validation - allow alphanumeric, underscore, hyphen, dot
  const validPattern = /^[a-zA-Z0-9_.-]+$/;
  if (!validPattern.test(sight)) {
    return false;
  }
  
  // Path traversal protection
  if (sight.includes('..') || sight.includes('/') || sight.includes('\\')) {
    return false;
  }
  
  // Reserved name protection
  const reservedNames = ['con', 'prn', 'aux', 'nul', 'admin', 'root', 'system'];
  const lowerSight = sight.toLowerCase();
  if (reservedNames.some(name => lowerSight === name || lowerSight.startsWith(name + '.'))) {
    return false;
  }
  
  return true;
}

/**
 * Extracts sight identifier from URL path safely
 */
function extractSightFromPath(urlPath: string): string | null {
  if (!urlPath || typeof urlPath !== 'string') {
    return null;
  }
  
  // Remove query string and fragments
  const cleanPath = urlPath.split('?')[0].split('#')[0];
  
  // Extract sight from /schema/{sight} pattern
  const match = cleanPath.match(/^\/schema\/([^/]+)$/);
  if (!match) {
    return null;
  }
  
  const sight = decodeURIComponent(match[1]);
  
  // Additional validation
  if (sight.length > 100) {
    return null;
  }
  
  return sight;
}

/**
 * Sanitizes input data to prevent injection attacks
 */
function sanitizeInputData(data: SaveData): SaveData {
  const sanitized: SaveData = {
    sight: data.sight.trim(),
    value: sanitizeValue(data.value),
    type: data.type || 'text',
    timestamp: data.timestamp
  };
  
  // Sanitize optional fields
  if (data.id) {
    sanitized.id = data.id.trim();
  }
  
  if (data.context && typeof data.context === 'object') {
    sanitized.context = sanitizeContext(data.context);
  }
  
  return sanitized;
}

/**
 * Sanitizes values to prevent script injection
 */
function sanitizeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === 'string') {
    return value
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }
  
  if (typeof value === 'object') {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(value)) {
      const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (cleanKey.length > 0 && cleanKey.length <= 50) {
        sanitized[cleanKey] = sanitizeValue(val);
      }
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Sanitizes context object
 */
function sanitizeContext(context: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(context)) {
    const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (cleanKey.length > 0 && cleanKey.length <= 50) {
      sanitized[cleanKey] = sanitizeValue(value);
    }
  }
  
  return sanitized;
}

function applyCors(req: Request, res: Response, cors: boolean | CorsOptions): void {
  if (cors === true) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-SightEdit-Version');
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (typeof cors === 'object') {
    const origin = req.headers.origin;
    
    if (cors.origin) {
      if (typeof cors.origin === 'string') {
        res.header('Access-Control-Allow-Origin', cors.origin);
      } else if (Array.isArray(cors.origin) && origin && cors.origin.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      } else if (typeof cors.origin === 'function' && origin && cors.origin(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }
    }
    
    if (cors.methods) {
      res.header('Access-Control-Allow-Methods', cors.methods.join(', '));
    }
    
    if (cors.allowedHeaders) {
      res.header('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
    }
    
    if (cors.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
}

/**
 * CSP Nonce Manager for secure content policy
 */
class CSPNonceManager {
  private static instance: CSPNonceManager;
  private nonceCache = new Map<string, { nonce: string; timestamp: number }>();
  private readonly NONCE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly NONCE_LENGTH = 32;

  static getInstance(): CSPNonceManager {
    if (!this.instance) {
      this.instance = new CSPNonceManager();
    }
    return this.instance;
  }

  generateNonce(): string {
    const nonce = crypto.randomBytes(this.NONCE_LENGTH).toString('base64')
      .replace(/[+/]/g, '')
      .replace(/=/g, '')
      .substring(0, 32);
    return nonce;
  }

  getNonceForRequest(requestId: string): string {
    // Clean up expired nonces
    this.cleanupExpiredNonces();

    // Check cache
    const cached = this.nonceCache.get(requestId);
    if (cached && Date.now() - cached.timestamp < this.NONCE_TTL) {
      return cached.nonce;
    }

    // Generate new nonce
    const nonce = this.generateNonce();
    this.nonceCache.set(requestId, { nonce, timestamp: Date.now() });
    return nonce;
  }

  private cleanupExpiredNonces(): void {
    const now = Date.now();
    for (const [key, value] of this.nonceCache.entries()) {
      if (now - value.timestamp > this.NONCE_TTL) {
        this.nonceCache.delete(key);
      }
    }
  }

  validateNonce(requestId: string, nonce: string): boolean {
    const cached = this.nonceCache.get(requestId);
    return cached ? cached.nonce === nonce : false;
  }
}

/**
 * CSP Violation Reporter
 */
class CSPViolationReporter {
  private violations: any[] = [];
  private readonly MAX_VIOLATIONS = 1000;

  recordViolation(violation: any): void {
    this.violations.push({
      ...violation,
      timestamp: new Date().toISOString(),
      userAgent: violation.userAgent || 'unknown'
    });

    // Limit stored violations
    if (this.violations.length > this.MAX_VIOLATIONS) {
      this.violations = this.violations.slice(-this.MAX_VIOLATIONS);
    }

    // Log critical violations
    console.warn('CSP Violation:', {
      directive: violation['violated-directive'],
      blockedUri: violation['blocked-uri'],
      sourceFile: violation['source-file'],
      lineNumber: violation['line-number']
    });
  }

  getViolations(limit: number = 100): any[] {
    return this.violations.slice(-limit);
  }

  getViolationStats(): any {
    const stats: any = {
      total: this.violations.length,
      byDirective: {},
      bySource: {},
      recent: this.violations.slice(-10)
    };

    this.violations.forEach(v => {
      const directive = v['violated-directive'] || 'unknown';
      stats.byDirective[directive] = (stats.byDirective[directive] || 0) + 1;

      const source = v['blocked-uri'] || 'inline';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    });

    return stats;
  }
}

const cspNonceManager = CSPNonceManager.getInstance();
const cspReporter = new CSPViolationReporter();

/**
 * Generate Content Security Policy with nonces
 */
function generateCSP(req: Request, res: Response): { policy: string; nonce: string } {
  // Generate unique nonce for this request
  const requestId = `${req.ip}-${Date.now()}-${Math.random()}`;
  const nonce = cspNonceManager.getNonceForRequest(requestId);

  // Store nonce in response locals for use in templates
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.cspNonce = nonce;

  // Build CSP directives based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Base directives - very restrictive by default
  const directives: string[] = [];

  // Default source - restrictive
  directives.push("default-src 'self'");

  // Script source - nonce-based with strict-dynamic for modern browsers
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'" // Allows trusted scripts to load other scripts
  ];

  // In development, allow eval for debugging tools (with warning)
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'"); // Only for development!
    console.warn('WARNING: unsafe-eval enabled in development mode. This should NEVER be used in production.');
  }

  // Add trusted CDNs if needed (configure based on your needs)
  if (process.env.TRUSTED_SCRIPT_HOSTS) {
    const trustedHosts = process.env.TRUSTED_SCRIPT_HOSTS.split(',');
    scriptSources.push(...trustedHosts);
  }

  directives.push(`script-src ${scriptSources.join(' ')}`);

  // Style source - nonce-based
  const styleSources = [
    "'self'",
    `'nonce-${nonce}'`
  ];

  // In development, allow inline styles for hot reload
  if (isDevelopment) {
    // Hash-based CSP for specific inline styles if needed
    // styleSources.push("'sha256-xxxxx'"); // Add computed hashes for static inline styles
  }

  // Add trusted style CDNs
  if (process.env.TRUSTED_STYLE_HOSTS) {
    const trustedHosts = process.env.TRUSTED_STYLE_HOSTS.split(',');
    styleSources.push(...trustedHosts);
  }

  directives.push(`style-src ${styleSources.join(' ')}`);

  // Image sources
  directives.push("img-src 'self' data: https: blob:");

  // Font sources
  directives.push("font-src 'self' data: https:");

  // Connect sources (for API calls, WebSockets)
  const connectSources = ["'self'"];
  if (isDevelopment) {
    connectSources.push('ws:', 'wss:', 'http://localhost:*', 'https://localhost:*');
  } else {
    connectSources.push('wss:'); // Only secure WebSockets in production
  }

  if (process.env.API_ENDPOINTS) {
    const apiEndpoints = process.env.API_ENDPOINTS.split(',');
    connectSources.push(...apiEndpoints);
  }

  directives.push(`connect-src ${connectSources.join(' ')}`);

  // Media sources
  directives.push("media-src 'self' blob:");

  // Object/embed sources - none for security
  directives.push("object-src 'none'");

  // Frame sources - none by default
  directives.push("frame-src 'none'");
  directives.push("frame-ancestors 'none'");

  // Child sources (for web workers)
  directives.push("child-src 'self' blob:");

  // Worker sources
  directives.push("worker-src 'self' blob:");

  // Manifest source
  directives.push("manifest-src 'self'");

  // Form action - restrict form submissions
  directives.push("form-action 'self'");

  // Base URI - prevent base tag injection
  directives.push("base-uri 'self'");

  // Upgrade insecure requests in production
  if (isProduction) {
    directives.push('upgrade-insecure-requests');
    directives.push('block-all-mixed-content');
  }

  // Report URI for CSP violations
  const reportUri = process.env.CSP_REPORT_URI || '/api/csp-report';
  directives.push(`report-uri ${reportUri}`);

  // Report-To header (newer standard)
  if (process.env.CSP_REPORT_TO) {
    directives.push(`report-to ${process.env.CSP_REPORT_TO}`);
  }

  return {
    policy: directives.join('; '),
    nonce
  };
}

/**
 * Apply security headers including Content Security Policy
 */
function applySecurityHeaders(req: Request, res: Response): void {
  // Generate CSP with nonce
  const { policy, nonce } = generateCSP(req, res);

  // Apply CSP header
  const isReportOnly = process.env.CSP_REPORT_ONLY === 'true';
  if (isReportOnly) {
    res.setHeader('Content-Security-Policy-Report-Only', policy);
  } else {
    res.setHeader('Content-Security-Policy', policy);
  }

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Disabled in modern browsers, CSP is better
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  
  // HSTS (HTTP Strict Transport Security) - only if HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Add CSP nonce to response for use in HTML generation
  res.setHeader('X-CSP-Nonce', nonce);
}

function checkRateLimit(
  req: Request,
  rateLimitMap: Map<string, number[]>,
  options: RateLimitOptions
): boolean {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = options.windowMs || 60000; // 1 minute default
  const max = options.max || 60; // 60 requests per window default
  
  const timestamps = rateLimitMap.get(ip) || [];
  const recentTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (recentTimestamps.length >= max) {
    return false;
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(ip, recentTimestamps);
  
  // Clean up old entries
  if (rateLimitMap.size > 1000) {
    const oldestAllowed = now - windowMs;
    for (const [key, times] of rateLimitMap.entries()) {
      const recent = times.filter(t => t > oldestAllowed);
      if (recent.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, recent);
      }
    }
  }
  
  return true;
}

/**
 * Global system metrics
 */
class SystemMetrics {
  private static instance: SystemMetrics;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastRequestTime = 0;
  private responseTimeHistory: number[] = [];
  private readonly MAX_HISTORY = 1000;

  static getInstance(): SystemMetrics {
    if (!this.instance) {
      this.instance = new SystemMetrics();
    }
    return this.instance;
  }

  recordRequest(responseTime: number, isError: boolean = false): void {
    this.requestCount++;
    this.lastRequestTime = Date.now();
    
    if (isError) {
      this.errorCount++;
    }
    
    this.responseTimeHistory.push(responseTime);
    if (this.responseTimeHistory.length > this.MAX_HISTORY) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-this.MAX_HISTORY);
    }
  }

  getMetrics(): Record<string, any> {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.responseTimeHistory.length > 0 
      ? this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length 
      : 0;
    
    return {
      uptime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      averageResponseTime: Math.round(avgResponseTime),
      requestsPerSecond: uptime > 0 ? (this.requestCount / (uptime / 1000)) : 0,
      lastRequestTime: this.lastRequestTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }
  
  reset(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimeHistory = [];
    this.startTime = Date.now();
  }
}

/**
 * Handle health check endpoint
 */
async function handleHealthCheck(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  const healthOptions = options.healthCheck || { enabled: true };
  
  if (healthOptions.enabled === false) {
    return res.status(404).json({ error: 'Health check disabled' });
  }

  const startTime = Date.now();
  const checks: HealthCheckResult[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  try {
    // Storage health check
    const storageCheck = await checkStorageHealth(storage);
    checks.push(storageCheck);
    if (storageCheck.status !== 'healthy') {
      overallStatus = storageCheck.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    // Memory check
    const memoryCheck = checkMemoryHealth();
    checks.push(memoryCheck);
    if (memoryCheck.status !== 'healthy' && overallStatus === 'healthy') {
      overallStatus = memoryCheck.status;
    }

    // CPU check
    const cpuCheck = checkCPUHealth();
    checks.push(cpuCheck);
    if (cpuCheck.status !== 'healthy' && overallStatus === 'healthy') {
      overallStatus = cpuCheck.status;
    }

    // Disk space check (if file storage)
    if (typeof options.storage === 'string' && options.storage === 'file' && options.storagePath) {
      const diskCheck = await checkDiskSpace(options.storagePath);
      checks.push(diskCheck);
      if (diskCheck.status !== 'healthy' && overallStatus === 'healthy') {
        overallStatus = diskCheck.status;
      }
    }

    // Custom health checks
    if (healthOptions.customChecks) {
      for (const customCheck of healthOptions.customChecks) {
        try {
          const result = await customCheck();
          checks.push(result);
          if (result.status !== 'healthy' && overallStatus === 'healthy') {
            overallStatus = result.status;
          }
        } catch (error) {
          checks.push({
            name: 'custom_check',
            status: 'unhealthy',
            message: `Custom check failed: ${(error as Error).message}`
          });
          overallStatus = 'unhealthy';
        }
      }
    }

    // Dependencies check
    if (healthOptions.includeDependencies) {
      const depsCheck = await checkDependencies();
      checks.push(...depsCheck);
      
      const unhealthyDeps = depsCheck.filter(d => d.status === 'unhealthy');
      const degradedDeps = depsCheck.filter(d => d.status === 'degraded');
      
      if (unhealthyDeps.length > 0) {
        overallStatus = 'unhealthy';
      } else if (degradedDeps.length > 0 && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    const responseTime = Date.now() - startTime;
    const metrics = SystemMetrics.getInstance();
    metrics.recordRequest(responseTime, overallStatus !== 'healthy');

    const healthData: SystemHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks
    };

    // Add system info if requested
    if (healthOptions.includeSystemInfo) {
      healthData.system = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        loadAverage: os.loadavg(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem()
      };
    }

    // Add storage info if requested
    if (healthOptions.includeStorageInfo) {
      healthData.storage = {
        type: typeof options.storage === 'string' ? options.storage : 'custom',
        connected: storageCheck.status !== 'unhealthy',
        responseTime: storageCheck.responseTime || 0,
        details: storageCheck.details
      };
    }

    // Set appropriate HTTP status
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    res.status(httpStatus).json(healthData);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    SystemMetrics.getInstance().recordRequest(responseTime, true);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: (error as Error).message
    });
  }
}

/**
 * Handle HEAD request for health check (lightweight)
 */
async function handleHealthCheckHead(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  const healthOptions = options.healthCheck || { enabled: true };
  
  if (healthOptions.enabled === false) {
    return res.status(404).end();
  }

  try {
    // Quick storage check
    const startTime = Date.now();
    const storageHealthy = await quickStorageCheck(storage);
    const responseTime = Date.now() - startTime;
    
    SystemMetrics.getInstance().recordRequest(responseTime, !storageHealthy);
    
    res.status(storageHealthy ? 200 : 503)
       .header('X-Health-Status', storageHealthy ? 'healthy' : 'unhealthy')
       .header('X-Response-Time', responseTime.toString())
       .end();
  } catch (error) {
    res.status(503).end();
  }
}

/**
 * Handle metrics endpoint (Prometheus-style)
 */
async function handleMetrics(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  const metrics = SystemMetrics.getInstance().getMetrics();
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  // Format as Prometheus metrics
  const promMetrics = [
    `# HELP sightedit_requests_total Total number of HTTP requests`,
    `# TYPE sightedit_requests_total counter`,
    `sightedit_requests_total ${metrics.requestCount}`,
    ``,
    `# HELP sightedit_errors_total Total number of HTTP errors`,
    `# TYPE sightedit_errors_total counter`,
    `sightedit_errors_total ${metrics.errorCount}`,
    ``,
    `# HELP sightedit_request_duration_seconds Average request duration`,
    `# TYPE sightedit_request_duration_seconds gauge`,
    `sightedit_request_duration_seconds ${metrics.averageResponseTime / 1000}`,
    ``,
    `# HELP sightedit_uptime_seconds Server uptime in seconds`,
    `# TYPE sightedit_uptime_seconds counter`,
    `sightedit_uptime_seconds ${metrics.uptime / 1000}`,
    ``,
    `# HELP sightedit_memory_usage_bytes Memory usage in bytes`,
    `# TYPE sightedit_memory_usage_bytes gauge`,
    `sightedit_memory_usage_bytes{type="rss"} ${memUsage.rss}`,
    `sightedit_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}`,
    `sightedit_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}`,
    `sightedit_memory_usage_bytes{type="external"} ${memUsage.external}`,
    ``,
    `# HELP sightedit_cpu_usage_seconds CPU usage in seconds`,
    `# TYPE sightedit_cpu_usage_seconds counter`,
    `sightedit_cpu_usage_seconds{type="user"} ${cpuUsage.user / 1000000}`,
    `sightedit_cpu_usage_seconds{type="system"} ${cpuUsage.system / 1000000}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(promMetrics);
}

/**
 * Handle status endpoint (simplified health)
 */
async function handleStatus(
  req: Request,
  res: Response,
  storage: StorageAdapter,
  options: SightEditHandlerOptions
): Promise<void> {
  const metrics = SystemMetrics.getInstance().getMetrics();
  const storageHealthy = await quickStorageCheck(storage);
  
  const status = {
    status: storageHealthy ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Math.round(metrics.uptime / 1000),
    version: process.env.npm_package_version || '1.0.0',
    requests: metrics.requestCount,
    errors: metrics.errorCount
  };
  
  res.json(status);
}

/**
 * Check storage health
 */
async function checkStorageHealth(storage: StorageAdapter): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Test basic storage operations
    const testKey = `_health_check_${Date.now()}`;
    const testValue = { timestamp: Date.now(), test: true };
    
    // Test write
    await storage.set(testKey, testValue);
    
    // Test read
    const retrieved = await storage.get(testKey);
    
    // Test delete
    await storage.delete(testKey);
    
    const responseTime = Date.now() - startTime;
    
    // Verify data integrity
    if (!retrieved || retrieved.timestamp !== testValue.timestamp) {
      return {
        name: 'storage',
        status: 'unhealthy',
        message: 'Data integrity check failed',
        responseTime
      };
    }
    
    // Check response time
    const status = responseTime > 5000 ? 'degraded' : 
                  responseTime > 1000 ? 'degraded' : 'healthy';
    
    return {
      name: 'storage',
      status,
      message: `Storage operations completed in ${responseTime}ms`,
      responseTime,
      details: {
        readWriteTest: 'passed',
        responseTime: `${responseTime}ms`
      }
    };
    
  } catch (error) {
    return {
      name: 'storage',
      status: 'unhealthy',
      message: `Storage check failed: ${(error as Error).message}`,
      responseTime: Date.now() - startTime
    };
  }
}

/**
 * Quick storage check (for HEAD requests)
 */
async function quickStorageCheck(storage: StorageAdapter): Promise<boolean> {
  try {
    // Just try to list keys as a quick connectivity test
    await storage.list();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check memory health
 */
function checkMemoryHealth(): HealthCheckResult {
  const memUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let message = `Memory usage: ${Math.round(heapUsedPercent)}% heap, ${Math.round(usedMemoryPercent)}% system`;
  
  if (heapUsedPercent > 90 || usedMemoryPercent > 95) {
    status = 'unhealthy';
    message = `Critical memory usage: ${Math.round(heapUsedPercent)}% heap, ${Math.round(usedMemoryPercent)}% system`;
  } else if (heapUsedPercent > 80 || usedMemoryPercent > 85) {
    status = 'degraded';
    message = `High memory usage: ${Math.round(heapUsedPercent)}% heap, ${Math.round(usedMemoryPercent)}% system`;
  }
  
  return {
    name: 'memory',
    status,
    message,
    details: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapUsedPercent: Math.round(heapUsedPercent),
      systemUsedPercent: Math.round(usedMemoryPercent),
      rss: memUsage.rss,
      external: memUsage.external
    }
  };
}

/**
 * Check CPU health
 */
function checkCPUHealth(): HealthCheckResult {
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const load1min = loadAvg[0];
  const loadPercent = (load1min / cpuCount) * 100;
  
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let message = `CPU load: ${Math.round(loadPercent)}% (${load1min.toFixed(2)}/${cpuCount})`;
  
  if (loadPercent > 90) {
    status = 'unhealthy';
    message = `Critical CPU load: ${Math.round(loadPercent)}% (${load1min.toFixed(2)}/${cpuCount})`;
  } else if (loadPercent > 70) {
    status = 'degraded';
    message = `High CPU load: ${Math.round(loadPercent)}% (${load1min.toFixed(2)}/${cpuCount})`;
  }
  
  return {
    name: 'cpu',
    status,
    message,
    details: {
      loadAverage1min: load1min,
      loadAverage5min: loadAvg[1],
      loadAverage15min: loadAvg[2],
      cpuCount,
      loadPercent: Math.round(loadPercent)
    }
  };
}

/**
 * Check disk space
 */
async function checkDiskSpace(storagePath: string): Promise<HealthCheckResult> {
  try {
    const stats = await fs.stat(storagePath);
    
    // This is a simplified check - in production, you'd want to use a library
    // like 'statvfs' or 'diskusage' for accurate disk space information
    return {
      name: 'disk',
      status: 'healthy',
      message: 'Storage path accessible',
      details: {
        path: storagePath,
        accessible: true
      }
    };
  } catch (error) {
    return {
      name: 'disk',
      status: 'unhealthy',
      message: `Storage path not accessible: ${(error as Error).message}`,
      details: {
        path: storagePath,
        accessible: false
      }
    };
  }
}

/**
 * Check external dependencies
 */
async function checkDependencies(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  // Database check (if using database storage)
  // This would be implemented based on your specific database
  
  // External API checks
  // Add checks for any external services your app depends on
  
  return results;
}

/**
 * Handle CSP violation reports
 */
async function handleCSPReport(req: Request, res: Response): Promise<void> {
  try {
    const report = req.body;
    
    // Validate report structure
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ error: 'Invalid report format' });
    }

    // Extract CSP report (can be in different formats)
    const cspReport = report['csp-report'] || report;
    
    // Record the violation
    cspReporter.recordViolation(cspReport);

    // In production, you might want to send to a monitoring service
    if (process.env.NODE_ENV === 'production' && process.env.MONITORING_ENDPOINT) {
      // Send to monitoring service asynchronously
      fetch(process.env.MONITORING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'csp-violation',
          report: cspReport,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        })
      }).catch(err => console.error('Failed to send CSP report to monitoring:', err));
    }

    // Return 204 No Content as per CSP reporting spec
    res.status(204).end();
  } catch (error) {
    console.error('Error handling CSP report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get CSP violation statistics
 */
async function handleCSPStats(req: Request, res: Response): Promise<void> {
  try {
    // This endpoint should be protected in production
    if (process.env.NODE_ENV === 'production') {
      // Check for admin authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Validate admin token (implement your auth logic)
      // const token = authHeader.substring(7);
      // if (!validateAdminToken(token)) {
      //   return res.status(403).json({ error: 'Forbidden' });
      // }
    }

    const stats = cspReporter.getViolationStats();
    res.json({
      success: true,
      stats,
      environment: process.env.NODE_ENV,
      cspMode: process.env.CSP_REPORT_ONLY === 'true' ? 'report-only' : 'enforce'
    });
  } catch (error) {
    console.error('Error getting CSP stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Quick setup function for development
 * For production, use ProductionSightEditServer class
 */
export function createSightEditServer(config: Partial<ProductionServerConfig> = {}): ProductionSightEditServer {
  // Provide defaults for required configs in development
  const defaultConfig: ProductionServerConfig = {
    jwt: {
      accessTokenSecret: process.env.JWT_ACCESS_SECRET || crypto.randomBytes(64).toString('hex'),
      refreshTokenSecret: process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex'),
      issuer: 'sightedit-dev',
      audience: ['sightedit-client']
    },
    security: {
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      passwordResetExpiry: 60,
      emailVerificationExpiry: 24,
      maxSessions: 5,
      requireEmailVerification: false,
      enableTwoFactor: false,
      enableAccountLockout: true,
      passwordHistory: 5
    },
    csrf: {
      enabled: true
    },
    environment: (process.env.NODE_ENV as any) || 'development',
    ...config
  };
  
  return new ProductionSightEditServer(defaultConfig);
}

/**
 * Start a SightEdit server with sensible defaults
 * Perfect for quick prototyping and development
 */
export async function startSightEditServer(config: Partial<ProductionServerConfig> = {}): Promise<ProductionSightEditServer> {
  const server = createSightEditServer(config);
  await server.start();
  return server;
}

// Export the metrics instance for use in middleware
export const systemMetrics = SystemMetrics.getInstance();

// Export all types and utilities
export type { Request, Response, NextFunction } from 'express';
export type { DatabaseConfig } from './storage/DatabaseStorage';
export type { 
  UserData, 
  SecurityConfig, 
  EmailConfig, 
  UserSession 
} from './auth/secure-auth-handler';
export type { 
  SecureJWTPayload, 
  AuthUser, 
  JWTConfig, 
  LoginAttempt 
} from './auth/secure-jwt';
export {
  createDatabaseStorage,
  PostgreSQLStorage,
  MySQLStorage,
  SQLiteStorage,
  MongoDBStorage
} from './storage/DatabaseStorage';
export { SecureAuthHandler } from './auth/secure-auth-handler';
export { SecureJWTAuth } from './auth/secure-jwt';
export { ServerCSRFValidation, createCSRFProtection } from './middleware/csrf-validation';