import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class SelectModalEditor extends BaseEditor {
  private modal: ModalManager;
  private selectOptions: Array<{value: string, label: string}> = [];
  private selectedValue: string = '';
  private allowMultiple: boolean = false;
  private selectedValues: Set<string> = new Set();

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'select';
    
    // Parse options from data attributes or config
    const optionsStr = element.dataset.sightOptions || element.dataset.options || '';
    if (optionsStr) {
      this.selectOptions = optionsStr.split(',').map(opt => {
        const trimmed = opt.trim();
        const [value, label] = trimmed.includes(':') ? trimmed.split(':') : [trimmed, trimmed];
        return { value: value.trim(), label: label.trim() };
      });
    }
    
    this.allowMultiple = element.dataset.multiple === 'true';
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.addEventListener('click', () => {
      if (!this.isEditing) {
        this.startEditing();
      }
    });
  }

  protected startEditing(): void {
    super.startEditing();
    
    // Get current value(s)
    const currentValue = this.extractValue();
    if (this.allowMultiple) {
      this.selectedValues = new Set(currentValue.split(',').map(v => v.trim()).filter(v => v));
    } else {
      this.selectedValue = currentValue;
    }

    // Create container
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 400px;';

    // Search input
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = 'margin-bottom: 20px;';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search options...';
    searchInput.style.cssText = `
      width: 100%;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    `;
    searchInput.onfocus = () => {
      searchInput.style.borderColor = '#3b82f6';
    };
    searchInput.onblur = () => {
      searchInput.style.borderColor = '#e5e7eb';
    };

    searchContainer.appendChild(searchInput);

    // Selected display (for multiple)
    const selectedDisplay = document.createElement('div');
    if (this.allowMultiple) {
      selectedDisplay.style.cssText = `
        margin-bottom: 20px;
        padding: 12px;
        background: #f9fafb;
        border-radius: 8px;
        min-height: 50px;
      `;
      this.updateSelectedDisplay(selectedDisplay);
    }

    // Options list
    const optionsList = document.createElement('div');
    optionsList.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px;
    `;

    // Render options
    const renderOptions = (searchTerm: string = '') => {
      optionsList.innerHTML = '';
      
      const filteredOptions = this.selectOptions.filter(opt => 
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (filteredOptions.length === 0) {
        const noResults = document.createElement('div');
        noResults.textContent = 'No options found';
        noResults.style.cssText = 'padding: 20px; text-align: center; color: #6b7280;';
        optionsList.appendChild(noResults);
        return;
      }

      filteredOptions.forEach(option => {
        const optionEl = document.createElement('div');
        const isSelected = this.allowMultiple 
          ? this.selectedValues.has(option.value)
          : this.selectedValue === option.value;
        
        optionEl.style.cssText = `
          padding: 12px;
          margin-bottom: 4px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          background: ${isSelected ? '#dbeafe' : 'white'};
          border: 1px solid ${isSelected ? '#3b82f6' : 'transparent'};
          transition: all 0.2s;
        `;

        // Checkbox or radio icon
        const icon = document.createElement('div');
        icon.style.cssText = `
          width: 20px;
          height: 20px;
          border: 2px solid ${isSelected ? '#3b82f6' : '#d1d5db'};
          border-radius: ${this.allowMultiple ? '4px' : '50%'};
          background: ${isSelected ? '#3b82f6' : 'white'};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        `;
        
        if (isSelected) {
          icon.innerHTML = '<span style="color: white; font-size: 12px;">✓</span>';
        }

        // Option content
        const content = document.createElement('div');
        content.style.cssText = 'flex: 1;';
        
        const labelEl = document.createElement('div');
        labelEl.textContent = option.label;
        labelEl.style.cssText = 'font-weight: 500; color: #1f2937;';
        
        const valueEl = document.createElement('div');
        if (option.value !== option.label) {
          valueEl.textContent = option.value;
          valueEl.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 2px;';
        }
        
        content.appendChild(labelEl);
        if (option.value !== option.label) {
          content.appendChild(valueEl);
        }

        optionEl.appendChild(icon);
        optionEl.appendChild(content);

        // Hover effect
        optionEl.onmouseover = () => {
          if (!isSelected) {
            optionEl.style.background = '#f3f4f6';
          }
        };
        optionEl.onmouseout = () => {
          if (!isSelected) {
            optionEl.style.background = 'white';
          }
        };

        // Click handler
        optionEl.onclick = () => {
          if (this.allowMultiple) {
            if (this.selectedValues.has(option.value)) {
              this.selectedValues.delete(option.value);
            } else {
              this.selectedValues.add(option.value);
            }
            this.updateSelectedDisplay(selectedDisplay);
          } else {
            this.selectedValue = option.value;
          }
          renderOptions(searchInput.value);
        };

        optionsList.appendChild(optionEl);
      });
    };

    // Search handler
    searchInput.oninput = () => {
      renderOptions(searchInput.value);
    };

    // Quick actions for multiple select
    let quickActions: HTMLElement | null = null;
    if (this.allowMultiple) {
      quickActions = document.createElement('div');
      quickActions.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px;';
      
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = 'Select All';
      selectAllBtn.style.cssText = this.getQuickActionStyle();
      selectAllBtn.onclick = () => {
        this.selectOptions.forEach(opt => this.selectedValues.add(opt.value));
        this.updateSelectedDisplay(selectedDisplay);
        renderOptions(searchInput.value);
      };

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear All';
      clearBtn.style.cssText = this.getQuickActionStyle();
      clearBtn.onclick = () => {
        this.selectedValues.clear();
        this.updateSelectedDisplay(selectedDisplay);
        renderOptions(searchInput.value);
      };

      quickActions.appendChild(selectAllBtn);
      quickActions.appendChild(clearBtn);
    }

    // Assemble container
    container.appendChild(searchContainer);
    if (this.allowMultiple) {
      container.appendChild(selectedDisplay);
      if (quickActions) container.appendChild(quickActions);
    }
    container.appendChild(optionsList);

    // Initial render
    renderOptions();

    // Open modal
    const footer = this.modal.open(container, {
      title: this.allowMultiple ? '☑️ Multi-Select' : '📋 Select Option',
      width: '500px',
      footer: true
    });

    // Footer buttons
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: #6b7280;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.stopEditing(false);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply';
    saveBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    saveBtn.onclick = () => this.stopEditing(true);

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    // Focus search
    setTimeout(() => searchInput.focus(), 100);
  }

  private updateSelectedDisplay(display: HTMLElement): void {
    if (this.selectedValues.size === 0) {
      display.innerHTML = '<span style="color: #9ca3af;">No items selected</span>';
      return;
    }

    display.innerHTML = '';
    const tags = document.createElement('div');
    tags.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

    this.selectedValues.forEach(value => {
      const option = this.selectOptions.find(o => o.value === value);
      if (!option) return;

      const tag = document.createElement('span');
      tag.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: #3b82f6;
        color: white;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
      `;
      
      const label = document.createElement('span');
      label.textContent = option.label;
      
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '×';
      removeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        margin: 0;
        line-height: 1;
      `;
      removeBtn.onclick = () => {
        this.selectedValues.delete(value);
        this.updateSelectedDisplay(display);
      };

      tag.appendChild(label);
      tag.appendChild(removeBtn);
      tags.appendChild(tag);
    });

    display.appendChild(tags);
  }

  private getQuickActionStyle(): string {
    return `
      padding: 8px 16px;
      background: #f3f4f6;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    `;
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      if (this.allowMultiple) {
        this.value = Array.from(this.selectedValues).join(', ');
      } else {
        this.value = this.selectedValue;
      }
      this.applyValue(this.value);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    return this.element.textContent || '';
  }

  applyValue(value: string): void {
    if (this.allowMultiple) {
      const values = value.split(',').map(v => v.trim());
      const labels = values.map(v => {
        const option = this.selectOptions.find(o => o.value === v);
        return option ? option.label : v;
      });
      this.element.textContent = labels.join(', ');
    } else {
      const option = this.selectOptions.find(o => o.value === value);
      this.element.textContent = option ? option.label : value;
    }
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}