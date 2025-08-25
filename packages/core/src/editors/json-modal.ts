import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class JSONModalEditor extends BaseEditor {
  private modal: ModalManager;
  private currentValue: any = {};
  private errorMessage: string = '';

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'json';
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
    
    // Parse current value
    const currentText = this.extractValue();
    try {
      this.currentValue = currentText ? JSON.parse(currentText) : {};
      this.errorMessage = '';
    } catch (e) {
      this.currentValue = {};
      this.errorMessage = 'Invalid JSON in current content';
    }

    // Create container
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 600px;';

    // View mode toggle
    const viewToggle = document.createElement('div');
    viewToggle.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      background: #f3f4f6;
      padding: 4px;
      border-radius: 8px;
    `;

    const treeBtn = this.createViewButton('🌳 Tree View', true);
    const codeBtn = this.createViewButton('{ } Code View', false);
    
    viewToggle.appendChild(treeBtn);
    viewToggle.appendChild(codeBtn);

    // Tree view container
    const treeView = document.createElement('div');
    treeView.id = 'tree-view';
    treeView.style.cssText = `
      max-height: 500px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      background: #f9fafb;
    `;

    // Code view container
    const codeView = document.createElement('div');
    codeView.id = 'code-view';
    codeView.style.display = 'none';

    const codeEditor = document.createElement('textarea');
    codeEditor.id = 'json-code-editor';
    codeEditor.value = JSON.stringify(this.currentValue, null, 2);
    codeEditor.style.cssText = `
      width: 100%;
      height: 500px;
      padding: 15px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
      tab-size: 2;
    `;

    codeView.appendChild(codeEditor);

    // Error display
    const errorDisplay = document.createElement('div');
    errorDisplay.id = 'error-display';
    errorDisplay.style.cssText = `
      margin-top: 10px;
      padding: 10px;
      background: #fee2e2;
      color: #dc2626;
      border-radius: 6px;
      font-size: 14px;
      display: ${this.errorMessage ? 'block' : 'none'};
    `;
    errorDisplay.textContent = this.errorMessage;

    // Format toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
    `;

    const formatBtn = document.createElement('button');
    formatBtn.textContent = '✨ Format';
    formatBtn.style.cssText = this.getToolbarButtonStyle();
    formatBtn.onclick = () => {
      try {
        const parsed = JSON.parse(codeEditor.value);
        codeEditor.value = JSON.stringify(parsed, null, 2);
        this.currentValue = parsed;
        errorDisplay.style.display = 'none';
        this.renderTreeView(treeView);
      } catch (e: any) {
        errorDisplay.textContent = '❌ ' + e.message;
        errorDisplay.style.display = 'block';
      }
    };

    const minifyBtn = document.createElement('button');
    minifyBtn.textContent = '📦 Minify';
    minifyBtn.style.cssText = this.getToolbarButtonStyle();
    minifyBtn.onclick = () => {
      try {
        const parsed = JSON.parse(codeEditor.value);
        codeEditor.value = JSON.stringify(parsed);
        this.currentValue = parsed;
        errorDisplay.style.display = 'none';
      } catch (e: any) {
        errorDisplay.textContent = '❌ ' + e.message;
        errorDisplay.style.display = 'block';
      }
    };

    const validateBtn = document.createElement('button');
    validateBtn.textContent = '✓ Validate';
    validateBtn.style.cssText = this.getToolbarButtonStyle();
    validateBtn.onclick = () => {
      try {
        const parsed = JSON.parse(codeEditor.value);
        this.currentValue = parsed;
        errorDisplay.textContent = '✅ Valid JSON';
        errorDisplay.style.cssText = `
          margin-top: 10px;
          padding: 10px;
          background: #dcfce7;
          color: #16a34a;
          border-radius: 6px;
          font-size: 14px;
          display: block;
        `;
        setTimeout(() => {
          errorDisplay.style.display = 'none';
        }, 2000);
      } catch (e: any) {
        errorDisplay.textContent = '❌ ' + e.message;
        errorDisplay.style.cssText = `
          margin-top: 10px;
          padding: 10px;
          background: #fee2e2;
          color: #dc2626;
          border-radius: 6px;
          font-size: 14px;
          display: block;
        `;
      }
    };

    toolbar.appendChild(formatBtn);
    toolbar.appendChild(minifyBtn);
    toolbar.appendChild(validateBtn);

    // View switching
    treeBtn.onclick = () => {
      treeBtn.style.background = '#3b82f6';
      treeBtn.style.color = 'white';
      codeBtn.style.background = 'transparent';
      codeBtn.style.color = '#6b7280';
      treeView.style.display = 'block';
      codeView.style.display = 'none';
      
      // Sync code to tree
      try {
        this.currentValue = JSON.parse(codeEditor.value);
        this.renderTreeView(treeView);
        errorDisplay.style.display = 'none';
      } catch (e: any) {
        errorDisplay.textContent = '❌ ' + e.message;
        errorDisplay.style.display = 'block';
      }
    };

    codeBtn.onclick = () => {
      codeBtn.style.background = '#3b82f6';
      codeBtn.style.color = 'white';
      treeBtn.style.background = 'transparent';
      treeBtn.style.color = '#6b7280';
      codeView.style.display = 'block';
      treeView.style.display = 'none';
      
      // Sync tree to code
      codeEditor.value = JSON.stringify(this.currentValue, null, 2);
    };

    // Assemble container
    container.appendChild(viewToggle);
    container.appendChild(treeView);
    container.appendChild(codeView);
    container.appendChild(errorDisplay);
    container.appendChild(toolbar);

    // Initial render
    this.renderTreeView(treeView);

    // Open modal
    const footer = this.modal.open(container, {
      title: '{ } JSON Editor',
      width: '700px',
      footer: true
    });

    // Footer buttons
    const importBtn = document.createElement('button');
    importBtn.textContent = '📥 Import';
    importBtn.style.cssText = `
      padding: 10px 20px;
      background: #8b5cf6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-right: auto;
    `;
    importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const json = JSON.parse(e.target?.result as string);
              this.currentValue = json;
              codeEditor.value = JSON.stringify(json, null, 2);
              this.renderTreeView(treeView);
              errorDisplay.style.display = 'none';
            } catch (err: any) {
              errorDisplay.textContent = '❌ Invalid JSON file';
              errorDisplay.style.display = 'block';
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    };

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
    saveBtn.onclick = () => {
      // Validate before saving
      try {
        if (codeView.style.display !== 'none') {
          this.currentValue = JSON.parse(codeEditor.value);
        }
        this.stopEditing(true);
      } catch (e: any) {
        errorDisplay.textContent = '❌ Fix JSON errors before saving';
        errorDisplay.style.display = 'block';
      }
    };

    footer.appendChild(importBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  private createViewButton(label: string, active: boolean): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      background: ${active ? '#3b82f6' : 'transparent'};
      color: ${active ? 'white' : '#6b7280'};
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    return btn;
  }

  private getToolbarButtonStyle(): string {
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

  private renderTreeView(container: HTMLElement): void {
    container.innerHTML = '';
    const tree = this.createTreeNode('root', this.currentValue, true);
    container.appendChild(tree);
  }

  private createTreeNode(key: string, value: any, isRoot: boolean = false): HTMLElement {
    const node = document.createElement('div');
    node.style.cssText = isRoot ? '' : 'margin-left: 20px;';

    if (value === null) {
      node.innerHTML = `<span style="color: #6b7280;">${key}: </span><span style="color: #dc2626;">null</span>`;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      const details = document.createElement('details');
      details.open = isRoot;
      
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor: pointer; user-select: none;';
      summary.innerHTML = `<span style="color: #1e40af; font-weight: 600;">${isRoot ? '{}' : key}</span> <span style="color: #6b7280;">{${Object.keys(value).length}}</span>`;
      
      details.appendChild(summary);
      
      const content = document.createElement('div');
      content.style.cssText = 'margin-left: 20px;';
      
      Object.entries(value).forEach(([k, v]) => {
        content.appendChild(this.createTreeNode(k, v));
      });
      
      details.appendChild(content);
      node.appendChild(details);
    } else if (Array.isArray(value)) {
      const details = document.createElement('details');
      details.open = isRoot;
      
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor: pointer; user-select: none;';
      summary.innerHTML = `<span style="color: #7c3aed; font-weight: 600;">${isRoot ? '[]' : key}</span> <span style="color: #6b7280;">[${value.length}]</span>`;
      
      details.appendChild(summary);
      
      const content = document.createElement('div');
      content.style.cssText = 'margin-left: 20px;';
      
      value.forEach((v, i) => {
        content.appendChild(this.createTreeNode(`[${i}]`, v));
      });
      
      details.appendChild(content);
      node.appendChild(details);
    } else if (typeof value === 'string') {
      node.innerHTML = `<span style="color: #6b7280;">${key}: </span><span style="color: #059669;">"${value}"</span>`;
    } else if (typeof value === 'number') {
      node.innerHTML = `<span style="color: #6b7280;">${key}: </span><span style="color: #dc2626;">${value}</span>`;
    } else if (typeof value === 'boolean') {
      node.innerHTML = `<span style="color: #6b7280;">${key}: </span><span style="color: #2563eb;">${value}</span>`;
    }

    return node;
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      this.value = JSON.stringify(this.currentValue);
      this.applyValue(this.value);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    // Return the current JSON value
    if (this.currentValue) {
      return JSON.stringify(this.currentValue, null, 2);
    }
    return this.element.textContent || '{}';
  }

  applyValue(value: string): void {
    try {
      // Validate and format JSON
      const parsed = JSON.parse(value);
      this.currentValue = parsed;
      this.value = value;
      
      // Create a compact display for the element
      const displayText = this.createCompactDisplay(parsed);
      this.element.textContent = displayText;
      
      // Add visual styling for better display
      this.element.style.cssText = `
        ${this.element.style.cssText}
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 100px;
        overflow: hidden;
        position: relative;
        background: #f8f9fa;
        padding: 8px;
        border-radius: 4px;
        border-left: 3px solid #28a745;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        font-size: 12px;
        line-height: 1.4;
      `;
      
      // Add ellipsis if content is too long
      if (displayText.length > 200) {
        const truncated = displayText.substring(0, 200) + '...';
        this.element.textContent = truncated;
        
        // Add a tooltip or indicator
        this.element.setAttribute('title', 'Click to edit full JSON data');
        
        // Add visual indicator for large JSON
        const indicator = document.createElement('span');
        indicator.textContent = '📄 Large JSON';
        indicator.style.cssText = `
          position: absolute;
          top: 4px;
          right: 4px;
          background: #007bff;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: bold;
        `;
        this.element.style.position = 'relative';
        this.element.appendChild(indicator);
      }
      
    } catch (error) {
      console.warn('Invalid JSON value:', error);
      // Keep existing value if invalid
      if (!this.element.textContent) {
        this.element.textContent = '{}';
      }
    }
  }
  
  private createCompactDisplay(data: any): string {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';
    if (typeof data === 'boolean') return String(data);
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') return `"${data}"`;
    
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      if (data.length <= 3) {
        return `[${data.map(item => this.createCompactDisplay(item)).join(', ')}]`;
      }
      return `[${data.length} items]`;
    }
    
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return '{}';
      if (keys.length <= 3) {
        const pairs = keys.map(key => `"${key}": ${this.createCompactDisplay(data[key])}`);
        return `{${pairs.join(', ')}}`;
      }
      return `{${keys.length} fields: ${keys.slice(0, 3).join(', ')}...}`;
    }
    
    return JSON.stringify(data);
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}