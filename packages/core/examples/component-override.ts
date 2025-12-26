/**
 * Component Override Examples
 *
 * This file demonstrates how to override SightEdit UI components with custom implementations.
 */

import {
  registerComponent,
  unregisterComponent,
  renderComponent,
  type ComponentProps
} from '../src/customization/ComponentRegistry';

// Example 1: Override the toolbar with a custom implementation
function customToolbarRenderer(props: ComponentProps): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'my-custom-toolbar';
  toolbar.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 20px;
    background: #1f2937;
    border-radius: 12px;
    box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    z-index: 9999;
  `;

  // Custom badge
  const badge = document.createElement('div');
  badge.style.cssText = `
    display: inline-block;
    padding: 4px 12px;
    background: #8b5cf6;
    color: white;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
  `;
  badge.textContent = `${props.changeCount || 0} unsaved`;
  toolbar.appendChild(badge);

  // Custom save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = props.isSaving ? '⏳ Saving...' : '✓ Save All';
  saveBtn.disabled = props.isSaving || false;
  saveBtn.style.cssText = `
    display: block;
    width: 100%;
    padding: 12px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: ${props.isSaving ? 'not-allowed' : 'pointer'};
    margin-bottom: 8px;
    transition: background 0.2s;
  `;

  saveBtn.addEventListener('mouseenter', () => {
    if (!props.isSaving) {
      saveBtn.style.background = '#059669';
    }
  });

  saveBtn.addEventListener('mouseleave', () => {
    if (!props.isSaving) {
      saveBtn.style.background = '#10b981';
    }
  });

  if (props.onSave) {
    saveBtn.addEventListener('click', () => {
      if (!props.isSaving) {
        props.onSave?.();
      }
    });
  }

  toolbar.appendChild(saveBtn);

  // Custom cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '✕ Discard';
  cancelBtn.style.cssText = `
    display: block;
    width: 100%;
    padding: 12px;
    background: transparent;
    color: #9ca3af;
    border: 1px solid #374151;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;

  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.borderColor = '#ef4444';
    cancelBtn.style.color = '#ef4444';
  });

  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.borderColor = '#374151';
    cancelBtn.style.color = '#9ca3af';
  });

  if (props.onCancel) {
    cancelBtn.addEventListener('click', props.onCancel);
  }

  toolbar.appendChild(cancelBtn);

  return toolbar;
}

// Register the custom toolbar
registerComponent({
  type: 'toolbar',
  renderer: customToolbarRenderer,
  priority: 200 // Higher priority than default (100)
});

// Example 2: Override the modal with a glassmorphism design
function customModalRenderer(props: ComponentProps): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    width: ${props.width || 600}px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
  `;

  // Header with gradient background
  if (props.title) {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const title = document.createElement('h3');
    title.textContent = props.title;
    title.style.cssText = `
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: white;
    `;
    header.appendChild(title);

    if (props.onClose) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = `
        width: 36px;
        height: 36px;
        background: rgba(255,255,255,0.2);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 20px;
        cursor: pointer;
        transition: background 0.2s;
      `;

      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
      });

      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.2)';
      });

      closeBtn.addEventListener('click', props.onClose);
      header.appendChild(closeBtn);
    }

    modal.appendChild(header);
  }

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    padding: 24px;
    max-height: calc(90vh - 100px);
    overflow: auto;
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
}

registerComponent({
  type: 'modal',
  renderer: customModalRenderer,
  priority: 150
});

// Example 3: Override save button with icon and animation
function customSaveButtonRenderer(props: ComponentProps): HTMLElement {
  const button = document.createElement('button');
  button.className = 'custom-save-btn';

  // Create icon
  const icon = document.createElement('span');
  icon.textContent = props.loading ? '⏳' : '💾';
  icon.style.marginRight = '8px';

  // Create text
  const text = document.createElement('span');
  text.textContent = props.loading ? 'Saving...' : (props.label || 'Save');

  button.appendChild(icon);
  button.appendChild(text);

  button.disabled = props.disabled || props.loading || false;
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 12px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
    opacity: ${props.disabled ? '0.5' : '1'};
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  `;

  if (!props.disabled && !props.loading) {
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });
  }

  if (props.onClick) {
    button.addEventListener('click', () => {
      if (!props.disabled && !props.loading) {
        // Add click animation
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
          button.style.transform = 'scale(1)';
        }, 100);

        props.onClick?.();
      }
    });
  }

  return button;
}

registerComponent({
  type: 'saveButton',
  renderer: customSaveButtonRenderer,
  priority: 150
});

// Example 4: Success message with custom animation
function customSuccessMessageRenderer(props: ComponentProps): HTMLElement {
  const message = document.createElement('div');
  message.style.cssText = `
    padding: 16px 20px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 12px 0;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    animation: slideInRight 0.3s ease;
  `;

  // Add animation keyframes
  if (!document.querySelector('#custom-message-keyframes')) {
    const style = document.createElement('style');
    style.id = 'custom-message-keyframes';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const content = document.createElement('div');
  content.style.cssText = 'display: flex; align-items: center; gap: 12px;';

  const icon = document.createElement('span');
  icon.textContent = '✓';
  icon.style.cssText = `
    width: 24px;
    height: 24px;
    background: rgba(255,255,255,0.3);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
  `;

  const text = document.createElement('span');
  text.textContent = props.message || 'Success!';

  content.appendChild(icon);
  content.appendChild(text);
  message.appendChild(content);

  if (props.onDismiss) {
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.2s;
    `;

    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.3)';
    });

    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.2)';
    });

    closeBtn.addEventListener('click', props.onDismiss);
    message.appendChild(closeBtn);
  }

  // Auto-dismiss
  if (props.duration) {
    setTimeout(() => {
      message.style.transform = 'translateX(100%)';
      message.style.opacity = '0';
      message.style.transition = 'all 0.3s';
      setTimeout(() => message.remove(), 300);
    }, props.duration);
  }

  return message;
}

registerComponent({
  type: 'successMessage',
  renderer: customSuccessMessageRenderer,
  priority: 150
});

// Example 5: Using the component registry to render components
export function exampleUsage() {
  // Render custom toolbar
  const toolbar = renderComponent('toolbar', {
    changeCount: 5,
    onSave: async () => {
      console.log('Saving changes...');
    },
    onCancel: () => {
      console.log('Cancelling...');
    },
    isSaving: false
  });

  document.body.appendChild(toolbar);

  // Render custom modal
  const modal = renderComponent('modal', {
    title: 'Edit Content',
    content: '<p>Your custom content here</p>',
    width: 700,
    onClose: () => {
      modal.remove();
    }
  });

  document.body.appendChild(modal);

  // Render success message
  const message = renderComponent('successMessage', {
    message: 'Changes saved successfully!',
    duration: 3000,
    onDismiss: () => {
      message.remove();
    }
  });

  document.body.appendChild(message);

  // Later: unregister custom components
  // unregisterComponent('toolbar', customToolbarRenderer);
  // unregisterComponent('modal', customModalRenderer);
  // unregisterComponent('saveButton', customSaveButtonRenderer);
  // unregisterComponent('successMessage', customSuccessMessageRenderer);
}

// Export for use in other modules
export {
  customToolbarRenderer,
  customModalRenderer,
  customSaveButtonRenderer,
  customSuccessMessageRenderer
};
