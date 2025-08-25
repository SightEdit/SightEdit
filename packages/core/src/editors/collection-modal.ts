import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

interface CollectionItem {
  id: string;
  value: string;
}

export class CollectionModalEditor extends BaseEditor {
  private modal: ModalManager;
  private items: CollectionItem[] = [];
  private nextId: number = 1;

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'collection';
    
    // Parse initial items from element content
    this.parseInitialItems();
  }

  render(): void {
    try {
      this.element.style.cursor = 'pointer';
      
      // Remove any existing listeners to prevent duplicates
      const clickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.isEditing) {
          this.startEditing();
        }
      };
      
      // Store handler reference for cleanup
      (this as any)._clickHandler = clickHandler;
      this.element.addEventListener('click', clickHandler);
    } catch (error) {
      console.error('Error rendering collection editor:', error);
    }
  }

  private parseInitialItems(): void {
    try {
      const content = (this.element.textContent || '').trim();
      if (!content) {
        this.items = [];
        this.nextId = 1;
        return;
      }
      
      // Try to parse as array first
      if (content.startsWith('[') && content.endsWith(']')) {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            this.items = parsed.map((item, index) => ({
              id: `item-${index + 1}`,
              value: typeof item === 'object' ? JSON.stringify(item) : String(item)
            }));
            this.nextId = this.items.length + 1;
            return;
          }
        } catch (e) {
          console.warn('Failed to parse as JSON array:', e);
        }
      }
      
      // Parse comma-separated values
      const parts = content.split(',').map(s => s.trim()).filter(s => s);
      this.items = parts.map((value, index) => ({
        id: `item-${index + 1}`,
        value
      }));
      this.nextId = this.items.length + 1;
    } catch (error) {
      console.error('Error parsing initial items:', error);
      this.items = [];
      this.nextId = 1;
    }
  }

  protected startEditing(): void {
    super.startEditing();
    
    // Create container
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 500px;';

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      padding: 15px;
      background: #f0f9ff;
      border: 1px solid #0ea5e9;
      border-radius: 8px;
      margin-bottom: 20px;
      color: #0c4a6e;
      font-size: 14px;
    `;
    instructions.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 5px;">📚 Collection Editor</div>
      <div>Add, edit, remove, and reorder items in this collection.</div>
    `;

    // Items container
    const itemsContainer = document.createElement('div');
    itemsContainer.id = 'collection-items';
    itemsContainer.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      background: #f9fafb;
      margin-bottom: 20px;
    `;

    // Add item section
    const addSection = document.createElement('div');
    addSection.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    `;

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'Enter new item...';
    addInput.style.cssText = `
      flex: 1;
      padding: 10px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
    `;

    const addBtn = document.createElement('button');
    addBtn.textContent = '➕ Add Item';
    addBtn.style.cssText = `
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    addBtn.onmouseover = () => {
      addBtn.style.background = '#2563eb';
    };
    addBtn.onmouseout = () => {
      addBtn.style.background = '#3b82f6';
    };

    addBtn.onclick = () => {
      const value = addInput.value.trim();
      if (value) {
        this.addItem(value);
        addInput.value = '';
        this.renderItems(itemsContainer);
      }
    };

    // Enter key to add
    addInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        addBtn.click();
      }
    };

    addSection.appendChild(addInput);
    addSection.appendChild(addBtn);

    // Quick actions
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    `;

    const sortBtn = this.createActionButton('🔤 Sort A-Z', () => {
      this.items.sort((a, b) => a.value.localeCompare(b.value));
      this.renderItems(itemsContainer);
    });

    const reverseBtn = this.createActionButton('🔃 Reverse', () => {
      this.items.reverse();
      this.renderItems(itemsContainer);
    });

    const clearBtn = this.createActionButton('🗑️ Clear All', () => {
      if (confirm('Are you sure you want to remove all items?')) {
        this.items = [];
        this.renderItems(itemsContainer);
      }
    });

    actions.appendChild(sortBtn);
    actions.appendChild(reverseBtn);
    actions.appendChild(clearBtn);

    // Stats
    const stats = document.createElement('div');
    stats.id = 'collection-stats';
    stats.style.cssText = `
      padding: 10px;
      background: #f3f4f6;
      border-radius: 6px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    `;

    // Assemble container
    container.appendChild(instructions);
    container.appendChild(addSection);
    container.appendChild(actions);
    container.appendChild(itemsContainer);
    container.appendChild(stats);

    // Initial render
    this.renderItems(itemsContainer);
    this.updateStats();

    // Open modal
    const footer = this.modal.open(container, {
      title: '📚 Collection Editor',
      width: '600px',
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

    // Focus input
    setTimeout(() => addInput.focus(), 100);
  }

  private createActionButton(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding: 8px 16px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;
    btn.onmouseover = () => {
      btn.style.background = '#f3f4f6';
      btn.style.borderColor = '#9ca3af';
    };
    btn.onmouseout = () => {
      btn.style.background = 'white';
      btn.style.borderColor = '#e5e7eb';
    };
    btn.onclick = onClick;
    return btn;
  }

  private renderItems(container: HTMLElement): void {
    container.innerHTML = '';
    
    if (this.items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        padding: 40px;
        text-align: center;
        color: #9ca3af;
      `;
      empty.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
        <div>No items in collection</div>
        <div style="font-size: 12px; margin-top: 5px;">Add items using the input above</div>
      `;
      container.appendChild(empty);
      this.updateStats();
      return;
    }

    this.items.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        margin-bottom: 8px;
        transition: all 0.2s;
      `;

      // Drag handle
      const handle = document.createElement('div');
      handle.innerHTML = '⋮⋮';
      handle.style.cssText = `
        cursor: move;
        color: #9ca3af;
        font-size: 12px;
        user-select: none;
      `;
      handle.draggable = true;
      handle.ondragstart = (e) => {
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', index.toString());
        itemEl.style.opacity = '0.5';
      };
      handle.ondragend = () => {
        itemEl.style.opacity = '1';
      };

      // Item number
      const num = document.createElement('div');
      num.textContent = `${index + 1}.`;
      num.style.cssText = `
        width: 30px;
        color: #6b7280;
        font-size: 14px;
        font-weight: 600;
      `;

      // Item value (editable)
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.value = item.value;
      valueInput.style.cssText = `
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        font-size: 14px;
        background: #f9fafb;
      `;
      valueInput.onfocus = () => {
        valueInput.style.background = 'white';
        valueInput.style.borderColor = '#3b82f6';
      };
      valueInput.onblur = () => {
        valueInput.style.background = '#f9fafb';
        valueInput.style.borderColor = '#e5e7eb';
        item.value = valueInput.value;
      };
      valueInput.oninput = () => {
        item.value = valueInput.value;
      };

      // Actions
      const actions = document.createElement('div');
      actions.style.cssText = 'display: flex; gap: 5px;';

      // Move up
      if (index > 0) {
        const upBtn = this.createItemButton('↑', () => {
          [this.items[index], this.items[index - 1]] = [this.items[index - 1], this.items[index]];
          this.renderItems(container);
        });
        actions.appendChild(upBtn);
      }

      // Move down
      if (index < this.items.length - 1) {
        const downBtn = this.createItemButton('↓', () => {
          [this.items[index], this.items[index + 1]] = [this.items[index + 1], this.items[index]];
          this.renderItems(container);
        });
        actions.appendChild(downBtn);
      }

      // Delete
      const deleteBtn = this.createItemButton('×', () => {
        this.items.splice(index, 1);
        this.renderItems(container);
      }, '#ef4444');
      actions.appendChild(deleteBtn);

      // Drag over handlers
      itemEl.ondragover = (e) => {
        e.preventDefault();
        itemEl.style.background = '#dbeafe';
      };
      itemEl.ondragleave = () => {
        itemEl.style.background = 'white';
      };
      itemEl.ondrop = (e) => {
        e.preventDefault();
        itemEl.style.background = 'white';
        
        const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'));
        if (fromIndex !== index) {
          const movedItem = this.items[fromIndex];
          this.items.splice(fromIndex, 1);
          this.items.splice(index, 0, movedItem);
          this.renderItems(container);
        }
      };

      itemEl.appendChild(handle);
      itemEl.appendChild(num);
      itemEl.appendChild(valueInput);
      itemEl.appendChild(actions);
      container.appendChild(itemEl);
    });

    this.updateStats();
  }

  private createItemButton(label: string, onClick: () => void, color: string = '#6b7280'): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      background: ${color};
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      transition: all 0.2s;
    `;
    btn.onmouseover = () => {
      btn.style.transform = 'scale(1.1)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'scale(1)';
    };
    btn.onclick = onClick;
    return btn;
  }

  private addItem(value: string): void {
    this.items.push({
      id: `item-${this.nextId++}`,
      value
    });
  }

  private updateStats(): void {
    const stats = document.getElementById('collection-stats');
    if (stats) {
      const count = this.items.length;
      const chars = this.items.reduce((sum, item) => sum + item.value.length, 0);
      stats.innerHTML = `
        <strong>${count}</strong> item${count !== 1 ? 's' : ''} • 
        <strong>${chars}</strong> total characters
      `;
    }
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      // Convert items to comma-separated string for display
      this.value = this.items.map(item => item.value).join(', ');
      this.applyValue(this.value);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    // Return current items as comma-separated string
    if (this.items && this.items.length > 0) {
      return this.items.map(item => item.value).join(', ');
    }
    return this.element.textContent || '';
  }

  applyValue(value: string): void {
    // Apply the value back to the element
    if (value) {
      this.element.textContent = value;
      // Also parse it back to items for consistency
      this.parseInitialItems();
    } else {
      this.element.textContent = '';
      this.items = [];
    }
  }

  destroy(): void {
    try {
      // Remove click handler if exists
      if ((this as any)._clickHandler) {
        this.element.removeEventListener('click', (this as any)._clickHandler);
        delete (this as any)._clickHandler;
      }
      
      // Close modal if open
      if (this.modal) {
        this.modal.close();
      }
      
      super.destroy();
    } catch (error) {
      console.error('Error destroying collection editor:', error);
    }
  }
}