import { BaseEditor } from './base';
import { EditorOptions, DetectedElement } from '../types';
import { createElement, setStyles } from '../utils/dom';
import { ElementDetector } from '../detector';

interface CollectionItem {
  id: string;
  element: HTMLElement;
  data: Record<string, any>;
}

export class CollectionEditor extends BaseEditor {
  private modal: HTMLElement | null = null;
  private items: CollectionItem[] = [];
  private template: HTMLElement | null = null;
  private container: HTMLElement;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
    this.container = element;
    this.analyzeCollection();
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.position = 'relative';
    
    const editButton = createElement('button', {
      className: 'sight-edit-collection-button',
      style: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        padding: '8px 16px',
        backgroundColor: this.options.theme?.primaryColor || '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        zIndex: '100'
      }
    }, ['Edit Collection']);

    this.element.appendChild(editButton);

    this.element.addEventListener('mouseenter', () => {
      editButton.style.opacity = '1';
    });

    this.element.addEventListener('mouseleave', () => {
      editButton.style.opacity = '0';
    });

    editButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showModal();
    });
  }

  private analyzeCollection(): void {
    const items = this.element.querySelectorAll('[data-sight-item]');
    
    items.forEach((item, index) => {
      if (item instanceof HTMLElement) {
        const id = item.dataset.sightItem || `item-${index}`;
        const data = this.extractItemData(item);
        
        this.items.push({
          id,
          element: item,
          data
        });
        
        if (index === 0 && !this.template) {
          this.template = item.cloneNode(true) as HTMLElement;
        }
      }
    });
  }

  private extractItemData(item: HTMLElement): Record<string, any> {
    const data: Record<string, any> = {};
    const editableElements = item.querySelectorAll('[data-sight]');
    
    editableElements.forEach(el => {
      if (el instanceof HTMLElement) {
        const sight = el.dataset.sight;
        if (sight) {
          const detected = ElementDetector.detectElement(el);
          if (detected) {
            data[sight] = this.getElementValue(el, detected.type);
          }
        }
      }
    });
    
    return data;
  }

  private getElementValue(element: HTMLElement, type: string): any {
    switch (type) {
      case 'image':
        return element.getAttribute('src') || '';
      case 'link':
        return {
          href: element.getAttribute('href') || '',
          text: element.textContent || ''
        };
      default:
        return element.textContent || '';
    }
  }

  private showModal(): void {
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
        overflow: 'hidden',
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
        marginBottom: '20px'
      }
    });

    const title = createElement('h3', {
      style: {
        margin: '0',
        fontSize: '20px',
        fontWeight: '600'
      }
    }, ['Edit Collection']);

    const addButton = createElement('button', {
      style: {
        padding: '8px 16px',
        backgroundColor: this.options.theme?.primaryColor || '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px'
      }
    }, ['+ Add Item']);

    addButton.addEventListener('click', () => this.addItem());

    header.appendChild(title);
    header.appendChild(addButton);

    const itemsList = createElement('div', {
      style: {
        flexGrow: '1',
        overflowY: 'auto',
        marginBottom: '20px',
        maxHeight: '400px'
      }
    });

    this.renderItems(itemsList);

    const footer = createElement('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
        paddingTop: '20px',
        borderTop: '1px solid #e0e0e0'
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
    }, ['Save Changes']);

    cancelButton.addEventListener('click', () => this.closeModal());
    saveButton.addEventListener('click', () => this.saveCollection());

    footer.appendChild(cancelButton);
    footer.appendChild(saveButton);

    modalContent.appendChild(header);
    modalContent.appendChild(itemsList);
    modalContent.appendChild(footer);
    this.modal.appendChild(modalContent);
    document.body.appendChild(this.modal);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  private renderItems(container: HTMLElement): void {
    container.innerHTML = '';
    
    this.items.forEach((item, index) => {
      const itemEl = createElement('div', {
        style: {
          padding: '16px',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          marginBottom: '12px',
          backgroundColor: '#f9f9f9'
        }
      });

      const itemHeader = createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }
      });

      const itemTitle = createElement('h4', {
        style: {
          margin: '0',
          fontSize: '16px',
          color: '#333'
        }
      }, [`Item ${index + 1}`]);

      const actions = createElement('div', {
        style: {
          display: 'flex',
          gap: '8px'
        }
      });

      if (index > 0) {
        const moveUpBtn = this.createActionButton('↑', () => this.moveItem(index, -1));
        actions.appendChild(moveUpBtn);
      }

      if (index < this.items.length - 1) {
        const moveDownBtn = this.createActionButton('↓', () => this.moveItem(index, 1));
        actions.appendChild(moveDownBtn);
      }

      const deleteBtn = this.createActionButton('×', () => this.removeItem(index), '#dc3545');
      actions.appendChild(deleteBtn);

      itemHeader.appendChild(itemTitle);
      itemHeader.appendChild(actions);

      const fields = createElement('div', {
        style: {
          display: 'grid',
          gap: '12px'
        }
      });

      Object.entries(item.data).forEach(([key, value]) => {
        const field = this.createField(key, value, (newValue) => {
          item.data[key] = newValue;
        });
        fields.appendChild(field);
      });

      itemEl.appendChild(itemHeader);
      itemEl.appendChild(fields);
      container.appendChild(itemEl);
    });
  }

  private createActionButton(text: string, onClick: () => void, color = '#666'): HTMLElement {
    const btn = createElement('button', {
      style: {
        width: '30px',
        height: '30px',
        border: '1px solid #ddd',
        backgroundColor: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        color,
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, [text]);

    btn.addEventListener('click', onClick);
    return btn;
  }

  private createField(name: string, value: any, onChange: (value: any) => void): HTMLElement {
    const field = createElement('div');
    
    const label = createElement('label', {
      style: {
        display: 'block',
        marginBottom: '4px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#555'
      }
    }, [name]);

    let input: HTMLElement;
    
    if (typeof value === 'object' && value.href) {
      // Link field
      const linkContainer = createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px'
        }
      });
      
      const hrefInput = createElement('input', {
        type: 'url',
        value: value.href,
        placeholder: 'URL',
        style: {
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }
      }) as HTMLInputElement;
      
      const textInput = createElement('input', {
        type: 'text',
        value: value.text,
        placeholder: 'Link text',
        style: {
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }
      }) as HTMLInputElement;
      
      hrefInput.addEventListener('input', () => {
        onChange({ href: hrefInput.value, text: textInput.value });
      });
      
      textInput.addEventListener('input', () => {
        onChange({ href: hrefInput.value, text: textInput.value });
      });
      
      linkContainer.appendChild(hrefInput);
      linkContainer.appendChild(textInput);
      input = linkContainer;
    } else if (value.startsWith('http') && (value.includes('.jpg') || value.includes('.png') || value.includes('.gif'))) {
      // Image field
      input = createElement('input', {
        type: 'url',
        value,
        placeholder: 'Image URL',
        style: {
          width: '100%',
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }
      }) as HTMLInputElement;
      
      input.addEventListener('input', (e) => {
        onChange((e.target as HTMLInputElement).value);
      });
    } else {
      // Text field
      input = createElement('input', {
        type: 'text',
        value,
        style: {
          width: '100%',
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }
      }) as HTMLInputElement;
      
      input.addEventListener('input', (e) => {
        onChange((e.target as HTMLInputElement).value);
      });
    }

    field.appendChild(label);
    field.appendChild(input);
    
    return field;
  }

  private moveItem(index: number, direction: number): void {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.items.length) return;
    
    const temp = this.items[index];
    this.items[index] = this.items[newIndex];
    this.items[newIndex] = temp;
    
    if (this.modal) {
      const itemsList = this.modal.querySelector('div[style*="overflow"]');
      if (itemsList) {
        this.renderItems(itemsList as HTMLElement);
      }
    }
  }

  private removeItem(index: number): void {
    this.items.splice(index, 1);
    
    if (this.modal) {
      const itemsList = this.modal.querySelector('div[style*="overflow"]');
      if (itemsList) {
        this.renderItems(itemsList as HTMLElement);
      }
    }
  }

  private addItem(): void {
    if (!this.template) return;
    
    const newItem: CollectionItem = {
      id: `item-${Date.now()}`,
      element: this.template.cloneNode(true) as HTMLElement,
      data: {}
    };
    
    // Extract default data from template
    const editableElements = newItem.element.querySelectorAll('[data-sight]');
    editableElements.forEach(el => {
      if (el instanceof HTMLElement) {
        const sight = el.dataset.sight;
        if (sight) {
          newItem.data[sight] = '';
        }
      }
    });
    
    this.items.push(newItem);
    
    if (this.modal) {
      const itemsList = this.modal.querySelector('div[style*="overflow"]');
      if (itemsList) {
        this.renderItems(itemsList as HTMLElement);
      }
    }
  }

  private async saveCollection(): Promise<void> {
    // Update DOM
    this.container.innerHTML = '';
    
    this.items.forEach((item, index) => {
      const newElement = item.element.cloneNode(true) as HTMLElement;
      newElement.dataset.sightItem = (index + 1).toString();
      
      // Update element values
      Object.entries(item.data).forEach(([key, value]) => {
        const el = newElement.querySelector(`[data-sight="${key}"]`);
        if (el instanceof HTMLElement) {
          if (typeof value === 'object' && value.href) {
            el.setAttribute('href', value.href);
            el.textContent = value.text;
          } else if (el.tagName === 'IMG') {
            el.setAttribute('src', value);
          } else {
            el.textContent = value;
          }
        }
      });
      
      this.container.appendChild(newElement);
    });
    
    const collectionData = this.items.map(item => item.data);
    
    if (this.onSave) {
      await this.onSave(collectionData);
    }
    
    this.closeModal();
    this.analyzeCollection(); // Re-analyze after save
  }

  private closeModal(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  extractValue(): any {
    return this.items.map(item => item.data);
  }

  applyValue(value: any[]): void {
    // This would recreate the DOM based on the value array
    // Implementation depends on having a proper template system
  }

  destroy(): void {
    this.closeModal();
    const button = this.element.querySelector('.sight-edit-collection-button');
    if (button) {
      button.remove();
    }
    super.destroy();
  }
}