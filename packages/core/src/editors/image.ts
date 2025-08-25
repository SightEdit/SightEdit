import { BaseEditor } from './base';
import { EditorConfig } from '../types';
import { createElement } from '../utils/dom';

export class ImageEditor extends BaseEditor {
  private modal?: HTMLElement;

  render(): void {
    this.injectStyles();
    this.setupClickHandler();
  }

  extractValue(): string {
    if (this.element.tagName === 'IMG') {
      return (this.element as HTMLImageElement).src;
    }
    const bgImage = this.element.style.backgroundImage;
    if (!bgImage || bgImage === 'none') return '';
    
    // Handle various URL formats: url("..."), url('...'), url(...)
    const match = bgImage.match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : '';
  }

  applyValue(value: string): void {
    if (this.element.tagName === 'IMG') {
      (this.element as HTMLImageElement).src = value;
    } else {
      this.element.style.backgroundImage = `url('${value}')`;
    }
  }

  private setupClickHandler(): void {
    this.element.addEventListener('click', () => {
      this.openEditor();
    });
  }

  private openEditor(): void {
    this.startEditing();
    this.createModal();
  }

  private createModal(): void {
    // TODO: Implement full image editor modal
    // For now, just a simple URL input
    const modal = createElement('div', {
      className: 'sight-edit-modal',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: (this.config.theme?.zIndex || 9999) + 10
      }
    });

    const content = createElement('div', {
      className: 'sight-edit-modal-content',
      style: {
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: this.config.theme?.borderRadius || '4px',
        maxWidth: '500px',
        width: '90%'
      }
    });

    const input = createElement('input', {
      type: 'url',
      value: this.getValue(),
      placeholder: 'Enter image URL',
      style: {
        width: '100%',
        padding: '8px',
        marginBottom: '10px',
        border: '1px solid #ddd',
        borderRadius: this.config.theme?.borderRadius || '4px'
      }
    }) as HTMLInputElement;

    const saveBtn = createElement('button', {
      textContent: 'Save',
      style: {
        backgroundColor: this.config.theme?.primaryColor || '#007bff',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: this.config.theme?.borderRadius || '4px',
        marginRight: '10px',
        cursor: 'pointer'
      }
    });

    const cancelBtn = createElement('button', {
      textContent: 'Cancel',
      style: {
        backgroundColor: '#6c757d',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: this.config.theme?.borderRadius || '4px',
        cursor: 'pointer'
      }
    });

    saveBtn.addEventListener('click', () => {
      this.setValue(input.value);
      this.closeModal();
      this.stopEditing(true);
    });

    cancelBtn.addEventListener('click', () => {
      this.closeModal();
      this.stopEditing(false);
    });

    // Add keyboard event handlers
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.setValue(input.value);
        this.closeModal();
        this.stopEditing(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeModal();
        this.stopEditing(false);
      }
    });

    content.appendChild(input);
    content.appendChild(saveBtn);
    content.appendChild(cancelBtn);
    modal.appendChild(content);
    
    this.modal = modal;
    document.body.appendChild(modal);
    input.focus();
  }

  private closeModal(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = undefined;
    }
  }

  destroy(): void {
    this.closeModal();
    super.destroy();
  }
}