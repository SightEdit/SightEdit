import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback, useRef } from 'react';
import { SightEditCore, SightEditConfig, Editor } from '@sightedit/core';
import { SightEditErrorBoundary } from './ErrorBoundary';

export interface SightEditContextValue {
  sightEdit: SightEditCore | null;
  isInitialized: boolean;
  isEditMode: boolean;
  activeEditors: readonly Editor[];
  error: Error | null;
  initialize: (config?: Partial<SightEditConfig>) => Promise<void>;
  destroy: () => Promise<void>;
  toggleEditMode: () => void;
  setEditMode: (enabled: boolean) => void;
}

const SightEditContext = createContext<SightEditContextValue | null>(null);

export interface SightEditProviderProps {
  children: ReactNode;
  config?: Partial<SightEditConfig>;
  autoInit?: boolean;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

export function SightEditProvider({
  children,
  config,
  autoInit = true,
  fallback = null,
  onError
}: SightEditProviderProps): JSX.Element {
  const [sightEdit, setSightEdit] = useState<SightEditCore | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeEditors, setActiveEditors] = useState<readonly Editor[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // BUG FIX: Store event listener cleanup functions
  const listenersRef = useRef<(() => void)[]>([]);

  // BUG FIX: Memoize callback ref to prevent unnecessary re-renders
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  // Initialize SightEdit
  const initialize = useCallback(async (initConfig?: Partial<SightEditConfig>) => {
    if (isInitializing) return;
    
    setIsInitializing(true);
    setError(null);

    try {
      const instance = SightEditCore.getInstance(initConfig || config);
      await instance.initialize();
      
      setSightEdit(instance);
      setIsInitialized(true);
      setIsEditMode(instance.isEditMode());
      setActiveEditors(instance.getActiveEditors());

      // BUG FIX: Clean up old listeners before adding new ones
      listenersRef.current.forEach(cleanup => cleanup());
      listenersRef.current = [];

      // Set up event listeners with named functions for cleanup
      const editModeListener = () => {
        setIsEditMode(instance.isEditMode());
      };

      const editorsUpdatedListener = () => {
        setActiveEditors(instance.getActiveEditors());
      };

      const errorListener = (event: any) => {
        const err = event.error;
        setError(err);
        // BUG FIX: Use onErrorRef.current to avoid stale closure
        if (onErrorRef.current) {
          onErrorRef.current(err);
        }
      };

      instance.on('edit-mode:toggled', editModeListener);
      instance.on('editors:updated', editorsUpdatedListener);
      instance.on('error:occurred', errorListener);

      // BUG FIX: Store cleanup functions for proper memory management
      listenersRef.current = [
        () => instance.off('edit-mode:toggled', editModeListener),
        () => instance.off('editors:updated', editorsUpdatedListener),
        () => instance.off('error:occurred', errorListener)
      ];

    } catch (err) {
      const error = err as Error;
      setError(error);
      // BUG FIX: Use onErrorRef.current to avoid stale closure
      if (onErrorRef.current) {
        onErrorRef.current(error);
      }
    } finally {
      setIsInitializing(false);
    }
  // BUG FIX: Added config to dependencies (memoized above)
  }, [config]);

  // Destroy SightEdit
  const destroy = useCallback(async () => {
    // BUG FIX: Clean up event listeners before destroying
    listenersRef.current.forEach(cleanup => cleanup());
    listenersRef.current = [];

    if (sightEdit) {
      try {
        await sightEdit.destroy();
        setSightEdit(null);
        setIsInitialized(false);
        setIsEditMode(false);
        setActiveEditors([]);
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(error);
        // BUG FIX: Use onErrorRef.current to avoid stale closure
        if (onErrorRef.current) {
          onErrorRef.current(error);
        }
      }
    }
  }, [sightEdit]);

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    if (sightEdit) {
      sightEdit.toggleEditMode();
    }
  }, [sightEdit]);

  // Set edit mode
  const setEditMode = useCallback((enabled: boolean) => {
    if (sightEdit) {
      sightEdit.setEditMode(enabled);
    }
  }, [sightEdit]);

  // Auto-initialize if requested
  useEffect(() => {
    if (autoInit && !isInitialized && !isInitializing) {
      initialize();
    }
  // BUG FIX: Added all dependencies (initialize, isInitialized, isInitializing)
  }, [autoInit, isInitialized, isInitializing, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // BUG FIX: Clean up event listeners on unmount
      listenersRef.current.forEach(cleanup => cleanup());
      listenersRef.current = [];

      if (sightEdit) {
        sightEdit.destroy().catch(console.error);
      }
    };
  }, [sightEdit]);

  const contextValue = useMemo<SightEditContextValue>(() => ({
    sightEdit,
    isInitialized,
    isEditMode,
    activeEditors,
    error,
    initialize,
    destroy,
    toggleEditMode,
    setEditMode
  }), [
    sightEdit,
    isInitialized,
    isEditMode,
    activeEditors,
    error,
    initialize,
    destroy,
    toggleEditMode,
    setEditMode
  ]);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <SightEditErrorBoundary onError={onError}>
      <SightEditContext.Provider value={contextValue}>
        {children}
      </SightEditContext.Provider>
    </SightEditErrorBoundary>
  );
}

export function useSightEditContext(): SightEditContextValue {
  const context = useContext(SightEditContext);
  if (!context) {
    throw new Error('useSightEditContext must be used within a SightEditProvider');
  }
  return context;
}

// Higher-order component for automatic SightEdit integration
export function withSightEdit<P extends object>(
  Component: React.ComponentType<P>,
  config?: Partial<SightEditConfig>
) {
  const WrappedComponent = (props: P) => (
    <SightEditProvider config={config}>
      <Component {...props} />
    </SightEditProvider>
  );

  WrappedComponent.displayName = `withSightEdit(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}