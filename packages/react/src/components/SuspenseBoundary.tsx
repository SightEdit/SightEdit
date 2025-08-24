import React, { Suspense, ReactNode } from 'react';

export interface SuspenseBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onSuspense?: () => void;
  onResolved?: () => void;
}

export function SuspenseBoundary({ 
  children, 
  fallback,
  onSuspense,
  onResolved 
}: SuspenseBoundaryProps): JSX.Element {
  // Default loading fallback for SightEdit
  const defaultFallback = (
    <div 
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        color: '#6c757d',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          marginRight: '8px',
          border: '2px solid #dee2e6',
          borderTop: '2px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      />
      Loading editor...
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  React.useEffect(() => {
    onSuspense?.();
    return () => {
      onResolved?.();
    };
  }, [onSuspense, onResolved]);

  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
}

// Hook for creating lazy-loaded editor components
export function useLazyEditor<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): T | null {
  const [Component, setComponent] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const loadComponent = async () => {
      if (Component) return; // Already loaded
      
      setIsLoading(true);
      setError(null);

      try {
        const module = await importFn();
        if (mounted) {
          setComponent(() => module.default);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadComponent();

    return () => {
      mounted = false;
    };
  }, [importFn, Component]);

  if (error) {
    throw error; // Let ErrorBoundary handle it
  }

  return Component;
}