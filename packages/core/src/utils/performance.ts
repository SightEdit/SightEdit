// Performance utilities for SightEdit

/**
 * Debounce function to limit the rate of function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

/**
 * Throttle function to limit the rate of function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Optimized requestAnimationFrame wrapper
 */
export function raf(callback: () => void): number {
  return requestAnimationFrame(callback);
}

/**
 * Intersection Observer for lazy loading and viewport detection
 */
export class ViewportObserver {
  private observer: IntersectionObserver;
  private callbacks = new Map<Element, (entry: IntersectionObserverEntry) => void>();
  
  constructor(options: IntersectionObserverInit = {}) {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const callback = this.callbacks.get(entry.target);
        if (callback) {
          callback(entry);
        }
      });
    }, {
      rootMargin: '50px',
      threshold: 0.1,
      ...options
    });
  }
  
  observe(element: Element, callback: (entry: IntersectionObserverEntry) => void): void {
    this.callbacks.set(element, callback);
    this.observer.observe(element);
  }
  
  unobserve(element: Element): void {
    this.callbacks.delete(element);
    this.observer.unobserve(element);
  }
  
  destroy(): void {
    this.observer.disconnect();
    this.callbacks.clear();
  }
}

/**
 * Memory-efficient element selection
 */
export function querySelectorOptimized(selector: string, context?: Element): Element[] {
  const root = context || document;
  const elements = root.querySelectorAll(selector);
  
  // Convert NodeList to Array more efficiently
  return elements.length < 100 ? 
    Array.from(elements) : 
    Array.prototype.slice.call(elements);
}

/**
 * Optimized DOM manipulation
 */
export class DOMBatch {
  private mutations: Array<() => void> = [];
  private scheduled = false;
  
  add(mutation: () => void): void {
    this.mutations.push(mutation);
    this.schedule();
  }
  
  private schedule(): void {
    if (this.scheduled) return;
    
    this.scheduled = true;
    raf(() => {
      this.flush();
    });
  }
  
  private flush(): void {
    const mutations = this.mutations.splice(0);
    
    // Batch DOM operations
    mutations.forEach(mutation => mutation());
    
    this.scheduled = false;
  }
}

/**
 * Event delegation for better performance
 */
export class EventDelegator {
  private handlers = new Map<string, Map<string, (event: Event) => void>>();
  
  constructor(private container: Element) {}
  
  on(selector: string, eventType: string, handler: (event: Event) => void): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Map());
      this.container.addEventListener(eventType, this.handleEvent.bind(this));
    }
    
    this.handlers.get(eventType)!.set(selector, handler);
  }
  
  off(selector: string, eventType: string): void {
    const eventHandlers = this.handlers.get(eventType);
    if (eventHandlers) {
      eventHandlers.delete(selector);
      
      if (eventHandlers.size === 0) {
        this.container.removeEventListener(eventType, this.handleEvent.bind(this));
        this.handlers.delete(eventType);
      }
    }
  }
  
  private handleEvent(event: Event): void {
    const target = event.target as Element;
    const eventHandlers = this.handlers.get(event.type);
    
    if (!eventHandlers) return;
    
    for (const [selector, handler] of eventHandlers) {
      if (target.matches(selector) || target.closest(selector)) {
        handler(event);
        break;
      }
    }
  }
  
  destroy(): void {
    for (const eventType of this.handlers.keys()) {
      this.container.removeEventListener(eventType, this.handleEvent.bind(this));
    }
    this.handlers.clear();
  }
}

/**
 * Efficient data storage with automatic cleanup
 */
export class DataCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; ttl?: number }>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor(private defaultTTL: number = 300000) { // 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }
  
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    const now = Date.now();
    if (item.ttl && (now - item.timestamp) > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.ttl && (now - item.timestamp) > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

/**
 * Image loading optimization
 */
export class ImageLoader {
  private static cache = new Set<string>();
  
  static async preload(src: string): Promise<HTMLImageElement> {
    if (this.cache.has(src)) {
      const img = new Image();
      img.src = src;
      return img;
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.add(src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }
  
  static async loadLazy(img: HTMLImageElement, src: string): Promise<void> {
    if (this.cache.has(src)) {
      img.src = src;
      return;
    }
    
    return new Promise((resolve, reject) => {
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = src;
        this.cache.add(src);
        resolve();
      };
      tempImg.onerror = reject;
      tempImg.src = src;
    });
  }
}

/**
 * Enhanced Performance monitoring utilities with metrics collection and budgets
 */
export interface PerformanceBudget {
  name: string;
  maxDuration: number;
  maxMemory?: number;
  maxBundleSize?: number;
}

export interface PerformanceMetrics {
  marks: Map<string, number>;
  measures: Map<string, number>;
  memoryUsage?: MemoryUsage;
  bundleSize?: number;
  budgetViolations: BudgetViolation[];
}

export interface BudgetViolation {
  budget: PerformanceBudget;
  actualValue: number;
  violation: 'duration' | 'memory' | 'bundle';
}

export interface MemoryUsage {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export class PerformanceMonitor {
  private marks = new Map<string, number>();
  private measures = new Map<string, number>();
  private budgets = new Map<string, PerformanceBudget>();
  private violations: BudgetViolation[] = [];
  private metricsCallback?: (metrics: PerformanceMetrics) => void;
  private reportInterval?: number;
  
  constructor(config?: {
    reportInterval?: number;
    onMetrics?: (metrics: PerformanceMetrics) => void;
  }) {
    if (config?.onMetrics) {
      this.metricsCallback = config.onMetrics;
    }
    
    if (config?.reportInterval) {
      this.reportInterval = setInterval(() => {
        this.collectAndReport();
      }, config.reportInterval);
    }
  }
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
    
    if (performance.mark) {
      performance.mark(`sightedit-${name}`);
    }
  }
  
  measure(name: string, startMark?: string): number {
    const endTime = performance.now();
    const startTime = startMark ? this.marks.get(startMark) : this.marks.get(name);
    
    if (startTime === undefined) {
      console.warn(`Performance mark "${startMark || name}" not found`);
      return 0;
    }
    
    const duration = endTime - startTime;
    this.measures.set(name, duration);
    
    if ('measure' in performance && 'mark' in performance) {
      try {
        performance.measure(
          `sightedit-${name}`,
          startMark ? `sightedit-${startMark}` : `sightedit-${name}`
        );
      } catch (e) {
        // Ignore measurement errors
      }
    }
    
    // Check budgets
    this.checkBudgets(name, duration);
    
    return duration;
  }
  
  setBudget(budget: PerformanceBudget): void {
    this.budgets.set(budget.name, budget);
  }
  
  private checkBudgets(name: string, duration: number): void {
    const budget = this.budgets.get(name);
    if (budget && duration > budget.maxDuration) {
      const violation: BudgetViolation = {
        budget,
        actualValue: duration,
        violation: 'duration'
      };
      
      this.violations.push(violation);
      
      if (this.metricsCallback) {
        console.warn(`Performance budget exceeded for ${name}: ${duration.toFixed(2)}ms > ${budget.maxDuration}ms`);
      }
    }
  }
  
  getMemoryUsage(): MemoryUsage | undefined {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
    return undefined;
  }
  
  getBundleSize(): Promise<number> {
    return new Promise((resolve) => {
      // Estimate bundle size from script tags
      const scripts = document.querySelectorAll('script[src*="sightedit"]');
      let totalSize = 0;
      let loaded = 0;
      
      if (scripts.length === 0) {
        resolve(0);
        return;
      }
      
      scripts.forEach(script => {
        const src = (script as HTMLScriptElement).src;
        fetch(src, { method: 'HEAD' })
          .then(response => {
            const size = parseInt(response.headers.get('content-length') || '0');
            totalSize += size;
          })
          .catch(() => {
            // Fallback: estimate from src length (rough approximation)
            totalSize += src.length * 10;
          })
          .finally(() => {
            loaded++;
            if (loaded === scripts.length) {
              resolve(totalSize);
            }
          });
      });
    });
  }
  
  async getMetrics(): Promise<PerformanceMetrics> {
    const memoryUsage = this.getMemoryUsage();
    const bundleSize = await this.getBundleSize();
    
    return {
      marks: new Map(this.marks),
      measures: new Map(this.measures),
      memoryUsage,
      bundleSize,
      budgetViolations: [...this.violations]
    };
  }
  
  private async collectAndReport(): Promise<void> {
    if (this.metricsCallback) {
      const metrics = await this.getMetrics();
      this.metricsCallback(metrics);
    }
  }
  
  report(): void {
    console.group('SightEdit Performance Report');
    
    // Performance measures
    console.group('Timing Metrics');
    for (const [name, duration] of this.measures) {
      const budget = this.budgets.get(name);
      const status = budget && duration > budget.maxDuration ? '❌' : '✅';
      console.log(`${status} ${name}: ${duration.toFixed(2)}ms${budget ? ` (budget: ${budget.maxDuration}ms)` : ''}`);
    }
    console.groupEnd();
    
    // Memory usage
    const memory = this.getMemoryUsage();
    if (memory) {
      console.group('Memory Usage');
      console.log(`Used: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Total: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Limit: ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`);
      console.groupEnd();
    }
    
    // Budget violations
    if (this.violations.length > 0) {
      console.group('Budget Violations');
      this.violations.forEach(violation => {
        console.warn(`${violation.budget.name}: ${violation.actualValue.toFixed(2)}ms > ${violation.budget.maxDuration}ms`);
      });
      console.groupEnd();
    }
    
    console.groupEnd();
  }
  
  clear(): void {
    this.marks.clear();
    this.measures.clear();
    this.violations = [];
    
    if (performance.clearMarks) {
      performance.clearMarks();
    }
    if (performance.clearMeasures) {
      performance.clearMeasures();
    }
  }
  
  destroy(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
    this.clear();
  }
}