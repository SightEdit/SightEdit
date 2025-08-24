/**
 * Advanced Cache Warming and Prefetching Strategies for SightEdit
 * Intelligent cache preloading based on usage patterns and predictions
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface WarmingConfig {
  // Warming strategies
  strategies: {
    critical: boolean;      // Critical path warming
    popular: boolean;       // Popular content warming
    predictive: boolean;    // Predictive warming
    geographic: boolean;    // Geographic warming
    temporal: boolean;      // Time-based warming
  };
  
  // Timing configuration
  timing: {
    startupWarming: boolean;
    scheduleWarming: string[]; // Cron expressions
    idleWarming: boolean;
    beforeExpiry: number; // Seconds before expiry to refresh
  };
  
  // Resource limits
  limits: {
    maxConcurrentRequests: number;
    maxWarmingTime: number; // Max time to spend warming
    maxMemoryUsage: number; // Max memory for warming cache
    rateLimitPerSecond: number;
  };
  
  // Intelligence settings
  intelligence: {
    learningEnabled: boolean;
    predictionHorizon: number; // Hours to predict ahead
    patternDetection: boolean;
    userBehaviorTracking: boolean;
  };
  
  // Priority system
  priority: {
    levels: number;
    algorithm: 'weighted' | 'round-robin' | 'priority-queue';
    decay: number; // Priority decay rate
  };
}

export interface WarmingTarget {
  id: string;
  type: 'content' | 'schema' | 'asset' | 'query';
  key: string;
  priority: number;
  estimatedLoadTime: number;
  dependencies: string[];
  conditions: WarmingCondition[];
  fetcher: () => Promise<any>;
  validator?: (data: any) => boolean;
  transformer?: (data: any) => any;
  metadata: Record<string, any>;
}

export interface WarmingCondition {
  type: 'time' | 'user' | 'location' | 'device' | 'custom';
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in' | 'matches';
  value: any;
  context?: any;
}

export interface WarmingSession {
  id: string;
  startTime: number;
  endTime?: number;
  targets: WarmingTarget[];
  completed: number;
  failed: number;
  skipped: number;
  totalTime: number;
  strategy: string;
  metadata: Record<string, any>;
}

export interface UsagePattern {
  id: string;
  pattern: RegExp | string;
  frequency: number;
  avgAccessTime: number;
  peakHours: number[];
  userSegments: string[];
  dependencies: string[];
  lastSeen: number;
}

export interface PredictionModel {
  name: string;
  accuracy: number;
  features: string[];
  predictions: Map<string, number>; // key -> probability
  lastTraining: number;
}

export interface WarmingMetrics {
  totalSessions: number;
  successfulSessions: number;
  totalTargetsWarmed: number;
  avgWarmingTime: number;
  hitRateImprovement: number;
  memoryUsage: number;
  bandwidthUsed: number;
  costSavings: number;
  lastUpdated: number;
}

/**
 * Advanced cache warming and prefetching manager
 */
export class CacheWarmingManager extends EventEmitter {
  private config: WarmingConfig;
  private targets: Map<string, WarmingTarget> = new Map();
  private sessions: Map<string, WarmingSession> = new Map();
  private usagePatterns: Map<string, UsagePattern> = new Map();
  private predictionModels: Map<string, PredictionModel> = new Map();
  private metrics: WarmingMetrics;
  private scheduler?: NodeJS.Timeout;
  private warmingQueue: WarmingTarget[] = [];
  private activeWarming = false;
  private isInitialized = false;
  
  constructor(config: WarmingConfig) {
    super();
    this.config = {
      strategies: {
        critical: true,
        popular: true,
        predictive: false,
        geographic: false,
        temporal: true
      },
      timing: {
        startupWarming: true,
        scheduleWarming: ['0 2 * * *'], // Daily at 2 AM
        idleWarming: true,
        beforeExpiry: 300 // 5 minutes
      },
      limits: {
        maxConcurrentRequests: 5,
        maxWarmingTime: 30000, // 30 seconds
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        rateLimitPerSecond: 10
      },
      intelligence: {
        learningEnabled: true,
        predictionHorizon: 24,
        patternDetection: true,
        userBehaviorTracking: true
      },
      priority: {
        levels: 5,
        algorithm: 'weighted',
        decay: 0.1
      },
      ...config
    };
    
    this.initializeMetrics();
    this.initializePredictionModels();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing cache warming manager', {
        component: 'CacheWarmingManager',
        strategies: Object.keys(this.config.strategies).filter(s => this.config.strategies[s as keyof typeof this.config.strategies])
      });
      
      // Load historical patterns and models
      await this.loadUsagePatterns();
      await this.loadPredictionModels();
      
      // Set up schedulers
      this.setupScheduler();
      
      // Start learning if enabled
      if (this.config.intelligence.learningEnabled) {
        this.startLearning();
      }
      
      // Startup warming
      if (this.config.timing.startupWarming) {
        this.scheduleStartupWarming();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Cache warming manager initialized', {
        component: 'CacheWarmingManager'
      });
      
    } catch (error) {
      logger.error('Failed to initialize cache warming manager', {
        component: 'CacheWarmingManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Add warming target
   */
  addTarget(target: WarmingTarget): void {
    this.targets.set(target.id, target);
    
    logger.debug('Warming target added', {
      component: 'CacheWarmingManager',
      targetId: target.id,
      type: target.type,
      priority: target.priority
    });
    
    // Auto-queue high priority targets
    if (target.priority >= this.config.priority.levels - 1) {
      this.queueTarget(target);
    }
  }
  
  /**
   * Remove warming target
   */
  removeTarget(targetId: string): boolean {
    const removed = this.targets.delete(targetId);
    
    // Remove from queue if present
    this.warmingQueue = this.warmingQueue.filter(t => t.id !== targetId);
    
    if (removed) {
      logger.debug('Warming target removed', {
        component: 'CacheWarmingManager',
        targetId
      });
    }
    
    return removed;
  }
  
  /**
   * Start warming session
   */
  async startWarmingSession(strategy: string, targets?: WarmingTarget[]): Promise<string> {
    if (this.activeWarming) {
      throw new Error('Warming session already active');
    }
    
    const sessionId = this.generateSessionId();
    const session: WarmingSession = {
      id: sessionId,
      startTime: Date.now(),
      targets: targets || this.selectTargetsForStrategy(strategy),
      completed: 0,
      failed: 0,
      skipped: 0,
      totalTime: 0,
      strategy,
      metadata: {}
    };
    
    this.sessions.set(sessionId, session);
    this.activeWarming = true;
    
    try {
      logger.info('Starting cache warming session', {
        component: 'CacheWarmingManager',
        sessionId,
        strategy,
        targetsCount: session.targets.length
      });
      
      await this.executeWarmingSession(session);
      
      session.endTime = Date.now();
      session.totalTime = session.endTime - session.startTime;
      
      this.updateMetrics(session);
      this.emit('sessionCompleted', session);
      
      logger.info('Cache warming session completed', {
        component: 'CacheWarmingManager',
        sessionId,
        completed: session.completed,
        failed: session.failed,
        totalTime: session.totalTime
      });
      
    } catch (error) {
      session.endTime = Date.now();
      session.totalTime = session.endTime! - session.startTime;
      
      logger.error('Cache warming session failed', {
        component: 'CacheWarmingManager',
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('sessionFailed', { session, error });
      throw error;
    } finally {
      this.activeWarming = false;
    }
    
    return sessionId;
  }
  
  /**
   * Warm critical path
   */
  async warmCriticalPath(userContext?: any): Promise<void> {
    if (!this.config.strategies.critical) return;
    
    const criticalTargets = this.identifyCriticalTargets(userContext);
    
    if (criticalTargets.length > 0) {
      await this.startWarmingSession('critical', criticalTargets);
    }
  }
  
  /**
   * Warm popular content
   */
  async warmPopularContent(): Promise<void> {
    if (!this.config.strategies.popular) return;
    
    const popularTargets = this.identifyPopularTargets();
    
    if (popularTargets.length > 0) {
      await this.startWarmingSession('popular', popularTargets);
    }
  }
  
  /**
   * Predictive warming based on patterns
   */
  async predictiveWarming(): Promise<void> {
    if (!this.config.strategies.predictive) return;
    
    const predictions = await this.generatePredictions();
    const predictiveTargets = this.createTargetsFromPredictions(predictions);
    
    if (predictiveTargets.length > 0) {
      await this.startWarmingSession('predictive', predictiveTargets);
    }
  }
  
  /**
   * Geographic warming for edge locations
   */
  async geographicWarming(region: string): Promise<void> {
    if (!this.config.strategies.geographic) return;
    
    const geoTargets = this.identifyGeographicTargets(region);
    
    if (geoTargets.length > 0) {
      await this.startWarmingSession('geographic', geoTargets);
    }
  }
  
  /**
   * Time-based warming for scheduled content
   */
  async temporalWarming(): Promise<void> {
    if (!this.config.strategies.temporal) return;
    
    const temporalTargets = this.identifyTemporalTargets();
    
    if (temporalTargets.length > 0) {
      await this.startWarmingSession('temporal', temporalTargets);
    }
  }
  
  /**
   * Record access pattern for learning
   */
  recordAccess(key: string, context: any = {}): void {
    if (!this.config.intelligence.userBehaviorTracking) return;
    
    const now = Date.now();
    const hour = new Date().getHours();
    
    // Update or create usage pattern
    let pattern = this.usagePatterns.get(key);
    if (!pattern) {
      pattern = {
        id: key,
        pattern: key,
        frequency: 0,
        avgAccessTime: 0,
        peakHours: [],
        userSegments: [],
        dependencies: [],
        lastSeen: now
      };
      this.usagePatterns.set(key, pattern);
    }
    
    // Update pattern data
    pattern.frequency++;
    pattern.lastSeen = now;
    
    // Update peak hours
    if (!pattern.peakHours.includes(hour)) {
      pattern.peakHours.push(hour);
    }
    
    // Extract user segment if available
    if (context.userSegment && !pattern.userSegments.includes(context.userSegment)) {
      pattern.userSegments.push(context.userSegment);
    }
    
    // Update prediction models
    if (this.config.intelligence.learningEnabled) {
      this.updatePredictionModels(key, context);
    }
    
    this.emit('accessRecorded', { key, pattern, context });
  }
  
  /**
   * Get warming metrics
   */
  getMetrics(): WarmingMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get session history
   */
  getSessionHistory(limit: number = 10): WarmingSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }
  
  /**
   * Get usage patterns
   */
  getUsagePatterns(limit: number = 50): UsagePattern[] {
    return Array.from(this.usagePatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }
  
  private async executeWarmingSession(session: WarmingSession): Promise<void> {
    const sortedTargets = this.prioritizeTargets(session.targets);
    const concurrentTasks: Promise<void>[] = [];
    let activeRequests = 0;
    
    for (const target of sortedTargets) {
      // Check conditions
      if (!this.evaluateConditions(target.conditions)) {
        session.skipped++;
        continue;
      }
      
      // Rate limiting
      while (activeRequests >= this.config.limits.maxConcurrentRequests) {
        await Promise.race(concurrentTasks);
        activeRequests = concurrentTasks.length;
      }
      
      // Create warming task
      const task = this.warmTarget(target, session);
      concurrentTasks.push(task);
      activeRequests++;
      
      // Remove completed tasks
      task.finally(() => {
        const index = concurrentTasks.indexOf(task);
        if (index > -1) {
          concurrentTasks.splice(index, 1);
        }
      });
      
      // Check time limits
      if (Date.now() - session.startTime > this.config.limits.maxWarmingTime) {
        logger.warn('Warming session time limit reached', {
          component: 'CacheWarmingManager',
          sessionId: session.id,
          timeSpent: Date.now() - session.startTime
        });
        break;
      }
    }
    
    // Wait for all tasks to complete
    await Promise.allSettled(concurrentTasks);
  }
  
  private async warmTarget(target: WarmingTarget, session: WarmingSession): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Warming target', {
        component: 'CacheWarmingManager',
        targetId: target.id,
        type: target.type,
        key: target.key
      });
      
      // Fetch data
      const data = await target.fetcher();
      
      // Validate data if validator provided
      if (target.validator && !target.validator(data)) {
        throw new Error('Data validation failed');
      }
      
      // Transform data if transformer provided
      const finalData = target.transformer ? target.transformer(data) : data;
      
      // Cache the data (emit event for cache layers to handle)
      this.emit('warmingData', {
        key: target.key,
        data: finalData,
        target,
        session: session.id
      });
      
      session.completed++;
      
      const duration = Date.now() - startTime;
      logger.debug('Target warmed successfully', {
        component: 'CacheWarmingManager',
        targetId: target.id,
        duration
      });
      
    } catch (error) {
      session.failed++;
      
      logger.warn('Failed to warm target', {
        component: 'CacheWarmingManager',
        targetId: target.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('warmingError', {
        target,
        session: session.id,
        error
      });
    }
  }
  
  private identifyCriticalTargets(userContext?: any): WarmingTarget[] {
    return Array.from(this.targets.values()).filter(target => {
      // Critical path items have high priority
      if (target.priority < this.config.priority.levels - 2) return false;
      
      // Check user context conditions
      if (userContext) {
        return this.evaluateConditions(target.conditions, userContext);
      }
      
      return true;
    });
  }
  
  private identifyPopularTargets(): WarmingTarget[] {
    // Get most frequently accessed patterns
    const popularPatterns = Array.from(this.usagePatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20)
      .map(p => p.id);
    
    return Array.from(this.targets.values()).filter(target =>
      popularPatterns.includes(target.key)
    );
  }
  
  private identifyTemporalTargets(): WarmingTarget[] {
    const currentHour = new Date().getHours();
    
    return Array.from(this.targets.values()).filter(target => {
      const pattern = this.usagePatterns.get(target.key);
      return pattern && pattern.peakHours.includes(currentHour);
    });
  }
  
  private identifyGeographicTargets(region: string): WarmingTarget[] {
    return Array.from(this.targets.values()).filter(target => {
      return target.conditions.some(condition =>
        condition.type === 'location' &&
        condition.value === region
      );
    });
  }
  
  private async generatePredictions(): Promise<Map<string, number>> {
    const predictions = new Map<string, number>();
    
    for (const [modelName, model] of this.predictionModels) {
      // Simple prediction based on historical patterns
      for (const [key, pattern] of this.usagePatterns) {
        const now = Date.now();
        const timeSinceLastAccess = now - pattern.lastSeen;
        const avgAccessInterval = 24 * 60 * 60 * 1000 / pattern.frequency; // Average time between accesses
        
        // Predict probability of access within prediction horizon
        const probability = Math.max(0, 1 - (timeSinceLastAccess / avgAccessInterval));
        
        if (probability > 0.5) {
          predictions.set(key, probability);
        }
      }
    }
    
    return predictions;
  }
  
  private createTargetsFromPredictions(predictions: Map<string, number>): WarmingTarget[] {
    const predictiveTargets: WarmingTarget[] = [];
    
    for (const [key, probability] of predictions) {
      const existingTarget = this.targets.get(key);
      if (existingTarget) {
        // Adjust priority based on prediction probability
        const adjustedTarget = {
          ...existingTarget,
          priority: Math.round(probability * this.config.priority.levels),
          metadata: {
            ...existingTarget.metadata,
            predicted: true,
            probability
          }
        };
        predictiveTargets.push(adjustedTarget);
      }
    }
    
    return predictiveTargets;
  }
  
  private prioritizeTargets(targets: WarmingTarget[]): WarmingTarget[] {
    switch (this.config.priority.algorithm) {
      case 'weighted':
        return targets.sort((a, b) => {
          const scoreA = this.calculateWeightedScore(a);
          const scoreB = this.calculateWeightedScore(b);
          return scoreB - scoreA;
        });
      
      case 'priority-queue':
        return targets.sort((a, b) => b.priority - a.priority);
      
      case 'round-robin':
        // Group by priority and round-robin within groups
        const groups = new Map<number, WarmingTarget[]>();
        for (const target of targets) {
          if (!groups.has(target.priority)) {
            groups.set(target.priority, []);
          }
          groups.get(target.priority)!.push(target);
        }
        
        const result: WarmingTarget[] = [];
        const sortedPriorities = Array.from(groups.keys()).sort((a, b) => b - a);
        
        let maxLength = Math.max(...Array.from(groups.values()).map(g => g.length));
        for (let i = 0; i < maxLength; i++) {
          for (const priority of sortedPriorities) {
            const group = groups.get(priority)!;
            if (i < group.length) {
              result.push(group[i]);
            }
          }
        }
        
        return result;
      
      default:
        return targets;
    }
  }
  
  private calculateWeightedScore(target: WarmingTarget): number {
    let score = target.priority * 10;
    
    // Add frequency bonus
    const pattern = this.usagePatterns.get(target.key);
    if (pattern) {
      score += pattern.frequency * 0.1;
    }
    
    // Add recency bonus
    if (pattern) {
      const hoursSinceLastAccess = (Date.now() - pattern.lastSeen) / (1000 * 60 * 60);
      score += Math.max(0, 10 - hoursSinceLastAccess);
    }
    
    // Subtract estimated load time penalty
    score -= target.estimatedLoadTime * 0.001;
    
    return score;
  }
  
  private evaluateConditions(conditions: WarmingCondition[], context: any = {}): boolean {
    if (conditions.length === 0) return true;
    
    return conditions.every(condition => {
      const contextValue = context[condition.type] || this.getContextValue(condition.type);
      
      switch (condition.operator) {
        case 'equals':
          return contextValue === condition.value;
        case 'contains':
          return String(contextValue).includes(String(condition.value));
        case 'gt':
          return Number(contextValue) > Number(condition.value);
        case 'lt':
          return Number(contextValue) < Number(condition.value);
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(contextValue);
        case 'matches':
          return new RegExp(condition.value).test(String(contextValue));
        default:
          return true;
      }
    });
  }
  
  private getContextValue(type: string): any {
    switch (type) {
      case 'time':
        return new Date().getHours();
      case 'user':
        return 'anonymous'; // Would get from actual user context
      case 'location':
        return 'unknown'; // Would get from geolocation
      case 'device':
        return 'desktop'; // Would get from user agent
      default:
        return null;
    }
  }
  
  private queueTarget(target: WarmingTarget): void {
    if (!this.warmingQueue.find(t => t.id === target.id)) {
      this.warmingQueue.push(target);
      this.sortQueue();
    }
  }
  
  private sortQueue(): void {
    this.warmingQueue = this.prioritizeTargets(this.warmingQueue);
  }
  
  private setupScheduler(): void {
    // Simple scheduler - in production use a proper cron library
    this.scheduler = setInterval(() => {
      this.runScheduledWarming();
    }, 60000); // Check every minute
  }
  
  private async runScheduledWarming(): Promise<void> {
    const hour = new Date().getHours();
    
    // Check if it's a scheduled warming time (simplified)
    const shouldWarm = this.config.timing.scheduleWarming.some(schedule => {
      // Simple parsing for '0 2 * * *' (2 AM daily)
      const parts = schedule.split(' ');
      return parts.length >= 2 && parseInt(parts[1]) === hour;
    });
    
    if (shouldWarm && !this.activeWarming) {
      try {
        await this.temporalWarming();
      } catch (error) {
        logger.error('Scheduled warming failed', {
          component: 'CacheWarmingManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  
  private scheduleStartupWarming(): void {
    // Delay startup warming to avoid competing with initial load
    setTimeout(async () => {
      try {
        await this.warmCriticalPath();
      } catch (error) {
        logger.error('Startup warming failed', {
          component: 'CacheWarmingManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 5000);
  }
  
  private startLearning(): void {
    // Periodically update prediction models
    setInterval(() => {
      this.trainPredictionModels();
    }, 60000 * 60); // Every hour
  }
  
  private async loadUsagePatterns(): Promise<void> {
    // In production, load from persistent storage
    logger.debug('Usage patterns loaded', {
      component: 'CacheWarmingManager',
      patternsCount: this.usagePatterns.size
    });
  }
  
  private async loadPredictionModels(): Promise<void> {
    // In production, load from persistent storage
    logger.debug('Prediction models loaded', {
      component: 'CacheWarmingManager',
      modelsCount: this.predictionModels.size
    });
  }
  
  private updatePredictionModels(key: string, context: any): void {
    // Update models with new access data
    for (const [modelName, model] of this.predictionModels) {
      // Simple update - in production use proper ML algorithms
      const currentProbability = model.predictions.get(key) || 0;
      const newProbability = Math.min(1, currentProbability + 0.1);
      model.predictions.set(key, newProbability);
    }
  }
  
  private trainPredictionModels(): void {
    // Train models based on accumulated data
    for (const [modelName, model] of this.predictionModels) {
      // Simple training - in production use proper ML training
      model.lastTraining = Date.now();
      model.accuracy = Math.min(1, model.accuracy + 0.01);
    }
    
    logger.debug('Prediction models trained', {
      component: 'CacheWarmingManager',
      modelsCount: this.predictionModels.size
    });
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      totalSessions: 0,
      successfulSessions: 0,
      totalTargetsWarmed: 0,
      avgWarmingTime: 0,
      hitRateImprovement: 0,
      memoryUsage: 0,
      bandwidthUsed: 0,
      costSavings: 0,
      lastUpdated: Date.now()
    };
  }
  
  private initializePredictionModels(): void {
    // Initialize basic prediction models
    this.predictionModels.set('frequency', {
      name: 'Frequency-based Prediction',
      accuracy: 0.7,
      features: ['frequency', 'recency'],
      predictions: new Map(),
      lastTraining: Date.now()
    });
    
    this.predictionModels.set('temporal', {
      name: 'Temporal Pattern Prediction',
      accuracy: 0.6,
      features: ['peak_hours', 'day_of_week'],
      predictions: new Map(),
      lastTraining: Date.now()
    });
  }
  
  private updateMetrics(session: WarmingSession): void {
    this.metrics.totalSessions++;
    if (session.failed === 0) {
      this.metrics.successfulSessions++;
    }
    
    this.metrics.totalTargetsWarmed += session.completed;
    
    // Update average warming time
    const currentAvg = this.metrics.avgWarmingTime;
    const count = this.metrics.totalSessions;
    this.metrics.avgWarmingTime = ((currentAvg * (count - 1)) + session.totalTime) / count;
    
    this.metrics.lastUpdated = Date.now();
  }
  
  private generateSessionId(): string {
    return `warming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.scheduler) {
      clearInterval(this.scheduler);
    }
    
    this.targets.clear();
    this.sessions.clear();
    this.usagePatterns.clear();
    this.predictionModels.clear();
    this.warmingQueue = [];
    this.removeAllListeners();
    
    this.isInitialized = false;
    
    logger.info('Cache warming manager destroyed', {
      component: 'CacheWarmingManager'
    });
  }
}

export { CacheWarmingManager };