import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement } from '../utils/dom';

export class DateEditor extends BaseEditor {
  private input: HTMLInputElement | null = null;
  private originalElement: HTMLElement;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
    this.originalElement = element;
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.textDecoration = 'underline';
    this.element.style.textDecorationStyle = 'dotted';
    
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      this.startInlineEdit();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.opacity = '0.8';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.opacity = '1';
    });
  }

  private startInlineEdit(): void {
    if (this.input) return;
    
    const currentValue = this.extractValue();
    const rect = this.element.getBoundingClientRect();
    
    this.input = createElement('input', {
      type: 'datetime-local',
      value: this.formatForInput(currentValue),
      style: {
        position: 'absolute',
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        padding: '4px 8px',
        border: '2px solid ' + (this.options.theme?.primaryColor || '#007bff'),
        borderRadius: '4px',
        fontSize: window.getComputedStyle(this.element).fontSize,
        fontFamily: window.getComputedStyle(this.element).fontFamily,
        backgroundColor: 'white',
        zIndex: '10000'
      }
    }) as HTMLInputElement;

    document.body.appendChild(this.input);
    this.input.focus();
    this.input.select();

    this.input.addEventListener('blur', () => this.finishEdit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.finishEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdit();
      }
    });

    this.startEditing();
  }

  private formatForInput(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return new Date().toISOString().slice(0, 16);
      }
      return date.toISOString().slice(0, 16);
    } catch {
      return new Date().toISOString().slice(0, 16);
    }
  }

  private formatForDisplay(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return date.toLocaleDateString(this.options.locale || 'en-US', options);
  }

  private async finishEdit(): Promise<void> {
    if (!this.input) return;
    
    const newValue = this.input.value;
    if (newValue) {
      const date = new Date(newValue);
      const displayValue = this.formatForDisplay(date);
      this.element.textContent = displayValue;
      this.element.dataset.sightValue = date.toISOString();
      
      if (this.onSave) {
        await this.onSave({
          iso: date.toISOString(),
          display: displayValue,
          timestamp: date.getTime()
        });
      }
    }
    
    this.cleanupInput();
    this.stopEditing();
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

  extractValue(): string {
    const dataValue = this.element.dataset.sightValue;
    if (dataValue) {
      return dataValue;
    }
    
    const textContent = this.element.textContent || '';
    try {
      const date = new Date(textContent);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch {}
    
    return new Date().toISOString();
  }

  applyValue(value: any): void {
    if (typeof value === 'string') {
      const date = new Date(value);
      this.element.textContent = this.formatForDisplay(date);
      this.element.dataset.sightValue = date.toISOString();
    } else if (value && value.iso) {
      const date = new Date(value.iso);
      this.element.textContent = this.formatForDisplay(date);
      this.element.dataset.sightValue = value.iso;
    }
  }

  destroy(): void {
    this.cleanupInput();
    this.element.style.cursor = '';
    this.element.style.textDecoration = '';
    this.element.style.textDecorationStyle = '';
    this.element.style.opacity = '';
    super.destroy();
  }
}