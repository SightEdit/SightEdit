/**
 * HTML Designer Editor
 * Visual editor for editing entire HTML sections
 */

import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { HTMLDesignerSchema } from '../schema/advanced-schema';
import { HTMLSanitizer } from '../utils/sanitizer';

export class HTMLDesignerEditor extends BaseEditor {
  private schema?: HTMLDesignerSchema;
  private designer?: HTMLElement;
  private originalHTML: string = '';
  private currentHTML: string = '';
  private selectedElement?: HTMLElement;
  private mode: 'visual' | 'code' | 'split' = 'visual';
  private codeEditor?: HTMLTextAreaElement;
  private visualEditor?: HTMLElement;
  private toolbar?: HTMLElement;
  private propertyPanel?: HTMLElement;
  
  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
    if (options?.schema && 'designerConfig' in options.schema) {
      this.schema = options.schema as HTMLDesignerSchema;
    }
    this.originalHTML = element.innerHTML;
    this.currentHTML = this.originalHTML;
  }
  
  render(): void {
    // Add edit button
    const editButton = document.createElement('button');
    editButton.className = 'sight-edit-html-designer-trigger';
    editButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/>
        <path d="M3 9h18M9 3v18" stroke-width="2"/>
      </svg>
      <span>Design Section</span>
    `;
    editButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #8b5cf6;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000;
      transition: all 0.2s;
    `;
    
    editButton.addEventListener('click', () => this.openDesigner());
    
    // Add hover outline to section
    this.element.addEventListener('mouseenter', () => {
      if (!this.designer) {
        this.element.style.outline = '2px dashed #8b5cf6';
        this.element.style.outlineOffset = '4px';
      }
    });
    
    this.element.addEventListener('mouseleave', () => {
      if (!this.designer) {
        this.element.style.outline = '';
      }
    });
    
    // Make element relative if not already
    const position = window.getComputedStyle(this.element).position;
    if (position === 'static') {
      this.element.style.position = 'relative';
    }
    
    this.element.appendChild(editButton);
  }
  
  private openDesigner(): void {
    const position = this.schema?.editor?.position || 'fullscreen';
    
    if (position === 'fullscreen') {
      this.createFullscreenDesigner();
    } else {
      this.createModalDesigner();
    }
  }
  
  private createFullscreenDesigner(): void {
    this.designer = document.createElement('div');
    this.designer.className = 'sight-edit-html-designer';
    this.designer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #f3f4f6;
      z-index: 10000;
      display: flex;
      flex-direction: column;
    `;
    
    // Create header
    const header = this.createDesignerHeader();
    this.designer.appendChild(header);
    
    // Create toolbar
    this.toolbar = this.createToolbar();
    this.designer.appendChild(this.toolbar);
    
    // Create main content area
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;
    
    // Left sidebar - components/templates
    const leftSidebar = this.createLeftSidebar();
    content.appendChild(leftSidebar);
    
    // Center - visual/code editor
    const center = this.createCenterArea();
    content.appendChild(center);
    
    // Right sidebar - properties
    this.propertyPanel = this.createPropertyPanel();
    content.appendChild(this.propertyPanel);
    
    this.designer.appendChild(content);
    
    // Footer with actions
    const footer = this.createDesignerFooter();
    this.designer.appendChild(footer);
    
    document.body.appendChild(this.designer);
    
    // Initialize visual editor
    this.initializeVisualEditor();
  }
  
  private createModalDesigner(): void {
    // Similar to fullscreen but in a modal
    // Implementation would be similar with different styling
  }
  
  private createDesignerHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      background: white;
      border-bottom: 1px solid #e5e7eb;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    // Title and mode switcher
    const left = document.createElement('div');
    left.style.cssText = 'display: flex; align-items: center; gap: 20px;';
    
    const title = document.createElement('h2');
    title.textContent = 'HTML Section Designer';
    title.style.cssText = `
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    `;
    left.appendChild(title);
    
    // Mode switcher
    const modeSwitcher = document.createElement('div');
    modeSwitcher.style.cssText = `
      display: flex;
      background: #f3f4f6;
      border-radius: 6px;
      padding: 2px;
    `;
    
    ['visual', 'code', 'split'].forEach(mode => {
      const btn = document.createElement('button');
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.style.cssText = `
        padding: 6px 12px;
        border: none;
        background: ${this.mode === mode ? 'white' : 'transparent'};
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      `;
      btn.addEventListener('click', () => this.switchMode(mode as any));
      modeSwitcher.appendChild(btn);
    });
    
    left.appendChild(modeSwitcher);
    header.appendChild(left);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
    `;
    closeBtn.addEventListener('click', () => this.closeDesigner());
    header.appendChild(closeBtn);
    
    return header;
  }
  
  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      background: white;
      border-bottom: 1px solid #e5e7eb;
      padding: 8px 20px;
      display: flex;
      gap: 16px;
      align-items: center;
    `;
    
    // Formatting tools
    const tools = [
      { icon: 'B', command: 'bold', title: 'Bold' },
      { icon: 'I', command: 'italic', title: 'Italic' },
      { icon: 'U', command: 'underline', title: 'Underline' },
      { separator: true },
      { icon: '≡', command: 'justifyLeft', title: 'Align Left' },
      { icon: '≡', command: 'justifyCenter', title: 'Align Center' },
      { icon: '≡', command: 'justifyRight', title: 'Align Right' },
      { separator: true },
      { icon: '•', command: 'insertUnorderedList', title: 'Bullet List' },
      { icon: '1.', command: 'insertOrderedList', title: 'Numbered List' },
      { separator: true },
      { icon: '🔗', command: 'createLink', title: 'Insert Link' },
      { icon: '🖼', command: 'insertImage', title: 'Insert Image' },
      { separator: true },
      { icon: '↶', command: 'undo', title: 'Undo' },
      { icon: '↷', command: 'redo', title: 'Redo' }
    ];
    
    tools.forEach(tool => {
      if (tool.separator) {
        const sep = document.createElement('div');
        sep.style.cssText = `
          width: 1px;
          height: 24px;
          background: #e5e7eb;
        `;
        toolbar.appendChild(sep);
      } else {
        const btn = document.createElement('button');
        btn.innerHTML = tool.icon || '?';
        btn.title = tool.title || '';
        btn.style.cssText = `
          width: 32px;
          height: 32px;
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-weight: ${tool.command === 'bold' ? 'bold' : 'normal'};
          font-style: ${tool.command === 'italic' ? 'italic' : 'normal'};
          text-decoration: ${tool.command === 'underline' ? 'underline' : 'none'};
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        btn.addEventListener('click', () => this.executeCommand(tool.command!));
        toolbar.appendChild(btn);
      }
    });
    
    return toolbar;
  }
  
  private createLeftSidebar(): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.style.cssText = `
      width: 240px;
      background: white;
      border-right: 1px solid #e5e7eb;
      overflow-y: auto;
    `;
    
    // Components section
    const componentsSection = document.createElement('div');
    componentsSection.style.cssText = 'padding: 16px;';
    
    const componentsTitle = document.createElement('h3');
    componentsTitle.textContent = 'Components';
    componentsTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin: 0 0 12px 0;
      text-transform: uppercase;
    `;
    componentsSection.appendChild(componentsTitle);
    
    // Component items
    const components = [
      { name: 'Heading', html: '<h2>New Heading</h2>' },
      { name: 'Paragraph', html: '<p>New paragraph text...</p>' },
      { name: 'Button', html: '<button class="btn">Click Me</button>' },
      { name: 'Image', html: '<img src="https://via.placeholder.com/300x200" alt="Placeholder">' },
      { name: 'Card', html: '<div class="card"><h3>Card Title</h3><p>Card content...</p></div>' },
      { name: 'Grid', html: '<div class="grid"><div>Item 1</div><div>Item 2</div><div>Item 3</div></div>' }
    ];
    
    components.forEach(comp => {
      const item = document.createElement('div');
      item.textContent = comp.name;
      item.style.cssText = `
        padding: 8px 12px;
        background: #f9fafb;
        border-radius: 4px;
        margin-bottom: 8px;
        cursor: move;
        transition: background 0.2s;
      `;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/html', comp.html);
      });
      item.addEventListener('mouseenter', () => {
        item.style.background = '#e5e7eb';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '#f9fafb';
      });
      componentsSection.appendChild(item);
    });
    
    sidebar.appendChild(componentsSection);
    
    // Templates section
    if (this.schema?.designerConfig?.templates) {
      const templatesSection = document.createElement('div');
      templatesSection.style.cssText = 'padding: 16px; border-top: 1px solid #e5e7eb;';
      
      const templatesTitle = document.createElement('h3');
      templatesTitle.textContent = 'Templates';
      templatesTitle.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: #6b7280;
        margin: 0 0 12px 0;
        text-transform: uppercase;
      `;
      templatesSection.appendChild(templatesTitle);
      
      this.schema.designerConfig.templates.forEach(template => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 8px;
          background: #f9fafb;
          border-radius: 4px;
          margin-bottom: 8px;
          cursor: pointer;
        `;
        
        if (template.thumbnail) {
          const img = document.createElement('img');
          img.src = template.thumbnail;
          img.style.cssText = 'width: 100%; border-radius: 4px;';
          item.appendChild(img);
        }
        
        const name = document.createElement('div');
        name.textContent = template.name;
        name.style.cssText = 'margin-top: 4px; font-size: 12px;';
        item.appendChild(name);
        
        item.addEventListener('click', () => this.applyTemplate(template));
        templatesSection.appendChild(item);
      });
      
      sidebar.appendChild(templatesSection);
    }
    
    return sidebar;
  }
  
  private createCenterArea(): HTMLElement {
    const center = document.createElement('div');
    center.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      background: white;
    `;
    
    // Device size selector
    const deviceBar = document.createElement('div');
    deviceBar.style.cssText = `
      padding: 12px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: center;
      gap: 12px;
    `;
    
    const devices = [
      { name: 'Desktop', width: '100%', icon: '🖥' },
      { name: 'Tablet', width: '768px', icon: '📱' },
      { name: 'Mobile', width: '375px', icon: '📱' }
    ];
    
    devices.forEach(device => {
      const btn = document.createElement('button');
      btn.innerHTML = `${device.icon} ${device.name}`;
      btn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid #e5e7eb;
        background: white;
        border-radius: 4px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.setDeviceSize(device.width));
      deviceBar.appendChild(btn);
    });
    
    center.appendChild(deviceBar);
    
    // Editor area
    const editorContainer = document.createElement('div');
    editorContainer.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 20px;
      background: #f9fafb;
    `;
    
    // Visual editor
    this.visualEditor = document.createElement('div');
    this.visualEditor.className = 'sight-edit-visual-editor';
    this.visualEditor.style.cssText = `
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      min-height: 400px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    `;
    this.visualEditor.contentEditable = 'true';
    
    // Code editor
    this.codeEditor = document.createElement('textarea');
    this.codeEditor.className = 'sight-edit-code-editor';
    this.codeEditor.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 20px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.5;
      border: none;
      background: #1e293b;
      color: #e2e8f0;
      display: none;
    `;
    
    editorContainer.appendChild(this.visualEditor);
    editorContainer.appendChild(this.codeEditor);
    
    center.appendChild(editorContainer);
    
    return center;
  }
  
  private createPropertyPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 280px;
      background: white;
      border-left: 1px solid #e5e7eb;
      overflow-y: auto;
      padding: 16px;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Properties';
    title.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin: 0 0 16px 0;
      text-transform: uppercase;
    `;
    panel.appendChild(title);
    
    // Properties will be populated based on selected element
    const propertiesContainer = document.createElement('div');
    propertiesContainer.className = 'sight-edit-properties';
    panel.appendChild(propertiesContainer);
    
    return panel;
  }
  
  private createDesignerFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      background: white;
      border-top: 1px solid #e5e7eb;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    // Status
    const status = document.createElement('div');
    status.style.cssText = 'font-size: 14px; color: #6b7280;';
    status.textContent = 'Ready';
    footer.appendChild(status);
    
    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 12px;';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => this.closeDesigner());
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Changes';
    saveBtn.style.cssText = `
      padding: 8px 20px;
      background: #8b5cf6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    `;
    saveBtn.addEventListener('click', () => this.saveChanges());
    
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    footer.appendChild(actions);
    
    return footer;
  }
  
  private initializeVisualEditor(): void {
    if (!this.visualEditor) return;
    
    // Sanitize initial content before setting
    const sanitizedContent = HTMLSanitizer.sanitize(this.currentHTML);
    this.visualEditor.innerHTML = sanitizedContent;
    
    // Make elements selectable
    this.visualEditor.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target !== this.visualEditor) {
        this.selectElement(target);
      }
    });
    
    // Handle drop
    this.visualEditor.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    this.visualEditor.addEventListener('drop', (e) => {
      e.preventDefault();
      const html = e.dataTransfer?.getData('text/html');
      if (html) {
        try {
          // Sanitize dropped content
          const sanitizedHTML = HTMLSanitizer.sanitize(html);
          const selection = window.getSelection();
          const range = selection?.getRangeAt(0);
          if (range && sanitizedHTML) {
            const fragment = document.createRange().createContextualFragment(sanitizedHTML);
            range.insertNode(fragment);
          }
        } catch (error) {
          console.error('Failed to sanitize dropped content:', error);
          // Fallback to text content
          const textContent = HTMLSanitizer.extractTextContent(html);
          if (textContent) {
            const selection = window.getSelection();
            const range = selection?.getRangeAt(0);
            if (range) {
              range.insertNode(document.createTextNode(textContent));
            }
          }
        }
      }
    });
    
    // Track changes with sanitization
    this.visualEditor.addEventListener('input', () => {
      const rawHTML = this.visualEditor!.innerHTML;
      // Real-time sanitization of user input
      try {
        this.currentHTML = HTMLSanitizer.sanitize(rawHTML);
        // Only update if content changed to avoid cursor jumping
        if (this.visualEditor!.innerHTML !== this.currentHTML) {
          this.visualEditor!.innerHTML = this.currentHTML;
        }
        if (this.mode === 'split') {
          this.codeEditor!.value = this.currentHTML;
        }
      } catch (error) {
        console.error('Real-time sanitization failed:', error);
        // Keep the original content but log the error
        this.currentHTML = rawHTML;
      }
    });
  }
  
  private selectElement(element: HTMLElement): void {
    // Remove previous selection
    if (this.selectedElement) {
      this.selectedElement.style.outline = '';
    }
    
    // Select new element
    this.selectedElement = element;
    element.style.outline = '2px solid #8b5cf6';
    
    // Update property panel
    this.updatePropertyPanel(element);
  }
  
  private updatePropertyPanel(element: HTMLElement): void {
    const container = this.propertyPanel?.querySelector('.sight-edit-properties');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Element type
    const typeField = this.createPropertyField('Element', element.tagName.toLowerCase(), 'text', true);
    container.appendChild(typeField);
    
    // Classes
    const classField = this.createPropertyField('Classes', element.className, 'text', false, (value) => {
      element.className = value;
    });
    container.appendChild(classField);
    
    // ID
    const idField = this.createPropertyField('ID', element.id, 'text', false, (value) => {
      element.id = value;
    });
    container.appendChild(idField);
    
    // Text content (if applicable)
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'DIV', 'BUTTON', 'A'].includes(element.tagName)) {
      const textField = this.createPropertyField('Text', element.textContent || '', 'textarea', false, (value) => {
        element.textContent = value;
      });
      container.appendChild(textField);
    }
    
    // Image source (if img)
    if (element.tagName === 'IMG') {
      const srcField = this.createPropertyField('Source', (element as HTMLImageElement).src, 'text', false, (value) => {
        (element as HTMLImageElement).src = value;
      });
      container.appendChild(srcField);
      
      const altField = this.createPropertyField('Alt Text', (element as HTMLImageElement).alt, 'text', false, (value) => {
        (element as HTMLImageElement).alt = value;
      });
      container.appendChild(altField);
    }
    
    // Link href (if anchor)
    if (element.tagName === 'A') {
      const hrefField = this.createPropertyField('Link', (element as HTMLAnchorElement).href, 'text', false, (value) => {
        (element as HTMLAnchorElement).href = value;
      });
      container.appendChild(hrefField);
    }
    
    // Styles section
    const stylesTitle = document.createElement('h4');
    stylesTitle.textContent = 'Styles';
    stylesTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin: 16px 0 12px 0;
    `;
    container.appendChild(stylesTitle);
    
    // Common style properties
    const styles = [
      { name: 'Color', prop: 'color', type: 'color' },
      { name: 'Background', prop: 'backgroundColor', type: 'color' },
      { name: 'Font Size', prop: 'fontSize', type: 'text' },
      { name: 'Padding', prop: 'padding', type: 'text' },
      { name: 'Margin', prop: 'margin', type: 'text' }
    ];
    
    styles.forEach(style => {
      const value = element.style[style.prop as any] || '';
      const field = this.createPropertyField(style.name, value, style.type as 'text' | 'textarea' | 'color' | 'select', false, (value) => {
        (element.style as any)[style.prop] = value;
      });
      container.appendChild(field);
    });
  }
  
  private createPropertyField(
    label: string,
    value: string,
    type: 'text' | 'textarea' | 'color' | 'select',
    readonly: boolean,
    onChange?: (value: string) => void
  ): HTMLElement {
    const field = document.createElement('div');
    field.style.cssText = 'margin-bottom: 12px;';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    `;
    field.appendChild(labelEl);
    
    let input: HTMLInputElement | HTMLTextAreaElement;
    
    if (type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = type;
    }
    
    input.value = value;
    input.readOnly = readonly;
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 14px;
      ${readonly ? 'background: #f9fafb; color: #6b7280;' : ''}
    `;
    
    if (onChange) {
      input.addEventListener('input', () => onChange(input.value));
    }
    
    field.appendChild(input);
    
    return field;
  }
  
  private switchMode(mode: 'visual' | 'code' | 'split'): void {
    this.mode = mode;
    
    if (!this.visualEditor || !this.codeEditor) return;
    
    switch (mode) {
      case 'visual':
        // Sanitize before switching to visual mode
        if (this.codeEditor.value !== this.currentHTML) {
          try {
            this.currentHTML = HTMLSanitizer.sanitize(this.codeEditor.value);
          } catch (error) {
            console.error('Failed to sanitize code editor content:', error);
            this.currentHTML = HTMLSanitizer.extractTextContent(this.codeEditor.value);
          }
        }
        this.visualEditor.style.display = 'block';
        this.codeEditor.style.display = 'none';
        this.visualEditor.innerHTML = this.currentHTML;
        break;
      
      case 'code':
        this.visualEditor.style.display = 'none';
        this.codeEditor.style.display = 'block';
        this.codeEditor.value = this.currentHTML;
        
        // Add input validation for code editor
        this.codeEditor.addEventListener('input', this.handleCodeEditorInput.bind(this));
        break;
      
      case 'split':
        this.visualEditor.style.display = 'block';
        this.codeEditor.style.display = 'block';
        this.codeEditor.value = this.currentHTML;
        this.codeEditor.addEventListener('input', this.handleCodeEditorInput.bind(this));
        break;
    }
  }

  /**
   * Handle code editor input with validation
   */
  private handleCodeEditorInput(): void {
    if (!this.codeEditor) return;
    
    const rawValue = this.codeEditor.value;
    
    // Debounce validation to avoid performance issues
    if (this.codeValidationTimeout) {
      clearTimeout(this.codeValidationTimeout);
    }
    
    this.codeValidationTimeout = setTimeout(() => {
      try {
        // Validate HTML without applying it yet
        HTMLSanitizer.sanitize(rawValue);
        // If validation passes, update visual editor in split mode
        if (this.mode === 'split' && this.visualEditor) {
          const sanitized = HTMLSanitizer.sanitize(rawValue);
          this.currentHTML = sanitized;
          this.visualEditor.innerHTML = sanitized;
        }
      } catch (error) {
        // Show validation error to user
        console.warn('HTML validation failed:', error);
        // Could show error indicator in UI
      }
    }, 500);
  }

  private codeValidationTimeout?: NodeJS.Timeout;
  
  private setDeviceSize(width: string): void {
    if (this.visualEditor) {
      this.visualEditor.style.maxWidth = width;
    }
  }
  
  private executeCommand(command: string): void {
    if (command === 'createLink') {
      const url = prompt('Enter URL:');
      if (url) {
        document.execCommand(command, false, url);
      }
    } else if (command === 'insertImage') {
      const url = prompt('Enter image URL:');
      if (url) {
        document.execCommand(command, false, url);
      }
    } else {
      document.execCommand(command, false);
    }
    
    // Update current HTML
    if (this.visualEditor) {
      this.currentHTML = this.visualEditor.innerHTML;
    }
  }
  
  private applyTemplate(template: any): void {
    if (this.visualEditor && template.html) {
      try {
        // Sanitize template HTML
        const sanitizedHTML = HTMLSanitizer.sanitize(template.html);
        this.visualEditor.innerHTML = sanitizedHTML;
        this.currentHTML = sanitizedHTML;
        
        if (template.css && typeof template.css === 'string') {
          // Sanitize and validate CSS (basic validation)
          const sanitizedCSS = this.sanitizeCSS(template.css);
          if (sanitizedCSS) {
            const style = document.createElement('style');
            style.textContent = sanitizedCSS;
            this.visualEditor.appendChild(style);
          }
        }
      } catch (error) {
        console.error('Failed to apply template:', error);
        // Fallback to error message
        this.visualEditor.innerHTML = '<p>Template could not be applied safely.</p>';
        this.currentHTML = this.visualEditor.innerHTML;
      }
    }
  }

  /**
   * Basic CSS sanitization to prevent CSS injection attacks
   */
  private sanitizeCSS(css: string): string {
    if (!css || typeof css !== 'string') {
      return '';
    }

    // Remove potentially dangerous CSS constructs
    let sanitized = css
      // Remove @import statements
      .replace(/@import[^;]+;?/gi, '')
      // Remove javascript: and data: URLs
      .replace(/\burl\s*\(\s*["']?\s*(javascript|data):[^)]*\)/gi, '')
      // Remove expression() calls (IE)
      .replace(/expression\s*\([^)]*\)/gi, '')
      // Remove behavior property (IE)
      .replace(/behavior\s*:[^;]+;?/gi, '')
      // Remove @media with javascript
      .replace(/@media[^{]*\{[^}]*javascript[^}]*\}/gi, '')
      // Remove comments that could contain malicious code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Limit length
      .substring(0, 50000);

    return sanitized.trim();
  }
  
  private async saveChanges(): Promise<void> {
    try {
      // Final sanitization before saving
      let finalHTML = this.currentHTML;
      
      // If in code mode, get content from code editor
      if (this.mode === 'code' && this.codeEditor) {
        finalHTML = this.codeEditor.value;
      }
      
      // Sanitize one final time before saving
      const sanitizedHTML = HTMLSanitizer.sanitize(finalHTML);
      
      // Update current HTML and element
      this.currentHTML = sanitizedHTML;
      this.element.innerHTML = sanitizedHTML;
      
      // Save to backend
      await this.save();
      
      // Close designer
      this.closeDesigner();
    } catch (error) {
      console.error('Failed to save changes:', error);
      // Show error to user
      alert('Failed to save changes. Please check your content and try again.');
    }
  }
  
  private closeDesigner(): void {
    if (this.designer) {
      this.designer.remove();
      this.designer = undefined;
    }
    
    // Remove outline from element
    this.element.style.outline = '';
  }
  
  extractValue(): string {
    return this.currentHTML;
  }
  
  applyValue(value: string): void {
    try {
      // Sanitize HTML to prevent XSS - use default (non-strict) mode for content editing
      const sanitizedHTML = HTMLSanitizer.sanitize(value, {
        allowedTags: [
          // Standard content tags
          'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr',
          // Lists
          'ul', 'ol', 'li',
          // Links and media
          'a', 'img', 'figure', 'figcaption',
          // Code and quotes
          'blockquote', 'code', 'pre',
          // Tables
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          // Layout elements
          'section', 'article', 'header', 'footer', 'aside', 'nav',
          // Forms (limited for designer)
          'button'
        ],
        allowedAttributes: {
          '*': ['class', 'id', 'style', 'data-*', 'title'],
          'a': ['href', 'target', 'rel'],
          'img': ['src', 'alt', 'width', 'height'],
          'th': ['scope', 'colspan', 'rowspan'],
          'td': ['colspan', 'rowspan'],
          'button': ['type', 'disabled']
        },
        allowDataAttributes: true,
        maxLength: 500000 // 500KB limit for designer content
      }, false);
      
      this.currentHTML = sanitizedHTML;
      this.element.innerHTML = sanitizedHTML;
    } catch (error) {
      console.error('Failed to sanitize HTML in designer:', error);
      // Fallback to text content only
      const textContent = HTMLSanitizer.extractTextContent(value);
      this.currentHTML = `<p>${textContent}</p>`;
      this.element.innerHTML = this.currentHTML;
    }
  }
  
  async save(): Promise<void> {
    if (this.onSave) {
      await this.onSave(this.currentHTML);
    }
  }
  
  destroy(): void {
    // Clean up timeout
    if (this.codeValidationTimeout) {
      clearTimeout(this.codeValidationTimeout);
    }
    
    this.closeDesigner();
    super.destroy();
  }
}