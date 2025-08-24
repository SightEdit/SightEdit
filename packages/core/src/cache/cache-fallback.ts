/**
 * Graceful Cache Degradation and Fallback Mechanisms for SightEdit
 * Ensures system reliability and performance under various failure scenarios
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface FallbackConfig {
  // Degradation strategies
  strategies: {
    layerFailover: boolean;    // Fallback to other cache layers
    gracefulDegradation: boolean; // Reduce cache functionality gradually
    circuitBreaker: boolean;   // Circuit breaker pattern
    retryWithBackoff: boolean; // Exponential backoff retry
    cacheBypass: boolean;      // Bypass cache when failing
  };
  
  // Health checking
  healthCheck: {
    enabled: boolean;
    interval: number; // milliseconds
    timeout: number;  // milliseconds
    consecutiveFailures: number; // failures before marking unhealthy
    recoveryThreshold: number;   // successes before marking healthy
  };
  
  // Circuit breaker settings
  circuitBreaker: {
    failureThreshold: number;    // failures to open circuit
    recoveryTimeout: number;     // ms before trying to close circuit
    successThreshold: number;    // successes to close circuit
    halfOpenMaxCalls: number;    // max calls in half-open state
  };
  
  // Retry configuration
  retry: {
    maxAttempts: number;
    initialDelay: number;        // ms
    maxDelay: number;           // ms
    backoffMultiplier: number;
    jitterEnabled: boolean;
  };
  
  // Performance thresholds
  performance: {
    responseTimeThreshold: number; // ms
    errorRateThreshold: number;    // 0-1
    memoryPressureThreshold: number; // 0-1
    cpuUsageThreshold: number;     // 0-1
  };
  
  // Fallback prioritization
  layerPriority: string[];  // Ordered list of cache layers by priority
}

export interface LayerHealth {
  layerName: string;
  isHealthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'failed';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastHealthCheck: number;
  lastFailure?: number;
  lastSuccess?: number;
  averageResponseTime: number;
  errorRate: number;
  circuitState: CircuitState;
  metadata: Record<string, any>;
}

export interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  nextAttemptTime: number;
  halfOpenCalls: number;
}

export interface FallbackOperation {
  id: string;
  operation: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  value?: any;
  options?: any;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptTime: number;
  errors: string[];
  layersAttempted: string[];
  fallbackStrategy: string;
  completed: boolean;
  result?: any;
}

export interface DegradationLevel {
  level: 'normal' | 'warning' | 'degraded' | 'critical' | 'emergency';
  description: string;
  limitations: string[];
  activeStrategies: string[];
  healthyLayers: number;
  totalLayers: number;
}

export interface FallbackMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  fallbackOperations: number;
  averageLatency: number;
  circuitBreakerTrips: number;
  layerFailovers: number;
  retryAttempts: number;
  bypassedOperations: number;
  lastUpdated: number;
}

/**
 * Advanced cache fallback and degradation manager
 */
export class CacheFallbackManager extends EventEmitter {
  private config: FallbackConfig;
  private layerHealthStatus: Map<string, LayerHealth> = new Map();
  private activeOperations: Map<string, FallbackOperation> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private metrics: FallbackMetrics;
  private degradationLevel: DegradationLevel;
  private cacheInstances: Map<string, any> = new Map();
  private isInitialized = false;
  
  constructor(config: FallbackConfig) {
    super();
    this.config = {
      strategies: {
        layerFailover: true,
        gracefulDegradation: true,
        circuitBreaker: true,
        retryWithBackoff: true,
        cacheBypass: false
      },
      healthCheck: {
        enabled: true,
        interval: 30000, // 30 seconds
        timeout: 5000,   // 5 seconds
        consecutiveFailures: 3,
        recoveryThreshold: 2
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        successThreshold: 3,
        halfOpenMaxCalls: 3
      },
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,   // 1 second
        maxDelay: 30000,      // 30 seconds
        backoffMultiplier: 2,
        jitterEnabled: true
      },
      performance: {
        responseTimeThreshold: 1000, // 1 second
        errorRateThreshold: 0.1,     // 10%
        memoryPressureThreshold: 0.8,  // 80%
        cpuUsageThreshold: 0.8         // 80%
      },
      layerPriority: ['memory', 'redis', 'browser', 'serviceworker', 'cdn'],
      ...config
    };
    
    this.initializeMetrics();
    this.initializeDegradationLevel();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing cache fallback manager', {
        component: 'CacheFallbackManager',
        strategies: Object.keys(this.config.strategies).filter(s => 
          this.config.strategies[s as keyof typeof this.config.strategies]
        ),
        layerPriority: this.config.layerPriority
      });
      
      // Initialize layer health status
      for (const layerName of this.config.layerPriority) {
        this.initializeLayerHealth(layerName);
      }
      
      // Start health checking if enabled
      if (this.config.healthCheck.enabled) {
        this.startHealthChecking();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Cache fallback manager initialized', {
        component: 'CacheFallbackManager'
      });
      
    } catch (error) {
      logger.error('Failed to initialize cache fallback manager', {
        component: 'CacheFallbackManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Register cache layer instance
   */
  registerCacheLayer(name: string, instance: any): void {
    this.cacheInstances.set(name, instance);
    
    if (!this.layerHealthStatus.has(name)) {
      this.initializeLayerHealth(name);
    }
    
    logger.debug('Cache layer registered', {
      component: 'CacheFallbackManager',
      layer: name
    });
  }
  
  /**
   * Execute cache operation with fallback
   */
  async executeWithFallback<T>(
    operation: 'get' | 'set' | 'delete' | 'clear',
    key: string,
    value?: any,
    options: any = {}
  ): Promise<T | null> {
    const operationId = this.generateOperationId();
    const fallbackOperation: FallbackOperation = {
      id: operationId,
      operation,
      key,
      value,
      options,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: this.config.retry.maxAttempts,
      nextAttemptTime: Date.now(),
      errors: [],
      layersAttempted: [],
      fallbackStrategy: 'layerFailover',
      completed: false
    };
    
    this.activeOperations.set(operationId, fallbackOperation);
    this.metrics.totalOperations++;
    
    try {
      const result = await this.executeFallbackOperation<T>(fallbackOperation);
      
      this.metrics.successfulOperations++;
      fallbackOperation.completed = true;
      fallbackOperation.result = result;
      
      this.emit('operationCompleted', fallbackOperation);
      return result;
      
    } catch (error) {
      this.metrics.failedOperations++;
      fallbackOperation.errors.push(error instanceof Error ? error.message : String(error));
      
      logger.error('Cache operation failed after all fallbacks', {
        component: 'CacheFallbackManager',
        operationId,
        operation,
        key,
        attempts: fallbackOperation.attempts,
        layersAttempted: fallbackOperation.layersAttempted,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('operationFailed', fallbackOperation);
      
      // Final fallback: bypass cache if enabled
      if (this.config.strategies.cacheBypass && operation === 'get') {
        this.metrics.bypassedOperations++;
        return await this.bypassCache<T>(key, options);
      }
      
      return null;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }
  
  /**
   * Get current system health status
   */
  getHealthStatus(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    layers: LayerHealth[];
    degradation: DegradationLevel;
    metrics: FallbackMetrics;
  } {
    const layers = Array.from(this.layerHealthStatus.values());
    const healthyLayers = layers.filter(l => l.isHealthy).length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyLayers === layers.length) {
      overall = 'healthy';
    } else if (healthyLayers > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }
    
    return {
      overall,
      layers,
      degradation: this.degradationLevel,
      metrics: this.getMetrics()
    };
  }
  
  /**
   * Force health check for all layers
   */
  async forceHealthCheck(): Promise<void> {
    const healthCheckPromises = Array.from(this.layerHealthStatus.keys()).map(
      layerName => this.performHealthCheck(layerName)
    );
    
    await Promise.allSettled(healthCheckPromises);
    this.updateDegradationLevel();
  }
  
  /**
   * Manually set layer health status
   */
  setLayerHealth(layerName: string, isHealthy: boolean, reason?: string): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    const wasHealthy = health.isHealthy;
    health.isHealthy = isHealthy;
    health.lastHealthCheck = Date.now();
    
    if (isHealthy) {
      health.consecutiveSuccesses++;
      health.consecutiveFailures = 0;
      health.lastSuccess = Date.now();
      health.status = 'healthy';
      
      // Reset circuit breaker on recovery
      if (health.circuitState.state === 'open') {
        this.closeCircuit(layerName);
      }
    } else {
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      health.lastFailure = Date.now();
      health.status = 'unhealthy';
      
      if (reason) {
        health.metadata.lastError = reason;
      }
    }
    
    // Trigger circuit breaker if needed
    if (this.config.strategies.circuitBreaker && !isHealthy) {
      this.checkCircuitBreaker(layerName);
    }
    
    if (wasHealthy !== isHealthy) {
      this.emit('layerHealthChanged', {
        layerName,
        isHealthy,
        previousState: wasHealthy,
        health
      });
      
      this.updateDegradationLevel();
    }
    
    logger.info('Layer health status updated', {
      component: 'CacheFallbackManager',
      layer: layerName,
      isHealthy,
      consecutiveFailures: health.consecutiveFailures,
      consecutiveSuccesses: health.consecutiveSuccesses,
      reason
    });
  }
  
  /**
   * Get fallback metrics
   */
  getMetrics(): FallbackMetrics {
    const currentTime = Date.now();
    const activeOps = Array.from(this.activeOperations.values());
    
    // Calculate average latency from completed operations
    let totalLatency = 0;
    let completedOps = 0;
    
    activeOps.forEach(op => {
      if (op.completed) {
        totalLatency += currentTime - op.timestamp;
        completedOps++;
      }
    });
    
    this.metrics.averageLatency = completedOps > 0 ? totalLatency / completedOps : 0;
    this.metrics.lastUpdated = currentTime;
    
    return { ...this.metrics };
  }
  
  private async executeFallbackOperation<T>(operation: FallbackOperation): Promise<T | null> {
    const startTime = Date.now();
    
    // Determine layer execution order based on health and priority
    const availableLayers = this.getAvailableLayers();
    
    for (const layerName of availableLayers) {
      // Check circuit breaker
      if (!this.canAttemptLayer(layerName)) {
        continue;
      }
      
      try {
        operation.attempts++;
        operation.layersAttempted.push(layerName);
        
        logger.debug('Attempting cache operation', {
          component: 'CacheFallbackManager',
          operationId: operation.id,
          layer: layerName,
          operation: operation.operation,
          key: operation.key,
          attempt: operation.attempts
        });
        
        const result = await this.executeOnLayer<T>(layerName, operation);
        
        // Record success
        this.recordLayerSuccess(layerName, Date.now() - startTime);
        
        // If this is a successful fallback to a lower-priority layer
        if (operation.layersAttempted.length > 1) {
          this.metrics.fallbackOperations++;
          this.emit('fallbackSuccess', {
            operationId: operation.id,
            successfulLayer: layerName,
            failedLayers: operation.layersAttempted.slice(0, -1)
          });
        }
        
        return result;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        operation.errors.push(`${layerName}: ${errorMessage}`);
        
        // Record failure
        this.recordLayerFailure(layerName, Date.now() - startTime, errorMessage);
        
        logger.warn('Cache layer operation failed', {
          component: 'CacheFallbackManager',
          operationId: operation.id,
          layer: layerName,
          operation: operation.operation,
          key: operation.key,
          error: errorMessage
        });
        
        // Continue to next layer unless this was the last attempt
        continue;
      }
    }
    
    // If we get here, all layers failed
    if (this.config.strategies.retryWithBackoff && operation.attempts < operation.maxAttempts) {
      return await this.retryWithBackoff<T>(operation);
    }
    
    throw new Error(`All cache layers failed for ${operation.operation} operation on key ${operation.key}`);
  }
  
  private async executeOnLayer<T>(layerName: string, operation: FallbackOperation): Promise<T | null> {
    const cacheInstance = this.cacheInstances.get(layerName);
    if (!cacheInstance) {
      throw new Error(`Cache layer ${layerName} not registered`);
    }
    
    switch (operation.operation) {
      case 'get':
        return await cacheInstance.get(operation.key);
      
      case 'set':
        await cacheInstance.set(operation.key, operation.value, operation.options);
        return operation.value;
      
      case 'delete':
        const deleted = await cacheInstance.delete(operation.key);
        return deleted as T;
      
      case 'clear':
        await cacheInstance.clear();
        return null;
      
      default:
        throw new Error(`Unsupported operation: ${operation.operation}`);
    }
  }
  
  private async retryWithBackoff<T>(operation: FallbackOperation): Promise<T | null> {
    this.metrics.retryAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      this.config.retry.initialDelay * Math.pow(this.config.retry.backoffMultiplier, operation.attempts - 1),
      this.config.retry.maxDelay
    );
    
    const delay = this.config.retry.jitterEnabled 
      ? baseDelay * (0.5 + Math.random() * 0.5) // 50-100% of base delay
      : baseDelay;
    
    operation.nextAttemptTime = Date.now() + delay;
    
    logger.debug('Retrying cache operation with backoff', {
      component: 'CacheFallbackManager',
      operationId: operation.id,
      attempt: operation.attempts + 1,
      delay,
      maxAttempts: operation.maxAttempts
    });
    
    await this.sleep(delay);
    
    return await this.executeFallbackOperation<T>(operation);
  }
  
  private async bypassCache<T>(key: string, options: any): Promise<T | null> {
    // This would fetch data directly from the source
    // For now, return null to indicate cache bypass
    logger.info('Cache bypassed, fetching from source', {
      component: 'CacheFallbackManager',
      key
    });
    
    this.emit('cacheBypass', { key, options });
    return null;
  }
  
  private getAvailableLayers(): string[] {
    return this.config.layerPriority.filter(layerName => {
      const health = this.layerHealthStatus.get(layerName);
      const instance = this.cacheInstances.get(layerName);
      
      return health && instance && (health.isHealthy || this.canAttemptDegradedLayer(layerName));
    });
  }
  
  private canAttemptLayer(layerName: string): boolean {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return false;
    
    // Check circuit breaker
    if (this.config.strategies.circuitBreaker) {
      const circuit = health.circuitState;
      
      switch (circuit.state) {
        case 'open':
          // Circuit is open, check if we can try again
          return Date.now() >= circuit.nextAttemptTime;
        
        case 'half-open':
          // In half-open state, limit the number of calls
          return circuit.halfOpenCalls < this.config.circuitBreaker.halfOpenMaxCalls;
        
        case 'closed':
          // Circuit is closed, normal operation
          return true;
        
        default:
          return false;
      }
    }
    
    return health.isHealthy || this.canAttemptDegradedLayer(layerName);
  }
  
  private canAttemptDegradedLayer(layerName: string): boolean {
    if (!this.config.strategies.gracefulDegradation) return false;
    
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return false;
    
    // Allow attempts on degraded layers if they're not completely failed
    return health.status === 'degraded' || 
           (health.status === 'unhealthy' && health.consecutiveFailures < 10);
  }
  
  private recordLayerSuccess(layerName: string, responseTime: number): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    health.consecutiveSuccesses++;
    health.consecutiveFailures = 0;
    health.lastSuccess = Date.now();
    health.lastHealthCheck = Date.now();
    
    // Update average response time
    const alpha = 0.1; // Exponential moving average factor
    health.averageResponseTime = health.averageResponseTime * (1 - alpha) + responseTime * alpha;
    
    // Update circuit breaker
    if (health.circuitState.state === 'half-open') {
      health.circuitState.successes++;
      health.circuitState.halfOpenCalls++;
      
      if (health.circuitState.successes >= this.config.circuitBreaker.successThreshold) {
        this.closeCircuit(layerName);
      }
    }
    
    // Mark as healthy if recovery threshold met
    if (!health.isHealthy && health.consecutiveSuccesses >= this.config.healthCheck.recoveryThreshold) {
      this.setLayerHealth(layerName, true, 'Recovery threshold met');
    }
  }
  
  private recordLayerFailure(layerName: string, responseTime: number, error: string): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    health.consecutiveFailures++;
    health.consecutiveSuccesses = 0;
    health.lastFailure = Date.now();
    health.lastHealthCheck = Date.now();
    health.metadata.lastError = error;
    
    // Update error rate (exponential moving average)
    const alpha = 0.1;
    health.errorRate = health.errorRate * (1 - alpha) + alpha;
    
    // Check if layer should be marked unhealthy
    if (health.isHealthy && health.consecutiveFailures >= this.config.healthCheck.consecutiveFailures) {
      this.setLayerHealth(layerName, false, `Consecutive failures: ${health.consecutiveFailures}`);
    }
    
    // Update circuit breaker
    this.checkCircuitBreaker(layerName);
  }
  
  private checkCircuitBreaker(layerName: string): void {
    if (!this.config.strategies.circuitBreaker) return;
    
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    const circuit = health.circuitState;
    
    if (circuit.state === 'closed') {
      circuit.failures++;
      
      if (circuit.failures >= this.config.circuitBreaker.failureThreshold) {
        this.openCircuit(layerName);
      }
    } else if (circuit.state === 'half-open') {
      circuit.halfOpenCalls++;
      
      // Failed in half-open state, go back to open
      this.openCircuit(layerName);
    }
  }
  
  private openCircuit(layerName: string): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    health.circuitState.state = 'open';
    health.circuitState.lastFailureTime = Date.now();
    health.circuitState.nextAttemptTime = Date.now() + this.config.circuitBreaker.recoveryTimeout;
    health.status = 'failed';
    
    this.metrics.circuitBreakerTrips++;
    
    logger.warn('Circuit breaker opened for cache layer', {
      component: 'CacheFallbackManager',
      layer: layerName,
      failures: health.circuitState.failures,
      nextAttempt: new Date(health.circuitState.nextAttemptTime).toISOString()
    });
    
    this.emit('circuitBreakerOpened', { layerName, health });
    
    // Schedule attempt to half-open
    setTimeout(() => {
      this.halfOpenCircuit(layerName);
    }, this.config.circuitBreaker.recoveryTimeout);
  }
  
  private halfOpenCircuit(layerName: string): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health || health.circuitState.state !== 'open') return;
    
    health.circuitState.state = 'half-open';
    health.circuitState.successes = 0;
    health.circuitState.halfOpenCalls = 0;
    health.status = 'degraded';
    
    logger.info('Circuit breaker half-opened for cache layer', {
      component: 'CacheFallbackManager',
      layer: layerName
    });
    
    this.emit('circuitBreakerHalfOpened', { layerName, health });
  }
  
  private closeCircuit(layerName: string): void {
    const health = this.layerHealthStatus.get(layerName);
    if (!health) return;
    
    health.circuitState.state = 'closed';
    health.circuitState.failures = 0;
    health.circuitState.successes = 0;
    health.circuitState.halfOpenCalls = 0;
    health.circuitState.lastSuccessTime = Date.now();
    health.status = 'healthy';
    
    logger.info('Circuit breaker closed for cache layer', {
      component: 'CacheFallbackManager',
      layer: layerName
    });
    
    this.emit('circuitBreakerClosed', { layerName, health });
  }
  
  private initializeLayerHealth(layerName: string): void {
    const health: LayerHealth = {
      layerName,
      isHealthy: true,
      status: 'healthy',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastHealthCheck: Date.now(),
      averageResponseTime: 0,
      errorRate: 0,
      circuitState: {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
        lastSuccessTime: Date.now(),
        nextAttemptTime: 0,
        halfOpenCalls: 0
      },
      metadata: {}
    };
    
    this.layerHealthStatus.set(layerName, health);
  }
  
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('Health check failed', {
          component: 'CacheFallbackManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.healthCheck.interval);
  }
  
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.cacheInstances.keys()).map(
      layerName => this.performHealthCheck(layerName)
    );
    
    await Promise.allSettled(healthCheckPromises);
    this.updateDegradationLevel();
  }
  
  private async performHealthCheck(layerName: string): Promise<void> {
    const instance = this.cacheInstances.get(layerName);
    if (!instance) return;
    
    const startTime = Date.now();
    
    try {
      // Simple health check - try to set and get a test value
      const testKey = `__health_check_${Date.now()}`;
      const testValue = 'health_check_value';
      
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheck.timeout);
      });
      
      await Promise.race([
        (async () => {
          await instance.set(testKey, testValue, { ttl: 60 }); // 1 minute TTL
          const retrieved = await instance.get(testKey);
          await instance.delete(testKey);
          
          if (retrieved !== testValue) {
            throw new Error('Health check value mismatch');
          }
        })(),
        timeout
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // Check performance thresholds
      let isHealthy = true;
      let reason = '';
      
      if (responseTime > this.config.performance.responseTimeThreshold) {
        isHealthy = false;
        reason = `Response time too high: ${responseTime}ms`;
      }
      
      this.recordLayerSuccess(layerName, responseTime);
      
      if (!isHealthy) {
        this.setLayerHealth(layerName, false, reason);
      } else {
        // Only update to healthy if not currently in a failure state
        const health = this.layerHealthStatus.get(layerName);
        if (health && health.consecutiveFailures === 0) {
          this.setLayerHealth(layerName, true, 'Health check passed');
        }
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.recordLayerFailure(layerName, responseTime, errorMessage);
      this.setLayerHealth(layerName, false, errorMessage);
    }
  }
  
  private updateDegradationLevel(): void {
    const layers = Array.from(this.layerHealthStatus.values());
    const healthyLayers = layers.filter(l => l.isHealthy).length;
    const totalLayers = layers.length;
    const healthPercentage = totalLayers > 0 ? healthyLayers / totalLayers : 1;
    
    let level: DegradationLevel['level'];
    let description: string;
    let limitations: string[] = [];
    let activeStrategies: string[] = [];
    
    if (healthPercentage >= 0.9) {
      level = 'normal';
      description = 'All cache layers operating normally';
    } else if (healthPercentage >= 0.7) {
      level = 'warning';
      description = 'Minor cache layer issues detected';
      limitations = ['Reduced cache redundancy'];
      activeStrategies = ['layerFailover'];
    } else if (healthPercentage >= 0.5) {
      level = 'degraded';
      description = 'Significant cache layer failures';
      limitations = ['Reduced cache redundancy', 'Increased response times'];
      activeStrategies = ['layerFailover', 'gracefulDegradation'];
    } else if (healthPercentage > 0) {
      level = 'critical';
      description = 'Critical cache layer failures';
      limitations = ['Severely reduced performance', 'Limited cache availability'];
      activeStrategies = ['layerFailover', 'gracefulDegradation', 'retryWithBackoff'];
    } else {
      level = 'emergency';
      description = 'All cache layers failed';
      limitations = ['No cache available', 'All requests bypass cache'];
      activeStrategies = ['cacheBypass'];
    }
    
    const newDegradationLevel: DegradationLevel = {
      level,
      description,
      limitations,
      activeStrategies,
      healthyLayers,
      totalLayers
    };
    
    // Check if degradation level changed
    if (this.degradationLevel.level !== newDegradationLevel.level) {
      const previousLevel = this.degradationLevel.level;
      this.degradationLevel = newDegradationLevel;
      
      logger.warn('Cache degradation level changed', {
        component: 'CacheFallbackManager',
        previousLevel,
        newLevel: level,
        healthyLayers,
        totalLayers,
        description
      });
      
      this.emit('degradationLevelChanged', {
        previousLevel,
        newLevel: newDegradationLevel,
        healthStatus: this.getHealthStatus()
      });
    } else {
      this.degradationLevel = newDegradationLevel;
    }
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      fallbackOperations: 0,
      averageLatency: 0,
      circuitBreakerTrips: 0,
      layerFailovers: 0,
      retryAttempts: 0,
      bypassedOperations: 0,
      lastUpdated: Date.now()
    };
  }
  
  private initializeDegradationLevel(): void {
    this.degradationLevel = {
      level: 'normal',
      description: 'System initializing',
      limitations: [],
      activeStrategies: [],
      healthyLayers: 0,
      totalLayers: 0
    };
  }
  
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.layerHealthStatus.clear();
    this.activeOperations.clear();
    this.cacheInstances.clear();
    this.removeAllListeners();
    
    this.isInitialized = false;
    
    logger.info('Cache fallback manager destroyed', {
      component: 'CacheFallbackManager'
    });
  }
}

export { CacheFallbackManager };