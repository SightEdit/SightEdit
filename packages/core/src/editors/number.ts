import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement } from '../utils/dom';

export class NumberEditor extends BaseEditor {
  private input: HTMLInputElement | null = null;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.position = 'relative';
    
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      this.startInlineEdit();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      this.element.style.borderRadius = '4px';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.backgroundColor = '';
      this.element.style.borderRadius = '';
    });
  }

  private startInlineEdit(): void {
    if (this.input) return;
    
    const currentValue = this.extractValue();
    const rect = this.element.getBoundingClientRect();
    
    // Determine input attributes based on schema
    const schema = this.options.schema;
    const min = schema?.min;
    const max = schema?.max;
    const step = this.detectStep(currentValue);
    
    this.input = createElement('input', {
      type: 'number',
      value: currentValue.toString(),
      min: min?.toString(),
      max: max?.toString(),
      step: step,
      style: {
        position: 'absolute',
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${Math.max(rect.width, 100)}px`,
        height: `${rect.height}px`,
        padding: '4px 8px',
        border: '2px solid ' + (this.options.theme?.primaryColor || '#007bff'),
        borderRadius: '4px',
        fontSize: window.getComputedStyle(this.element).fontSize,
        fontFamily: window.getComputedStyle(this.element).fontFamily,
        backgroundColor: 'white',
        textAlign: 'right',
        zIndex: '10000'
      }
    }) as HTMLInputElement;

    document.body.appendChild(this.input);
    this.input.focus();
    this.input.select();

    // Add keyboard shortcuts for increment/decrement
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && e.shiftKey) {
        e.preventDefault();
        this.incrementValue(10);
      } else if (e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault();
        this.incrementValue(-10);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.finishEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit();
      }
    });

    this.input.addEventListener('blur', () => this.finishEdit());
    this.input.addEventListener('input', () => this.validateInput());

    this.startEditing();
  }

  private detectStep(value: number): string {
    const strValue = value.toString();
    const decimalIndex = strValue.indexOf('.');
    
    if (decimalIndex === -1) {
      return '1';
    }
    
    const decimals = strValue.length - decimalIndex - 1;
    return decimals <= 2 ? '0.01' : '0.001';
  }

  private incrementValue(amount: number): void {
    if (!this.input) return;
    
    const current = parseFloat(this.input.value) || 0;
    const newValue = current + amount;
    
    const schema = this.options.schema;
    if (schema?.min !== undefined && newValue < schema.min) {
      this.input.value = schema.min.toString();
    } else if (schema?.max !== undefined && newValue > schema.max) {
      this.input.value = schema.max.toString();
    } else {
      this.input.value = newValue.toString();
    }
    
    this.validateInput();
  }

  private validateInput(): void {
    if (!this.input) return;
    
    const value = parseFloat(this.input.value);
    const schema = this.options.schema;
    
    let isValid = true;
    
    if (isNaN(value)) {
      isValid = false;
    } else if (schema?.min !== undefined && value < schema.min) {
      isValid = false;
    } else if (schema?.max !== undefined && value > schema.max) {
      isValid = false;
    }
    
    this.input.style.borderColor = isValid 
      ? (this.options.theme?.primaryColor || '#007bff')
      : '#dc3545';
  }

  private async finishEdit(): Promise<void> {
    if (!this.input) return;
    
    const value = parseFloat(this.input.value);
    
    if (!isNaN(value)) {
      const validation = this.validate();
      if (validation === true) {
        // Format the display value
        const formatted = this.formatNumber(value);
        this.element.textContent = formatted;
        this.element.dataset.sightValue = value.toString();
        
        if (this.onSave) {
          await this.onSave(value);
        }
      } else {
        this.showError(validation as string);
      }
    }
    
    this.cleanupInput();
    this.stopEditing();
  }

  private formatNumber(value: number): string {
    // Check if element has currency or percentage indicator
    const text = this.element.textContent || '';
    const hasCurrency = /[$€£¥]/.test(text);
    const hasPercentage = /%/.test(text);
    
    if (hasCurrency) {
      const currency = text.match(/[$€£¥]/)?.[0] || '$';
      return currency + value.toLocaleString(this.options.locale || 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (hasPercentage) {
      return value.toLocaleString(this.options.locale || 'en-US') + '%';
    } else {
      // Regular number formatting
      const decimals = value.toString().split('.')[1]?.length || 0;
      return value.toLocaleString(this.options.locale || 'en-US', {
        minimumFractionDigits: decimals > 0 ? Math.min(decimals, 3) : 0,
        maximumFractionDigits: Math.max(decimals, 3)
      });
    }
  }

  private cancelEdit(): void {
    this.cleanupInput();
    this.stopEditing(false);
  }

  private cleanupInput(): void {
    if (this.input) {
      this.input.remove();
      this.input = null;
    }
  }

  extractValue(): number {
    const dataValue = this.element.dataset.sightValue;
    if (dataValue) {
      return parseFloat(dataValue);
    }
    
    const text = this.element.textContent || '';
    // Remove currency symbols, commas, and percentage signs
    const cleaned = text.replace(/[$€£¥,%]/g, '').replace(/,/g, '');
    const value = parseFloat(cleaned);
    
    return isNaN(value) ? 0 : value;
  }

  applyValue(value: any): void {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (!isNaN(numValue)) {
      this.element.textContent = this.formatNumber(numValue);
      this.element.dataset.sightValue = numValue.toString();
    }
  }

  validate(): boolean | string {
    const value = this.extractValue();
    const schema = this.options.schema;
    
    if (schema?.required && (value === null || value === undefined)) {
      return 'This field is required';
    }
    
    if (schema?.min !== undefined && value < schema.min) {
      return `Minimum value is ${schema.min}`;
    }
    
    if (schema?.max !== undefined && value > schema.max) {
      return `Maximum value is ${schema.max}`;
    }
    
    return super.validate();
  }

  destroy(): void {
    this.cleanupInput();
    this.element.style.cursor = '';
    this.element.style.backgroundColor = '';
    this.element.style.borderRadius = '';
    super.destroy();
  }
}