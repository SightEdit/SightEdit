export interface CleanupHandler {
  cleanup(): void | Promise<void>;
}

export class EventManager {
  private readonly subscriptions = new Set<() => void>();
  private readonly cleanupHandlers = new Set<CleanupHandler>();

  addEventListener<K extends keyof DocumentEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.subscriptions.add(() => 
      target.removeEventListener(type, listener, options)
    );
  }

  addEventListenerGeneric<T extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: T) => void,
    options?: AddEventListenerOptions
  ): void {
    const typedListener = listener as EventListener;
    target.addEventListener(type, typedListener, options);
    this.subscriptions.add(() => 
      target.removeEventListener(type, typedListener, options)
    );
  }

  addCleanupHandler(handler: CleanupHandler): void {
    this.cleanupHandlers.add(handler);
  }

  removeCleanupHandler(handler: CleanupHandler): void {
    this.cleanupHandlers.delete(handler);
  }

  async destroy(): Promise<void> {
    // Clean up event listeners
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('Failed to unsubscribe event listener:', error);
      }
    }
    this.subscriptions.clear();

    // Execute cleanup handlers
    const cleanupPromises = Array.from(this.cleanupHandlers).map(async handler => {
      try {
        await handler.cleanup();
      } catch (error) {
        console.warn('Cleanup handler failed:', error);
      }
    });

    await Promise.all(cleanupPromises);
    this.cleanupHandlers.clear();
  }
}

export class EditorLifecycleManager {
  private readonly activeEditors = new WeakMap<Element, any>();
  private readonly cleanupHandlers = new Map<any, CleanupHandler[]>();
  private readonly eventManager: EventManager;

  constructor() {
    this.eventManager = new EventManager();
  }

  async createEditor(element: Element, editor: any): Promise<void> {
    // Store editor reference
    this.activeEditors.set(element, editor);
    this.cleanupHandlers.set(editor, []);

    // Set up cleanup for when element is removed from DOM
    this.setupElementObserver(element, editor);
  }

  async destroyEditor(element: Element): Promise<void> {
    const editor = this.activeEditors.get(element);
    if (!editor) return;

    const handlers = this.cleanupHandlers.get(editor) || [];

    // Execute cleanup handlers in reverse order
    for (const handler of handlers.reverse()) {
      try {
        await handler.cleanup();
      } catch (error) {
        console.warn('Cleanup handler failed:', error);
      }
    }

    // Remove from collections
    this.activeEditors.delete(element);
    this.cleanupHandlers.delete(editor);

    // Destroy the editor itself
    if (editor.destroy && typeof editor.destroy === 'function') {
      try {
        await editor.destroy();
      } catch (error) {
        console.warn('Editor destruction failed:', error);
      }
    }
  }

  registerCleanup(editor: any, handler: CleanupHandler): void {
    const handlers = this.cleanupHandlers.get(editor) || [];
    handlers.push(handler);
    this.cleanupHandlers.set(editor, handlers);
  }

  private setupElementObserver(element: Element, editor: any): void {
    // Use MutationObserver to detect when element is removed from DOM
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(node => {
          if (node === element || (node instanceof Element && node.contains(element))) {
            // Element was removed from DOM, clean up editor
            this.destroyEditor(element).catch(error => {
              console.warn('Failed to cleanup editor after DOM removal:', error);
            });
            observer.disconnect();
          }
        });
      });
    });

    // Observe the document for removed nodes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Register cleanup to disconnect observer
    this.registerCleanup(editor, {
      cleanup: () => {
        observer.disconnect();
      }
    });
  }

  async destroyAll(): Promise<void> {
    // Get all active editors
    const editorsToDestroy = new Set<any>();
    
    // We can't iterate over WeakMap, so we need to track editors differently
    for (const [editor, handlers] of this.cleanupHandlers) {
      editorsToDestroy.add(editor);
    }

    // Destroy all editors
    const destroyPromises = Array.from(editorsToDestroy).map(async editor => {
      // Find the element for this editor (this is a limitation of WeakMap)
      // In practice, we'd need to maintain a reverse mapping or use Map instead
      const handlers = this.cleanupHandlers.get(editor) || [];
      
      for (const handler of handlers.reverse()) {
        try {
          await handler.cleanup();
        } catch (error) {
          console.warn('Cleanup handler failed:', error);
        }
      }

      if (editor.destroy && typeof editor.destroy === 'function') {
        try {
          await editor.destroy();
        } catch (error) {
          console.warn('Editor destruction failed:', error);
        }
      }
    });

    await Promise.all(destroyPromises);
    
    this.cleanupHandlers.clear();
    
    // Clean up event manager
    await this.eventManager.destroy();
  }

  getActiveEditorCount(): number {
    return this.cleanupHandlers.size;
  }
}

// Memory leak detection and warnings
export class MemoryLeakDetector {
  private readonly thresholds = {
    editors: 100,
    eventListeners: 1000,
    domNodes: 10000
  };

  private checkInterval: number | null = null;

  start(intervalMs: number = 30000): void { // Check every 30 seconds
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = window.setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkMemoryUsage(): void {
    // Check DOM node count
    const domNodeCount = document.getElementsByTagName('*').length;
    if (domNodeCount > this.thresholds.domNodes) {
      console.warn(`Potential memory leak: ${domNodeCount} DOM nodes detected (threshold: ${this.thresholds.domNodes})`);
    }

    // Check for performance.memory if available (Chrome)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      const totalMB = Math.round(memory.totalJSHeapSize / 1048576);
      
      console.debug(`Memory usage: ${usedMB}MB / ${totalMB}MB`);
      
      // Warn if memory usage is high
      if (usedMB > 100) {
        console.warn(`High memory usage detected: ${usedMB}MB`);
      }
    }
  }

  setThreshold(type: keyof typeof this.thresholds, value: number): void {
    this.thresholds[type] = value;
  }
}