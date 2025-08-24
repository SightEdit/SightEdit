import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement } from '../utils/dom';
import { JSONValidator } from '../utils/sanitizer';
import { SafeJSONParser } from '../utils/safe-json';

export class JSONEditor extends BaseEditor {
  private modal: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.fontFamily = 'monospace';
    this.element.style.fontSize = '0.9em';
    this.element.style.backgroundColor = '#f5f5f5';
    this.element.style.padding = '8px';
    this.element.style.borderRadius = '4px';
    this.element.style.border = '1px solid #ddd';
    this.element.style.position = 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.maxHeight = '200px';
    
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      this.showModal();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.backgroundColor = '#e8e8e8';
      this.element.style.borderColor = this.options.theme?.primaryColor || '#007bff';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.backgroundColor = '#f5f5f5';
      this.element.style.borderColor = '#ddd';
    });

    // Add edit indicator
    const editIndicator = createElement('div', {
      style: {
        position: 'absolute',
        top: '4px',
        right: '4px',
        padding: '2px 6px',
        backgroundColor: this.options.theme?.primaryColor || '#007bff',
        color: 'white',
        fontSize: '11px',
        borderRadius: '3px',
        opacity: '0',
        transition: 'opacity 0.3s'
      }
    }, ['Edit JSON']);

    this.element.appendChild(editIndicator);
    
    this.element.addEventListener('mouseenter', () => {
      editIndicator.style.opacity = '1';
    });
    
    this.element.addEventListener('mouseleave', () => {
      editIndicator.style.opacity = '0';
    });
  }

  private showModal(): void {
    const currentValue = this.extractValue();
    
    this.modal = createElement('div', {
      className: 'sight-edit-modal',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '10000'
      }
    });

    const modalContent = createElement('div', {
      style: {
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
      }
    });

    const header = createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }
    });

    const title = createElement('h3', {
      style: {
        margin: '0',
        fontSize: '18px',
        fontWeight: '600'
      }
    }, ['Edit JSON']);

    const actions = createElement('div', {
      style: {
        display: 'flex',
        gap: '8px'
      }
    });

    const formatButton = createElement('button', {
      style: {
        padding: '6px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer',
        fontSize: '14px'
      }
    }, ['Format']);

    const validateButton = createElement('button', {
      style: {
        padding: '6px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer',
        fontSize: '14px'
      }
    }, ['Validate']);

    formatButton.addEventListener('click', () => this.formatJSON());
    validateButton.addEventListener('click', () => this.validateJSON());

    actions.appendChild(formatButton);
    actions.appendChild(validateButton);
    header.appendChild(title);
    header.appendChild(actions);

    const editorWrapper = createElement('div', {
      style: {
        flex: '1',
        marginBottom: '16px',
        position: 'relative',
        border: '1px solid #ddd',
        borderRadius: '4px',
        overflow: 'hidden'
      }
    });

    this.textarea = createElement('textarea', {
      value: this.formatJSONString(currentValue),
      style: {
        width: '100%',
        height: '400px',
        padding: '12px',
        border: 'none',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        fontSize: '13px',
        lineHeight: '1.5',
        resize: 'none',
        outline: 'none',
        tabSize: '2'
      },
      spellcheck: 'false'
    }) as HTMLTextAreaElement;

    // Add line numbers
    const lineNumbers = createElement('div', {
      style: {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '40px',
        height: '100%',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #ddd',
        padding: '12px 8px',
        textAlign: 'right',
        fontSize: '13px',
        lineHeight: '1.5',
        color: '#666',
        userSelect: 'none',
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
      }
    });

    this.updateLineNumbers();
    this.textarea.addEventListener('input', () => this.updateLineNumbers());
    this.textarea.addEventListener('scroll', () => {
      lineNumbers.scrollTop = this.textarea!.scrollTop;
    });

    // Indent with Tab
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea!.selectionStart;
        const end = this.textarea!.selectionEnd;
        const value = this.textarea!.value;
        this.textarea!.value = value.substring(0, start) + '  ' + value.substring(end);
        this.textarea!.selectionStart = this.textarea!.selectionEnd = start + 2;
      }
    });

    editorWrapper.appendChild(lineNumbers);
    this.textarea.style.paddingLeft = '50px';
    editorWrapper.appendChild(this.textarea);

    const errorDisplay = createElement('div', {
      id: 'json-error',
      style: {
        marginBottom: '16px',
        padding: '8px 12px',
        backgroundColor: '#fee',
        border: '1px solid #fcc',
        borderRadius: '4px',
        color: '#c00',
        fontSize: '13px',
        display: 'none'
      }
    });

    const footer = createElement('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
      }
    });

    const cancelButton = createElement('button', {
      style: {
        padding: '8px 16px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer'
      }
    }, ['Cancel']);

    const saveButton = createElement('button', {
      style: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: this.options.theme?.primaryColor || '#007bff',
        color: 'white',
        cursor: 'pointer'
      }
    }, ['Save']);

    cancelButton.addEventListener('click', () => this.closeModal());
    saveButton.addEventListener('click', () => this.saveJSON());

    footer.appendChild(cancelButton);
    footer.appendChild(saveButton);

    modalContent.appendChild(header);
    modalContent.appendChild(editorWrapper);
    modalContent.appendChild(errorDisplay);
    modalContent.appendChild(footer);
    this.modal.appendChild(modalContent);
    document.body.appendChild(this.modal);

    this.textarea.focus();

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  private updateLineNumbers(): void {
    if (!this.textarea) return;
    
    const lineNumbers = this.modal?.querySelector('div[style*="position: absolute"]');
    if (!lineNumbers) return;
    
    const lines = this.textarea.value.split('\n').length;
    const numbers = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    lineNumbers.textContent = numbers;
  }

  private formatJSONString(value: any): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return typeof value === 'string' ? value : '';
    }
  }

  private formatJSON(): void {
    if (!this.textarea) return;
    
    const parsed = SafeJSONParser.tryParse(this.textarea.value);
    if (parsed !== null) {
      this.textarea.value = SafeJSONParser.stringify(parsed, undefined, 2);
      this.updateLineNumbers();
      this.hideError();
    } else {
      this.showValidationMessage('Invalid JSON: Unable to parse JSON');
    }
  }

  private validateJSON(): void {
    if (!this.textarea) return;
    
    const validation = JSONValidator.validate(this.textarea.value);
    
    if (validation.isValid) {
      this.showValidationMessage('Valid JSON', 'success');
      setTimeout(() => this.hideError(), 2000);
    } else {
      this.showValidationMessage('Invalid JSON: ' + (validation.error || 'Unknown error'));
    }
  }

  private showValidationMessage(message: string, type: 'error' | 'success' = 'error'): void {
    const errorDisplay = this.modal?.querySelector('#json-error') as HTMLElement;
    if (!errorDisplay) return;
    
    errorDisplay.textContent = message;
    errorDisplay.style.display = 'block';
    
    if (type === 'success') {
      errorDisplay.style.backgroundColor = '#efe';
      errorDisplay.style.borderColor = '#cfc';
      errorDisplay.style.color = '#060';
    } else {
      errorDisplay.style.backgroundColor = '#fee';
      errorDisplay.style.borderColor = '#fcc';
      errorDisplay.style.color = '#c00';
    }
  }

  private hideError(): void {
    const errorDisplay = this.modal?.querySelector('#json-error') as HTMLElement;
    if (errorDisplay) {
      errorDisplay.style.display = 'none';
    }
  }

  private async saveJSON(): Promise<void> {
    if (!this.textarea) return;
    
    const validation = JSONValidator.validate(this.textarea.value);
    
    if (!validation.isValid) {
      this.showValidationMessage('Cannot save invalid JSON: ' + (validation.error || 'Unknown error'));
      return;
    }
    
    try {
      // Update display
      this.element.textContent = JSON.stringify(validation.sanitized, null, 2);
      
      if (this.onSave) {
        await this.onSave(validation.sanitized);
      }
      
      this.closeModal();
    } catch (error) {
      this.showValidationMessage('Save failed: ' + (error as Error).message);
    }
  }

  private closeModal(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.textarea = null;
    }
  }

  extractValue(): any {
    const text = this.element.textContent || '';
    const parsed = SafeJSONParser.tryParse(text);
    return parsed !== null ? parsed : text;
  }

  applyValue(value: any): void {
    this.element.textContent = SafeJSONParser.stringify(value, undefined, 2);
  }

  destroy(): void {
    this.closeModal();
    const indicator = this.element.querySelector('div[style*="position: absolute"]');
    if (indicator) {
      indicator.remove();
    }
    this.element.style.cursor = '';
    this.element.style.fontFamily = '';
    this.element.style.fontSize = '';
    this.element.style.backgroundColor = '';
    this.element.style.padding = '';
    this.element.style.borderRadius = '';
    this.element.style.border = '';
    this.element.style.position = '';
    this.element.style.overflow = '';
    this.element.style.maxHeight = '';
    super.destroy();
  }
}