/**
 * React Error Boundary components for comprehensive error handling
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorHandler, SightEditError, ErrorType } from '@sightedit/core';

// Optional Sentry integration - only load if available
let sentry: any = null;
try {
  // This import will fail gracefully if not available in basic builds
  const sentryModule = require('@sightedit/core/utils/sentry-integration');
  sentry = sentryModule.sentry;
} catch (e) {
  // Sentry not available in basic build - continue without it
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  isRecoverable: boolean;
  lastErrorTime?: number;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void;
  fallback?: React.ComponentType<ErrorBoundaryFallbackProps>;
  enableRetry?: boolean;
  maxRetries?: number;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolateErrors?: boolean;
  level?: 'page' | 'section' | 'component';
  autoRetryDelay?: number;
  enableSentry?: boolean;
}

export interface ErrorBoundaryFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetError: () => void;
  retry: () => void;
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
  errorId: string | null;
  isRecoverable: boolean;
  level: string;
  userMessage: { message: string; suggestion?: string; action?: string };
}

/**
 * Main Error Boundary component with advanced error recovery
 */
export class SightEditErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetKeys: string;
  private retryTimeouts: NodeJS.Timeout[] = [];
  private errorCount = 0;
  private readonly ERROR_THRESHOLD = 5;
  private readonly TIME_WINDOW = 60000;
  private errorTimestamps: number[] = [];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isRecoverable: true
    };
    
    this.resetKeys = this.generateResetKey(props.resetKeys);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const isRecoverable = error instanceof SightEditError ? error.recoverable : true;
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      isRecoverable,
      lastErrorTime: Date.now()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId || this.generateErrorId();
    
    this.setState({ errorInfo, errorId });
    
    this.trackErrorFrequency();
    
    const errorType = this.determineErrorType(error);
    const context = {
      component: 'ErrorBoundary',
      level: this.props.level || 'component',
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
      errorId,
      userId: this.getUserId(),
      errorFrequency: this.errorCount,
      props: this.sanitizeProps()
    };
    
    ErrorHandler.handle(error, errorType, context);
    
    if (this.props.enableSentry !== false) {
      this.reportToSentry(error, errorInfo, errorId);
    }
    
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo, errorId);
      } catch (handlerError) {
        ErrorHandler.handle(handlerError as Error, ErrorType.RUNTIME, {
          component: 'ErrorBoundary',
          context: 'onError_handler',
          originalErrorId: errorId
        });
      }
    }
    
    if (this.shouldAutoRetry(error)) {
      this.scheduleRetry();
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && resetKeys) {
      const prevResetKeys = this.generateResetKey(prevProps.resetKeys);
      const currentResetKeys = this.generateResetKey(resetKeys);
      
      if (prevResetKeys !== currentResetKeys) {
        this.resetError();
        return;
      }
    }

    if (hasError && resetOnPropsChange && this.hasPropsChanged(prevProps)) {
      this.resetError();
    }
  }
  
  componentWillUnmount() {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  render() {
    const { hasError, error, errorInfo, errorId, retryCount, isRecoverable } = this.state;
    const { fallback: Fallback, children, enableRetry = true, maxRetries = 3 } = this.props;

    if (hasError && error) {
      const userMessage = { 
        message: error.message || 'An unexpected error occurred',
        suggestion: 'Try refreshing the page or contact support if the issue persists'
      };
      const canRetry = enableRetry && 
                      retryCount < maxRetries && 
                      isRecoverable && 
                      this.errorCount < this.ERROR_THRESHOLD;

      const fallbackProps: ErrorBoundaryFallbackProps = {
        error,
        errorInfo,
        resetError: this.resetError,
        retry: this.retry,
        canRetry,
        retryCount,
        maxRetries,
        errorId,
        isRecoverable,
        level: this.props.level || 'component',
        userMessage
      };

      if (Fallback) {
        return <Fallback {...fallbackProps} />;
      }

      return <DefaultErrorFallback {...fallbackProps} />;
    }

    return children;
  }

  private resetError = (): void => {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts = [];

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isRecoverable: true,
      lastErrorTime: undefined
    });
  };

  private retry = (): void => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries || this.errorCount >= this.ERROR_THRESHOLD) {
      return;
    }

    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));

    ErrorHandler.handle(
      `Error boundary retry attempt ${retryCount + 1}`,
      ErrorType.RUNTIME,
      {
        component: 'ErrorBoundary',
        retryCount: retryCount + 1,
        maxRetries,
        level: this.props.level,
        errorId: this.state.errorId
      }
    );
  };

  private async reportToSentry(error: Error, errorInfo: ErrorInfo, errorId: string): Promise<void> {
    try {
      await sentry.captureException(error, {
        tags: {
          component: 'ErrorBoundary',
          level: this.props.level || 'component',
          errorId
        },
        extra: {
          componentStack: errorInfo.componentStack,
          retryCount: this.state.retryCount,
          props: this.sanitizeProps()
        },
        user: {
          id: this.getUserId()
        }
      });
      
      await sentry.addBreadcrumb({
        message: 'Error boundary caught error',
        category: 'error_boundary',
        level: 'error',
        data: {
          errorId,
          componentLevel: this.props.level,
          retryCount: this.state.retryCount
        }
      });
    } catch (sentryError) {
      console.warn('Failed to report error to Sentry:', sentryError);
    }
  }
  
  private trackErrorFrequency(): void {
    const now = Date.now();
    this.errorTimestamps.push(now);
    
    this.errorTimestamps = this.errorTimestamps.filter(
      timestamp => now - timestamp < this.TIME_WINDOW
    );
    
    this.errorCount = this.errorTimestamps.length;
    
    if (this.errorCount >= this.ERROR_THRESHOLD) {
      console.warn('Too many errors in error boundary, disabling auto-retry');
    }
  }
  
  private shouldAutoRetry(error: Error): boolean {
    const { enableRetry = true, maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (!enableRetry || retryCount >= maxRetries || this.errorCount >= this.ERROR_THRESHOLD) {
      return false;
    }

    if (error instanceof SightEditError) {
      return error.retryable;
    }

    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes(ErrorType.NETWORK) || 
           errorMessage.includes('timeout') || 
           errorMessage.includes('fetch') ||
           errorMessage.includes('loading');
  }
  
  private scheduleRetry(): void {
    const { autoRetryDelay = 1000 } = this.props;
    const { retryCount } = this.state;
    const delay = Math.min(autoRetryDelay * Math.pow(2, retryCount), 10000);

    const timeout = setTimeout(() => {
      this.retry();
    }, delay);

    this.retryTimeouts.push(timeout);
  }
  
  private determineErrorType(error: Error): string {
    if (error instanceof SightEditError) {
      return error.type;
    }

    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes(ErrorType.NETWORK) || message.includes('fetch')) {
      return ErrorType.NETWORK;
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('permission') || message.includes('forbidden')) {
      return 'permission';
    }
    if (message.includes('auth')) {
      return 'authentication';
    }
    if (stack.includes('validation') || message.includes('validation')) {
      return 'validation';
    }

    return ErrorType.RUNTIME;
  }
  
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateResetKey(resetKeys?: Array<string | number>): string {
    if (!resetKeys) return '';
    return resetKeys.join('|');
  }
  
  private hasPropsChanged(prevProps: ErrorBoundaryProps): boolean {
    const relevantKeys: (keyof ErrorBoundaryProps)[] = ['resetKeys', 'maxRetries', 'enableRetry', 'level'];
    return relevantKeys.some(key => prevProps[key] !== this.props[key]);
  }
  
  private getUserId(): string | undefined {
    if (typeof window !== 'undefined') {
      const sightEdit = (window as any).SightEdit;
      if (sightEdit && sightEdit.getUserId) {
        return sightEdit.getUserId();
      }
    }
    return undefined;
  }
  
  private sanitizeProps(): Record<string, any> {
    const { onError, children, fallback, ...safeProps } = this.props;
    return {
      ...safeProps,
      hasChildren: !!children,
      hasFallback: !!fallback,
      hasOnError: !!onError
    };
  }
}

/**
 * Default error fallback component
 */
const DefaultErrorFallback: React.FC<ErrorBoundaryFallbackProps> = ({
  error,
  errorInfo,
  resetError,
  retry,
  canRetry,
  retryCount,
  maxRetries,
  errorId,
  isRecoverable,
  level,
  userMessage
}) => {
  const isPageLevel = level === 'page';
  const containerClass = isPageLevel 
    ? 'min-h-screen flex items-center justify-center bg-gray-50'
    : 'p-6 bg-red-50 border border-red-200 rounded-lg';

  return (
    <div className={containerClass}>
      <div className="text-center max-w-md mx-auto">
        <div className={`${isPageLevel ? 'text-6xl' : 'text-4xl'} mb-4`}>
          {isRecoverable ? '⚠️' : '💥'}
        </div>
        
        <h2 className={`${isPageLevel ? 'text-2xl' : 'text-lg'} font-semibold text-gray-900 mb-2`}>
          {isPageLevel ? 'Something went wrong' : 'Component Error'}
        </h2>
        
        <p className="text-gray-600 mb-4">
          {userMessage.message}
        </p>

        {userMessage.suggestion && (
          <p className="text-sm text-gray-500 mb-6">
            {userMessage.suggestion}
          </p>
        )}

        <div className="space-y-3">
          {canRetry && (
            <button
              onClick={retry}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
            </button>
          )}
          
          {isRecoverable && (
            <button
              onClick={resetError}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          )}
          
          {!isRecoverable && (
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
            >
              Reload Page
            </button>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Error Details (Development)
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 overflow-auto max-h-32">
              <div><strong>Error:</strong> {error.message}</div>
              {errorId && <div><strong>ID:</strong> {errorId}</div>}
              {error.stack && (
                <div className="mt-2">
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap">{error.stack}</pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

/**
 * HOC for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Partial<ErrorBoundaryProps>
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <SightEditErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </SightEditErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for error handling in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error, context?: Record<string, any>) => {
    ErrorHandler.handle(error, ErrorType.RUNTIME, {
      component: 'useErrorHandler',
      ...context
    });
    
    sentry.captureException(error, {
      tags: { component: 'useErrorHandler' },
      extra: context
    });
    
    setError(error);
  }, []);

  const handleAsyncError = React.useCallback(async (
    promise: Promise<any>,
    context?: Record<string, any>
  ): Promise<any> => {
    try {
      return await promise;
    } catch (error) {
      handleError(error as Error, context);
      return null;
    }
  }, [handleError]);

  if (error) {
    throw error;
  }

  return {
    handleError,
    handleAsyncError,
    resetError,
    hasError: !!error
  };
}

// Specialized error boundaries
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <SightEditErrorBoundary
    level="page"
    enableRetry={true}
    maxRetries={3}
    resetOnPropsChange={false}
    isolateErrors={false}
  >
    {children}
  </SightEditErrorBoundary>
);

export const SectionErrorBoundary: React.FC<{ children: ReactNode; sectionName?: string }> = ({ 
  children, 
  sectionName 
}) => (
  <SightEditErrorBoundary
    level="section"
    enableRetry={true}
    maxRetries={2}
    resetOnPropsChange={true}
    isolateErrors={true}
    onError={(error, errorInfo, errorId) => {
      ErrorHandler.handle(error, ErrorType.RUNTIME, {
        component: 'SectionErrorBoundary',
        section: sectionName,
        errorId
      });
    }}
  >
    {children}
  </SightEditErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{ 
  children: ReactNode;
  componentName?: string;
  fallback?: React.ComponentType<ErrorBoundaryFallbackProps>;
}> = ({ children, componentName, fallback }) => (
  <SightEditErrorBoundary
    level="component"
    enableRetry={true}
    maxRetries={1}
    resetOnPropsChange={true}
    isolateErrors={true}
    fallback={fallback}
    onError={(error, errorInfo, errorId) => {
      ErrorHandler.handle(error, ErrorType.RUNTIME, {
        component: componentName || 'ComponentErrorBoundary',
        errorId
      });
    }}
  >
    {children}
  </SightEditErrorBoundary>
);

export const NetworkErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <SightEditErrorBoundary
    level="component"
    enableRetry={true}
    maxRetries={5}
    resetOnPropsChange={false}
    isolateErrors={true}
    onError={(error, errorInfo, errorId) => {
      ErrorHandler.handle(error, ErrorType.NETWORK, {
        component: 'NetworkErrorBoundary',
        errorId
      });
    }}
  >
    {children}
  </SightEditErrorBoundary>
);

export default SightEditErrorBoundary;