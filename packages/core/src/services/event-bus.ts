import { Editor } from '../types';

export interface EventMap {
  // Core events
  'core:initialized': { config: any };
  'core:destroyed': {};
  'edit-mode:entered': {};
  'edit-mode:exited': {};
  'edit-mode:toggled': { enabled: boolean };

  // Editor events
  'editor:created': { editor: Editor; element: Element };
  'editor:destroyed': { editorId: string; element?: Element };
  'editor:focused': { editor: Editor };
  'editor:blurred': { editor: Editor };
  
  // Content events
  'content:changed': { sight: string; value: any; previous?: any };
  'content:saved': { sight: string; value: any; response: any };
  'content:save-failed': { sight: string; value: any; error: Error };

  // Collaboration events
  'collaboration:user-joined': { user: CollaborationUser };
  'collaboration:user-left': { user: CollaborationUser };
  'collaboration:cursor-moved': { user: CollaborationUser; position: CursorPosition };
  'collaboration:selection-changed': { user: CollaborationUser; selection: SelectionRange };

  // API events
  'api:save:success': { data: any; response: any };
  'api:save:error': { data: any; error: Error };
  'api:batch:success': { operations: any[]; response: any };
  'api:batch:error': { operations: any[]; error: Error };
  'api:upload:success': { files: FileList; response: any };
  'api:upload:error': { files: FileList; error: Error };
  'api:get:success': { sight: string; response: any };
  'api:get:error': { sight: string; error: Error };

  // Error events
  'error:occurred': { error: Error; context: string };
  'error:recovered': { error: Error; context: string; strategy: string };
  'error:unrecoverable': { error: Error; context: string };

  // Security events
  'security:threat-detected': { threat: ThreatInfo };
  'security:policy-violation': { violation: PolicyViolation };

  // Performance events
  'performance:slow-operation': { operation: string; duration: number };
  'performance:memory-warning': { usage: number; threshold: number };
}

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface CursorPosition {
  x: number;
  y: number;
  element?: string;
}

export interface SelectionRange {
  start: number;
  end: number;
  element: string;
}

export interface ThreatInfo {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  details: Record<string, any>;
}

export interface PolicyViolation {
  directive: string;
  blockedURI: string;
  violatedDirective: string;
  originalPolicy: string;
}

export type EventKey<T> = string & keyof T;
export type EventHandler<T, K extends EventKey<T>> = (payload: T[K]) => void;

export interface Subscription {
  unsubscribe(): void;
}

export class EventBus {
  private listeners = new Map<keyof EventMap, Set<Function>>();
  private maxListeners = 100;
  private debugMode = false;

  constructor(options: { maxListeners?: number; debug?: boolean } = {}) {
    this.maxListeners = options.maxListeners ?? 100;
    this.debugMode = options.debug ?? false;
  }

  on<K extends keyof EventMap>(
    event: K,
    listener: EventHandler<EventMap, K>
  ): Subscription {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    eventListeners.add(listener);
    
    // Check for memory leaks after adding the listener
    if (eventListeners.size > this.maxListeners) {
      console.warn(
        `EventBus: Maximum listeners (${this.maxListeners}) exceeded for event "${String(event)}". ` +
        'Possible memory leak detected.'
      );
    }

    if (this.debugMode) {
      console.debug(`EventBus: Listener added for "${String(event)}". Total: ${eventListeners.size}`);
    }

    return {
      unsubscribe: () => {
        eventListeners.delete(listener);
        if (eventListeners.size === 0) {
          this.listeners.delete(event);
        }
        
        if (this.debugMode) {
          console.debug(`EventBus: Listener removed for "${String(event)}". Remaining: ${eventListeners.size}`);
        }
      }
    };
  }

  once<K extends keyof EventMap>(
    event: K,
    listener: EventHandler<EventMap, K>
  ): Subscription {
    const subscription = this.on(event, (payload) => {
      subscription.unsubscribe();
      listener(payload);
    });
    
    return subscription;
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    
    if (this.debugMode) {
      console.debug(`EventBus: Emitting "${String(event)}" with payload:`, payload);
    }

    if (eventListeners) {
      // Create a copy to avoid issues if listeners are added/removed during emission
      const listenersArray = Array.from(eventListeners);
      
      for (const listener of listenersArray) {
        try {
          (listener as Function)(payload);
        } catch (error) {
          console.error(`EventBus: Error in listener for "${String(event)}":`, error);
          
          // Emit error event (but be careful not to create infinite loops)
          if (event !== 'error:occurred') {
            this.emit('error:occurred', {
              error: error as Error,
              context: `Event listener for "${String(event)}"`
            });
          }
        }
      }
    }
  }

  // Remove all listeners for a specific event
  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
      if (this.debugMode) {
        console.debug(`EventBus: All listeners removed for "${String(event)}"`);
      }
    } else {
      this.listeners.clear();
      if (this.debugMode) {
        console.debug('EventBus: All listeners removed for all events');
      }
    }
  }

  // Get listener count for an event
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  // Get all event names that have listeners
  eventNames(): (keyof EventMap)[] {
    return Array.from(this.listeners.keys());
  }

  // Set maximum listeners (for memory leak detection)
  setMaxListeners(max: number): void {
    this.maxListeners = max;
  }

  // Enable/disable debug mode
  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }

  // Clean up all listeners
  destroy(): void {
    this.removeAllListeners();
  }
}