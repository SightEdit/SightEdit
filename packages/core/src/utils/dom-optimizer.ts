/**
 * Optimized DOM manipulation utilities for better performance
 */

export interface DOMUpdateOperation {
  type: 'style' | 'content' | 'attribute' | 'class';
  element: HTMLElement;
  property?: string;
  value?: any;
  operation?: 'add' | 'remove' | 'set' | 'toggle';
}

/**
 * High-performance DOM operations manager
 */
export class OptimizedDOMManager {
  private static instance: OptimizedDOMManager;
  private elementCache = new WeakMap<HTMLElement, Map<string, HTMLElement | HTMLElement[]>>();
  private observerCache = new WeakMap<HTMLElement, MutationObserver>();
  private pendingUpdates: DOMUpdateOperation[] = [];
  private updateScheduled = false;

  static getInstance(): OptimizedDOMManager {
    if (!this.instance) {
      this.instance = new OptimizedDOMManager();
    }
    return this.instance;
  }

  /**
   * Get cached element to avoid repeated DOM queries
   */
  getCachedElement(parent: HTMLElement, selector: string): HTMLElement | null {
    if (!this.elementCache.has(parent)) {
      this.elementCache.set(parent, new Map());
    }
    
    const cache = this.elementCache.get(parent)!;
    
    if (cache.has(selector)) {
      const cached = cache.get(selector);
      // Verify element is still in DOM
      if (cached && (cached as HTMLElement).isConnected) {
        return cached as HTMLElement;
      } else {
        // Remove stale cache entry
        cache.delete(selector);
      }
    }
    
    const element = parent.querySelector(selector) as HTMLElement;
    if (element) {
      cache.set(selector, element);
    }
    
    return element;
  }

  /**
   * Get cached elements (multiple results)
   */
  getCachedElements(parent: HTMLElement, selector: string): HTMLElement[] {
    const cacheKey = `${selector}:all`;
    
    if (!this.elementCache.has(parent)) {
      this.elementCache.set(parent, new Map());
    }
    
    const cache = this.elementCache.get(parent)!;
    
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey) as HTMLElement[];
      // Verify all elements are still in DOM
      if (cached && cached.every(el => el.isConnected)) {
        return cached;
      } else {
        cache.delete(cacheKey);
      }
    }
    
    const elements = Array.from(parent.querySelectorAll(selector)) as HTMLElement[];
    if (elements.length > 0) {
      cache.set(cacheKey, elements);
    }
    
    return elements;
  }

  /**
   * Clear cache for a specific parent element
   */
  clearCache(parent: HTMLElement): void {
    this.elementCache.delete(parent);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.elementCache = new WeakMap();
  }

  /**
   * Batch DOM updates for better performance
   */
  batchDOMUpdates(updates: DOMUpdateOperation[]): void {
    this.pendingUpdates.push(...updates);
    
    if (!this.updateScheduled) {
      this.scheduleUpdate();
    }
  }

  /**
   * Schedule a single DOM update
   */
  scheduleDOMUpdate(update: DOMUpdateOperation): void {
    this.batchDOMUpdates([update]);
  }

  /**
   * Schedule updates using requestAnimationFrame for optimal performance
   */
  private scheduleUpdate(): void {
    this.updateScheduled = true;
    
    requestAnimationFrame(() => {
      this.flushUpdates();
      this.updateScheduled = false;
    });
  }

  /**
   * Execute all pending DOM updates
   */
  private flushUpdates(): void {
    if (this.pendingUpdates.length === 0) return;

    // Group updates by element for better performance
    const updatesByElement = new Map<HTMLElement, DOMUpdateOperation[]>();
    
    for (const update of this.pendingUpdates) {
      if (!updatesByElement.has(update.element)) {
        updatesByElement.set(update.element, []);
      }
      updatesByElement.get(update.element)!.push(update);
    }

    // Execute updates element by element
    for (const [element, updates] of updatesByElement) {
      if (!element.isConnected) continue; // Skip disconnected elements
      
      this.executeElementUpdates(element, updates);
    }

    this.pendingUpdates = [];
  }

  /**
   * Execute updates for a single element
   */
  private executeElementUpdates(element: HTMLElement, updates: DOMUpdateOperation[]): void {
    try {
      for (const update of updates) {
        switch (update.type) {
          case 'style':
            this.updateStyle(element, update);
            break;
          case 'content':
            this.updateContent(element, update);
            break;
          case 'attribute':
            this.updateAttribute(element, update);
            break;
          case 'class':
            this.updateClass(element, update);
            break;
        }
      }
    } catch (error) {
      console.error('DOM update failed:', error, { element, updates });
    }
  }

  private updateStyle(element: HTMLElement, update: DOMUpdateOperation): void {
    if (update.property && update.value !== undefined) {
      (element.style as any)[update.property] = update.value;
    }
  }

  private updateContent(element: HTMLElement, update: DOMUpdateOperation): void {
    if (update.property === 'textContent') {
      element.textContent = update.value;
    } else if (update.property === 'innerHTML') {
      element.innerHTML = update.value;
    }
  }

  private updateAttribute(element: HTMLElement, update: DOMUpdateOperation): void {
    if (!update.property) return;
    
    if (update.operation === 'remove') {
      element.removeAttribute(update.property);
    } else {
      element.setAttribute(update.property, update.value || '');
    }
  }

  private updateClass(element: HTMLElement, update: DOMUpdateOperation): void {
    if (!update.value) return;
    
    switch (update.operation) {
      case 'add':
        element.classList.add(update.value);
        break;
      case 'remove':
        element.classList.remove(update.value);
        break;
      case 'toggle':
        element.classList.toggle(update.value);
        break;
      case 'set':
        element.className = update.value;
        break;
    }
  }

  /**
   * Create an optimized mutation observer
   */
  observeElement(
    element: HTMLElement,
    callback: MutationCallback,
    options: MutationObserverInit = { childList: true, subtree: true }
  ): MutationObserver {
    // Reuse existing observer if available
    if (this.observerCache.has(element)) {
      const existing = this.observerCache.get(element)!;
      existing.disconnect();
    }

    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    
    this.observerCache.set(element, observer);
    
    return observer;
  }

  /**
   * Disconnect observer for element
   */
  disconnectObserver(element: HTMLElement): void {
    const observer = this.observerCache.get(element);
    if (observer) {
      observer.disconnect();
      this.observerCache.delete(element);
    }
  }

  /**
   * Disconnect all observers
   */
  disconnectAllObservers(): void {
    // WeakMap doesn't support iteration, so we'll clear it directly
    // The observers will be garbage collected when elements are removed
    this.observerCache = new WeakMap();
  }

  /**
   * Efficiently measure element dimensions
   */
  measureElement(element: HTMLElement): { 
    width: number; 
    height: number; 
    top: number; 
    left: number; 
  } {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left
    };
  }

  /**
   * Check if element is visible in viewport
   */
  isElementVisible(element: HTMLElement, threshold = 0): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    return (
      rect.top >= -threshold &&
      rect.left >= -threshold &&
      rect.bottom <= windowHeight + threshold &&
      rect.right <= windowWidth + threshold
    );
  }

  /**
   * Efficiently scroll element into view
   */
  scrollIntoView(
    element: HTMLElement, 
    options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'nearest' }
  ): void {
    if (!this.isElementVisible(element)) {
      element.scrollIntoView(options);
    }
  }

  /**
   * Create document fragment for efficient DOM manipulation
   */
  createFragment(): DocumentFragment {
    return document.createDocumentFragment();
  }

  /**
   * Append multiple elements efficiently using document fragment
   */
  appendElements(parent: HTMLElement, elements: (HTMLElement | string)[]): void {
    const fragment = this.createFragment();
    
    for (const element of elements) {
      if (typeof element === 'string') {
        const textNode = document.createTextNode(element);
        fragment.appendChild(textNode);
      } else {
        fragment.appendChild(element);
      }
    }
    
    parent.appendChild(fragment);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnectAllObservers();
    this.clearAllCaches();
    this.pendingUpdates = [];
  }
}

// Utility functions for common DOM operations
export const DOM = {
  /**
   * Create element with attributes and content
   */
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attributes?: Record<string, string>,
    content?: string
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);
    
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
      }
    }
    
    if (content) {
      element.textContent = content;
    }
    
    return element;
  },

  /**
   * Find element with fallback
   */
  findElement<T extends HTMLElement = HTMLElement>(
    selector: string,
    parent: HTMLElement | Document = document
  ): T | null {
    return parent.querySelector<T>(selector);
  },

  /**
   * Find elements with fallback
   */
  findElements<T extends HTMLElement = HTMLElement>(
    selector: string,
    parent: HTMLElement | Document = document
  ): T[] {
    return Array.from(parent.querySelectorAll<T>(selector));
  },

  /**
   * Check if element matches selector
   */
  matches(element: HTMLElement, selector: string): boolean {
    return element.matches(selector);
  },

  /**
   * Get closest ancestor matching selector
   */
  closest<T extends HTMLElement = HTMLElement>(
    element: HTMLElement,
    selector: string
  ): T | null {
    return element.closest<T>(selector);
  }
};