import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement } from '../utils/dom';
import { HTMLSanitizer } from '../utils/sanitizer';

// Dynamic import for Quill to support SSR
let Quill: any = null;

/**
 * Rich Text Editor with Quill.js integration
 * Provides full WYSIWYG editing capabilities with formatting, media, and collaboration support
 */
export class RichTextEditor extends BaseEditor {
  private container: HTMLElement | null = null;
  private quillInstance: any = null;
  private toolbar: HTMLElement | null = null;
  private isInitialized = false;
  private placeholder: string;
  private readonly: boolean = false;
  private autosaveTimer: NodeJS.Timeout | null = null;
  private lastSavedContent: string = '';
  private collaborators: Map<string, any> = new Map();

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
    this.placeholder = element.dataset?.sightPlaceholder || 'Start typing...';
    this.readonly = element.dataset?.sightReadonly === 'true';
    this.value = this.extractValue();
  }

  async render(): Promise<void> {
    // Load Quill dynamically if not already loaded
    if (!Quill && typeof window !== 'undefined') {
      try {
        Quill = (await import('quill')).default;
      } catch (error) {
        console.error('Failed to load Quill:', error);
        // Fallback to contenteditable
        this.renderFallback();
        return;
      }
    }

    if (!Quill) {
      // SSR or Quill not available, use fallback
      this.renderFallback();
      return;
    }

    this.setupEditor();
  }

  private setupEditor(): void {
    // Hide original element
    this.element.style.display = 'none';
    
    // Create container structure
    this.container = createElement('div', {
      class: 'sightedit-richtext-container',
      'data-sight': this.element.dataset.sight || ''
    });

    // Create toolbar
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);

    // Create editor container
    const editorContainer = createElement('div', {
      class: 'sightedit-richtext-editor'
    });
    this.container.appendChild(editorContainer);

    // Insert container after original element
    this.element.parentNode?.insertBefore(this.container, this.element.nextSibling);

    // Initialize Quill
    this.initializeQuill(editorContainer);

    // Add styles
    this.injectStyles();

    // Setup event handlers
    this.setupEventHandlers();

    // Setup auto-save if enabled
    if (this.options?.autoSave) {
      this.setupAutoSave();
    }

    // Mark as initialized
    this.isInitialized = true;
  }

  private createToolbar(): HTMLElement {
    const toolbar = createElement('div', {
      class: 'sightedit-richtext-toolbar',
      id: `toolbar-${Date.now()}`
    });

    toolbar.innerHTML = `
      <div class="ql-toolbar">
        <!-- Text formatting -->
        <span class="ql-formats">
          <select class="ql-font">
            <option selected>Sans Serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
          </select>
          <select class="ql-size">
            <option value="small">Small</option>
            <option selected>Normal</option>
            <option value="large">Large</option>
            <option value="huge">Huge</option>
          </select>
        </span>
        
        <!-- Basic formatting -->
        <span class="ql-formats">
          <button class="ql-bold" title="Bold"></button>
          <button class="ql-italic" title="Italic"></button>
          <button class="ql-underline" title="Underline"></button>
          <button class="ql-strike" title="Strike"></button>
        </span>
        
        <!-- Color -->
        <span class="ql-formats">
          <select class="ql-color" title="Text Color"></select>
          <select class="ql-background" title="Background Color"></select>
        </span>
        
        <!-- Lists -->
        <span class="ql-formats">
          <button class="ql-list" value="ordered" title="Ordered List"></button>
          <button class="ql-list" value="bullet" title="Bullet List"></button>
          <button class="ql-indent" value="-1" title="Decrease Indent"></button>
          <button class="ql-indent" value="+1" title="Increase Indent"></button>
        </span>
        
        <!-- Alignment -->
        <span class="ql-formats">
          <select class="ql-align">
            <option selected></option>
            <option value="center"></option>
            <option value="right"></option>
            <option value="justify"></option>
          </select>
        </span>
        
        <!-- Media -->
        <span class="ql-formats">
          <button class="ql-link" title="Link"></button>
          <button class="ql-image" title="Image"></button>
          <button class="ql-video" title="Video"></button>
          <button class="ql-code-block" title="Code Block"></button>
        </span>
        
        <!-- Clear formatting -->
        <span class="ql-formats">
          <button class="ql-clean" title="Clear Formatting"></button>
        </span>
        
        <!-- Custom buttons -->
        <span class="ql-formats">
          <button class="ql-save" title="Save">💾</button>
          <button class="ql-fullscreen" title="Fullscreen">⛶</button>
        </span>
      </div>
    `;

    return toolbar;
  }

  private initializeQuill(container: HTMLElement): void {
    // Configure Quill modules
    const modules = {
      toolbar: {
        container: `#${this.toolbar?.id}`,
        handlers: {
          save: () => this.save(),
          fullscreen: () => this.toggleFullscreen()
        }
      },
      history: {
        delay: 1000,
        maxStack: 500,
        userOnly: true
      },
      clipboard: {
        matchVisual: true
      },
      ...(this.options?.modules || {})
    };

    // Create Quill instance
    this.quillInstance = new Quill(container, {
      theme: 'snow',
      placeholder: this.placeholder,
      readOnly: this.readonly,
      modules,
      formats: [
        'header', 'font', 'size',
        'bold', 'italic', 'underline', 'strike',
        'color', 'background',
        'list', 'bullet', 'indent',
        'align', 'direction',
        'link', 'image', 'video',
        'code-block', 'blockquote',
        'clean'
      ]
    });

    // Set initial content
    if (this.value) {
      this.quillInstance.root.innerHTML = HTMLSanitizer.sanitize(this.value);
    }

    // Handle content changes
    this.quillInstance.on('text-change', (delta: any, oldDelta: any, source: string) => {
      if (source === 'user') {
        this.value = this.getValue();
        this.onChange();
        
        // Emit change event
        this.element.dispatchEvent(new CustomEvent('sightEditChange', {
          detail: { value: this.value, delta, source }
        }));
      }
    });

    // Handle selection changes
    this.quillInstance.on('selection-change', (range: any, oldRange: any, source: string) => {
      if (range) {
        this.element.dispatchEvent(new CustomEvent('sightEditSelection', {
          detail: { range, oldRange, source }
        }));
      }
    });
  }

  private setupEventHandlers(): void {
    // Keyboard shortcuts
    this.quillInstance?.keyboard.addBinding({
      key: 'S',
      ctrlKey: true
    }, () => {
      this.save();
      return false;
    });

    // Paste handling
    this.quillInstance?.root.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/html') || 
                  e.clipboardData?.getData('text/plain') || '';
      
      const sanitized = HTMLSanitizer.sanitize(text);
      const delta = this.quillInstance.clipboard.convert(sanitized);
      this.quillInstance.updateContents(delta, 'user');
    });

    // Image upload handling
    this.quillInstance?.getModule('toolbar').addHandler('image', () => {
      this.selectLocalImage();
    });
  }

  private selectLocalImage(): void {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert('Image size should be less than 5MB');
          return;
        }

        // Convert to base64 or upload to server
        const reader = new FileReader();
        reader.onload = (e) => {
          const range = this.quillInstance.getSelection();
          this.quillInstance.insertEmbed(range.index, 'image', e.target?.result, 'user');
        };
        reader.readAsDataURL(file);
      }
    };
  }

  private setupAutoSave(): void {
    const interval = this.options?.autoSaveInterval || 30000; // 30 seconds default
    
    this.autosaveTimer = setInterval(() => {
      const currentContent = this.getValue();
      if (currentContent !== this.lastSavedContent) {
        this.save();
        this.lastSavedContent = currentContent;
      }
    }, interval);
  }

  private toggleFullscreen(): void {
    if (!this.container) return;
    
    const isFullscreen = this.container.classList.contains('fullscreen');
    
    if (isFullscreen) {
      this.container.classList.remove('fullscreen');
      document.body.style.overflow = '';
    } else {
      this.container.classList.add('fullscreen');
      document.body.style.overflow = 'hidden';
    }
    
    // Notify Quill to recalculate positions
    this.quillInstance?.update();
  }

  private renderFallback(): void {
    // Fallback to contenteditable for environments without Quill
    this.container = createElement('div', {
      class: 'sightedit-richtext-fallback'
    });

    const editor = createElement('div', {
      contenteditable: (!this.readonly).toString(),
      class: 'sightedit-richtext-content',
      'data-placeholder': this.placeholder
    });

    editor.innerHTML = HTMLSanitizer.sanitize(this.value || '');

    // Simple toolbar for fallback mode
    const toolbar = createElement('div', {
      class: 'sightedit-richtext-simple-toolbar'
    });

    toolbar.innerHTML = `
      <button data-command="bold" title="Bold">B</button>
      <button data-command="italic" title="Italic">I</button>
      <button data-command="underline" title="Underline">U</button>
      <button data-command="insertOrderedList" title="Ordered List">1.</button>
      <button data-command="insertUnorderedList" title="Bullet List">•</button>
      <button data-command="createLink" title="Link">🔗</button>
      <button data-command="removeFormat" title="Clear">✕</button>
    `;

    toolbar.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.dataset.command) {
        e.preventDefault();
        
        if (target.dataset.command === 'createLink') {
          const url = prompt('Enter URL:');
          if (url) {
            document.execCommand('createLink', false, url);
          }
        } else {
          document.execCommand(target.dataset.command, false, '');
        }
        
        editor.focus();
      }
    });

    this.container.appendChild(toolbar);
    this.container.appendChild(editor);

    // Handle changes
    editor.addEventListener('input', () => {
      this.value = HTMLSanitizer.sanitize(editor.innerHTML);
      this.onChange();
    });

    // Handle paste
    editor.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });

    this.element.style.display = 'none';
    this.element.parentNode?.insertBefore(this.container, this.element.nextSibling);
    
    this.injectFallbackStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('sightedit-richtext-styles')) return;

    const style = document.createElement('style');
    style.id = 'sightedit-richtext-styles';
    style.textContent = `
      .sightedit-richtext-container {
        border: 1px solid #ccc;
        border-radius: 4px;
        background: white;
        margin: 10px 0;
      }
      
      .sightedit-richtext-toolbar {
        border-bottom: 1px solid #eee;
        background: #fafafa;
        padding: 8px;
      }
      
      .sightedit-richtext-editor {
        min-height: 200px;
      }
      
      .sightedit-richtext-editor .ql-editor {
        min-height: 200px;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.6;
      }
      
      .sightedit-richtext-container.fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        margin: 0;
        border-radius: 0;
      }
      
      .sightedit-richtext-container.fullscreen .sightedit-richtext-editor {
        height: calc(100vh - 60px);
      }
      
      .ql-save::after { content: '💾'; }
      .ql-fullscreen::after { content: '⛶'; }
    `;
    
    document.head.appendChild(style);
  }

  private injectFallbackStyles(): void {
    if (document.getElementById('sightedit-fallback-styles')) return;

    const style = document.createElement('style');
    style.id = 'sightedit-fallback-styles';
    style.textContent = `
      .sightedit-richtext-fallback {
        border: 1px solid #ccc;
        border-radius: 4px;
        background: white;
      }
      
      .sightedit-richtext-simple-toolbar {
        border-bottom: 1px solid #eee;
        background: #fafafa;
        padding: 8px;
        display: flex;
        gap: 4px;
      }
      
      .sightedit-richtext-simple-toolbar button {
        padding: 4px 8px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        border-radius: 3px;
        font-weight: bold;
      }
      
      .sightedit-richtext-simple-toolbar button:hover {
        background: #f0f0f0;
      }
      
      .sightedit-richtext-content {
        min-height: 200px;
        padding: 12px;
        outline: none;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.6;
      }
      
      .sightedit-richtext-content:empty:before {
        content: attr(data-placeholder);
        color: #999;
      }
    `;
    
    document.head.appendChild(style);
  }

  getValue(): any {
    if (this.quillInstance) {
      // Return both HTML and Delta format
      return {
        html: this.quillInstance.root.innerHTML,
        delta: this.quillInstance.getContents(),
        text: this.quillInstance.getText()
      };
    }
    
    // Fallback mode
    const content = this.container?.querySelector('.sightedit-richtext-content');
    if (content) {
      return {
        html: content.innerHTML,
        text: content.textContent || ''
      };
    }
    
    return this.value;
  }

  setValue(value: any): void {
    if (typeof value === 'string') {
      // HTML string
      this.value = value;
      if (this.quillInstance) {
        this.quillInstance.root.innerHTML = HTMLSanitizer.sanitize(value);
      }
    } else if (value?.html) {
      // Object with HTML
      this.value = value.html;
      if (this.quillInstance) {
        this.quillInstance.root.innerHTML = HTMLSanitizer.sanitize(value.html);
      }
    } else if (value?.delta) {
      // Quill Delta format
      if (this.quillInstance) {
        this.quillInstance.setContents(value.delta);
        this.value = this.quillInstance.root.innerHTML;
      }
    }
    
    // Update fallback
    const content = this.container?.querySelector('.sightedit-richtext-content');
    if (content && !this.quillInstance) {
      content.innerHTML = HTMLSanitizer.sanitize(this.value);
    }
  }

  extractValue(): any {
    const html = this.element.innerHTML;
    const text = this.element.textContent || '';
    
    return {
      html: html,
      text: text
    };
  }

  applyValue(value: any): void {
    this.setValue(value);
    
    // Update original element
    if (typeof value === 'string') {
      this.element.innerHTML = value;
    } else if (value?.html) {
      this.element.innerHTML = value.html;
    }
  }

  validate(): boolean | string {
    const value = this.getValue();
    const text = value?.text || value?.toString() || '';
    
    // Check required
    if (this.element.dataset.sightRequired === 'true' && !text.trim()) {
      return 'This field is required';
    }
    
    // Check min length
    const minLength = parseInt(this.element.dataset.sightMinLength || '0');
    if (minLength && text.length < minLength) {
      return `Minimum length is ${minLength} characters`;
    }
    
    // Check max length  
    const maxLength = parseInt(this.element.dataset.sightMaxLength || '0');
    if (maxLength && text.length > maxLength) {
      return `Maximum length is ${maxLength} characters`;
    }
    
    return true;
  }

  // Collaboration methods
  setCollaboratorCursor(userId: string, range: any): void {
    if (!this.quillInstance) return;
    
    // Implementation for showing other users' cursors
    // This would integrate with the collaboration system
  }

  removeCollaboratorCursor(userId: string): void {
    if (!this.quillInstance) return;
    
    // Remove collaborator cursor
  }

  // History methods
  undo(): void {
    this.quillInstance?.history.undo();
  }

  redo(): void {
    this.quillInstance?.history.redo();
  }

  clearHistory(): void {
    this.quillInstance?.history.clear();
  }

  // Export methods
  getHTML(): string {
    return this.quillInstance?.root.innerHTML || '';
  }

  getText(): string {
    return this.quillInstance?.getText() || '';
  }

  getContents(): any {
    return this.quillInstance?.getContents();
  }

  getLength(): number {
    return this.quillInstance?.getLength() || 0;
  }

  // Focus management
  focus(): void {
    this.quillInstance?.focus();
  }

  blur(): void {
    this.quillInstance?.blur();
  }

  hasFocus(): boolean {
    return this.quillInstance?.hasFocus() || false;
  }

  // Enable/disable
  enable(enabled: boolean = true): void {
    this.quillInstance?.enable(enabled);
    this.readonly = !enabled;
  }

  disable(): void {
    this.enable(false);
  }

  destroy(): void {
    // Clear auto-save timer
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    
    // Destroy Quill instance
    if (this.quillInstance) {
      this.quillInstance = null;
    }
    
    // Remove container
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    
    // Show original element
    this.element.style.display = '';
    
    // Clear collaborators
    this.collaborators.clear();
    
    super.destroy();
  }
}