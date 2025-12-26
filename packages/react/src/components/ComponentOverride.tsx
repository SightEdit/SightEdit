/**
 * React Component Override Wrapper
 *
 * Allows React components to be used as SightEdit component overrides
 */

import React, { useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type {
  ComponentType,
  ComponentProps,
  ComponentRenderer
} from '@sightedit/core';
import { registerComponent, unregisterComponent } from '@sightedit/core';

interface ReactComponentProps extends ComponentProps {
  children?: React.ReactNode;
}

type ReactComponentRenderer = React.FC<ReactComponentProps>;

interface ComponentOverrideConfig {
  type: ComponentType;
  component: ReactComponentRenderer;
  priority?: number;
}

/**
 * Wraps a React component to be used as a SightEdit component override
 */
export function createReactComponentRenderer(
  Component: ReactComponentRenderer
): ComponentRenderer {
  return (props: ComponentProps) => {
    const container = document.createElement('div');
    const root = createRoot(container);

    // Render React component
    root.render(<Component {...props} />);

    // Store root for cleanup
    (container as any).__reactRoot = root;

    return container;
  };
}

/**
 * Hook to register a React component as a SightEdit component override
 */
export function useComponentOverride(config: ComponentOverrideConfig): void {
  const rendererRef = useRef<ComponentRenderer | null>(null);

  useEffect(() => {
    // Create renderer
    const renderer = createReactComponentRenderer(config.component);
    rendererRef.current = renderer;

    // Register
    registerComponent({
      type: config.type,
      renderer,
      priority: config.priority
    });

    // Cleanup
    return () => {
      if (rendererRef.current) {
        unregisterComponent(config.type, rendererRef.current);
      }
    };
  }, [config.type, config.component, config.priority]);
}

/**
 * Component to register React component overrides declaratively
 */
interface ComponentOverrideProviderProps {
  overrides: ComponentOverrideConfig[];
  children?: React.ReactNode;
}

export const ComponentOverrideProvider: React.FC<ComponentOverrideProviderProps> = ({
  overrides,
  children
}) => {
  useEffect(() => {
    const renderers: Array<{ type: ComponentType; renderer: ComponentRenderer }> = [];

    // Register all overrides
    overrides.forEach(config => {
      const renderer = createReactComponentRenderer(config.component);
      renderers.push({ type: config.type, renderer });

      registerComponent({
        type: config.type,
        renderer,
        priority: config.priority
      });
    });

    // Cleanup
    return () => {
      renderers.forEach(({ type, renderer }) => {
        unregisterComponent(type, renderer);
      });
    };
  }, [overrides]);

  return <>{children}</>;
};

/**
 * Pre-built React component overrides
 */

// Custom Toolbar
interface CustomToolbarProps extends ComponentProps {
  changeCount?: number;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
}

export const CustomToolbar: React.FC<CustomToolbarProps> = ({
  changeCount = 0,
  onSave,
  onCancel,
  isSaving = false
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        display: 'flex',
        gap: '12px',
        padding: '16px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999
      }}
    >
      <span
        style={{
          color: 'white',
          fontSize: '14px',
          fontWeight: 500,
          lineHeight: '36px'
        }}
      >
        {changeCount} change(s)
      </span>

      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          padding: '8px 20px',
          background: 'white',
          color: '#764ba2',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.5 : 1
        }}
      >
        {isSaving ? 'Saving...' : 'Save All'}
      </button>

      <button
        onClick={onCancel}
        style={{
          padding: '8px 20px',
          background: 'rgba(255,255,255,0.2)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Cancel
      </button>
    </div>
  );
};

// Custom Modal
interface CustomModalProps extends ComponentProps {
  title?: string;
  onClose?: () => void;
  children?: React.ReactNode;
  width?: number;
}

export const CustomModal: React.FC<CustomModalProps> = ({
  title,
  onClose,
  children,
  width = 600
}) => {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          width: `${width}px`,
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid #e5e7eb'
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 600,
                color: '#1f2937'
              }}
            >
              {title}
            </h3>

            {onClose && (
              <button
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '24px',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div
          style={{
            padding: '24px',
            overflow: 'auto',
            flex: 1
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// Custom Button
interface CustomButtonProps extends ComponentProps {
  label?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  label = 'Button',
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false
}) => {
  const variantStyles = {
    primary: {
      background: '#8b5cf6',
      color: 'white',
      border: 'none'
    },
    secondary: {
      background: '#f3f4f6',
      color: '#374151',
      border: '1px solid #d1d5db'
    },
    danger: {
      background: '#ef4444',
      color: 'white',
      border: 'none'
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '10px 20px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'all 0.2s',
        ...variantStyles[variant]
      }}
    >
      {loading ? 'Loading...' : label}
    </button>
  );
};

// Custom Message
interface CustomMessageProps extends ComponentProps {
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onDismiss?: () => void;
}

export const CustomMessage: React.FC<CustomMessageProps> = ({
  message = 'Message',
  type = 'info',
  onDismiss
}) => {
  const typeStyles = {
    success: {
      background: '#f0fdf4',
      border: '1px solid #bbf7d0',
      borderLeft: '4px solid #22c55e',
      color: '#166534'
    },
    error: {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderLeft: '4px solid #ef4444',
      color: '#991b1b'
    },
    warning: {
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderLeft: '4px solid #f59e0b',
      color: '#92400e'
    },
    info: {
      background: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderLeft: '4px solid #3b82f6',
      color: '#1e40af'
    }
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '8px 0',
        ...typeStyles[type]
      }}
    >
      <span>{message}</span>

      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            padding: 0,
            width: '20px',
            height: '20px',
            color: 'inherit'
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
