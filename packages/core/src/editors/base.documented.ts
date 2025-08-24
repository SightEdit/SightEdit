/**
 * @module @sightedit/core/editors
 * @description Base editor class for all SightEdit editors
 */

import { Editor, EditorConfig } from '../types';
import { EventEmitter } from '../utils/event-emitter';
import { addClass, removeClass, hasClass } from '../utils/dom';

/**
 * Abstract base class for all SightEdit editors.
 * Provides common functionality for editing, validation, and saving.
 * All custom editors should extend this class.
 * 
 * @abstract
 * @class BaseEditor
 * @extends EventEmitter
 * @implements {Editor}
 * 
 * @fires BaseEditor#change - When the editor value changes
 * @fires BaseEditor#editStart - When editing begins
 * @fires BaseEditor#editEnd - When editing ends
 * 
 * @example
 * ```javascript
 * class CustomEditor extends BaseEditor {
 *   render() {
 *     // Implement custom rendering logic
 *     this.element.contentEditable = 'true';
 *     this.setupKeyboardHandlers(this.element);
 *   }
 *   
 *   extractValue() {
 *     return this.element.textContent;
 *   }
 *   
 *   applyValue(value) {
 *     this.element.textContent = value;
 *   }
 * }
 * ```
 */
export abstract class BaseEditor extends EventEmitter implements Editor {
  /**
   * The HTML element being edited
   * @public
   * @type {HTMLElement}
   */
  public element: HTMLElement;
  
  /**
   * Editor configuration options
   * @protected
   * @type {EditorConfig}
   */
  protected config: EditorConfig;
  
  /**
   * Alias for config (backward compatibility)
   * @protected
   * @type {EditorConfig}
   */
  protected options: EditorConfig;
  
  /**
   * Original value before editing started
   * @protected
   * @type {any}
   */
  protected originalValue: any;
  
  /**
   * Whether the editor is currently in edit mode
   * @protected
   * @type {boolean}
   */
  protected isEditing = false;
  
  /**
   * Whether the current value is valid
   * @protected
   * @type {boolean}
   */
  protected isValid = true;
  
  /**
   * Current value of the editor
   * @public
   * @type {any}
   */
  value: any;
  
  /**
   * Callback function to save the edited value
   * @public
   * @type {Function}
   */
  onSave?: (value: any) => Promise<void>;

  /**
   * Creates a new BaseEditor instance.
   * 
   * @constructor
   * @param {HTMLElement} element - The element to make editable
   * @param {EditorConfig} [config] - Configuration options
   * @param {string} [config.mode='inline'] - Editor mode (inline, modal, sidebar, tooltip)
   * @param {Object} [config.schema] - Validation schema
   * @param {Object} [config.theme] - Theme configuration
   * @param {string} [config.locale] - Locale for internationalization
   */
  constructor(element: HTMLElement, config?: EditorConfig) {
    super();
    this.element = element;
    this.config = config || {};
    this.options = this.config;
    this.originalValue = this.extractValue();
    this.value = this.originalValue;
  }

  /**
   * Renders the editor UI.
   * Must be implemented by subclasses.
   * 
   * @abstract
   * @public
   * @returns {void}
   */
  abstract render(): void;
  
  /**
   * Extracts the current value from the element.
   * Must be implemented by subclasses.
   * 
   * @abstract
   * @public
   * @returns {any} The extracted value
   */
  abstract extractValue(): any;
  
  /**
   * Applies a value to the element.
   * Must be implemented by subclasses.
   * 
   * @abstract
   * @public
   * @param {any} value - The value to apply
   * @returns {void}
   */
  abstract applyValue(value: any): void;

  /**
   * Gets the current value of the editor.
   * 
   * @public
   * @returns {any} The current value
   * 
   * @example
   * ```javascript
   * const currentValue = editor.getValue();
   * console.log('Current value:', currentValue);
   * ```
   */
  getValue(): any {
    return this.value;
  }

  /**
   * Sets the value of the editor and updates the UI.
   * 
   * @public
   * @param {any} value - The value to set
   * @fires BaseEditor#change
   * @returns {void}
   * 
   * @example
   * ```javascript
   * editor.setValue('New content');
   * ```
   */
  setValue(value: any): void {
    this.value = value;
    this.applyValue(value);
    
    /**
     * Value change event
     * @event BaseEditor#change
     * @type {any}
     */
    this.emit('change', value);
  }

  /**
   * Validates the current value against the schema.
   * 
   * @public
   * @returns {boolean|string} True if valid, error message if invalid
   * 
   * @example
   * ```javascript
   * const validation = editor.validate();
   * if (validation !== true) {
   *   console.error('Validation failed:', validation);
   * }
   * ```
   */
  validate(): boolean | string {
    const schema = this.config.schema;
    
    if (!schema) {
      return true;
    }

    // Required field validation
    if (schema.required && !this.value) {
      return 'This field is required';
    }

    // String length validation
    if (schema.minLength && this.value.length < schema.minLength) {
      return `Minimum length is ${schema.minLength}`;
    }

    if (schema.maxLength && this.value.length > schema.maxLength) {
      return `Maximum length is ${schema.maxLength}`;
    }

    // Numeric range validation
    if (schema.min !== undefined && this.value < schema.min) {
      return `Minimum value is ${schema.min}`;
    }

    if (schema.max !== undefined && this.value > schema.max) {
      return `Maximum value is ${schema.max}`;
    }

    // Custom validation function
    if (schema.validation) {
      const result = schema.validation(this.value);
      if (typeof result === 'string') {
        return result;
      }
      return result ? true : 'Invalid value';
    }

    return true;
  }

  /**
   * Starts the editing process.
   * 
   * @protected
   * @fires BaseEditor#editStart
   * @returns {void}
   */
  protected startEditing(): void {
    if (this.isEditing) return;
    
    this.isEditing = true;
    addClass(this.element, 'sight-edit-active');
    this.originalValue = this.getValue();
    
    /**
     * Edit start event
     * @event BaseEditor#editStart
     */
    this.emit('editStart');
  }

  /**
   * Stops the editing process, optionally saving changes.
   * 
   * @protected
   * @param {boolean} [save=true] - Whether to save changes
   * @fires BaseEditor#editEnd
   * @returns {Promise<void>}
   */
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
      // Revert to original value
      this.setValue(this.originalValue);
    }
    
    this.isEditing = false;
    removeClass(this.element, 'sight-edit-active');
    this.clearError();
    
    /**
     * Edit end event
     * @event BaseEditor#editEnd
     */
    this.emit('editEnd');
  }

  /**
   * Checks if the value has changed since editing started.
   * 
   * @protected
   * @returns {boolean} True if the value has changed
   */
  protected hasChanged(): boolean {
    return this.value !== this.originalValue;
  }

  /**
   * Saves the current value using the onSave callback.
   * 
   * @protected
   * @returns {Promise<void>}
   * @throws {Error} If saving fails
   */
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

  /**
   * Displays an error message on the element.
   * 
   * @protected
   * @param {string} message - The error message to display
   * @returns {void}
   */
  protected showError(message: string): void {
    addClass(this.element, 'sight-edit-error');
    this.element.setAttribute('data-sight-error', message);
    this.isValid = false;
    
    // Auto-clear error after 5 seconds
    setTimeout(() => {
      if (!this.isValid) {
        this.clearError();
      }
    }, 5000);
  }

  /**
   * Clears any error state from the element.
   * 
   * @protected
   * @returns {void}
   */
  protected clearError(): void {
    removeClass(this.element, 'sight-edit-error');
    this.element.removeAttribute('data-sight-error');
    this.isValid = true;
  }

  /**
   * Shows a success indicator on the element.
   * 
   * @protected
   * @returns {void}
   */
  protected showSuccess(): void {
    addClass(this.element, 'sight-edit-success');
    setTimeout(() => {
      removeClass(this.element, 'sight-edit-success');
    }, 2000);
  }

  /**
   * Destroys the editor and cleans up resources.
   * 
   * @public
   * @returns {void}
   * 
   * @example
   * ```javascript
   * editor.destroy();
   * ```
   */
  destroy(): void {
    this.stopEditing(false);
    this.removeAllListeners();
    removeClass(this.element, 'sight-edit-ready');
  }

  /**
   * Sets up keyboard event handlers for the editable element.
   * 
   * @protected
   * @param {HTMLElement} editableElement - The element to attach handlers to
   * @returns {void}
   */
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

  /**
   * Determines if the editor allows line breaks.
   * Override in subclasses to allow multi-line editing.
   * 
   * @protected
   * @returns {boolean} True if line breaks are allowed
   */
  protected allowsLineBreaks(): boolean {
    return false;
  }

  /**
   * Injects editor-specific CSS styles into the document.
   * 
   * @protected
   * @returns {void}
   */
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