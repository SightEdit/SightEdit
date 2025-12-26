/**
 * Computed Field Definition
 */
export interface ComputedField {
  sight: string;
  dependencies: string[];
  compute: (values: Record<string, any>) => any | Promise<any>;
  debounce?: number; // Debounce time in ms
}

/**
 * Computed Field Manager
 * Manages dependencies and recomputation of derived values
 */
export class ComputedFieldManager {
  private fields: Map<string, ComputedField> = new Map();
  private cachedValues: Map<string, any> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Register a computed field
   */
  registerComputed(field: ComputedField): void {
    this.fields.set(field.sight, field);
    this.buildDependencyGraph();
  }

  /**
   * Unregister a computed field
   */
  unregisterComputed(sight: string): void {
    this.fields.delete(sight);
    this.cachedValues.delete(sight);
    this.buildDependencyGraph();
  }

  /**
   * Get all computed field sights
   */
  getComputedFields(): string[] {
    return Array.from(this.fields.keys());
  }

  /**
   * Check if a sight is a computed field
   */
  isComputed(sight: string): boolean {
    return this.fields.has(sight);
  }

  /**
   * Compute a field's value
   */
  async computeValue(sight: string, allValues: Record<string, any>): Promise<any> {
    const field = this.fields.get(sight);

    if (!field) {
      return undefined;
    }

    // Gather dependency values
    const depValues: Record<string, any> = {};
    for (const dep of field.dependencies) {
      depValues[dep] = allValues[dep];
    }

    // Compute value
    try {
      const value = await field.compute(depValues);
      this.cachedValues.set(sight, value);
      return value;
    } catch (error) {
      console.error(`[SightEdit Computed] Error computing field "${sight}":`, error);
      return undefined;
    }
  }

  /**
   * Compute value with debouncing
   */
  async computeValueDebounced(
    sight: string,
    allValues: Record<string, any>
  ): Promise<any> {
    const field = this.fields.get(sight);

    if (!field) {
      return undefined;
    }

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(sight);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // If no debounce, compute immediately
    if (!field.debounce) {
      return this.computeValue(sight, allValues);
    }

    // Return cached value immediately, schedule recomputation
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        const value = await this.computeValue(sight, allValues);
        resolve(value);
      }, field.debounce);

      this.debounceTimers.set(sight, timer);

      // Return cached value if available
      if (this.cachedValues.has(sight)) {
        resolve(this.cachedValues.get(sight));
      }
    });
  }

  /**
   * Get fields that depend on a given sight
   */
  getDependentFields(sight: string): string[] {
    const dependents: string[] = [];

    this.fields.forEach((field, fieldSight) => {
      if (field.dependencies.includes(sight)) {
        dependents.push(fieldSight);
      }
    });

    return dependents;
  }

  /**
   * Recompute all fields that depend on changed sights
   */
  async recomputeDependents(
    changedSights: string[],
    allValues: Record<string, any>
  ): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};
    const visited = new Set<string>();

    // BFS to find all affected computed fields
    const queue = [...changedSights];

    while (queue.length > 0) {
      const sight = queue.shift()!;

      if (visited.has(sight)) {
        continue;
      }

      visited.add(sight);

      // Find fields that depend on this sight
      const dependents = this.getDependentFields(sight);

      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          // Compute new value
          const newValue = await this.computeValue(dependent, allValues);
          updates[dependent] = newValue;

          // Add to queue to check transitive dependencies
          queue.push(dependent);
        }
      }
    }

    return updates;
  }

  /**
   * Build dependency graph for optimization
   */
  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();

    this.fields.forEach((field, sight) => {
      const deps = new Set(field.dependencies);
      this.dependencyGraph.set(sight, deps);
    });
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependencies(): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const hasCycle = (sight: string): boolean => {
      if (stack.has(sight)) {
        return true; // Circular dependency detected
      }

      if (visited.has(sight)) {
        return false;
      }

      visited.add(sight);
      stack.add(sight);

      const deps = this.dependencyGraph.get(sight) || new Set();

      for (const dep of deps) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      stack.delete(sight);
      return false;
    };

    for (const sight of this.fields.keys()) {
      if (hasCycle(sight)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get cached value
   */
  getCachedValue(sight: string): any {
    return this.cachedValues.get(sight);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedValues.clear();
  }

  /**
   * Clear all debounce timers
   */
  clearDebounceTimers(): void {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  /**
   * Destroy manager
   */
  destroy(): void {
    this.clearDebounceTimers();
    this.fields.clear();
    this.cachedValues.clear();
    this.dependencyGraph.clear();
  }
}

/**
 * Global computed field manager
 */
let globalComputedManager: ComputedFieldManager | null = null;

/**
 * Get global computed field manager
 */
export function getGlobalComputedManager(): ComputedFieldManager {
  if (!globalComputedManager) {
    globalComputedManager = new ComputedFieldManager();
  }
  return globalComputedManager;
}

/**
 * Reset global manager (for testing)
 */
export function resetGlobalComputedManager(): void {
  if (globalComputedManager) {
    globalComputedManager.destroy();
  }
  globalComputedManager = new ComputedFieldManager();
}
