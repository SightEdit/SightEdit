import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement } from '../utils/dom';

export class SelectEditor extends BaseEditor {
  private dropdown: HTMLElement | null = null;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.position = 'relative';
    
    // Add dropdown arrow indicator
    const arrow = createElement('span', {
      style: {
        marginLeft: '8px',
        fontSize: '0.8em',
        opacity: '0.6'
      }
    }, ['▼']);
    
    if (!this.element.querySelector('span[style*="margin-left"]')) {
      this.element.appendChild(arrow);
    }

    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      this.element.style.borderRadius = '4px';
      this.element.style.padding = '4px 8px';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.backgroundColor = '';
      if (!this.dropdown) {
        this.element.style.borderRadius = '';
        this.element.style.padding = '';
      }
    });
  }

  private toggleDropdown(): void {
    if (this.dropdown) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    const rect = this.element.getBoundingClientRect();
    const options = this.getOptions();
    
    this.dropdown = createElement('div', {
      className: 'sight-edit-dropdown',
      style: {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        minWidth: `${rect.width}px`,
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        zIndex: '10000',
        maxHeight: '200px',
        overflowY: 'auto'
      }
    });

    const currentValue = this.extractValue();

    options.forEach(option => {
      const optionEl = createElement('div', {
        style: {
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: option.value === currentValue ? '#f0f0f0' : 'white',
          borderBottom: '1px solid #eee',
          transition: 'background-color 0.2s'
        }
      }, [option.label]);

      optionEl.addEventListener('mouseenter', () => {
        optionEl.style.backgroundColor = '#f0f0f0';
      });

      optionEl.addEventListener('mouseleave', () => {
        optionEl.style.backgroundColor = option.value === currentValue ? '#f0f0f0' : 'white';
      });

      optionEl.addEventListener('click', () => {
        this.selectOption(option);
      });

      this.dropdown!.appendChild(optionEl);
    });

    // Add custom option input if no predefined options
    if (options.length === 0) {
      const customInput = createElement('input', {
        type: 'text',
        placeholder: 'Enter custom value...',
        style: {
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          borderTop: options.length > 0 ? '1px solid #ddd' : 'none',
          outline: 'none'
        }
      }) as HTMLInputElement;

      customInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const value = customInput.value.trim();
          if (value) {
            this.selectOption({ value, label: value });
          }
        } else if (e.key === 'Escape') {
          this.closeDropdown();
        }
      });

      this.dropdown.appendChild(customInput);
    }

    document.body.appendChild(this.dropdown);
    
    // Position adjustment if dropdown goes off screen
    const dropdownRect = this.dropdown.getBoundingClientRect();
    if (dropdownRect.bottom > window.innerHeight) {
      this.dropdown.style.top = `${rect.top - dropdownRect.height - 4}px`;
    }
    
    if (dropdownRect.right > window.innerWidth) {
      this.dropdown.style.left = `${window.innerWidth - dropdownRect.width - 10}px`;
    }

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
      document.addEventListener('keydown', this.handleEscape);
    }, 0);

    this.startEditing();
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.dropdown && !this.dropdown.contains(e.target as Node) && 
        !this.element.contains(e.target as Node)) {
      this.closeDropdown();
    }
  };

  private handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.closeDropdown();
    }
  };

  private getOptions(): Array<{ value: string; label: string }> {
    // First check schema options
    if (this.options.schema?.options) {
      return this.options.schema.options;
    }
    
    // Try to extract from data attribute
    const dataOptions = this.element.dataset.sightOptions;
    if (dataOptions) {
      try {
        const parsed = JSON.parse(dataOptions);
        if (Array.isArray(parsed)) {
          return parsed.map(opt => 
            typeof opt === 'string' 
              ? { value: opt, label: opt }
              : opt
          );
        }
      } catch {
        // Try comma-separated format
        return dataOptions.split(',').map(opt => ({
          value: opt.trim(),
          label: opt.trim()
        }));
      }
    }
    
    // Try to find options from nearby select element
    const select = this.element.querySelector('select') || 
                  this.element.closest('form')?.querySelector(`select[name="${this.element.dataset.sight}"]`);
    
    if (select) {
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        label: opt.textContent || opt.value
      }));
    }
    
    return [];
  }

  private async selectOption(option: { value: string; label: string }): Promise<void> {
    this.element.textContent = option.label;
    
    // Remove the arrow and re-add it
    const arrow = this.element.querySelector('span[style*="margin-left"]');
    if (arrow) {
      arrow.remove();
    }
    
    this.element.appendChild(createElement('span', {
      style: {
        marginLeft: '8px',
        fontSize: '0.8em',
        opacity: '0.6'
      }
    }, ['▼']));
    
    this.element.dataset.sightValue = option.value;
    
    if (this.onSave) {
      await this.onSave(option);
    }
    
    this.closeDropdown();
  }

  private closeDropdown(): void {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    
    document.removeEventListener('click', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleEscape);
    
    this.element.style.backgroundColor = '';
    this.element.style.borderRadius = '';
    this.element.style.padding = '';
    
    this.stopEditing();
  }

  extractValue(): string {
    return this.element.dataset.sightValue || this.element.textContent?.replace('▼', '').trim() || '';
  }

  applyValue(value: any): void {
    if (typeof value === 'object' && value.value) {
      this.element.textContent = value.label || value.value;
      this.element.dataset.sightValue = value.value;
    } else {
      this.element.textContent = value;
      this.element.dataset.sightValue = value;
    }
    
    // Re-add arrow
    const arrow = this.element.querySelector('span[style*="margin-left"]');
    if (!arrow) {
      this.element.appendChild(createElement('span', {
        style: {
          marginLeft: '8px',
          fontSize: '0.8em',
          opacity: '0.6'
        }
      }, ['▼']));
    }
  }

  destroy(): void {
    this.closeDropdown();
    const arrow = this.element.querySelector('span[style*="margin-left"]');
    if (arrow) {
      arrow.remove();
    }
    this.element.style.cursor = '';
    this.element.style.position = '';
    this.element.style.backgroundColor = '';
    this.element.style.borderRadius = '';
    this.element.style.padding = '';
    super.destroy();
  }
}