/**
 * Accessibility utilities for SightEdit
 * Provides ARIA attributes, keyboard navigation, and focus management
 */

export interface A11yConfig {
  announceChanges?: boolean;
  keyboardShortcuts?: boolean;
  focusIndicator?: boolean;
  highContrast?: boolean;
  reducedMotion?: boolean;
}

export class AccessibilityManager {
  private config: A11yConfig;
  private liveRegion: HTMLElement | null = null;
  private focusTrap: FocusTrap | null = null;
  private originalFocus: HTMLElement | null = null;

  constructor(config: A11yConfig = {}) {
    this.config = {
      announceChanges: true,
      keyboardShortcuts: true,
      focusIndicator: true,
      highContrast: false,
      reducedMotion: false,
      ...config
    };

    this.initialize();
  }

  private initialize(): void {
    // Create live region for screen reader announcements
    if (this.config.announceChanges) {
      this.createLiveRegion();
    }

    // Check user preferences
    this.detectUserPreferences();

    // Add global keyboard listeners
    if (this.config.keyboardShortcuts) {
      this.setupKeyboardShortcuts();
    }
  }

  private createLiveRegion(): void {
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sight-edit-live-region';
    this.liveRegion.style.cssText = `
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(this.liveRegion);
  }

  private detectUserPreferences(): void {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.config.reducedMotion = true;
    }

    // Check for high contrast preference
    if (window.matchMedia('(prefers-contrast: high)').matches) {
      this.config.highContrast = true;
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));
  }

  private handleGlobalKeydown(event: KeyboardEvent): void {
    // Skip if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Escape key to exit any active editor
    if (event.key === 'Escape') {
      this.announce('Edit mode cancelled');
      document.dispatchEvent(new CustomEvent('sightEditEscape'));
    }

    // Tab navigation hints
    if (event.key === '?' && (event.ctrlKey || event.metaKey)) {
      this.showKeyboardHelp();
    }
  }

  /**
   * Announce message to screen readers
   */
  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.liveRegion || !this.config.announceChanges) return;

    this.liveRegion.setAttribute('aria-live', priority);
    this.liveRegion.textContent = message;

    // Clear after announcement
    setTimeout(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = '';
      }
    }, 1000);
  }

  /**
   * Add ARIA attributes to an editable element
   */
  public addAriaAttributes(
    element: HTMLElement,
    type: string,
    label?: string,
    description?: string
  ): void {
    // Set role based on element type
    const role = this.getAriaRole(type);
    if (role) {
      element.setAttribute('role', role);
    }

    // Add label
    if (label) {
      const labelId = `sight-edit-label-${Math.random().toString(36).substr(2, 9)}`;
      const labelElement = document.createElement('span');
      labelElement.id = labelId;
      labelElement.className = 'sight-edit-sr-only';
      labelElement.textContent = label;
      element.parentNode?.insertBefore(labelElement, element);
      element.setAttribute('aria-labelledby', labelId);
    }

    // Add description
    if (description) {
      element.setAttribute('aria-description', description);
    }

    // Mark as editable
    element.setAttribute('aria-editable', 'true');
    element.setAttribute('tabindex', '0');

    // Add edit mode indicator
    element.setAttribute('data-sight-edit-focusable', 'true');
  }

  private getAriaRole(type: string): string | null {
    const roleMap: Record<string, string> = {
      text: 'textbox',
      richtext: 'textbox',
      number: 'spinbutton',
      date: 'textbox',
      select: 'combobox',
      color: 'textbox',
      link: 'link',
      image: 'img',
      collection: 'list',
      json: 'textbox'
    };

    return roleMap[type] || null;
  }

  /**
   * Create a focus trap for modal editors
   */
  public createFocusTrap(container: HTMLElement): FocusTrap {
    this.originalFocus = document.activeElement as HTMLElement;
    this.focusTrap = new FocusTrap(container);
    this.focusTrap.activate();
    return this.focusTrap;
  }

  /**
   * Release focus trap and restore original focus
   */
  public releaseFocusTrap(): void {
    if (this.focusTrap) {
      this.focusTrap.deactivate();
      this.focusTrap = null;
    }

    if (this.originalFocus) {
      this.originalFocus.focus();
      this.originalFocus = null;
    }
  }

  /**
   * Show keyboard shortcuts help
   */
  private showKeyboardHelp(): void {
    const helpText = `
      Keyboard Shortcuts:
      - Ctrl/Cmd + E: Toggle edit mode
      - Tab: Navigate between editable elements
      - Enter: Start editing focused element
      - Escape: Cancel editing
      - Ctrl/Cmd + S: Save changes
      - Ctrl/Cmd + ?: Show this help
    `;
    
    this.announce(helpText, 'assertive');
    
    // Also show visual help dialog
    const dialog = document.createElement('div');
    dialog.className = 'sight-edit-help-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Keyboard shortcuts');
    dialog.innerHTML = `
      <div class="sight-edit-help-content">
        <h2>Keyboard Shortcuts</h2>
        <dl>
          <dt>Ctrl/Cmd + E</dt><dd>Toggle edit mode</dd>
          <dt>Tab</dt><dd>Navigate between editable elements</dd>
          <dt>Enter</dt><dd>Start editing focused element</dd>
          <dt>Escape</dt><dd>Cancel editing</dd>
          <dt>Ctrl/Cmd + S</dt><dd>Save changes</dd>
          <dt>Ctrl/Cmd + ?</dt><dd>Show this help</dd>
        </dl>
        <button class="sight-edit-help-close">Close (Esc)</button>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const closeButton = dialog.querySelector('.sight-edit-help-close') as HTMLButtonElement;
    closeButton?.focus();
    
    const close = () => {
      dialog.remove();
      this.originalFocus?.focus();
    };
    
    closeButton?.addEventListener('click', close);
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  /**
   * Apply focus styles to an element
   */
  public applyFocusStyles(element: HTMLElement): void {
    if (!this.config.focusIndicator) return;

    element.style.outline = '2px solid var(--sight-edit-focus-color, #0066cc)';
    element.style.outlineOffset = '2px';
  }

  /**
   * Remove focus styles from an element
   */
  public removeFocusStyles(element: HTMLElement): void {
    element.style.outline = '';
    element.style.outlineOffset = '';
  }

  /**
   * Check if reduced motion is preferred
   */
  public get prefersReducedMotion(): boolean {
    return this.config.reducedMotion || false;
  }

  /**
   * Check if high contrast is preferred
   */
  public get prefersHighContrast(): boolean {
    return this.config.highContrast || false;
  }

  /**
   * Clean up accessibility features
   */
  public destroy(): void {
    if (this.liveRegion) {
      this.liveRegion.remove();
      this.liveRegion = null;
    }

    if (this.focusTrap) {
      this.focusTrap.deactivate();
      this.focusTrap = null;
    }

    document.removeEventListener('keydown', this.handleGlobalKeydown.bind(this));
  }
}

/**
 * Focus trap utility for modal dialogs
 */
class FocusTrap {
  private container: HTMLElement;
  private focusableElements: HTMLElement[] = [];
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;
  private active = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.handleKeydown = this.handleKeydown.bind(this);
    this.updateFocusableElements();
  }

  private updateFocusableElements(): void {
    const selector = `
      a[href],
      button:not([disabled]),
      textarea:not([disabled]),
      input:not([disabled]),
      select:not([disabled]),
      [tabindex]:not([tabindex="-1"]),
      [contenteditable="true"]
    `;

    this.focusableElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(selector)
    );

    this.firstFocusable = this.focusableElements[0] || null;
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1] || null;
  }

  public activate(): void {
    if (this.active) return;

    this.active = true;
    document.addEventListener('keydown', this.handleKeydown);
    
    // Focus first element
    if (this.firstFocusable) {
      this.firstFocusable.focus();
    }
  }

  public deactivate(): void {
    if (!this.active) return;

    this.active = false;
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === this.firstFocusable) {
        event.preventDefault();
        this.lastFocusable?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusable) {
        event.preventDefault();
        this.firstFocusable?.focus();
      }
    }
  }
}

// Helper function to add screen reader only styles
export function addScreenReaderStyles(): void {
  if (document.getElementById('sight-edit-sr-styles')) return;

  const style = document.createElement('style');
  style.id = 'sight-edit-sr-styles';
  style.textContent = `
    .sight-edit-sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    .sight-edit-help-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      z-index: 100000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .sight-edit-help-content h2 {
      margin-top: 0;
    }

    .sight-edit-help-content dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
    }

    .sight-edit-help-content dt {
      font-weight: bold;
      text-align: right;
    }

    .sight-edit-help-close {
      margin-top: 20px;
      padding: 8px 16px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .sight-edit-help-close:hover {
      background: #0052a3;
    }

    [data-sight-edit-focusable]:focus {
      outline: 2px solid #0066cc !important;
      outline-offset: 2px !important;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    @media (prefers-contrast: high) {
      .sight-edit-help-dialog {
        border-width: 3px;
      }
      
      [data-sight-edit-focusable]:focus {
        outline-width: 3px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

export default AccessibilityManager;