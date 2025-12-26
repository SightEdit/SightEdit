/**
 * Component Registry
 *
 * Allows developers to override default UI components with custom implementations.
 * Supports both function-based and class-based component renderers.
 */

export type ComponentType =
  | 'toolbar'
  | 'modal'
  | 'sidebar'
  | 'editor'
  | 'saveButton'
  | 'cancelButton'
  | 'deleteButton'
  | 'closeButton'
  | 'loadingSpinner'
  | 'errorMessage'
  | 'successMessage';

export interface ComponentProps {
  // Common props for all components
  theme?: any;
  className?: string;
  style?: Record<string, any>;

  // Toolbar props
  changeCount?: number;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;

  // Modal props
  title?: string;
  content?: HTMLElement | string;
  onClose?: () => void;
  width?: number;
  height?: number;

  // Editor props
  value?: any;
  onChange?: (value: any) => void;
  type?: string;
  properties?: Record<string, any>;

  // Button props
  label?: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';

  // Message props
  message?: string;
  duration?: number;
  onDismiss?: () => void;

  // Custom props
  [key: string]: any;
}

export type ComponentRenderer = (props: ComponentProps) => HTMLElement;

export interface ComponentOverride {
  type: ComponentType;
  renderer: ComponentRenderer;
  priority?: number; // Higher priority = rendered first (default: 100)
}

export class ComponentRegistry {
  private static instance: ComponentRegistry | null = null;
  private overrides: Map<ComponentType, ComponentOverride[]> = new Map();
  private defaults: Map<ComponentType, ComponentRenderer> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  /**
   * Register a component override
   */
  register(override: ComponentOverride): void {
    const { type, renderer, priority = 100 } = override;

    if (!this.overrides.has(type)) {
      this.overrides.set(type, []);
    }

    const overrides = this.overrides.get(type)!;
    overrides.push({ type, renderer, priority });

    // Sort by priority (descending)
    overrides.sort((a, b) => (b.priority || 100) - (a.priority || 100));
  }

  /**
   * Remove a component override
   */
  unregister(type: ComponentType, renderer: ComponentRenderer): void {
    const overrides = this.overrides.get(type);
    if (!overrides) return;

    const index = overrides.findIndex(o => o.renderer === renderer);
    if (index !== -1) {
      overrides.splice(index, 1);
    }
  }

  /**
   * Clear all overrides for a component type
   */
  clearOverrides(type: ComponentType): void {
    this.overrides.delete(type);
  }

  /**
   * Clear all overrides
   */
  clearAll(): void {
    this.overrides.clear();
  }

  /**
   * Render a component with the highest priority override or default
   */
  render(type: ComponentType, props: ComponentProps): HTMLElement {
    const overrides = this.overrides.get(type);

    // Use highest priority override if available
    if (overrides && overrides.length > 0) {
      try {
        return overrides[0].renderer(props);
      } catch (error) {
        console.error(`Error rendering override for ${type}:`, error);
        // Fall back to default
      }
    }

    // Use default renderer
    const defaultRenderer = this.defaults.get(type);
    if (defaultRenderer) {
      return defaultRenderer(props);
    }

    // Final fallback: empty div
    const fallback = document.createElement('div');
    fallback.textContent = `Component not found: ${type}`;
    fallback.style.cssText = 'padding: 1rem; color: red; border: 1px solid red;';
    return fallback;
  }

  /**
   * Check if a component type has overrides
   */
  hasOverride(type: ComponentType): boolean {
    const overrides = this.overrides.get(type);
    return !!overrides && overrides.length > 0;
  }

  /**
   * Get all registered overrides for a component type
   */
  getOverrides(type: ComponentType): ComponentOverride[] {
    return this.overrides.get(type) || [];
  }

  /**
   * Register default component renderers
   */
  private registerDefaults(): void {
    // Toolbar
    this.defaults.set('toolbar', (props) => {
      const toolbar = document.createElement('div');
      toolbar.className = 'se-toolbar';
      toolbar.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        gap: 8px;
        padding: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
      `;

      const badge = document.createElement('span');
      badge.style.cssText = `
        color: white;
        font-size: 14px;
        font-weight: 500;
        margin-right: 8px;
        line-height: 32px;
      `;
      badge.textContent = `${props.changeCount || 0} change(s)`;
      toolbar.appendChild(badge);

      const saveBtn = this.render('saveButton', {
        label: 'Save',
        onClick: props.onSave,
        loading: props.isSaving
      });
      toolbar.appendChild(saveBtn);

      const cancelBtn = this.render('cancelButton', {
        label: 'Cancel',
        onClick: props.onCancel
      });
      toolbar.appendChild(cancelBtn);

      return toolbar;
    });

    // Save Button
    this.defaults.set('saveButton', (props) => {
      const button = document.createElement('button');
      button.className = 'se-button se-button-primary';
      button.textContent = props.loading ? 'Saving...' : (props.label || 'Save');
      button.disabled = props.disabled || props.loading || false;
      button.style.cssText = `
        padding: 8px 16px;
        background: white;
        color: #764ba2;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
        opacity: ${props.disabled ? '0.5' : '1'};
        transition: all 0.2s;
      `;

      if (props.onClick) {
        button.addEventListener('click', () => {
          if (!props.disabled && !props.loading) {
            props.onClick?.();
          }
        });
      }

      return button;
    });

    // Cancel Button
    this.defaults.set('cancelButton', (props) => {
      const button = document.createElement('button');
      button.className = 'se-button se-button-secondary';
      button.textContent = props.label || 'Cancel';
      button.disabled = props.disabled || false;
      button.style.cssText = `
        padding: 8px 16px;
        background: rgba(255,255,255,0.2);
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
        opacity: ${props.disabled ? '0.5' : '1'};
        transition: all 0.2s;
      `;

      if (props.onClick) {
        button.addEventListener('click', () => {
          if (!props.disabled) {
            props.onClick?.();
          }
        });
      }

      return button;
    });

    // Delete Button
    this.defaults.set('deleteButton', (props) => {
      const button = document.createElement('button');
      button.className = 'se-button se-button-danger';
      button.textContent = props.label || 'Delete';
      button.disabled = props.disabled || false;
      button.style.cssText = `
        padding: 8px 16px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
        opacity: ${props.disabled ? '0.5' : '1'};
        transition: all 0.2s;
      `;

      if (props.onClick) {
        button.addEventListener('click', () => {
          if (!props.disabled) {
            props.onClick?.();
          }
        });
      }

      return button;
    });

    // Close Button
    this.defaults.set('closeButton', (props) => {
      const button = document.createElement('button');
      button.className = 'se-button se-button-close';
      button.textContent = '✕';
      button.style.cssText = `
        width: 32px;
        height: 32px;
        padding: 0;
        background: transparent;
        color: #6b7280;
        border: none;
        border-radius: 4px;
        font-size: 20px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      button.addEventListener('mouseenter', () => {
        button.style.background = '#f3f4f6';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
      });

      if (props.onClick) {
        button.addEventListener('click', props.onClick);
      }

      return button;
    });

    // Modal
    this.defaults.set('modal', (props) => {
      const overlay = document.createElement('div');
      overlay.className = 'se-modal-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
      `;

      const modal = document.createElement('div');
      modal.className = 'se-modal';
      modal.style.cssText = `
        background: white;
        border-radius: 8px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        width: ${props.width || 600}px;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.2s ease;
      `;

      // Header
      if (props.title) {
        const header = document.createElement('div');
        header.className = 'se-modal-header';
        header.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        `;

        const title = document.createElement('h3');
        title.textContent = props.title;
        title.style.cssText = `
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
        `;
        header.appendChild(title);

        if (props.onClose) {
          const closeBtn = this.render('closeButton', { onClick: props.onClose });
          header.appendChild(closeBtn);
        }

        modal.appendChild(header);
      }

      // Content
      const content = document.createElement('div');
      content.className = 'se-modal-content';
      content.style.cssText = `
        padding: 1.5rem;
        overflow: auto;
        flex: 1;
      `;

      if (typeof props.content === 'string') {
        content.innerHTML = props.content;
      } else if (props.content instanceof HTMLElement) {
        content.appendChild(props.content);
      }

      modal.appendChild(content);

      overlay.appendChild(modal);

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && props.onClose) {
          props.onClose();
        }
      });

      return overlay;
    });

    // Loading Spinner
    this.defaults.set('loadingSpinner', (props) => {
      const spinner = document.createElement('div');
      spinner.className = 'se-spinner';
      spinner.style.cssText = `
        width: 40px;
        height: 40px;
        border: 4px solid #f3f4f6;
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto;
      `;

      // Add keyframes if not already added
      if (!document.querySelector('#se-spinner-keyframes')) {
        const style = document.createElement('style');
        style.id = 'se-spinner-keyframes';
        style.textContent = `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      return spinner;
    });

    // Error Message
    this.defaults.set('errorMessage', (props) => {
      const message = document.createElement('div');
      message.className = 'se-message se-message-error';
      message.style.cssText = `
        padding: 12px 16px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-left: 4px solid #ef4444;
        border-radius: 4px;
        color: #991b1b;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 8px 0;
      `;

      const text = document.createElement('span');
      text.textContent = props.message || 'An error occurred';
      message.appendChild(text);

      if (props.onDismiss) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
          background: none;
          border: none;
          color: #991b1b;
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          width: 20px;
          height: 20px;
        `;
        closeBtn.addEventListener('click', props.onDismiss);
        message.appendChild(closeBtn);
      }

      if (props.duration) {
        setTimeout(() => {
          message.style.opacity = '0';
          message.style.transition = 'opacity 0.3s';
          setTimeout(() => message.remove(), 300);
        }, props.duration);
      }

      return message;
    });

    // Success Message
    this.defaults.set('successMessage', (props) => {
      const message = document.createElement('div');
      message.className = 'se-message se-message-success';
      message.style.cssText = `
        padding: 12px 16px;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-left: 4px solid #22c55e;
        border-radius: 4px;
        color: #166534;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 8px 0;
      `;

      const text = document.createElement('span');
      text.textContent = props.message || 'Success!';
      message.appendChild(text);

      if (props.onDismiss) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
          background: none;
          border: none;
          color: #166534;
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          width: 20px;
          height: 20px;
        `;
        closeBtn.addEventListener('click', props.onDismiss);
        message.appendChild(closeBtn);
      }

      if (props.duration) {
        setTimeout(() => {
          message.style.opacity = '0';
          message.style.transition = 'opacity 0.3s';
          setTimeout(() => message.remove(), 300);
        }, props.duration);
      }

      return message;
    });
  }

  /**
   * Get a default renderer (for testing/debugging)
   */
  getDefault(type: ComponentType): ComponentRenderer | undefined {
    return this.defaults.get(type);
  }
}

// Export singleton instance
export const componentRegistry = ComponentRegistry.getInstance();

// Convenience functions
export function registerComponent(override: ComponentOverride): void {
  componentRegistry.register(override);
}

export function unregisterComponent(type: ComponentType, renderer: ComponentRenderer): void {
  componentRegistry.unregister(type, renderer);
}

export function renderComponent(type: ComponentType, props: ComponentProps): HTMLElement {
  return componentRegistry.render(type, props);
}

export function hasComponentOverride(type: ComponentType): boolean {
  return componentRegistry.hasOverride(type);
}
