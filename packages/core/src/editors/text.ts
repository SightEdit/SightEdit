import { BaseEditor } from './base';
import { EditorConfig } from '../types';
import { debounce } from '../utils/dom';

export class TextEditor extends BaseEditor {
  private originalHTML = '';
  private saveDebounced: () => void;

  constructor(element: HTMLElement, config?: EditorConfig) {
    super(element, config);
    this.saveDebounced = debounce(() => this.autoSave(), 1000);
  }

  render(): void {
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
    
    this.element.addEventListener('click', () => {
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
    super.startEditing();
    this.originalHTML = this.element.innerHTML;
    this.element.setAttribute('contenteditable', 'true');
    
    requestAnimationFrame(() => {
      this.element.focus();
      this.selectAll();
    });
  }

  protected async stopEditing(save = true): Promise<void> {
    this.element.setAttribute('contenteditable', 'false');
    
    if (!save) {
      this.element.innerHTML = this.originalHTML;
      this.value = this.extractValue();
    }
    
    await super.stopEditing(save);
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
    this.element.removeAttribute('contenteditable');
    this.element.removeAttribute('spellcheck');
    super.destroy();
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