import { Editor, EditorConfig } from '../types';
import { EventEmitter } from '../utils/event-emitter';
import { addClass, removeClass, hasClass } from '../utils/dom';

export abstract class BaseEditor extends EventEmitter implements Editor {
  public element: HTMLElement;
  protected config: EditorConfig;
  protected options: EditorConfig;
  protected originalValue: any;
  protected isEditing = false;
  protected isValid = true;
  
  value: any;
  onSave?: (value: any) => Promise<void>;

  constructor(element: HTMLElement, config?: EditorConfig) {
    super();
    this.element = element;
    this.config = config || {};
    this.options = this.config;
    this.originalValue = this.extractValue();
    this.value = this.originalValue;
  }

  abstract render(): void;
  abstract extractValue(): any;
  abstract applyValue(value: any): void;

  getValue(): any {
    return this.value;
  }

  setValue(value: any): void {
    this.value = value;
    this.applyValue(value);
    this.emit('change', value);
  }

  validate(value?: any): boolean | string {
    const schema = this.config.schema;
    const valueToValidate = value !== undefined ? value : this.value;
    
    if (!schema) {
      return true;
    }

    if (schema.required && !valueToValidate) {
      return 'This field is required';
    }

    if (schema.minLength && valueToValidate.length < schema.minLength) {
      return `Minimum length is ${schema.minLength}`;
    }

    if (schema.maxLength && valueToValidate.length > schema.maxLength) {
      return `Maximum length is ${schema.maxLength}`;
    }

    if (schema.min !== undefined && valueToValidate < schema.min) {
      return `Minimum value is ${schema.min}`;
    }

    if (schema.max !== undefined && valueToValidate > schema.max) {
      return `Maximum value is ${schema.max}`;
    }

    if (schema.validation) {
      const result = schema.validation(valueToValidate);
      if (typeof result === 'string') {
        return result;
      }
      return result ? true : 'Invalid value';
    }

    return true;
  }

  protected startEditing(): void {
    if (this.isEditing) return;
    
    this.isEditing = true;
    addClass(this.element, 'sight-edit-active');
    this.originalValue = this.getValue();
    this.emit('editStart');
  }

  protected async stopEditing(save = true): Promise<void> {
    if (!this.isEditing) return;
    
    if (save) {
      const validation = this.validate();
      if (validation !== true) {
        this.showError(validation as string);
        return;
      }
      
      if (this.hasChanged()) {
        await this.save();
      }
    } else {
      this.setValue(this.originalValue);
    }
    
    this.isEditing = false;
    removeClass(this.element, 'sight-edit-active');
    this.clearError();
    this.emit('editEnd');
  }

  protected hasChanged(): boolean {
    return this.value !== this.originalValue;
  }

  protected async save(): Promise<void> {
    if (!this.onSave) return;
    
    try {
      addClass(this.element, 'sight-edit-saving');
      await this.onSave(this.value);
      this.originalValue = this.value;
      this.showSuccess();
    } catch (error) {
      this.showError('Failed to save');
      throw error;
    } finally {
      removeClass(this.element, 'sight-edit-saving');
    }
  }

  public showError(message: string): void {
    addClass(this.element, 'sight-edit-error');
    this.element.setAttribute('data-sight-error', message);
    this.isValid = false;
    
    setTimeout(() => {
      if (!this.isValid) {
        this.clearError();
      }
    }, 5000);
  }

  protected clearError(): void {
    removeClass(this.element, 'sight-edit-error');
    this.element.removeAttribute('data-sight-error');
    this.isValid = true;
  }

  protected showSuccess(): void {
    addClass(this.element, 'sight-edit-success');
    setTimeout(() => {
      removeClass(this.element, 'sight-edit-success');
    }, 2000);
  }

  destroy(): void {
    this.stopEditing(false);
    this.removeAllListeners();
    removeClass(this.element, 'sight-edit-ready');
  }

  protected setupKeyboardHandlers(editableElement: HTMLElement): void {
    editableElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.stopEditing(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        if (this.config.mode !== 'inline' || !this.allowsLineBreaks()) {
          e.preventDefault();
          this.stopEditing(true);
        }
      }
    });
  }

  protected allowsLineBreaks(): boolean {
    return false;
  }

  protected injectStyles(): void {
    if (document.getElementById('sight-edit-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sight-edit-styles';
    style.textContent = `
      .sight-edit-ready {
        position: relative;
        transition: all 0.2s ease;
      }
      
      [data-sight-edit-mode="edit"] .sight-edit-ready:hover {
        outline: 2px dashed ${this.config.theme?.primaryColor || '#007bff'};
        outline-offset: 2px;
        cursor: pointer;
      }
      
      .sight-edit-active {
        outline: 2px solid ${this.config.theme?.primaryColor || '#007bff'} !important;
        outline-offset: 2px;
      }
      
      .sight-edit-saving {
        opacity: 0.6;
        pointer-events: none;
      }
      
      .sight-edit-error {
        outline-color: #dc3545 !important;
      }
      
      .sight-edit-error::after {
        content: attr(data-sight-error);
        position: absolute;
        bottom: 100%;
        left: 0;
        background: #dc3545;
        color: white;
        padding: 4px 8px;
        border-radius: ${this.config.theme?.borderRadius || '4px'};
        font-size: 12px;
        white-space: nowrap;
        z-index: ${(this.config.theme?.zIndex || 9999) + 1};
        margin-bottom: 4px;
      }
      
      .sight-edit-success {
        outline-color: #28a745 !important;
      }
    `;
    
    document.head.appendChild(style);
  }
}