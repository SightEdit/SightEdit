import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement, setStyles } from '../utils/dom';

export class ColorEditor extends BaseEditor {
  private colorPicker: HTMLInputElement | null = null;
  private tooltip: HTMLElement | null = null;

  constructor(element: HTMLElement, options?: EditorOptions | string) {
    super(element, options);
    this.type = 'color'; // Set the type explicitly
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.position = 'relative';
    
    const currentColor = this.extractValue();
    this.addColorIndicator(currentColor);

    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showColorPicker();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.opacity = '0.8';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.opacity = '1';
    });
  }

  private addColorIndicator(color: string): void {
    const indicator = createElement('span', {
      style: {
        display: 'inline-block',
        width: '16px',
        height: '16px',
        backgroundColor: color,
        border: '1px solid #ddd',
        borderRadius: '2px',
        marginLeft: '8px',
        verticalAlign: 'middle'
      }
    });
    
    this.element.appendChild(indicator);
  }

  private showColorPicker(): void {
    const rect = this.element.getBoundingClientRect();
    const currentColor = this.extractValue();

    this.tooltip = createElement('div', {
      className: 'sight-edit-color-picker',
      style: {
        position: 'fixed',
        top: `${rect.bottom + 8}px`,
        left: `${rect.left}px`,
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        padding: '12px',
        zIndex: '10000'
      }
    });

    this.colorPicker = createElement('input', {
      type: 'color',
      value: currentColor,
      style: {
        width: '200px',
        height: '40px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }) as HTMLInputElement;

    const presetColors = [
      '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
      '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#800000',
      '#008000', '#000080', '#808000', '#800080', '#008080'
    ];

    const presetContainer = createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '4px',
        marginTop: '8px'
      }
    });

    presetColors.forEach(color => {
      const preset = createElement('button', {
        style: {
          width: '30px',
          height: '30px',
          backgroundColor: color,
          border: '1px solid #ddd',
          borderRadius: '2px',
          cursor: 'pointer'
        },
        title: color
      });

      preset.addEventListener('click', () => {
        this.colorPicker!.value = color;
        this.updateColor(color);
      });

      presetContainer.appendChild(preset);
    });

    const hexInput = createElement('input', {
      type: 'text',
      value: currentColor,
      placeholder: '#000000',
      style: {
        width: '100%',
        padding: '4px 8px',
        marginTop: '8px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '12px'
      }
    }) as HTMLInputElement;

    this.colorPicker.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      hexInput.value = color;
      this.updateColor(color);
    });

    hexInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        this.colorPicker!.value = color;
        this.updateColor(color);
      }
    });

    this.tooltip.appendChild(this.colorPicker);
    this.tooltip.appendChild(presetContainer);
    this.tooltip.appendChild(hexInput);
    document.body.appendChild(this.tooltip);

    document.addEventListener('click', this.handleOutsideClick);
    document.addEventListener('keydown', this.handleEscape);
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.tooltip && !this.tooltip.contains(e.target as Node) && 
        !this.element.contains(e.target as Node)) {
      this.closeColorPicker();
    }
  };

  private handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.closeColorPicker();
    }
  };

  private async updateColor(color: string): Promise<void> {
    this.element.textContent = color;
    const indicator = this.element.querySelector('span');
    if (indicator instanceof HTMLElement) {
      indicator.style.backgroundColor = color;
    }

    if (this.onSave) {
      await this.onSave(color);
    }
  }

  private closeColorPicker(): void {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
      this.colorPicker = null;
    }
    document.removeEventListener('click', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleEscape);
  }

  extractValue(): string {
    const text = this.element.textContent?.trim() || '';
    if (/^#[0-9A-F]{6}$/i.test(text)) {
      return text;
    }
    
    const computedColor = window.getComputedStyle(this.element).color;
    const rgb = computedColor.match(/\d+/g);
    if (rgb) {
      const hex = '#' + rgb.map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
      return hex.toUpperCase();
    }
    
    return '#000000';
  }

  applyValue(value: string): void {
    this.element.textContent = value;
    const indicator = this.element.querySelector('span');
    if (indicator instanceof HTMLElement) {
      indicator.style.backgroundColor = value;
    }
  }

  validate(value?: string): boolean | string {
    const colorToValidate = value !== undefined ? value : this.extractValue();
    
    // Check if it's a valid hex color
    if (!/^#[0-9A-F]{3}$/i.test(colorToValidate) && !/^#[0-9A-F]{6}$/i.test(colorToValidate)) {
      return 'Must be a valid hex color (e.g., #ff0000 or #f00)';
    }
    
    const schema = this.options.schema;
    if (schema?.required) {
      const text = this.element.textContent?.trim() || '';
      if (!text) {
        return 'This field is required';
      }
    }
    
    return super.validate();
  }

  destroy(): void {
    this.closeColorPicker();
    this.element.style.cursor = '';
    this.element.style.position = '';
    this.element.style.opacity = '';
    const indicator = this.element.querySelector('span');
    if (indicator) {
      indicator.remove();
    }
    super.destroy();
  }
}