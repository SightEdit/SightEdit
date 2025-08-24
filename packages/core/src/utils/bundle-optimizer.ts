// Bundle size optimization utilities

/**
 * Lazy loading utility for heavy dependencies
 */
export class LazyLoader {
  private static loaded = new Map<string, Promise<any>>();
  
  static async load<T>(
    moduleId: string, 
    importFn: () => Promise<T>
  ): Promise<T> {
    if (!this.loaded.has(moduleId)) {
      this.loaded.set(moduleId, importFn());
    }
    
    return this.loaded.get(moduleId)!;
  }
  
  static preload(moduleId: string, importFn: () => Promise<any>): void {
    if (!this.loaded.has(moduleId)) {
      this.loaded.set(moduleId, importFn());
    }
  }
}

/**
 * Tree-shaking friendly editor registration
 */
export class EditorRegistry {
  private static editors = new Map<string, () => Promise<any>>();
  
  static register(type: string, loader: () => Promise<any>): void {
    this.editors.set(type, loader);
  }
  
  static async get(type: string): Promise<any> {
    const loader = this.editors.get(type);
    if (!loader) {
      throw new Error(`Editor type "${type}" not found. Did you register it?`);
    }
    
    const module = await loader();
    return module.default || module;
  }
  
  static getTypes(): string[] {
    return Array.from(this.editors.keys());
  }
}

/**
 * Code splitting for plugins - Generic loader
 */
export async function loadPlugin(name: string, importPath?: string): Promise<any> {
  const pluginPath = importPath || `@sightedit/plugin-${name}`;
  
  return LazyLoader.load(`plugin-${name}`, async () => {
    // Dynamic import will be resolved at runtime
    try {
      // @ts-ignore - Dynamic imports can't be type-checked at compile time
      return await import(/* webpackIgnore: true */ pluginPath);
    } catch (error) {
      console.error(`Failed to load plugin ${name} from ${pluginPath}:`, error);
      throw new Error(`Plugin ${name} not found or failed to load`);
    }
  });
}

/**
 * Dynamic imports with fallbacks
 */
export async function dynamicImport<T>(
  importFn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    console.warn('Dynamic import failed:', error);
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Feature detection and progressive loading
 */
export class FeatureDetector {
  private static features = new Map<string, boolean>();
  
  static supports(feature: string): boolean {
    if (this.features.has(feature)) {
      return this.features.get(feature)!;
    }
    
    let supported = false;
    
    switch (feature) {
      case 'intersectionObserver':
        supported = 'IntersectionObserver' in window;
        break;
      
      case 'resizeObserver':
        supported = 'ResizeObserver' in window;
        break;
      
      case 'webp':
        supported = this.supportsWebP();
        break;
      
      case 'avif':
        supported = this.supportsAVIF();
        break;
      
      case 'touch':
        supported = 'ontouchstart' in window;
        break;
      
      case 'pointerEvents':
        supported = 'onpointerdown' in window;
        break;
      
      case 'customElements':
        supported = 'customElements' in window;
        break;
      
      case 'shadowDOM':
        supported = 'attachShadow' in Element.prototype;
        break;
      
      default:
        console.warn(`Unknown feature: ${feature}`);
        break;
    }
    
    this.features.set(feature, supported);
    return supported;
  }
  
  private static supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  
  private static supportsAVIF(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/avif').startsWith('data:image/avif');
  }
}

/**
 * Memory-efficient asset loading
 */
export class AssetManager {
  private static cache = new Map<string, Promise<any>>();
  
  static async loadCSS(url: string): Promise<void> {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    
    const promise = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load CSS: ${url}`));
      document.head.appendChild(link);
    });
    
    this.cache.set(url, promise);
    return promise;
  }
  
  static async loadScript(url: string): Promise<void> {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    
    const promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
    
    this.cache.set(url, promise);
    return promise;
  }
}

/**
 * Optimized event handling with memory leak prevention
 */
export class OptimizedEventEmitter {
  private listeners = new Map<string, Set<Function>>();
  private onceListeners = new Map<string, Set<Function>>();
  private maxListeners = 100; // Prevent memory leaks from excessive listeners
  
  on(event: string, listener: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const eventListeners = this.listeners.get(event)!;
    
    // Check for memory leak potential
    if (eventListeners.size >= this.maxListeners) {
      console.warn(`Possible memory leak: ${eventListeners.size} listeners for event "${event}"`);
    }
    
    eventListeners.add(listener);
    
    // Return unsubscribe function
    return () => this.off(event, listener);
  }
  
  once(event: string, listener: Function): () => void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    
    this.onceListeners.get(event)!.add(listener);
    
    return () => this.onceListeners.get(event)?.delete(listener);
  }
  
  off(event: string, listener: Function): void {
    this.listeners.get(event)?.delete(listener);
    this.onceListeners.get(event)?.delete(listener);
    
    // Cleanup empty sets to prevent memory leaks
    if (this.listeners.get(event)?.size === 0) {
      this.listeners.delete(event);
    }
    if (this.onceListeners.get(event)?.size === 0) {
      this.onceListeners.delete(event);
    }
  }
  
  emit(event: string, ...args: any[]): void {
    // Regular listeners
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      }
    }
    
    // Once listeners
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      for (const listener of onceListeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      }
      onceListeners.clear();
    }
  }
  
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }
  
  listenerCount(event: string): number {
    const regular = this.listeners.get(event)?.size || 0;
    const once = this.onceListeners.get(event)?.size || 0;
    return regular + once;
  }
  
  setMaxListeners(max: number): void {
    this.maxListeners = max;
  }
  
  getMaxListeners(): number {
    return this.maxListeners;
  }
  
  // Memory optimization: cleanup method
  cleanup(): void {
    // Remove empty event listener sets
    for (const [event, listeners] of this.listeners) {
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    }
    
    for (const [event, listeners] of this.onceListeners) {
      if (listeners.size === 0) {
        this.onceListeners.delete(event);
      }
    }
  }
}

/**
 * Memory management utilities for garbage collection optimization
 */
export class MemoryManager {
  private static weakRefs = new Set<WeakRef<any>>();
  private static cleanupInterval?: number;
  private static isEnabled = false;
  
  static enable(cleanupIntervalMs = 30000): void {
    if (this.isEnabled) return;
    
    this.isEnabled = true;
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, cleanupIntervalMs);
  }
  
  static disable(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.isEnabled = false;
    this.weakRefs.clear();
  }
  
  static track<T extends object>(obj: T): WeakRef<T> {
    const weakRef = new WeakRef(obj);
    this.weakRefs.add(weakRef);
    return weakRef;
  }
  
  private static performCleanup(): void {
    let cleaned = 0;
    
    for (const weakRef of this.weakRefs) {
      if (!weakRef.deref()) {
        this.weakRefs.delete(weakRef);
        cleaned++;
      }
    }
    
    // Force garbage collection if available (Chrome DevTools)
    if ('gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (cleaned > 0) {
      console.debug(`MemoryManager: Cleaned ${cleaned} stale references`);
    }
  }
  
  static getStats() {
    return {
      trackedReferences: this.weakRefs.size,
      isEnabled: this.isEnabled
    };
  }
}

/**
 * Enhanced object pool for reusing expensive objects
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  
  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = 50
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }
  
  acquire(): T {
    let obj: T;
    
    if (this.available.length > 0) {
      obj = this.available.pop()!;
    } else {
      obj = this.factory();
    }
    
    this.inUse.add(obj);
    return obj;
  }
  
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      console.warn('Attempting to release object not acquired from pool');
      return;
    }
    
    this.inUse.delete(obj);
    
    try {
      this.reset(obj);
      
      if (this.available.length < this.maxSize) {
        this.available.push(obj);
      }
    } catch (error) {
      console.error('Error resetting pooled object:', error);
    }
  }
  
  clear(): void {
    this.available = [];
    this.inUse.clear();
  }
  
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      maxSize: this.maxSize
    };
  }
}

/**
 * Batched DOM operations to minimize reflows and repaints
 */
export class BatchedDOMOperations {
  private operations: (() => void)[] = [];
  private scheduled = false;
  private frameId?: number;
  
  batch(operation: () => void): void {
    this.operations.push(operation);
    this.schedule();
  }
  
  private schedule(): void {
    if (this.scheduled) return;
    
    this.scheduled = true;
    this.frameId = requestAnimationFrame(() => {
      this.flush();
    });
  }
  
  private flush(): void {
    // Read phase - batch all reads first
    const reads: (() => void)[] = [];
    const writes: (() => void)[] = [];
    
    this.operations.forEach(op => {
      // Simple heuristic: operations with 'get', 'measure', 'scroll' are reads
      const opString = op.toString();
      if (opString.includes('get') || opString.includes('measure') || opString.includes('scroll')) {
        reads.push(op);
      } else {
        writes.push(op);
      }
    });
    
    // Execute all reads first, then all writes
    [...reads, ...writes].forEach(op => {
      try {
        op();
      } catch (error) {
        console.error('Batched DOM operation error:', error);
      }
    });
    
    this.operations = [];
    this.scheduled = false;
  }
  
  cancel(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = undefined;
    }
    this.operations = [];
    this.scheduled = false;
  }
  
  clear(): void {
    this.cancel();
  }
}