/**
 * Production SightEdit Server Example
 * 
 * This example demonstrates how to set up a complete production-ready
 * SightEdit server with all security, performance, and monitoring features.
 */

import { ProductionSightEditServer, startSightEditServer, ProductionServerConfig } from '../index';
import { readFileSync } from 'fs';
import * as path from 'path';

/**
 * Production Configuration Example
 */
const productionConfig: ProductionServerConfig = {
  // Server configuration
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  environment: 'production',
  
  // HTTPS configuration (required in production)
  https: {
    enabled: true,
    certPath: process.env.HTTPS_CERT_PATH || './certs/cert.pem',
    keyPath: process.env.HTTPS_KEY_PATH || './certs/key.pem'
  },
  
  // Database storage (recommended for production)
  storage: 'database',
  databaseConfig: {
    type: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'sightedit_production',
      username: process.env.DB_USER || 'sightedit',
      password: process.env.DB_PASSWORD!
    },
    pool: {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 600000
    }
  },
  
  // JWT Configuration (use strong secrets in production)
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    issuer: 'sightedit-production',
    audience: ['sightedit-client'],
    clockTolerance: 30,
    enableRateLimiting: true,
    maxLoginAttempts: 5,
    lockoutDuration: 900, // 15 minutes
    requireTwoFactor: false
  },
  
  // Security Configuration
  security: {
    maxLoginAttempts: 5,
    lockoutDuration: 15, // minutes
    passwordResetExpiry: 60, // minutes
    emailVerificationExpiry: 24, // hours
    maxSessions: 3,
    requireEmailVerification: true,
    enableTwoFactor: false,
    enableAccountLockout: true,
    passwordHistory: 10
  },
  
  // Email Configuration (required for password reset and verification)
  emailConfig: {
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASSWORD!
    },
    from: process.env.SMTP_FROM || 'noreply@yourdomain.com'
  },
  
  // CSRF Protection
  csrf: {
    enabled: true,
    secretKey: process.env.CSRF_SECRET!,
    excludePaths: ['/health', '/metrics', '/api/csp-report'],
    excludeMethods: ['GET', 'HEAD', 'OPTIONS']
  },
  
  // CORS Configuration
  cors: {
    enabled: true,
    origins: process.env.CORS_ORIGINS?.split(',') || ['https://yourdomain.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token']
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window per IP
    skipSuccessfulRequests: true
  },
  
  // Health Check
  healthCheck: {
    enabled: true,
    endpoint: '/health',
    includeSystemInfo: false, // Don't expose system info in production
    includeStorageInfo: true,
    includeDependencies: true,
    customChecks: [
      // Custom health check example
      async () => {
        try {
          // Check external service availability
          const response = await fetch('https://api.external-service.com/health');
          return {
            name: 'external_service',
            status: response.ok ? 'healthy' : 'unhealthy',
            message: `External service returned ${response.status}`,
            responseTime: Date.now()
          };
        } catch (error) {
          return {
            name: 'external_service',
            status: 'unhealthy',
            message: `External service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }
      }
    ]
  },
  
  // Logging Configuration
  logging: {
    level: 'info',
    format: 'json',
    destination: process.env.LOG_FILE || '/var/log/sightedit/app.log'
  },
  
  // Compression
  compression: {
    enabled: true,
    level: 6,
    threshold: '1kb'
  },
  
  // File Upload Configuration
  fileUpload: {
    maxSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 5,
    allowedTypes: [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'application/pdf'
    ],
    uploadPath: process.env.UPLOAD_PATH || '/var/lib/sightedit/uploads'
  },
  
  // Request Body Limits
  bodyLimit: {
    json: '2mb',
    urlencoded: '2mb'
  },
  
  // Hooks
  beforeSave: async (data) => {
    // Log all save operations for audit
    console.log('Save operation:', {
      sight: data.sight,
      type: data.type,
      timestamp: new Date().toISOString(),
      hasValue: data.value !== undefined
    });
    
    // Add audit trail
    return {
      ...data,
      context: {
        ...data.context,
        auditTrail: {
          operation: 'save',
          timestamp: Date.now(),
          source: 'sightedit-production'
        }
      }
    };
  },
  
  afterSave: async (data, result) => {
    // Send to analytics service
    try {
      await fetch(`${process.env.ANALYTICS_ENDPOINT}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ANALYTICS_API_KEY}`
        },
        body: JSON.stringify({
          event: 'content_updated',
          properties: {
            sight: data.sight,
            type: data.type,
            timestamp: data.timestamp,
            success: result.success
          }
        })
      });
    } catch (error) {
      console.error('Failed to send analytics event:', error);
    }
  },
  
  onError: (error, req) => {
    // Send critical errors to monitoring service
    if (error.message?.includes('database') || error.message?.includes('connection')) {
      fetch(`${process.env.MONITORING_WEBHOOK}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: 'SightEdit Critical Error',
          error: error.message,
          path: req.path,
          method: req.method,
          timestamp: new Date().toISOString(),
          severity: 'high'
        })
      }).catch(console.error);
    }
  }
};

/**
 * Development Configuration Example
 */
const developmentConfig: ProductionServerConfig = {
  // Basic setup for development
  port: 3001,
  host: 'localhost',
  environment: 'development',
  
  // HTTP only for development
  https: {
    enabled: false
  },
  
  // Memory storage for development (no database required)
  storage: 'memory',
  
  // Simple JWT config for development (auto-generated secrets)
  jwt: {
    accessTokenSecret: 'development-access-secret-key-please-change-in-production-minimum-64-chars',
    refreshTokenSecret: 'development-refresh-secret-key-please-change-in-production-minimum-64-chars',
    accessTokenExpiry: '1h', // Longer for development
    refreshTokenExpiry: '30d',
    issuer: 'sightedit-dev',
    audience: ['sightedit-dev-client'],
    enableRateLimiting: false // Disable rate limiting for dev
  },
  
  // Relaxed security for development
  security: {
    maxLoginAttempts: 10,
    lockoutDuration: 1, // 1 minute
    passwordResetExpiry: 60,
    emailVerificationExpiry: 24,
    maxSessions: 10,
    requireEmailVerification: false,
    enableTwoFactor: false,
    enableAccountLockout: false,
    passwordHistory: 0
  },
  
  // CSRF enabled but relaxed
  csrf: {
    enabled: true,
    excludePaths: ['/health', '/metrics', '/api/csp-report', '/api/auth/register'],
    excludeMethods: ['GET', 'HEAD', 'OPTIONS']
  },
  
  // CORS for local development
  cors: {
    enabled: true,
    origins: [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:8080',
      'http://127.0.0.1:3000'
    ],
    credentials: true
  },
  
  // No rate limiting for development
  rateLimit: {
    enabled: false
  },
  
  // Detailed health checks for debugging
  healthCheck: {
    enabled: true,
    endpoint: '/health',
    includeSystemInfo: true,
    includeStorageInfo: true,
    includeDependencies: false
  },
  
  // Debug logging
  logging: {
    level: 'debug',
    format: 'text'
  },
  
  // Generous limits for development
  fileUpload: {
    maxSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    allowedTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav',
      'application/pdf', 'text/plain', 'application/json'
    ],
    uploadPath: './dev-uploads'
  },
  
  bodyLimit: {
    json: '50mb',
    urlencoded: '50mb'
  }
};

/**
 * Start production server
 */
async function startProductionServer() {
  try {
    console.log('Starting SightEdit Production Server...');
    
    // Validate required environment variables
    const requiredEnvVars = [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET', 
      'CSRF_SECRET',
      'DB_PASSWORD'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable ${envVar} is not set`);
      }
    }
    
    const server = new ProductionSightEditServer(productionConfig);
    await server.start();
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start production server:', error);
    process.exit(1);
  }
}

/**
 * Start development server
 */
async function startDevelopmentServer() {
  try {
    console.log('Starting SightEdit Development Server...');
    
    const server = await startSightEditServer(developmentConfig);
    
    // Auto-create test user in development
    setTimeout(async () => {
      try {
        // This would create a test user - implementation depends on your auth setup
        console.log('Development server ready!');
        console.log('Test credentials:');
        console.log('  Email: test@example.com');
        console.log('  Password: TestPassword123!');
      } catch (error) {
        console.log('Note: Create a test user manually via POST /api/auth/register');
      }
    }, 1000);
    
  } catch (error) {
    console.error('Failed to start development server:', error);
    process.exit(1);
  }
}

/**
 * Docker/Container-ready server
 */
async function startContainerServer() {
  const config: ProductionServerConfig = {
    ...productionConfig,
    host: '0.0.0.0', // Listen on all interfaces in container
    port: parseInt(process.env.PORT || '3000'),
    
    // Health check optimized for container orchestration
    healthCheck: {
      enabled: true,
      endpoint: '/health',
      includeSystemInfo: false,
      includeStorageInfo: true,
      includeDependencies: true
    },
    
    // Container-optimized logging
    logging: {
      level: 'info',
      format: 'json' // Structured logs for log aggregation
    }
  };
  
  const server = new ProductionSightEditServer(config);
  await server.start();
  
  // Container health monitoring
  const healthEndpoint = config.healthCheck?.endpoint || '/health';
  console.log(`Container health check available at ${healthEndpoint}`);
  
  return server;
}

// Export configurations and functions
export {
  productionConfig,
  developmentConfig,
  startProductionServer,
  startDevelopmentServer,
  startContainerServer
};

// Auto-start based on NODE_ENV if this file is run directly
if (require.main === module) {
  const environment = process.env.NODE_ENV || 'development';
  
  switch (environment) {
    case 'production':
      startProductionServer();
      break;
    case 'development':
      startDevelopmentServer();
      break;
    case 'container':
      startContainerServer();
      break;
    default:
      console.log(`Unknown environment: ${environment}`);
      console.log('Available environments: production, development, container');
      process.exit(1);
  }
}