import { useCallback, useEffect, useState, useRef, useSyncExternalStore, useMemo } from 'react';
import { SightEditCore, SightEditConfig, Editor } from '@sightedit/core';

export interface UseSightEditOptions {
  config?: Partial<SightEditConfig>;
  autoInit?: boolean;
}

export interface UseSightEditReturn {
  isInitialized: boolean;
  isEditMode: boolean;
  activeEditors: readonly Editor[];
  error: Error | null;
  initialize: (config?: Partial<SightEditConfig>) => Promise<void>;
  destroy: () => Promise<void>;
  toggleEditMode: () => void;
  setEditMode: (enabled: boolean) => void;
  sightEdit: SightEditCore | null;
}

// External store for SightEdit state
const sightEditStore = {
  sightEdit: null as SightEditCore | null,
  subscribers: new Set<() => void>(),
  
  getSnapshot(): SightEditCore | null {
    return this.sightEdit;
  },

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  },

  setSightEdit(instance: SightEditCore | null): void {
    this.sightEdit = instance;
    this.subscribers.forEach(callback => callback());
  }
};

export function useSightEdit(options: UseSightEditOptions = {}): UseSightEditReturn {
  const { config, autoInit = true } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeEditors, setActiveEditors] = useState<readonly Editor[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const initializingRef = useRef(false);
  const listenersRef = useRef<(() => void)[]>([]);

  // BUG FIX: Memoize config object to prevent infinite loops
  // Config object is often created inline by parent components
  const configStr = config ? JSON.stringify(config) : '';
  const stableConfig = useMemo(() => config, [configStr]);

  // Subscribe to SightEdit instance changes
  const sightEdit = useSyncExternalStore(
    sightEditStore.subscribe.bind(sightEditStore),
    sightEditStore.getSnapshot.bind(sightEditStore)
  );

  // Initialize SightEdit
  const initialize = useCallback(async (initConfig?: Partial<SightEditConfig>) => {
    if (initializingRef.current) return;

    initializingRef.current = true;
    setError(null);

    try {
      let instance = sightEditStore.getSnapshot();

      if (!instance) {
        // BUG FIX: Use stableConfig instead of config to prevent infinite loops
        instance = SightEditCore.getInstance(initConfig || stableConfig);
        if (instance) {
          await instance.initialize();
        } else {
          throw new Error('Failed to get or create SightEditCore instance');
        }
        sightEditStore.setSightEdit(instance);
      }

      setIsInitialized(true);
      setIsEditMode(instance.isEditMode());
      const editorsMap = instance.getActiveEditors();
      setActiveEditors(Array.from(editorsMap.values()));

      // Set up event listeners
      const editModeListener = () => {
        setIsEditMode(instance!.isEditMode());
      };

      const editorsUpdatedListener = () => {
        const editorsMap = instance!.getActiveEditors();
        setActiveEditors(Array.from(editorsMap.values()));
      };

      const errorListener = (event: any) => {
        setError(event.error);
      };

      instance.on('edit-mode:toggled', editModeListener);
      instance.on('editors:updated', editorsUpdatedListener);
      instance.on('error:occurred', errorListener);

      // Store cleanup functions
      listenersRef.current = [
        () => instance!.off('edit-mode:toggled', editModeListener),
        () => instance!.off('editors:updated', editorsUpdatedListener),
        () => instance!.off('error:occurred', errorListener)
      ];

    } catch (err) {
      setError(err as Error);
    } finally {
      initializingRef.current = false;
    }
  // BUG FIX: Use stableConfig instead of config to prevent infinite loops
  }, [stableConfig]);

  // Destroy SightEdit
  const destroy = useCallback(async () => {
    try {
      // Clean up listeners
      listenersRef.current.forEach(cleanup => cleanup());
      listenersRef.current = [];

      const instance = sightEditStore.getSnapshot();
      if (instance) {
        await instance.destroy();
        sightEditStore.setSightEdit(null);
      }

      setIsInitialized(false);
      setIsEditMode(false);
      setActiveEditors([]);
      setError(null);
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    const instance = sightEditStore.getSnapshot();
    if (instance) {
      instance.toggleEditMode();
    }
  }, []);

  // Set edit mode
  const setEditMode = useCallback((enabled: boolean) => {
    const instance = sightEditStore.getSnapshot();
    if (instance) {
      instance.setEditMode(enabled ? 'edit' : 'view');
    }
  }, []);

  // Auto-initialize if requested
  useEffect(() => {
    if (autoInit && !isInitialized && !initializingRef.current) {
      initialize();
    }
  // BUG FIX: Added all dependencies to prevent stale closures
  }, [autoInit, isInitialized, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach(cleanup => cleanup());
      listenersRef.current = [];
    };
  }, []);

  return {
    isInitialized,
    isEditMode,
    activeEditors,
    error,
    initialize,
    destroy,
    toggleEditMode,
    setEditMode,
    sightEdit
  };
}

// Hook for accessing SightEdit context without initialization
export function useSightEditContext(): SightEditCore | null {
  return useSyncExternalStore(
    sightEditStore.subscribe.bind(sightEditStore),
    sightEditStore.getSnapshot.bind(sightEditStore)
  );
}