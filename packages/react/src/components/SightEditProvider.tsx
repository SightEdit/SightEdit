import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
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

  // Initialize SightEdit
  const initialize = async (initConfig?: Partial<SightEditConfig>) => {
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

      // Set up event listeners
      instance.on('edit-mode:toggled', () => {
        setIsEditMode(instance.isEditMode());
      });

      instance.on('editors:updated', () => {
        setActiveEditors(instance.getActiveEditors());
      });

      instance.on('error:occurred', (event: any) => {
        const err = event.error;
        setError(err);
        if (onError) {
          onError(err);
        }
      });

    } catch (err) {
      const error = err as Error;
      setError(error);
      if (onError) {
        onError(error);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // Destroy SightEdit
  const destroy = async () => {
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
        if (onError) {
          onError(error);
        }
      }
    }
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (sightEdit) {
      sightEdit.toggleEditMode();
    }
  };

  // Set edit mode
  const setEditMode = (enabled: boolean) => {
    if (sightEdit) {
      sightEdit.setEditMode(enabled);
    }
  };

  // Auto-initialize if requested
  useEffect(() => {
    if (autoInit && !isInitialized && !isInitializing) {
      initialize();
    }
  }, [autoInit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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