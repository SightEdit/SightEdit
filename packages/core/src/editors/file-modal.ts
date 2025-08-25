import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class FileModalEditor extends BaseEditor {
  private modal: ModalManager;
  private selectedFiles: File[] = [];
  private uploadedUrls: string[] = [];
  private allowMultiple: boolean = false;
  private acceptTypes: string = '*/*';
  private maxSize: number = 10 * 1024 * 1024; // 10MB default

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'file';
    
    // Parse configuration
    this.allowMultiple = element.dataset.multiple === 'true';
    this.acceptTypes = element.dataset.accept || '*/*';
    const maxSizeMB = element.dataset.maxSize ? parseFloat(element.dataset.maxSize) : 10;
    this.maxSize = maxSizeMB * 1024 * 1024;
  }

  render(): void {
    try {
      this.element.style.cursor = 'pointer';
      
      const clickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.isEditing) {
          this.startEditing();
        }
      };
      
      (this as any)._clickHandler = clickHandler;
      this.element.addEventListener('click', clickHandler);
    } catch (error) {
      console.error('Error rendering file editor:', error);
    }
  }

  protected startEditing(): void {
    super.startEditing();
    
    // Create container
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 500px;';

    // Drop zone
    const dropZone = document.createElement('div');
    dropZone.style.cssText = `
      border: 3px dashed #d1d5db;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      background: #f9fafb;
      transition: all 0.3s;
      position: relative;
    `;

    dropZone.innerHTML = `
      <div style="font-size: 64px; margin-bottom: 20px;">📁</div>
      <div style="font-size: 20px; font-weight: 600; color: #1f2937; margin-bottom: 10px;">
        Drag & drop files here
      </div>
      <div style="color: #6b7280; margin-bottom: 20px;">or</div>
      <input type="file" id="file-input" ${this.allowMultiple ? 'multiple' : ''} accept="${this.acceptTypes}" style="display: none;">
      <button onclick="document.getElementById('file-input').click()" style="
        padding: 12px 24px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
      " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
        Choose Files
      </button>
      <div style="color: #6b7280; margin-top: 15px; font-size: 14px;">
        ${this.getAcceptDescription()} • Max ${this.formatFileSize(this.maxSize)}
      </div>
    `;

    // Files preview area
    const filesPreview = document.createElement('div');
    filesPreview.style.cssText = 'margin-top: 20px;';
    
    // Upload progress
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = 'margin-top: 20px; display: none;';
    progressContainer.innerHTML = `
      <div style="margin-bottom: 10px; font-weight: 600; color: #374151;">Uploading...</div>
      <div style="background: #e5e7eb; border-radius: 8px; overflow: hidden; height: 8px;">
        <div id="upload-progress" style="background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s;"></div>
      </div>
      <div id="upload-status" style="margin-top: 10px; color: #6b7280; font-size: 14px;"></div>
    `;

    // Drag and drop handlers
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#3b82f6';
      dropZone.style.background = '#dbeafe';
    };

    dropZone.ondragleave = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#d1d5db';
      dropZone.style.background = '#f9fafb';
    };

    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#d1d5db';
      dropZone.style.background = '#f9fafb';
      
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        this.handleFiles(files, filesPreview);
      }
    };

    // File input handler
    setTimeout(() => {
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.onchange = (e) => {
          const files = Array.from((e.target as HTMLInputElement).files || []);
          this.handleFiles(files, filesPreview);
        };
      }
    }, 100);

    // Assemble container
    container.appendChild(dropZone);
    container.appendChild(filesPreview);
    container.appendChild(progressContainer);

    // Open modal
    const footer = this.modal.open(container, {
      title: '📤 File Upload',
      width: '600px',
      footer: true
    });

    // Footer buttons
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All';
    clearBtn.style.cssText = `
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-right: auto;
    `;
    clearBtn.onclick = () => {
      this.selectedFiles = [];
      this.uploadedUrls = [];
      filesPreview.innerHTML = '';
      progressContainer.style.display = 'none';
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

    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Upload & Apply';
    uploadBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    uploadBtn.onclick = async () => {
      if (this.selectedFiles.length > 0) {
        progressContainer.style.display = 'block';
        await this.uploadFiles(progressContainer);
      }
      this.stopEditing(true);
    };

    footer.appendChild(clearBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(uploadBtn);
  }

  private handleFiles(files: File[], preview: HTMLElement): void {
    // Validate files
    const validFiles = files.filter(file => {
      if (file.size > this.maxSize) {
        alert(`File ${file.name} exceeds maximum size of ${this.formatFileSize(this.maxSize)}`);
        return false;
      }
      if (this.acceptTypes !== '*/*') {
        const accepted = this.acceptTypes.split(',').some(type => {
          type = type.trim();
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.slice(0, -2));
          }
          return file.type === type || file.name.endsWith(type);
        });
        if (!accepted) {
          alert(`File ${file.name} is not an accepted type`);
          return false;
        }
      }
      return true;
    });

    if (!this.allowMultiple) {
      this.selectedFiles = validFiles.slice(0, 1);
    } else {
      this.selectedFiles = [...this.selectedFiles, ...validFiles];
    }

    this.renderPreview(preview);
  }

  private renderPreview(container: HTMLElement): void {
    container.innerHTML = '';
    
    if (this.selectedFiles.length === 0) return;

    const title = document.createElement('div');
    title.textContent = 'Selected Files:';
    title.style.cssText = 'font-weight: 600; color: #374151; margin-bottom: 10px;';
    container.appendChild(title);

    const filesList = document.createElement('div');
    filesList.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    this.selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
      `;

      // File icon
      const icon = document.createElement('div');
      icon.style.cssText = 'font-size: 24px;';
      icon.textContent = this.getFileIcon(file.type);

      // File info
      const info = document.createElement('div');
      info.style.cssText = 'flex: 1;';
      info.innerHTML = `
        <div style="font-weight: 500; color: #1f2937;">${file.name}</div>
        <div style="font-size: 12px; color: #6b7280;">${this.formatFileSize(file.size)} • ${file.type || 'Unknown type'}</div>
      `;

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '×';
      removeBtn.style.cssText = `
        width: 24px;
        height: 24px;
        border: none;
        background: #ef4444;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      `;
      removeBtn.onclick = () => {
        this.selectedFiles.splice(index, 1);
        this.renderPreview(container);
      };

      fileItem.appendChild(icon);
      fileItem.appendChild(info);
      fileItem.appendChild(removeBtn);
      filesList.appendChild(fileItem);
    });

    container.appendChild(filesList);
  }

  private async uploadFiles(progressContainer: HTMLElement): Promise<void> {
    const progressBar = progressContainer.querySelector('#upload-progress') as HTMLElement;
    const statusText = progressContainer.querySelector('#upload-status') as HTMLElement;
    
    this.uploadedUrls = [];
    const totalFiles = this.selectedFiles.length;
    
    for (let i = 0; i < totalFiles; i++) {
      const file = this.selectedFiles[i];
      statusText.textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})...`;
      
      const progress = ((i + 1) / totalFiles) * 100;
      progressBar.style.width = `${progress}%`;
      
      // Simulate upload (in real implementation, would upload to server)
      const url = await this.simulateUpload(file);
      this.uploadedUrls.push(url);
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
    }
    
    statusText.textContent = `✓ Successfully uploaded ${totalFiles} file(s)`;
    progressBar.style.background = '#10b981';
  }

  private async simulateUpload(file: File): Promise<string> {
    // In real implementation, this would upload to server
    // For now, create a data URL or simulate URL
    return new Promise((resolve, reject) => {
      try {
        // For demo, just return a simulated URL
        const timestamp = Date.now();
        const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        resolve(`/uploads/${timestamp}/${fileName}`);
      } catch (error) {
        reject(error);
      }
    });
  }

  private getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return '📦';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('presentation') || type.includes('powerpoint')) return '📽️';
    return '📎';
  }

  private getAcceptDescription(): string {
    if (this.acceptTypes === '*/*') return 'All file types';
    const types = this.acceptTypes.split(',').map(t => t.trim());
    if (types.length === 1) {
      if (types[0].endsWith('/*')) {
        return types[0].slice(0, -2).split('/')[1].toUpperCase() + ' files';
      }
      return types[0].toUpperCase();
    }
    return types.map(t => t.split('/').pop()?.toUpperCase()).join(', ');
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save && this.uploadedUrls.length > 0) {
      this.value = this.uploadedUrls.join(',');
      this.applyValue(this.value);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    // Return uploaded URLs if available, otherwise element content
    if (this.uploadedUrls && this.uploadedUrls.length > 0) {
      return this.uploadedUrls.join(',');
    }
    return this.element.dataset.fileUrls || this.element.textContent || '';
  }

  applyValue(value: string): void {
    if (!value) {
      this.element.textContent = '📎 Click to upload files';
      this.uploadedUrls = [];
      return;
    }
    
    const urls = value.split(',').filter(u => u.trim());
    this.uploadedUrls = urls;
    
    const fileNames = urls.map(url => {
      if (url.startsWith('data:')) {
        return 'Uploaded file';
      }
      if (url.startsWith('/uploads/')) {
        const parts = url.split('/');
        return parts[parts.length - 1] || 'File';
      }
      return url.split('/').pop() || 'File';
    });
    
    this.element.textContent = fileNames.length > 0 ? fileNames.join(', ') : '📎 Click to upload files';
    this.element.dataset.fileUrls = value;
  }

  destroy(): void {
    try {
      if ((this as any)._clickHandler) {
        this.element.removeEventListener('click', (this as any)._clickHandler);
        delete (this as any)._clickHandler;
      }
      
      if (this.modal) {
        this.modal.close();
      }
      
      super.destroy();
    } catch (error) {
      console.error('Error destroying file editor:', error);
    }
  }
}