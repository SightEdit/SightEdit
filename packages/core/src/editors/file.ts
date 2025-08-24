import { BaseEditor } from './base';
import { ElementType } from '../types';

export class FileEditor extends BaseEditor {
  protected dropZone?: HTMLElement;
  protected fileInput?: HTMLInputElement;
  protected progressBar?: HTMLElement;
  protected fileList?: HTMLElement;
  protected uploadedFiles: Array<{
    url: string;
    name: string;
    size: number;
    type: string;
  }> = [];

  getType(): ElementType {
    return 'file';
  }

  async render(): Promise<void> {
    const currentValue = this.extractValue();
    
    // Parse existing files if any
    if (currentValue) {
      try {
        this.uploadedFiles = JSON.parse(currentValue);
      } catch (e) {
        this.uploadedFiles = [];
      }
    }

    // Create file upload UI
    const container = document.createElement('div');
    container.className = 'sightedit-file-editor';
    container.innerHTML = `
      <div class="file-drop-zone" style="
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px;
        text-align: center;
        background: #f9f9f9;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-bottom: 20px;
      ">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin: 0 auto 16px;">
          <path d="M7 10L12 15L17 10" stroke="#666" stroke-width="2" stroke-linecap="round"/>
          <path d="M12 15V3" stroke="#666" stroke-width="2" stroke-linecap="round"/>
          <path d="M20 21H4" stroke="#666" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p style="margin: 0 0 8px; font-size: 16px; color: #333;">
          Drop files here or <span style="color: #0066cc; text-decoration: underline;">browse</span>
        </p>
        <p style="margin: 0; font-size: 12px; color: #666;">
          Maximum file size: 10MB | Supported: Images, PDFs, Documents
        </p>
        <input type="file" multiple style="display: none;" accept="image/*,.pdf,.doc,.docx,.txt,.csv">
      </div>
      
      <div class="file-progress" style="display: none; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="file-name" style="flex: 1; font-size: 14px;"></span>
          <span class="file-percent" style="font-size: 14px; color: #666;">0%</span>
        </div>
        <div style="background: #e0e0e0; height: 4px; border-radius: 2px; overflow: hidden;">
          <div class="progress-bar" style="
            background: linear-gradient(90deg, #0066cc, #0052a3);
            height: 100%;
            width: 0%;
            transition: width 0.3s ease;
          "></div>
        </div>
      </div>
      
      <div class="uploaded-files"></div>
    `;

    // Get elements
    this.dropZone = container.querySelector('.file-drop-zone') as HTMLElement;
    this.fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    this.progressBar = container.querySelector('.file-progress') as HTMLElement;
    this.fileList = container.querySelector('.uploaded-files') as HTMLElement;

    // Render existing files
    this.renderFileList();

    // Setup event handlers
    this.setupEventHandlers();

    // Show modal with the container
    this.showModal(container, {
      title: 'Upload Files',
      width: '600px',
      onSave: async () => {
        await this.save();
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.dropZone || !this.fileInput) return;

    // Click to browse
    this.dropZone.addEventListener('click', () => {
      this.fileInput?.click();
    });

    // File input change
    this.fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.handleFiles(Array.from(target.files));
      }
    });

    // Drag and drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone!.style.borderColor = '#0066cc';
      this.dropZone!.style.background = '#f0f7ff';
    });

    this.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone!.style.borderColor = '#ccc';
      this.dropZone!.style.background = '#f9f9f9';
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZone!.style.borderColor = '#ccc';
      this.dropZone!.style.background = '#f9f9f9';

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFiles(Array.from(files));
      }
    });
  }

  private async handleFiles(files: File[]): Promise<void> {
    // Validate files
    const validFiles = files.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        this.showError(`File "${file.name}" is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Upload files
    for (const file of validFiles) {
      await this.uploadFile(file);
    }
  }

  private async uploadFile(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('files', file);

    // Show progress
    if (this.progressBar) {
      this.progressBar.style.display = 'block';
      const fileName = this.progressBar.querySelector('.file-name') as HTMLElement;
      const percent = this.progressBar.querySelector('.file-percent') as HTMLElement;
      const bar = this.progressBar.querySelector('.progress-bar') as HTMLElement;
      
      if (fileName) fileName.textContent = file.name;
      if (percent) percent.textContent = '0%';
      if (bar) bar.style.width = '0%';
    }

    try {
      // Create XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          this.updateProgress(percentComplete);
        }
      });

      // Handle completion
      const response = await new Promise<any>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        // Get endpoint from config
        const endpoint = (window as any).SightEdit?.config?.endpoint || '/api/sightedit';
        xhr.open('POST', `${endpoint}/upload`);
        xhr.send(formData);
      });

      // Process response
      if (response.success && response.files) {
        for (const uploadedFile of response.files) {
          if (uploadedFile.success) {
            this.uploadedFiles.push({
              url: uploadedFile.url,
              name: uploadedFile.originalName,
              size: uploadedFile.size,
              type: uploadedFile.mimetype
            });
          }
        }
        this.renderFileList();
      }

    } catch (error: any) {
      this.showError(`Failed to upload ${file.name}: ${error.message}`);
    } finally {
      // Hide progress
      if (this.progressBar) {
        setTimeout(() => {
          this.progressBar!.style.display = 'none';
        }, 500);
      }
    }
  }

  private updateProgress(percent: number): void {
    if (!this.progressBar) return;
    
    const percentEl = this.progressBar.querySelector('.file-percent') as HTMLElement;
    const bar = this.progressBar.querySelector('.progress-bar') as HTMLElement;
    
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
  }

  private renderFileList(): void {
    if (!this.fileList) return;

    if (this.uploadedFiles.length === 0) {
      this.fileList.innerHTML = '<p style="text-align: center; color: #666; font-size: 14px;">No files uploaded yet</p>';
      return;
    }

    this.fileList.innerHTML = `
      <h4 style="margin: 0 0 12px; font-size: 14px; color: #333;">Uploaded Files (${this.uploadedFiles.length})</h4>
      <div style="max-height: 200px; overflow-y: auto;">
        ${this.uploadedFiles.map((file, index) => `
          <div style="
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: #f5f5f5;
            border-radius: 4px;
            margin-bottom: 8px;
          ">
            ${this.getFileIcon(file.type)}
            <div style="flex: 1; margin-left: 12px;">
              <div style="font-size: 14px; color: #333;">${file.name}</div>
              <div style="font-size: 12px; color: #666;">${this.formatFileSize(file.size)}</div>
            </div>
            <button data-index="${index}" class="remove-file" style="
              background: none;
              border: none;
              color: #d32f2f;
              cursor: pointer;
              padding: 4px;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    // Add remove handlers
    this.fileList.querySelectorAll('.remove-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0');
        this.uploadedFiles.splice(index, 1);
        this.renderFileList();
      });
    });
  }

  private getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="#4caf50"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
    } else if (mimeType === 'application/pdf') {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="#f44336"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>';
    } else {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="#2196f3"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private showError(message: string): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 100000;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  extractValue(): string {
    return JSON.stringify(this.uploadedFiles);
  }

  async applyValue(value: string): Promise<void> {
    try {
      this.uploadedFiles = JSON.parse(value);
      this.element.dataset.files = value;
      
      // Update display
      if (this.uploadedFiles.length > 0) {
        this.element.innerHTML = `
          <div style="padding: 8px; background: #f5f5f5; border-radius: 4px;">
            <strong>Files:</strong> ${this.uploadedFiles.length} uploaded
          </div>
        `;
      } else {
        this.element.innerHTML = '<em style="color: #666;">No files uploaded</em>';
      }
    } catch (e) {
      console.error('Failed to apply file value:', e);
    }
  }

  validate(value: string): boolean {
    try {
      const files = JSON.parse(value);
      return Array.isArray(files);
    } catch {
      return false;
    }
  }
}