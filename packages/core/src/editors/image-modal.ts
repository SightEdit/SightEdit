import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class ImageModalEditor extends BaseEditor {
  private modal: ModalManager;
  private currentSrc: string = '';

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'image';
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
    
    const img = this.element.tagName === 'IMG' ? this.element as HTMLImageElement : this.element.querySelector('img');
    this.currentSrc = img?.src || '';

    // Create editor content
    const container = document.createElement('div');

    // Tab buttons
    const tabs = document.createElement('div');
    tabs.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    `;

    const urlTab = this.createTab('URL', true);
    const uploadTab = this.createTab('Upload', false);
    const libraryTab = this.createTab('Library', false);
    
    tabs.appendChild(urlTab);
    tabs.appendChild(uploadTab);
    tabs.appendChild(libraryTab);

    // Tab contents
    const tabContents = document.createElement('div');
    
    // URL Tab Content
    const urlContent = document.createElement('div');
    urlContent.id = 'url-tab';
    urlContent.innerHTML = `
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Image URL</label>
        <input type="url" id="image-url" value="${this.currentSrc}" placeholder="https://example.com/image.jpg"
          style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Alt Text</label>
        <input type="text" id="image-alt" value="${img?.alt || ''}" placeholder="Describe the image"
          style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
      </div>
    `;

    // Upload Tab Content
    const uploadContent = document.createElement('div');
    uploadContent.id = 'upload-tab';
    uploadContent.style.display = 'none';
    uploadContent.innerHTML = `
      <div style="border: 2px dashed #d1d5db; border-radius: 8px; padding: 40px; text-align: center; background: #f9fafb;">
        <div style="font-size: 48px; margin-bottom: 10px;">📁</div>
        <div style="font-weight: 600; margin-bottom: 10px;">Drag & drop your image here</div>
        <div style="color: #6b7280; margin-bottom: 20px;">or</div>
        <input type="file" id="file-input" accept="image/*" style="display: none;">
        <button onclick="document.getElementById('file-input').click()"
          style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          Choose File
        </button>
        <div style="color: #6b7280; margin-top: 10px; font-size: 12px;">
          Supported formats: JPG, PNG, GIF, WebP (Max 5MB)
        </div>
      </div>
    `;

    // Library Tab Content
    const libraryContent = document.createElement('div');
    libraryContent.id = 'library-tab';
    libraryContent.style.display = 'none';
    libraryContent.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;">
        ${this.getStockImages().map(img => `
          <div class="library-image" style="cursor: pointer; border: 2px solid transparent; border-radius: 8px; overflow: hidden; transition: all 0.2s;"
               onmouseover="this.style.borderColor='#3b82f6'; this.style.transform='scale(1.05)'"
               onmouseout="this.style.borderColor='transparent'; this.style.transform='scale(1)'"
               onclick="document.getElementById('image-url').value='${img}'; updatePreview();">
            <img src="${img}" style="width: 100%; height: 100px; object-fit: cover;">
          </div>
        `).join('')}
      </div>
    `;

    // Image preview
    const previewContainer = document.createElement('div');
    previewContainer.innerHTML = `
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Preview</label>
        <div style="border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; background: #f9fafb; text-align: center;">
          <img id="preview-image" src="${this.currentSrc}" 
               style="max-width: 100%; max-height: 300px; border-radius: 4px;"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\' viewBox=\\'0 0 200 200\\'%3E%3Crect width=\\'200\\' height=\\'200\\' fill=\\'%23f3f4f6\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%236b7280\\' font-family=\\'sans-serif\\' font-size=\\'14\\'%3ENo Preview%3C/text%3E%3C/svg%3E'">
        </div>
      </div>
    `;

    // Assemble container
    container.appendChild(tabs);
    tabContents.appendChild(urlContent);
    tabContents.appendChild(uploadContent);
    tabContents.appendChild(libraryContent);
    container.appendChild(tabContents);
    container.appendChild(previewContainer);

    // Tab switching logic
    const tabButtons = [urlTab, uploadTab, libraryTab];
    const tabPanels = [urlContent, uploadContent, libraryContent];
    
    tabButtons.forEach((btn, index) => {
      btn.onclick = () => {
        tabButtons.forEach(b => {
          b.style.borderBottom = '2px solid transparent';
          b.style.color = '#6b7280';
        });
        tabPanels.forEach(p => p.style.display = 'none');
        
        btn.style.borderBottom = '2px solid #3b82f6';
        btn.style.color = '#3b82f6';
        tabPanels[index].style.display = 'block';
      };
    });

    // Update preview function
    const updatePreview = () => {
      const urlInput = document.getElementById('image-url') as HTMLInputElement;
      const previewImg = document.getElementById('preview-image') as HTMLImageElement;
      if (urlInput && previewImg) {
        previewImg.src = urlInput.value;
      }
    };

    // Open modal
    const footer = this.modal.open(container, {
      title: '🖼️ Image Editor',
      width: '700px',
      footer: true
    });

    // Setup URL input listener
    setTimeout(() => {
      const urlInput = document.getElementById('image-url') as HTMLInputElement;
      if (urlInput) {
        urlInput.addEventListener('input', updatePreview);
      }

      // File upload handler
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const result = e.target?.result as string;
              const urlInput = document.getElementById('image-url') as HTMLInputElement;
              const previewImg = document.getElementById('preview-image') as HTMLImageElement;
              if (urlInput) urlInput.value = result;
              if (previewImg) previewImg.src = result;
            };
            reader.readAsDataURL(file);
          }
        });
      }

      // Make updatePreview global for onclick handlers
      (window as any).updatePreview = updatePreview;
    }, 100);

    // Footer buttons
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
      const urlInput = document.getElementById('image-url') as HTMLInputElement;
      const altInput = document.getElementById('image-alt') as HTMLInputElement;
      if (urlInput) {
        this.currentSrc = urlInput.value;
        if (img) {
          img.src = this.currentSrc;
          if (altInput) img.alt = altInput.value;
        }
      }
      this.stopEditing(true);
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

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  private createTab(label: string, active: boolean): HTMLElement {
    const tab = document.createElement('button');
    tab.textContent = label;
    tab.style.cssText = `
      padding: 10px 20px;
      background: none;
      border: none;
      border-bottom: 2px solid ${active ? '#3b82f6' : 'transparent'};
      color: ${active ? '#3b82f6' : '#6b7280'};
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    return tab;
  }

  private getStockImages(): string[] {
    return [
      'https://via.placeholder.com/300x200/667eea/ffffff?text=Sample+1',
      'https://via.placeholder.com/300x200/764ba2/ffffff?text=Sample+2',
      'https://via.placeholder.com/300x200/f59e0b/ffffff?text=Sample+3',
      'https://via.placeholder.com/300x200/10b981/ffffff?text=Sample+4',
      'https://via.placeholder.com/300x200/ef4444/ffffff?text=Sample+5',
      'https://via.placeholder.com/300x200/3b82f6/ffffff?text=Sample+6'
    ];
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      this.value = this.currentSrc;
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    const img = this.element.tagName === 'IMG' ? this.element as HTMLImageElement : this.element.querySelector('img');
    return img?.src || '';
  }

  applyValue(value: string): void {
    const img = this.element.tagName === 'IMG' ? this.element as HTMLImageElement : this.element.querySelector('img');
    if (img) img.src = value;
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}