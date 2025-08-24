import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { createElement, setStyles } from '../utils/dom';

export class LinkEditor extends BaseEditor {
  private modal: HTMLElement | null = null;
  private urlInput: HTMLInputElement | null = null;
  private textInput: HTMLInputElement | null = null;
  private targetCheckbox: HTMLInputElement | null = null;

  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.style.textDecoration = 'underline';
    this.element.style.textDecorationStyle = 'dashed';
    
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
      this.showModal();
    });

    this.element.addEventListener('mouseenter', () => {
      this.element.style.opacity = '0.7';
    });

    this.element.addEventListener('mouseleave', () => {
      this.element.style.opacity = '1';
    });
  }

  private showModal(): void {
    const href = this.element.getAttribute('href') || '';
    const text = this.element.textContent || '';
    const target = this.element.getAttribute('target') === '_blank';

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
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
      }
    });

    const title = createElement('h3', {
      style: {
        margin: '0 0 16px 0',
        fontSize: '18px',
        fontWeight: '600'
      }
    }, ['Edit Link']);

    const form = createElement('form', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }
    });

    const urlGroup = this.createFormGroup('URL', 'url', href, 'https://example.com');
    const textGroup = this.createFormGroup('Text', 'text', text, 'Link text');
    
    const targetGroup = createElement('label', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer'
      }
    });

    this.targetCheckbox = createElement('input', {
      type: 'checkbox',
      checked: target
    }) as HTMLInputElement;

    targetGroup.appendChild(this.targetCheckbox);
    targetGroup.appendChild(document.createTextNode('Open in new tab'));

    const buttons = createElement('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
        marginTop: '8px'
      }
    });

    const cancelButton = createElement('button', {
      type: 'button',
      style: {
        padding: '8px 16px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: 'white',
        cursor: 'pointer'
      }
    }, ['Cancel']);

    const saveButton = createElement('button', {
      type: 'submit',
      style: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: this.options.theme?.primaryColor || '#007bff',
        color: 'white',
        cursor: 'pointer'
      }
    }, ['Save']);

    cancelButton.addEventListener('click', () => this.closeModal());
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveLink();
    });

    buttons.appendChild(cancelButton);
    buttons.appendChild(saveButton);

    form.appendChild(urlGroup);
    form.appendChild(textGroup);
    form.appendChild(targetGroup);
    form.appendChild(buttons);

    modalContent.appendChild(title);
    modalContent.appendChild(form);
    this.modal.appendChild(modalContent);
    document.body.appendChild(this.modal);

    this.urlInput?.focus();

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  private createFormGroup(label: string, name: string, value: string, placeholder: string): HTMLElement {
    const group = createElement('div');
    
    const labelEl = createElement('label', {
      style: {
        display: 'block',
        marginBottom: '4px',
        fontSize: '14px',
        fontWeight: '500'
      }
    }, [label]);

    const input = createElement('input', {
      type: name === 'url' ? 'url' : 'text',
      name,
      value,
      placeholder,
      style: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '14px'
      }
    }) as HTMLInputElement;

    if (name === 'url') {
      this.urlInput = input;
    } else if (name === 'text') {
      this.textInput = input;
    }

    group.appendChild(labelEl);
    group.appendChild(input);

    return group;
  }

  private async saveLink(): Promise<void> {
    if (!this.urlInput || !this.textInput || !this.targetCheckbox) return;

    const url = this.urlInput.value.trim();
    const text = this.textInput.value.trim();
    const target = this.targetCheckbox.checked;

    if (!url || !text) return;

    const value = {
      href: url,
      text,
      target: target ? '_blank' : '_self'
    };

    this.element.setAttribute('href', url);
    this.element.textContent = text;
    if (target) {
      this.element.setAttribute('target', '_blank');
    } else {
      this.element.removeAttribute('target');
    }

    if (this.onSave) {
      await this.onSave(value);
    }

    this.closeModal();
  }

  private closeModal(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.urlInput = null;
      this.textInput = null;
      this.targetCheckbox = null;
    }
  }

  extractValue(): any {
    return {
      href: this.element.getAttribute('href') || '',
      text: this.element.textContent || '',
      target: this.element.getAttribute('target') || '_self'
    };
  }

  applyValue(value: any): void {
    if (value.href) {
      this.element.setAttribute('href', value.href);
    }
    if (value.text) {
      this.element.textContent = value.text;
    }
    if (value.target) {
      this.element.setAttribute('target', value.target);
    }
  }

  destroy(): void {
    this.closeModal();
    this.element.style.cursor = '';
    this.element.style.textDecoration = '';
    this.element.style.textDecorationStyle = '';
    this.element.style.opacity = '';
    super.destroy();
  }
}