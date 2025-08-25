import { EventEmitter } from '../utils/event-emitter';

export interface ModalOptions {
  title?: string;
  width?: string;
  height?: string;
  className?: string;
  closeOnEscape?: boolean;
  closeOnOverlay?: boolean;
  showCloseButton?: boolean;
  footer?: boolean;
}

export class ModalManager extends EventEmitter {
  private modal: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private originalFocus: HTMLElement | null = null;
  private static instance: ModalManager;

  static getInstance(): ModalManager {
    if (!this.instance) {
      this.instance = new ModalManager();
    }
    return this.instance;
  }

  open(content: HTMLElement | string, options: ModalOptions = {}): HTMLElement {
    this.close(); // Close any existing modal
    
    const opts = {
      title: 'Edit',
      width: '600px',
      height: 'auto',
      closeOnEscape: true,
      closeOnOverlay: true,
      showCloseButton: true,
      footer: true,
      ...options
    };

    // Store current focus
    this.originalFocus = document.activeElement as HTMLElement;

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'sight-modal-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 999998;
      animation: fadeIn 0.2s ease;
    `;

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = `sight-modal ${opts.className || ''}`;
    this.modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      width: ${opts.width};
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.3s ease;
    `;

    // Create header
    const header = document.createElement('div');
    header.className = 'sight-modal-header';
    header.style.cssText = `
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('h3');
    title.textContent = opts.title || '';
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    `;
    header.appendChild(title);

    if (opts.showCloseButton) {
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.className = 'sight-modal-close';
      closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 28px;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
      `;
      closeBtn.onmouseover = () => {
        closeBtn.style.background = '#f3f4f6';
        closeBtn.style.color = '#1f2937';
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.background = 'none';
        closeBtn.style.color = '#6b7280';
      };
      closeBtn.onclick = () => this.close();
      header.appendChild(closeBtn);
    }

    // Create body
    const body = document.createElement('div');
    body.className = 'sight-modal-body';
    body.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    `;

    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }

    // Create footer if needed
    let footer: HTMLElement | null = null;
    if (opts.footer) {
      footer = document.createElement('div');
      footer.className = 'sight-modal-footer';
      footer.style.cssText = `
        padding: 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      `;
    }

    // Assemble modal
    this.modal.appendChild(header);
    this.modal.appendChild(body);
    if (footer) {
      this.modal.appendChild(footer);
    }

    // Add event listeners
    if (opts.closeOnOverlay) {
      this.overlay.onclick = () => this.close();
    }

    if (opts.closeOnEscape) {
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.close();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    // Add styles if not already added
    this.injectStyles();

    // Append to DOM
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.modal);

    // Focus first focusable element
    const focusable = this.modal.querySelector('input, textarea, select, button');
    if (focusable) {
      (focusable as HTMLElement).focus();
    }

    this.emit('open');
    return footer || body;
  }

  close(): void {
    if (this.modal) {
      this.modal.style.animation = 'slideOut 0.2s ease';
      setTimeout(() => {
        if (this.modal && this.modal.parentNode) {
          this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
      }, 200);
    }

    if (this.overlay) {
      this.overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 200);
    }

    // Restore focus
    if (this.originalFocus) {
      this.originalFocus.focus();
      this.originalFocus = null;
    }

    this.emit('close');
  }

  private injectStyles(): void {
    if (document.getElementById('sight-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'sight-modal-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translate(-50%, -48%) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      
      @keyframes slideOut {
        from {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -52%) scale(0.95);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

export class SidebarManager extends EventEmitter {
  private sidebar: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private static instance: SidebarManager;

  static getInstance(): SidebarManager {
    if (!this.instance) {
      this.instance = new SidebarManager();
    }
    return this.instance;
  }

  open(content: HTMLElement | string, options: any = {}): HTMLElement {
    this.close();

    const opts = {
      title: 'Edit',
      width: '400px',
      position: 'right',
      closeOnEscape: true,
      closeOnOverlay: true,
      ...options
    };

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'sight-sidebar-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(2px);
      z-index: 999998;
      animation: fadeIn 0.2s ease;
    `;

    // Create sidebar
    this.sidebar = document.createElement('div');
    this.sidebar.className = 'sight-sidebar';
    this.sidebar.style.cssText = `
      position: fixed;
      top: 0;
      ${opts.position}: 0;
      bottom: 0;
      width: ${opts.width};
      background: white;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      animation: slideIn${opts.position === 'right' ? 'Right' : 'Left'} 0.3s ease;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('h3');
    title.textContent = opts.title;
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    `;
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
    `;
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);

    // Create body
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    `;

    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }

    // Assemble sidebar
    this.sidebar.appendChild(header);
    this.sidebar.appendChild(body);

    // Event listeners
    if (opts.closeOnOverlay) {
      this.overlay.onclick = () => this.close();
    }

    if (opts.closeOnEscape) {
      const escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.close();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    // Add styles
    this.injectStyles();

    // Append to DOM
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.sidebar);

    this.emit('open');
    return body;
  }

  close(): void {
    if (this.sidebar) {
      this.sidebar.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (this.sidebar && this.sidebar.parentNode) {
          this.sidebar.parentNode.removeChild(this.sidebar);
        }
        this.sidebar = null;
      }, 300);
    }

    if (this.overlay) {
      this.overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 200);
    }

    this.emit('close');
  }

  private injectStyles(): void {
    if (document.getElementById('sight-sidebar-styles')) return;

    const style = document.createElement('style');
    style.id = 'sight-sidebar-styles';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
      
      @keyframes slideOutRight {
        from { transform: translateX(0); }
        to { transform: translateX(100%); }
      }
      
      @keyframes slideInLeft {
        from { transform: translateX(-100%); }
        to { transform: translateX(0); }
      }
      
      @keyframes slideOutLeft {
        from { transform: translateX(0); }
        to { transform: translateX(-100%); }
      }
    `;
    document.head.appendChild(style);
  }
}