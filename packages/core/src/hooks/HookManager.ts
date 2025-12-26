/**
 * Hook Manager
 *
 * Provides an extensible hook system for SightEdit lifecycle events.
 * Allows developers to inject custom logic at various points in the editing flow.
 */

import type { SaveData, SaveResponse, ElementType } from '../types';

// Hook event types
export type HookEvent =
  // Editor lifecycle
  | 'editor:beforeRender'
  | 'editor:afterRender'
  | 'editor:beforeDestroy'
  | 'editor:afterDestroy'
  | 'editor:focus'
  | 'editor:blur'

  // Value changes
  | 'value:beforeChange'
  | 'value:afterChange'
  | 'value:validated'
  | 'value:invalid'

  // Save operations
  | 'save:before'
  | 'save:after'
  | 'save:error'
  | 'save:success'

  // Batch operations
  | 'batch:beforeProcess'
  | 'batch:afterProcess'
  | 'batch:itemComplete'
  | 'batch:itemError'

  // Schema/Theme changes
  | 'schema:beforeUpdate'
  | 'schema:afterUpdate'
  | 'theme:beforeChange'
  | 'theme:afterChange'

  // Network
  | 'network:beforeRequest'
  | 'network:afterRequest'
  | 'network:error'
  | 'network:timeout'

  // UI
  | 'ui:toolbarRender'
  | 'ui:modalOpen'
  | 'ui:modalClose'
  | 'ui:notification'

  // Mode changes
  | 'mode:beforeChange'
  | 'mode:afterChange'

  // Plugin events
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'plugin:error';

// Hook context types
export interface EditorHookContext {
  element: HTMLElement;
  sight: string;
  type: ElementType;
  value?: any;
}

export interface ValueHookContext {
  sight: string;
  oldValue: any;
  newValue: any;
  type: ElementType;
  element: HTMLElement;
}

export interface SaveHookContext {
  data: SaveData;
  response?: SaveResponse;
  error?: Error;
}

export interface BatchHookContext {
  operations: SaveData[];
  currentIndex?: number;
  currentOperation?: SaveData;
  results?: Array<{ success: boolean; data?: any; error?: string }>;
}

export interface NetworkHookContext {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  response?: any;
  error?: Error;
  duration?: number;
}

export interface UIHookContext {
  component: string;
  props: any;
  element?: HTMLElement;
}

export interface ModeHookContext {
  oldMode: string;
  newMode: string;
}

export interface PluginHookContext {
  name: string;
  version: string;
  plugin: any;
  error?: Error;
}

export type HookContext =
  | EditorHookContext
  | ValueHookContext
  | SaveHookContext
  | BatchHookContext
  | NetworkHookContext
  | UIHookContext
  | ModeHookContext
  | PluginHookContext;

// Hook handler function
export type HookHandler<T = any> = (context: T) => void | Promise<void> | T | Promise<T>;

// Hook configuration
export interface Hook {
  event: HookEvent;
  handler: HookHandler;
  priority?: number; // Higher priority runs first (default: 100)
  once?: boolean; // Run only once
}

export class HookManager {
  private static instance: HookManager | null = null;
  private hooks: Map<HookEvent, Hook[]> = new Map();
  private executedOnceHooks: Set<HookHandler> = new Set();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Register a hook
   */
  register(hook: Hook): void {
    const { event, handler, priority = 100, once = false } = hook;

    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    const hooks = this.hooks.get(event)!;
    hooks.push({ event, handler, priority, once });

    // Sort by priority (descending)
    hooks.sort((a, b) => (b.priority || 100) - (a.priority || 100));
  }

  /**
   * Register multiple hooks at once
   */
  registerMany(hooks: Hook[]): void {
    hooks.forEach(hook => this.register(hook));
  }

  /**
   * Unregister a hook
   */
  unregister(event: HookEvent, handler: HookHandler): void {
    const hooks = this.hooks.get(event);
    if (!hooks) return;

    const index = hooks.findIndex(h => h.handler === handler);
    if (index !== -1) {
      hooks.splice(index, 1);
    }

    // Clean up executed once hooks
    this.executedOnceHooks.delete(handler);
  }

  /**
   * Clear all hooks for an event
   */
  clearEvent(event: HookEvent): void {
    const hooks = this.hooks.get(event);
    if (hooks) {
      hooks.forEach(hook => {
        this.executedOnceHooks.delete(hook.handler);
      });
    }
    this.hooks.delete(event);
  }

  /**
   * Clear all hooks
   */
  clearAll(): void {
    this.hooks.clear();
    this.executedOnceHooks.clear();
  }

  /**
   * Execute hooks for an event (sequential)
   */
  async execute<T = any>(event: HookEvent, context: T): Promise<T> {
    const hooks = this.hooks.get(event);
    if (!hooks || hooks.length === 0) {
      return context;
    }

    let currentContext = context;

    for (const hook of hooks) {
      // Skip if this is a "once" hook that has already been executed
      if (hook.once && this.executedOnceHooks.has(hook.handler)) {
        continue;
      }

      try {
        const result = await hook.handler(currentContext);

        // If hook returns a value, use it as the new context
        if (result !== undefined) {
          currentContext = result;
        }

        // Mark once hooks as executed
        if (hook.once) {
          this.executedOnceHooks.add(hook.handler);
        }
      } catch (error) {
        console.error(`Error executing hook for event ${event}:`, error);
        // Continue executing other hooks
      }
    }

    return currentContext;
  }

  /**
   * Execute hooks for an event (parallel)
   */
  async executeParallel<T = any>(event: HookEvent, context: T): Promise<T> {
    const hooks = this.hooks.get(event);
    if (!hooks || hooks.length === 0) {
      return context;
    }

    const promises = hooks
      .filter(hook => !hook.once || !this.executedOnceHooks.has(hook.handler))
      .map(async hook => {
        try {
          await hook.handler(context);

          if (hook.once) {
            this.executedOnceHooks.add(hook.handler);
          }
        } catch (error) {
          console.error(`Error executing hook for event ${event}:`, error);
        }
      });

    await Promise.all(promises);

    return context;
  }

  /**
   * Execute hooks synchronously (for performance-critical paths)
   */
  executeSync<T = any>(event: HookEvent, context: T): T {
    const hooks = this.hooks.get(event);
    if (!hooks || hooks.length === 0) {
      return context;
    }

    let currentContext = context;

    for (const hook of hooks) {
      if (hook.once && this.executedOnceHooks.has(hook.handler)) {
        continue;
      }

      try {
        const result = hook.handler(currentContext);

        // Handle promises by warning (shouldn't use async handlers in sync execution)
        if (result instanceof Promise) {
          console.warn(`Async hook handler used in sync execution for event ${event}`);
          continue;
        }

        if (result !== undefined) {
          currentContext = result;
        }

        if (hook.once) {
          this.executedOnceHooks.add(hook.handler);
        }
      } catch (error) {
        console.error(`Error executing hook for event ${event}:`, error);
      }
    }

    return currentContext;
  }

  /**
   * Check if an event has hooks
   */
  hasHooks(event: HookEvent): boolean {
    const hooks = this.hooks.get(event);
    return !!hooks && hooks.length > 0;
  }

  /**
   * Get all hooks for an event
   */
  getHooks(event: HookEvent): Hook[] {
    return this.hooks.get(event) || [];
  }

  /**
   * Get all registered events
   */
  getEvents(): HookEvent[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Get hook count for an event
   */
  getHookCount(event: HookEvent): number {
    const hooks = this.hooks.get(event);
    return hooks ? hooks.length : 0;
  }

  /**
   * Get total hook count across all events
   */
  getTotalHookCount(): number {
    let total = 0;
    this.hooks.forEach(hooks => {
      total += hooks.length;
    });
    return total;
  }
}

// Export singleton instance
export const hookManager = HookManager.getInstance();

// Convenience functions
export function registerHook(hook: Hook): void {
  hookManager.register(hook);
}

export function registerHooks(hooks: Hook[]): void {
  hookManager.registerMany(hooks);
}

export function unregisterHook(event: HookEvent, handler: HookHandler): void {
  hookManager.unregister(event, handler);
}

export function clearHookEvent(event: HookEvent): void {
  hookManager.clearEvent(event);
}

export function clearAllHooks(): void {
  hookManager.clearAll();
}

export function executeHook<T = any>(event: HookEvent, context: T): Promise<T> {
  return hookManager.execute(event, context);
}

export function executeHookParallel<T = any>(event: HookEvent, context: T): Promise<T> {
  return hookManager.executeParallel(event, context);
}

export function executeHookSync<T = any>(event: HookEvent, context: T): T {
  return hookManager.executeSync(event, context);
}

export function hasHooks(event: HookEvent): boolean {
  return hookManager.hasHooks(event);
}
