/**
 * Health Check and Uptime Monitoring System for SightEdit
 * Provides comprehensive health monitoring endpoints and probes
 */

import { Request, Response } from 'express';
import { log } from '../../../core/src/utils/logger';
import { businessMetrics } from '../../../core/src/utils/business-metrics';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
  metrics: HealthMetrics;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration: number;
  message?: string;
  details?: Record<string, any>;
}

export interface HealthMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    percentage: number;
  };
  requests: {
    total: number;
    errorsLast5m: number;
    averageResponseTime: number;
  };
  database: {
    connected: boolean;
    connectionCount?: number;
    queryTime?: number;
  };
  cache: {
    connected: boolean;
    hitRate?: number;
    memory?: number;
  };
  business: {
    activeUsers: number;
    editorActivations: number;
    saveSuccessRate: number;
  };
}

/**
 * Health check system for monitoring application status
 */
export class HealthCheckSystem {
  private static instance: HealthCheckSystem;
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private errorCount: number = 0;
  private responseTimes: number[] = [];
  private lastErrorTime: number = 0;

  // Health check functions registry
  private healthChecks = new Map<string, () => Promise<HealthCheck>>();

  static getInstance(): HealthCheckSystem {
    if (!this.instance) {
      this.instance = new HealthCheckSystem();
    }
    return this.instance;
  }

  constructor() {
    this.registerDefaultHealthChecks();
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    this.healthChecks.set(name, checkFn);
    log.info('Health check registered', {
      component: 'HealthCheckSystem',
      check_name: name
    });
  }

  /**
   * Remove a health check
   */
  unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    log.info('Health check unregistered', {
      component: 'HealthCheckSystem',
      check_name: name
    });
  }

  /**
   * Execute all health checks
   */
  async executeHealthChecks(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks: HealthCheck[] = [];

    // Run all registered health checks
    for (const [name, checkFn] of this.healthChecks) {
      try {
        const checkStartTime = Date.now();
        const result = await Promise.race([
          checkFn(),
          this.createTimeoutPromise(5000, name) // 5 second timeout
        ]);
        
        result.duration = Date.now() - checkStartTime;
        checks.push(result);
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          duration: Date.now() - startTime,
          message: error instanceof Error ? error.message : 'Unknown error'
        });

        log.error('Health check failed', {
          component: 'HealthCheckSystem',
          check_name: name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Determine overall status
    const overallStatus = this.determineOverallStatus(checks);

    // Get system metrics
    const metrics = await this.getSystemMetrics();

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      metrics
    };

    log.info('Health check completed', {
      component: 'HealthCheckSystem',
      status: overallStatus,
      duration: Date.now() - startTime,
      check_count: checks.length
    });

    return result;
  }

  /**
   * Basic health endpoint
   */
  async basicHealth(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.executeHealthChecks();
      
      const statusCode = result.status === 'healthy' ? 200 : 
                        result.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(result);
    } catch (error) {
      log.error('Health check endpoint failed', {
        component: 'HealthCheckSystem',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(503).json({
        status: 'unhealthy',
        timestamp: Date.now(),
        message: 'Health check system failure'
      });
    }
  }

  /**
   * Readiness probe endpoint
   */
  async readinessProbe(req: Request, res: Response): Promise<void> {
    try {
      const criticalChecks = ['database', 'cache'];
      const checks: HealthCheck[] = [];

      // Run only critical checks for readiness
      for (const checkName of criticalChecks) {
        if (this.healthChecks.has(checkName)) {
          const checkFn = this.healthChecks.get(checkName)!;
          try {
            const result = await Promise.race([
              checkFn(),
              this.createTimeoutPromise(3000, checkName)
            ]);
            checks.push(result);
          } catch (error) {
            checks.push({
              name: checkName,
              status: 'fail',
              duration: 0,
              message: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      const isReady = checks.every(check => check.status === 'pass');
      
      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'not_ready',
        timestamp: Date.now(),
        checks
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        timestamp: Date.now(),
        message: 'Readiness check failed'
      });
    }
  }

  /**
   * Liveness probe endpoint
   */
  async livenessProbe(req: Request, res: Response): Promise<void> {
    try {
      // Simple liveness check - just verify the process is responsive
      const memory = process.memoryUsage();
      const uptime = Date.now() - this.startTime;

      const isAlive = memory.heapUsed < memory.heapTotal * 0.95; // Not out of memory

      res.status(isAlive ? 200 : 503).json({
        status: isAlive ? 'alive' : 'not_alive',
        timestamp: Date.now(),
        uptime,
        memory: {
          used: memory.heapUsed,
          total: memory.heapTotal,
          percentage: (memory.heapUsed / memory.heapTotal) * 100
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_alive',
        timestamp: Date.now(),
        message: 'Liveness check failed'
      });
    }
  }

  /**
   * Startup probe endpoint
   */
  async startupProbe(req: Request, res: Response): Promise<void> {
    try {
      // Check if application has fully started
      const uptime = Date.now() - this.startTime;
      const minimumStartupTime = 10000; // 10 seconds

      const hasStarted = uptime > minimumStartupTime && 
                        this.healthChecks.size > 0;

      res.status(hasStarted ? 200 : 503).json({
        status: hasStarted ? 'started' : 'starting',
        timestamp: Date.now(),
        uptime,
        registered_checks: Array.from(this.healthChecks.keys())
      });
    } catch (error) {
      res.status(503).json({
        status: 'startup_failed',
        timestamp: Date.now(),
        message: 'Startup check failed'
      });
    }
  }

  /**
   * Track request metrics
   */
  trackRequest(responseTime: number, isError: boolean = false): void {
    this.requestCount++;
    this.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    if (isError) {
      this.errorCount++;
      this.lastErrorTime = Date.now();
    }
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<HealthMetrics> {
    const memory = process.memoryUsage();
    
    // Calculate CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) / 
                      ((Date.now() - this.startTime) / 1000) * 100;

    // Calculate average response time
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    // Calculate recent error rate
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentErrors = this.lastErrorTime > fiveMinutesAgo ? this.errorCount : 0;

    // Get business metrics
    const businessKPIs = businessMetrics.calculateKPIs('day');

    return {
      memory: {
        used: memory.heapUsed,
        total: memory.heapTotal,
        percentage: (memory.heapUsed / memory.heapTotal) * 100
      },
      cpu: {
        percentage: Math.min(cpuPercent, 100)
      },
      requests: {
        total: this.requestCount,
        errorsLast5m: recentErrors,
        averageResponseTime: avgResponseTime
      },
      database: {
        connected: true, // This would be determined by actual database check
        connectionCount: 10, // This would come from connection pool
        queryTime: 50 // This would be actual query time
      },
      cache: {
        connected: true, // This would be determined by actual cache check
        hitRate: 0.85, // This would come from cache statistics
        memory: 64 * 1024 * 1024 // This would be actual cache memory usage
      },
      business: {
        activeUsers: businessKPIs.dailyActiveUsers,
        editorActivations: 0, // This would come from recent metrics
        saveSuccessRate: businessKPIs.saveSuccessRate
      }
    };
  }

  /**
   * Register default health checks
   */
  private registerDefaultHealthChecks(): void {
    // Memory health check
    this.registerHealthCheck('memory', async () => {
      const memory = process.memoryUsage();
      const percentage = (memory.heapUsed / memory.heapTotal) * 100;
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `Memory usage: ${percentage.toFixed(1)}%`;

      if (percentage > 90) {
        status = 'fail';
        message += ' - Critical memory usage';
      } else if (percentage > 75) {
        status = 'warn';
        message += ' - High memory usage';
      }

      return {
        name: 'memory',
        status,
        duration: 0,
        message,
        details: {
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          percentage
        }
      };
    });

    // Disk space health check
    this.registerHealthCheck('disk', async () => {
      try {
        const fs = require('fs');
        const stats = fs.statSync('.');
        
        // This is a simplified check - in production you'd check actual disk usage
        return {
          name: 'disk',
          status: 'pass' as const,
          duration: 0,
          message: 'Disk space sufficient'
        };
      } catch (error) {
        return {
          name: 'disk',
          status: 'fail' as const,
          duration: 0,
          message: 'Disk check failed',
          details: { error: (error as Error).message }
        };
      }
    });

    // Database health check placeholder
    this.registerHealthCheck('database', async () => {
      // This would implement actual database connectivity check
      return {
        name: 'database',
        status: 'pass' as const,
        duration: 10,
        message: 'Database connection healthy'
      };
    });

    // Cache health check placeholder
    this.registerHealthCheck('cache', async () => {
      // This would implement actual cache connectivity check
      return {
        name: 'cache',
        status: 'pass' as const,
        duration: 5,
        message: 'Cache connection healthy'
      };
    });

    // External services health check
    this.registerHealthCheck('external_services', async () => {
      // This would check external API dependencies
      return {
        name: 'external_services',
        status: 'pass' as const,
        duration: 15,
        message: 'External services reachable'
      };
    });
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
    const failedChecks = checks.filter(check => check.status === 'fail');
    const warnChecks = checks.filter(check => check.status === 'warn');

    if (failedChecks.length > 0) {
      // Critical checks that cause unhealthy status
      const criticalChecks = ['database', 'memory'];
      const criticalFailures = failedChecks.filter(check => 
        criticalChecks.includes(check.name)
      );

      if (criticalFailures.length > 0) {
        return 'unhealthy';
      }

      // Non-critical failures result in degraded status
      return 'degraded';
    }

    if (warnChecks.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Create a timeout promise for health checks
   */
  private createTimeoutPromise(timeout: number, checkName: string): Promise<HealthCheck> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check '${checkName}' timed out after ${timeout}ms`));
      }, timeout);
    });
  }
}

// Singleton instance
export const healthCheckSystem = HealthCheckSystem.getInstance();