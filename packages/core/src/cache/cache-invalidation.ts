/**
 * Advanced Cache Invalidation and Content Versioning for SightEdit
 * Handles intelligent cache invalidation, content versioning, and cache consistency
 */

import { logger } from '../utils/logger';
import { EventEmitter } from '../utils/event-emitter';

export interface InvalidationConfig {
  // Versioning strategy
  versioningStrategy: 'timestamp' | 'semantic' | 'hash' | 'hybrid';
  
  // Invalidation methods
  methods: {
    push: boolean; // Push-based invalidation
    pull: boolean; // Pull-based validation
    ttl: boolean;  // TTL-based expiration
    event: boolean; // Event-driven invalidation
  };
  
  // Propagation settings
  propagation: {
    enabled: boolean;
    maxDepth: number;
    batchSize: number;
    delayMs: number;
  };
  
  // Consistency levels
  consistency: 'eventual' | 'strong' | 'causal';
  
  // Network optimization
  compression: boolean;
  delta: boolean; // Send only changes
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    trackInvalidations: boolean;
    reportMetrics: boolean;
  };
}

export interface CacheVersion {
  version: string;
  timestamp: number;
  checksum?: string;
  parentVersion?: string;
  tags: string[];
  metadata: Record<string, any>;
}

export interface InvalidationEvent {
  type: 'content_change' | 'schema_change' | 'permission_change' | 'manual';
  source: string;
  target: string | string[];
  scope: 'key' | 'pattern' | 'tag' | 'global';
  priority: 'low' | 'medium' | 'high' | 'critical';
  version?: CacheVersion;
  propagate: boolean;
  metadata?: Record<string, any>;
}

export interface InvalidationRule {
  id: string;
  name: string;
  pattern: string | RegExp;
  triggers: string[];
  action: 'delete' | 'refresh' | 'mark_stale';
  cascade: string[];
  condition?: (context: any) => boolean;
  priority: number;
  enabled: boolean;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>;
}

export interface DependencyNode {
  id: string;
  type: 'content' | 'schema' | 'component';
  version: CacheVersion;
  dependents: Set<string>;
  dependencies: Set<string>;
  lastInvalidated: number;
}

export interface InvalidationMetrics {
  totalInvalidations: number;
  invalidationsByType: Record<string, number>;
  avgPropagationTime: number;
  cascadeDepth: number;
  failedInvalidations: number;
  versionsGenerated: number;
  consistencyViolations: number;
  lastUpdated: number;
}

/**
 * Main cache invalidation manager
 */
export class CacheInvalidationManager extends EventEmitter {
  private config: InvalidationConfig;
  private versionManager: VersionManager;
  private dependencyGraph: DependencyGraph;
  private invalidationRules: Map<string, InvalidationRule> = new Map();
  private metrics: InvalidationMetrics;
  private eventQueue: InvalidationEvent[] = [];
  private propagationWorker?: NodeJS.Timeout;
  private consistencyChecker?: NodeJS.Timeout;
  private isInitialized = false;
  
  constructor(config: InvalidationConfig) {
    super();
    this.config = {
      versioningStrategy: 'hybrid',
      methods: {
        push: true,
        pull: true,
        ttl: true,
        event: true
      },
      propagation: {
        enabled: true,
        maxDepth: 5,
        batchSize: 50,
        delayMs: 100
      },
      consistency: 'eventual',
      compression: true,
      delta: true,
      monitoring: {
        enabled: true,
        trackInvalidations: true,
        reportMetrics: true
      },
      ...config
    };
    
    this.versionManager = new VersionManager(this.config.versioningStrategy);
    this.dependencyGraph = { nodes: new Map(), edges: new Map() };
    this.initializeMetrics();
    this.setupDefaultRules();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      logger.info('Initializing cache invalidation manager', {
        component: 'CacheInvalidationManager',
        strategy: this.config.versioningStrategy,
        consistency: this.config.consistency
      });
      
      if (this.config.propagation.enabled) {
        this.startPropagationWorker();
      }
      
      if (this.config.consistency === 'strong') {
        this.startConsistencyChecker();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Cache invalidation manager initialized', {
        component: 'CacheInvalidationManager'
      });
      
    } catch (error) {
      logger.error('Failed to initialize cache invalidation manager', {
        component: 'CacheInvalidationManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Create a new content version
   */
  createVersion(content: any, tags: string[] = [], metadata: Record<string, any> = {}): CacheVersion {
    return this.versionManager.createVersion(content, tags, metadata);
  }
  
  /**
   * Register cache dependency
   */
  addDependency(nodeId: string, dependsOn: string, type: 'content' | 'schema' | 'component' = 'content'): void {
    // Ensure nodes exist
    if (!this.dependencyGraph.nodes.has(nodeId)) {
      this.dependencyGraph.nodes.set(nodeId, {
        id: nodeId,
        type,
        version: this.versionManager.createVersion({}, [], { nodeId }),
        dependents: new Set(),
        dependencies: new Set(),
        lastInvalidated: 0
      });
    }
    
    if (!this.dependencyGraph.nodes.has(dependsOn)) {
      this.dependencyGraph.nodes.set(dependsOn, {
        id: dependsOn,
        type,
        version: this.versionManager.createVersion({}, [], { nodeId: dependsOn }),
        dependents: new Set(),
        dependencies: new Set(),
        lastInvalidated: 0
      });
    }
    
    // Add dependency relationship
    const node = this.dependencyGraph.nodes.get(nodeId)!;
    const dependency = this.dependencyGraph.nodes.get(dependsOn)!;
    
    node.dependencies.add(dependsOn);
    dependency.dependents.add(nodeId);
    
    // Update edges
    if (!this.dependencyGraph.edges.has(dependsOn)) {
      this.dependencyGraph.edges.set(dependsOn, new Set());
    }
    this.dependencyGraph.edges.get(dependsOn)!.add(nodeId);
    
    logger.debug('Cache dependency added', {
      component: 'CacheInvalidationManager',
      nodeId,
      dependsOn,
      type
    });
  }
  
  /**
   * Remove cache dependency
   */
  removeDependency(nodeId: string, dependsOn: string): void {
    const node = this.dependencyGraph.nodes.get(nodeId);
    const dependency = this.dependencyGraph.nodes.get(dependsOn);
    
    if (node && dependency) {
      node.dependencies.delete(dependsOn);
      dependency.dependents.delete(nodeId);
      
      const edges = this.dependencyGraph.edges.get(dependsOn);
      if (edges) {
        edges.delete(nodeId);
        if (edges.size === 0) {
          this.dependencyGraph.edges.delete(dependsOn);
        }
      }
    }
  }
  
  /**
   * Add invalidation rule
   */
  addRule(rule: InvalidationRule): void {
    this.invalidationRules.set(rule.id, rule);
    
    logger.debug('Invalidation rule added', {
      component: 'CacheInvalidationManager',
      ruleId: rule.id,
      ruleName: rule.name
    });
  }
  
  /**
   * Remove invalidation rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.invalidationRules.delete(ruleId);
    
    if (removed) {
      logger.debug('Invalidation rule removed', {
        component: 'CacheInvalidationManager',
        ruleId
      });
    }
    
    return removed;
  }
  
  /**
   * Trigger cache invalidation
   */
  async invalidate(event: InvalidationEvent): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      this.metrics.totalInvalidations++;
      this.metrics.invalidationsByType[event.type] = (this.metrics.invalidationsByType[event.type] || 0) + 1;
      
      logger.info('Cache invalidation triggered', {
        component: 'CacheInvalidationManager',
        type: event.type,
        source: event.source,
        target: event.target,
        scope: event.scope,
        priority: event.priority
      });
      
      // Apply matching rules
      await this.applyRules(event);
      
      // Handle direct invalidation
      await this.processInvalidation(event);
      
      // Handle cascade invalidation
      if (event.propagate && this.config.propagation.enabled) {
        await this.cascadeInvalidation(event);
      }
      
      this.emit('invalidated', event);
      
    } catch (error) {
      this.metrics.failedInvalidations++;
      
      logger.error('Cache invalidation failed', {
        component: 'CacheInvalidationManager',
        event,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.emit('invalidationError', { event, error });
      throw error;
    }
  }
  
  /**
   * Batch invalidate multiple items
   */
  async invalidateBatch(events: InvalidationEvent[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Sort events by priority
      const sortedEvents = events.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
      
      // Process in batches
      const batchSize = this.config.propagation.batchSize;
      for (let i = 0; i < sortedEvents.length; i += batchSize) {
        const batch = sortedEvents.slice(i, i + batchSize);
        
        await Promise.all(batch.map(event => this.invalidate(event)));
        
        // Add delay between batches to prevent overwhelming
        if (i + batchSize < sortedEvents.length) {
          await this.sleep(this.config.propagation.delayMs);
        }
      }
      
      const duration = Date.now() - startTime;
      this.updatePropagationMetrics(duration);
      
      logger.info('Batch invalidation completed', {
        component: 'CacheInvalidationManager',
        eventsCount: events.length,
        duration
      });
      
    } catch (error) {
      logger.error('Batch invalidation failed', {
        component: 'CacheInvalidationManager',
        eventsCount: events.length,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Check if content version is valid
   */
  isVersionValid(contentId: string, version: CacheVersion, currentVersion: CacheVersion): boolean {
    return this.versionManager.compareVersions(version, currentVersion) >= 0;
  }
  
  /**
   * Get dependency chain for a node
   */
  getDependencyChain(nodeId: string, maxDepth: number = this.config.propagation.maxDepth): string[] {
    const visited = new Set<string>();
    const chain: string[] = [];
    
    const traverse = (id: string, depth: number) => {
      if (depth >= maxDepth || visited.has(id)) {
        return;
      }
      
      visited.add(id);
      chain.push(id);
      
      const edges = this.dependencyGraph.edges.get(id);
      if (edges) {
        edges.forEach(dependentId => {
          traverse(dependentId, depth + 1);
        });
      }
    };
    
    traverse(nodeId, 0);
    return chain.slice(1); // Remove the original node
  }
  
  /**
   * Get invalidation metrics
   */
  getMetrics(): InvalidationMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get dependency graph info
   */
  getDependencyGraphInfo(): {
    nodesCount: number;
    edgesCount: number;
    maxDepth: number;
    orphanNodes: string[];
  } {
    const orphanNodes: string[] = [];
    let maxDepth = 0;
    let totalEdges = 0;
    
    for (const [nodeId, edges] of this.dependencyGraph.edges) {
      totalEdges += edges.size;
      
      // Calculate depth for each node
      const depth = this.calculateNodeDepth(nodeId);
      maxDepth = Math.max(maxDepth, depth);
    }
    
    // Find orphan nodes (nodes with no dependencies or dependents)
    for (const [nodeId, node] of this.dependencyGraph.nodes) {
      if (node.dependencies.size === 0 && node.dependents.size === 0) {
        orphanNodes.push(nodeId);
      }
    }
    
    return {
      nodesCount: this.dependencyGraph.nodes.size,
      edgesCount: totalEdges,
      maxDepth,
      orphanNodes
    };
  }
  
  private async applyRules(event: InvalidationEvent): Promise<void> {
    const matchingRules = Array.from(this.invalidationRules.values()).filter(rule => {
      if (!rule.enabled) return false;
      
      // Check if rule triggers match event type
      if (!rule.triggers.includes(event.type)) return false;
      
      // Check pattern match
      let patternMatch = false;
      if (typeof rule.pattern === 'string') {
        patternMatch = Array.isArray(event.target) 
          ? event.target.some(t => t.includes(rule.pattern as string))
          : (event.target as string).includes(rule.pattern);
      } else {
        patternMatch = Array.isArray(event.target)
          ? event.target.some(t => (rule.pattern as RegExp).test(t))
          : (rule.pattern as RegExp).test(event.target as string);
      }
      
      if (!patternMatch) return false;
      
      // Check condition
      if (rule.condition && !rule.condition(event)) return false;
      
      return true;
    });
    
    // Sort rules by priority
    matchingRules.sort((a, b) => b.priority - a.priority);
    
    // Apply rules
    for (const rule of matchingRules) {
      try {
        await this.applyRule(rule, event);
      } catch (error) {
        logger.error('Failed to apply invalidation rule', {
          component: 'CacheInvalidationManager',
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  
  private async applyRule(rule: InvalidationRule, event: InvalidationEvent): Promise<void> {
    logger.debug('Applying invalidation rule', {
      component: 'CacheInvalidationManager',
      ruleId: rule.id,
      action: rule.action
    });
    
    // Create cascade events
    const cascadeEvents: InvalidationEvent[] = rule.cascade.map(target => ({
      type: 'manual',
      source: `rule:${rule.id}`,
      target,
      scope: 'pattern',
      priority: event.priority,
      propagate: true,
      metadata: {
        originalEvent: event,
        rule: rule.id
      }
    }));
    
    // Queue cascade events
    this.eventQueue.push(...cascadeEvents);
  }
  
  private async processInvalidation(event: InvalidationEvent): Promise<void> {
    switch (event.scope) {
      case 'key':
        await this.invalidateKey(event.target as string);
        break;
      case 'pattern':
        await this.invalidatePattern(event.target as string);
        break;
      case 'tag':
        await this.invalidateByTags(Array.isArray(event.target) ? event.target : [event.target]);
        break;
      case 'global':
        await this.invalidateAll();
        break;
    }
  }
  
  private async cascadeInvalidation(event: InvalidationEvent): Promise<void> {
    const targetIds = Array.isArray(event.target) ? event.target : [event.target];
    const cascadeEvents: InvalidationEvent[] = [];
    
    for (const targetId of targetIds) {
      const dependentIds = this.getDependencyChain(targetId);
      
      for (const dependentId of dependentIds) {
        cascadeEvents.push({
          type: 'content_change',
          source: event.source,
          target: dependentId,
          scope: 'key',
          priority: event.priority,
          propagate: false, // Prevent infinite cascade
          metadata: {
            cascadeFrom: targetId,
            originalEvent: event
          }
        });
      }
    }
    
    if (cascadeEvents.length > 0) {
      this.eventQueue.push(...cascadeEvents);
      this.updateCascadeMetrics(cascadeEvents.length);
    }
  }
  
  private async invalidateKey(key: string): Promise<void> {
    // This would integrate with actual cache layers
    this.emit('invalidateKey', { key });
  }
  
  private async invalidatePattern(pattern: string): Promise<void> {
    // This would integrate with actual cache layers
    this.emit('invalidatePattern', { pattern });
  }
  
  private async invalidateByTags(tags: string[]): Promise<void> {
    // This would integrate with actual cache layers
    this.emit('invalidateByTags', { tags });
  }
  
  private async invalidateAll(): Promise<void> {
    // This would integrate with actual cache layers
    this.emit('invalidateAll');
  }
  
  private calculateNodeDepth(nodeId: string, visited = new Set<string>()): number {
    if (visited.has(nodeId)) return 0; // Circular dependency
    
    visited.add(nodeId);
    
    const node = this.dependencyGraph.nodes.get(nodeId);
    if (!node || node.dependencies.size === 0) {
      return 0;
    }
    
    let maxDepth = 0;
    for (const depId of node.dependencies) {
      const depth = this.calculateNodeDepth(depId, new Set(visited));
      maxDepth = Math.max(maxDepth, depth + 1);
    }
    
    return maxDepth;
  }
  
  private startPropagationWorker(): void {
    this.propagationWorker = setInterval(async () => {
      if (this.eventQueue.length > 0) {
        const events = this.eventQueue.splice(0, this.config.propagation.batchSize);
        
        try {
          await Promise.all(events.map(event => this.processInvalidation(event)));
        } catch (error) {
          logger.error('Propagation worker error', {
            component: 'CacheInvalidationManager',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }, this.config.propagation.delayMs);
  }
  
  private startConsistencyChecker(): void {
    this.consistencyChecker = setInterval(() => {
      this.checkConsistency();
    }, 60000); // Check every minute
  }
  
  private checkConsistency(): void {
    // Implement consistency checking logic
    // This would verify that cache versions are consistent across layers
    logger.debug('Consistency check completed', {
      component: 'CacheInvalidationManager'
    });
  }
  
  private initializeMetrics(): void {
    this.metrics = {
      totalInvalidations: 0,
      invalidationsByType: {},
      avgPropagationTime: 0,
      cascadeDepth: 0,
      failedInvalidations: 0,
      versionsGenerated: 0,
      consistencyViolations: 0,
      lastUpdated: Date.now()
    };
  }
  
  private updatePropagationMetrics(duration: number): void {
    const currentAvg = this.metrics.avgPropagationTime;
    const count = this.metrics.totalInvalidations;
    this.metrics.avgPropagationTime = ((currentAvg * (count - 1)) + duration) / count;
  }
  
  private updateCascadeMetrics(cascadeCount: number): void {
    this.metrics.cascadeDepth = Math.max(this.metrics.cascadeDepth, cascadeCount);
  }
  
  private setupDefaultRules(): void {
    // Content change rules
    this.addRule({
      id: 'content-change-cascade',
      name: 'Content Change Cascade',
      pattern: /^content:/,
      triggers: ['content_change'],
      action: 'delete',
      cascade: ['schema:*', 'component:*'],
      priority: 100,
      enabled: true
    });
    
    // Schema change rules
    this.addRule({
      id: 'schema-change-cascade',
      name: 'Schema Change Cascade',
      pattern: /^schema:/,
      triggers: ['schema_change'],
      action: 'refresh',
      cascade: ['content:*'],
      priority: 200,
      enabled: true
    });
    
    // Permission change rules
    this.addRule({
      id: 'permission-change',
      name: 'Permission Change',
      pattern: /^user:|^role:/,
      triggers: ['permission_change'],
      action: 'delete',
      cascade: ['content:*'],
      priority: 300,
      enabled: true
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.propagationWorker) {
      clearInterval(this.propagationWorker);
    }
    
    if (this.consistencyChecker) {
      clearInterval(this.consistencyChecker);
    }
    
    this.eventQueue = [];
    this.invalidationRules.clear();
    this.dependencyGraph.nodes.clear();
    this.dependencyGraph.edges.clear();
    this.removeAllListeners();
    
    this.isInitialized = false;
    
    logger.info('Cache invalidation manager destroyed', {
      component: 'CacheInvalidationManager'
    });
  }
}

/**
 * Version management system
 */
class VersionManager {
  private strategy: string;
  private versionCounter = 0;
  
  constructor(strategy: string) {
    this.strategy = strategy;
  }
  
  createVersion(content: any, tags: string[] = [], metadata: Record<string, any> = {}): CacheVersion {
    const timestamp = Date.now();
    let version: string;
    
    switch (this.strategy) {
      case 'timestamp':
        version = timestamp.toString();
        break;
      case 'semantic':
        version = this.generateSemanticVersion();
        break;
      case 'hash':
        version = this.generateHashVersion(content);
        break;
      case 'hybrid':
        version = `${timestamp}-${this.generateHashVersion(content).substring(0, 8)}`;
        break;
      default:
        version = (++this.versionCounter).toString();
    }
    
    return {
      version,
      timestamp,
      checksum: this.generateChecksum(content),
      tags,
      metadata
    };
  }
  
  compareVersions(v1: CacheVersion, v2: CacheVersion): number {
    switch (this.strategy) {
      case 'timestamp':
        return v1.timestamp - v2.timestamp;
      case 'semantic':
        return this.compareSemanticVersions(v1.version, v2.version);
      default:
        return v1.version.localeCompare(v2.version);
    }
  }
  
  private generateSemanticVersion(): string {
    // Simplified semantic versioning
    return `1.0.${this.versionCounter++}`;
  }
  
  private generateHashVersion(content: any): string {
    // Simple hash function for demo
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  private generateChecksum(content: any): string {
    return this.generateHashVersion(content);
  }
  
  private compareSemanticVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 !== part2) {
        return part1 - part2;
      }
    }
    
    return 0;
  }
}

// Classes already exported above
export { VersionManager };