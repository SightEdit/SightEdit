import { BaseEditor } from './base';
import { EditorConfig } from '../types';
import { debounce, removeClass } from '../utils/dom';

export class TextEditor extends BaseEditor {
  private originalHTML = '';
  private saveDebounced: () => void;

  constructor(element: HTMLElement, config?: EditorConfig | string) {
    super(element, config);
    this.type = 'text'; // Set the type explicitly
    this.saveDebounced = debounce(() => this.autoSave(), 1000);
  }

  render(): void {
    if ((this.config as any).debug) {
      console.log('[TextEditor] render() called for:', this.element.dataset.sight || this.element.dataset.sightedit);
    }
    this.injectStyles();
    this.makeEditable();
  }

  extractValue(): string {
    return this.element.textContent?.trim() || '';
  }

  applyValue(value: string): void {
    this.element.textContent = value;
  }

  private makeEditable(): void {
    this.element.setAttribute('contenteditable', 'false');
    this.element.setAttribute('spellcheck', 'true');
    
    // Add debug logging
    if ((this.config as any).debug) {
      console.log('[TextEditor] Making element editable:', this.element.dataset.sight);
    }
    
    this.element.addEventListener('click', () => {
      if ((this.config as any).debug) {
        console.log('[TextEditor] Click event fired:', {
          sight: this.element.dataset.sight,
          isEditing: this.isEditing,
          contenteditable: this.element.getAttribute('contenteditable')
        });
      }
      
      if (!this.isEditing) {
        this.startEditing();
      }
    });

    this.element.addEventListener('input', () => {
      this.value = this.extractValue();
      this.emit('input', this.value);
      
      if (this.config.mode === 'inline') {
        this.saveDebounced();
      }
    });

    this.element.addEventListener('blur', () => {
      if (this.isEditing) {
        this.stopEditing(true);
      }
    });

    this.setupKeyboardHandlers(this.element);
  }

  protected startEditing(): void {
    if ((this.config as any).debug) {
      console.log('[TextEditor] Starting edit mode for:', this.element.dataset.sight);
    }
    
    super.startEditing();
    this.originalHTML = this.element.innerHTML;
    this.element.setAttribute('contenteditable', 'true');
    
    requestAnimationFrame(() => {
      this.element.focus();
      this.selectAll();
      
      if ((this.config as any).debug) {
        console.log('[TextEditor] Element focused and selected:', this.element.dataset.sight);
      }
    });
  }

  protected async stopEditing(save = true): Promise<void> {
    this.element.setAttribute('contenteditable', 'false');
    
    if (!save) {
      this.element.innerHTML = this.originalHTML;
      this.value = this.extractValue();
      // Temporarily override applyValue to prevent it from overwriting our restored HTML
      const originalApplyValue = this.applyValue;
      this.applyValue = () => {}; // No-op during cancel
      await super.stopEditing(save);
      this.applyValue = originalApplyValue; // Restore original method
    } else {
      await super.stopEditing(save);
    }
  }

  private selectAll(): void {
    const range = document.createRange();
    range.selectNodeContents(this.element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private async autoSave(): Promise<void> {
    if (!this.isEditing || !this.hasChanged()) return;
    
    const validation = this.validate();
    if (validation === true) {
      await this.save();
    }
  }

  destroy(): void {
    super.destroy();
    this.element.removeAttribute('contenteditable');
    this.element.removeAttribute('spellcheck');
  }

  protected injectStyles(): void {
    super.injectStyles();
    
    if (document.getElementById('sight-edit-text-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sight-edit-text-styles';
    style.textContent = `
      [contenteditable="true"] {
        outline: none;
        min-height: 1em;
        word-wrap: break-word;
      }
      
      [contenteditable="true"]:empty::before {
        content: attr(data-sight-placeholder);
        color: #999;
        pointer-events: none;
      }
      
      [contenteditable="true"]:focus {
        background-color: rgba(0, 123, 255, 0.05);
      }
    `;
    
    document.head.appendChild(style);
  }
}