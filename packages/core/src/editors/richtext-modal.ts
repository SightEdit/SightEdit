import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class RichTextModalEditor extends BaseEditor {
  private modal: ModalManager;
  private editorContent: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'richtext';
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
    
    // Create editor content
    const container = document.createElement('div');
    container.style.cssText = 'min-height: 400px;';

    // Create toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.style.cssText = `
      display: flex;
      gap: 5px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 8px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    `;

    // Toolbar buttons
    const tools = [
      { cmd: 'bold', icon: 'B', title: 'Bold' },
      { cmd: 'italic', icon: 'I', title: 'Italic' },
      { cmd: 'underline', icon: 'U', title: 'Underline' },
      { divider: true },
      { cmd: 'formatBlock', icon: 'H1', value: 'h1', title: 'Heading 1' },
      { cmd: 'formatBlock', icon: 'H2', value: 'h2', title: 'Heading 2' },
      { cmd: 'formatBlock', icon: 'H3', value: 'h3', title: 'Heading 3' },
      { cmd: 'formatBlock', icon: 'P', value: 'p', title: 'Paragraph' },
      { divider: true },
      { cmd: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
      { cmd: 'insertOrderedList', icon: '1.', title: 'Numbered List' },
      { divider: true },
      { cmd: 'justifyLeft', icon: '⬅', title: 'Align Left' },
      { cmd: 'justifyCenter', icon: '↔', title: 'Align Center' },
      { cmd: 'justifyRight', icon: '➡', title: 'Align Right' },
      { divider: true },
      { cmd: 'createLink', icon: '🔗', title: 'Insert Link' },
      { cmd: 'insertImage', icon: '🖼', title: 'Insert Image' },
      { divider: true },
      { cmd: 'removeFormat', icon: '✖', title: 'Clear Formatting' }
    ];

    tools.forEach(tool => {
      if (tool.divider) {
        const divider = document.createElement('div');
        divider.style.cssText = 'width: 1px; background: #dee2e6; margin: 0 5px;';
        this.toolbar.appendChild(divider);
      } else {
        const btn = document.createElement('button');
        btn.innerHTML = tool.icon;
        btn.title = tool.title;
        btn.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid #dee2e6;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          transition: all 0.2s;
        `;
        
        btn.onmouseover = () => {
          btn.style.background = '#007bff';
          btn.style.color = 'white';
          btn.style.borderColor = '#007bff';
        };
        
        btn.onmouseout = () => {
          btn.style.background = 'white';
          btn.style.color = 'black';
          btn.style.borderColor = '#dee2e6';
        };
        
        btn.onclick = () => {
          if (tool.cmd === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) {
              document.execCommand('createLink', false, url);
            }
          } else if (tool.cmd === 'insertImage') {
            const url = prompt('Enter image URL:');
            if (url) {
              document.execCommand('insertImage', false, url);
            }
          } else if (tool.cmd === 'formatBlock') {
            document.execCommand(tool.cmd, false, tool.value);
          } else {
            document.execCommand(tool.cmd, false, undefined);
          }
          this.editorContent?.focus();
        };
        
        this.toolbar.appendChild(btn);
      }
    });

    // Create editor area
    this.editorContent = document.createElement('div');
    this.editorContent.contentEditable = 'true';
    this.editorContent.innerHTML = this.element.innerHTML;
    this.editorContent.style.cssText = `
      min-height: 300px;
      padding: 15px;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      background: white;
      outline: none;
      font-size: 16px;
      line-height: 1.6;
    `;

    container.appendChild(this.toolbar);
    container.appendChild(this.editorContent);

    // Open modal
    const footer = this.modal.open(container, {
      title: '✨ Rich Text Editor',
      width: '800px',
      footer: true
    });

    // Add footer buttons
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
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

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    // Focus editor
    this.editorContent.focus();
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save && this.editorContent) {
      this.value = this.editorContent.innerHTML;
      this.element.innerHTML = this.value;
    }
    
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    return this.element.innerHTML;
  }

  applyValue(value: string): void {
    this.element.innerHTML = value;
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}