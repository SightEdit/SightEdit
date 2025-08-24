import { ImageEditor } from '../../editors/image';
import { EditorConfig } from '../../types';

// Mock createElement utility
jest.mock('../../utils/dom', () => ({
  createElement: jest.fn((tag, attributes) => {
    const element = document.createElement(tag);
    Object.assign(element, attributes);
    if (attributes.style) {
      Object.assign(element.style, attributes.style);
    }
    return element;
  }),
  addClass: jest.fn(),
  removeClass: jest.fn(),
  hasClass: jest.fn()
}));

describe('ImageEditor', () => {
  let editor: ImageEditor;
  let imgElement: HTMLImageElement;
  let divElement: HTMLElement;
  let config: EditorConfig;

  beforeEach(() => {
    document.body.innerHTML = `
      <img id="test-image" src="https://example.com/test.jpg" alt="Test Image">
      <div id="test-div" style="background-image: url('https://example.com/bg.jpg')">Background</div>
    `;
    
    imgElement = document.getElementById('test-image') as HTMLImageElement;
    divElement = document.getElementById('test-div') as HTMLElement;
    
    config = {
      theme: {
        primaryColor: '#007bff',
        borderRadius: '8px',
        zIndex: 9999
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor and initialization', () => {
    it('should initialize with image element', () => {
      editor = new ImageEditor(imgElement, config);
      
      expect(editor.element).toBe(imgElement);
      expect(editor.config).toEqual(config);
    });

    it('should initialize with div element with background image', () => {
      editor = new ImageEditor(divElement, config);
      
      expect(editor.element).toBe(divElement);
    });
  });

  describe('extractValue', () => {
    it('should extract src from IMG element', () => {
      editor = new ImageEditor(imgElement, config);
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/test.jpg');
    });

    it('should extract background image URL from div element', () => {
      editor = new ImageEditor(divElement, config);
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/bg.jpg');
    });

    it('should handle div with quoted background image URL', () => {
      divElement.style.backgroundImage = 'url("https://example.com/quoted.jpg")';
      editor = new ImageEditor(divElement, config);
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/quoted.jpg');
    });

    it('should handle div with single-quoted background image URL', () => {
      divElement.style.backgroundImage = "url('https://example.com/single-quoted.jpg')";
      editor = new ImageEditor(divElement, config);
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/single-quoted.jpg');
    });

    it('should return empty string for div without background image', () => {
      divElement.style.backgroundImage = '';
      editor = new ImageEditor(divElement, config);
      
      const value = editor.extractValue();
      
      expect(value).toBe('');
    });
  });

  describe('applyValue', () => {
    it('should apply value to IMG element src', () => {
      editor = new ImageEditor(imgElement, config);
      
      editor.applyValue('https://example.com/new.jpg');
      
      expect(imgElement.src).toBe('https://example.com/new.jpg');
    });

    it('should apply value to div background image', () => {
      editor = new ImageEditor(divElement, config);
      
      editor.applyValue('https://example.com/new-bg.jpg');
      
      expect(divElement.style.backgroundImage).toBe("url('https://example.com/new-bg.jpg')");
    });
  });

  describe('render', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
      jest.spyOn(editor as any, 'injectStyles').mockImplementation();
      jest.spyOn(editor as any, 'setupClickHandler').mockImplementation();
    });

    it('should inject styles and setup click handler', () => {
      editor.render();
      
      expect(editor['injectStyles']).toHaveBeenCalled();
      expect(editor['setupClickHandler']).toHaveBeenCalled();
    });
  });

  describe('click handling', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
      editor.render();
    });

    it('should open editor on click', () => {
      const openEditorSpy = jest.spyOn(editor as any, 'openEditor');
      
      imgElement.click();
      
      expect(openEditorSpy).toHaveBeenCalled();
    });
  });

  describe('modal functionality', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
      jest.spyOn(editor as any, 'startEditing').mockImplementation();
    });

    it('should create modal on open editor', () => {
      editor['openEditor']();
      
      const modal = document.querySelector('.sight-edit-modal');
      expect(modal).toBeTruthy();
      expect(editor['modal']).toBeTruthy();
    });

    it('should create modal with correct styling', () => {
      editor['openEditor']();
      
      const modal = editor['modal'];
      expect(modal?.style.position).toBe('fixed');
      expect(modal?.style.top).toBe('0px');
      expect(modal?.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(modal?.style.zIndex).toBe('10009'); // theme.zIndex + 10
    });

    it('should create modal content with input and buttons', () => {
      editor['openEditor']();
      
      const content = document.querySelector('.sight-edit-modal-content');
      const input = content?.querySelector('input[type="url"]') as HTMLInputElement;
      const saveBtn = content?.querySelector('button') as HTMLButtonElement;
      
      expect(content).toBeTruthy();
      expect(input).toBeTruthy();
      expect(input.value).toBe('https://example.com/test.jpg');
      expect(input.placeholder).toBe('Enter image URL');
      expect(saveBtn.textContent).toBe('Save');
    });

    it('should focus input when modal opens', () => {
      const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus');
      
      editor['openEditor']();
      
      expect(focusSpy).toHaveBeenCalled();
    });

    it('should save value and close modal on save button click', async () => {
      const setValueSpy = jest.spyOn(editor, 'setValue');
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      editor['openEditor']();
      
      const input = document.querySelector('input[type="url"]') as HTMLInputElement;
      const saveBtn = document.querySelector('button') as HTMLButtonElement;
      
      input.value = 'https://example.com/new-image.jpg';
      saveBtn.click();
      
      expect(setValueSpy).toHaveBeenCalledWith('https://example.com/new-image.jpg');
      expect(stopEditingSpy).toHaveBeenCalledWith(true);
      expect(editor['modal']).toBeUndefined();
    });

    it('should cancel and close modal on cancel button click', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      editor['openEditor']();
      
      const buttons = document.querySelectorAll('button');
      const cancelBtn = Array.from(buttons).find(btn => btn.textContent === 'Cancel');
      
      cancelBtn?.click();
      
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
      expect(editor['modal']).toBeUndefined();
    });

    it('should close modal properly', () => {
      editor['openEditor']();
      const modal = editor['modal'];
      
      editor['closeModal']();
      
      expect(document.body.contains(modal!)).toBe(false);
      expect(editor['modal']).toBeUndefined();
    });

    it('should handle close modal when no modal exists', () => {
      expect(() => editor['closeModal']()).not.toThrow();
    });
  });

  describe('theme integration', () => {
    it('should use theme colors in modal styling', () => {
      const customConfig: EditorConfig = {
        theme: {
          primaryColor: '#ff6b6b',
          borderRadius: '12px',
          zIndex: 5000
        }
      };
      
      editor = new ImageEditor(imgElement, customConfig);
      editor['openEditor']();
      
      const content = document.querySelector('.sight-edit-modal-content') as HTMLElement;
      const input = content.querySelector('input') as HTMLInputElement;
      const saveBtn = content.querySelector('button') as HTMLButtonElement;
      
      expect(content.style.borderRadius).toBe('12px');
      expect(input.style.borderRadius).toBe('12px');
      expect(saveBtn.style.backgroundColor).toBe('#ff6b6b');
      expect(saveBtn.style.borderRadius).toBe('12px');
    });

    it('should use default theme values when theme not provided', () => {
      editor = new ImageEditor(imgElement, {});
      editor['openEditor']();
      
      const modal = editor['modal'];
      const content = document.querySelector('.sight-edit-modal-content') as HTMLElement;
      const saveBtn = content.querySelector('button') as HTMLButtonElement;
      
      expect(modal?.style.zIndex).toBe('10009'); // 9999 + 10
      expect(content.style.borderRadius).toBe('4px');
      expect(saveBtn.style.backgroundColor).toBe('#007bff');
    });
  });

  describe('value handling', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
    });

    it('should get and set values correctly', () => {
      expect(editor.getValue()).toBe('https://example.com/test.jpg');
      
      editor.setValue('https://example.com/updated.jpg');
      
      expect(editor.getValue()).toBe('https://example.com/updated.jpg');
      expect(imgElement.src).toBe('https://example.com/updated.jpg');
    });

    it('should emit change event when value is set', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.setValue('https://example.com/new-value.jpg');
      
      expect(emitSpy).toHaveBeenCalledWith('change', 'https://example.com/new-value.jpg');
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
    });

    it('should close modal and call super destroy', () => {
      const closeModalSpy = jest.spyOn(editor as any, 'closeModal');
      const superDestroySpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'destroy');
      
      editor['openEditor'](); // Create modal first
      
      editor.destroy();
      
      expect(closeModalSpy).toHaveBeenCalled();
      expect(superDestroySpy).toHaveBeenCalled();
    });

    it('should handle destroy when no modal exists', () => {
      const superDestroySpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'destroy');
      
      editor.destroy();
      
      expect(superDestroySpy).toHaveBeenCalled();
    });
  });

  describe('modal keyboard handling', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
      editor['openEditor']();
    });

    it('should handle Enter key in input to save', () => {
      const input = document.querySelector('input[type="url"]') as HTMLInputElement;
      const setValueSpy = jest.spyOn(editor, 'setValue');
      
      input.value = 'https://example.com/enter-test.jpg';
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterEvent);
      
      expect(setValueSpy).toHaveBeenCalledWith('https://example.com/enter-test.jpg');
    });

    it('should handle Escape key in input to cancel', () => {
      const input = document.querySelector('input[type="url"]') as HTMLInputElement;
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      input.dispatchEvent(escapeEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('validation integration', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
    });

    it('should inherit validation from base editor', () => {
      editor.config.schema = {
        type: 'image',
        required: true
      };
      
      editor.setValue('');
      const result = editor.validate();
      
      expect(result).toBe('This field is required');
    });

    it('should handle URL validation if schema provided', () => {
      editor.config.schema = {
        type: 'image',
        validation: (value: string) => value.startsWith('https://')
      };
      
      editor.setValue('http://insecure.com/image.jpg');
      const result = editor.validate();
      
      expect(result).toBe('Invalid value');
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
    });

    it('should maintain image alt text', () => {
      const originalAlt = imgElement.alt;
      
      editor.applyValue('https://example.com/new.jpg');
      
      expect(imgElement.alt).toBe(originalAlt);
    });

    it('should handle focus management in modal', () => {
      const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus');
      
      editor['openEditor']();
      
      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      editor = new ImageEditor(imgElement, config);
    });

    it('should handle invalid URLs gracefully', () => {
      expect(() => editor.applyValue('invalid-url')).not.toThrow();
      expect(imgElement.src).toContain('invalid-url'); // Browser handles the invalid URL
    });

    it('should handle modal creation errors', () => {
      // Mock createElement to throw error
      const { createElement } = require('../../utils/dom');
      createElement.mockImplementationOnce(() => {
        throw new Error('DOM creation failed');
      });
      
      expect(() => editor['openEditor']()).toThrow('DOM creation failed');
    });
  });

  describe('background image URL parsing', () => {
    beforeEach(() => {
      editor = new ImageEditor(divElement, config);
    });

    it('should handle complex background image URLs', () => {
      divElement.style.backgroundImage = 'url("https://example.com/path/with spaces/image.jpg")';
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/path/with spaces/image.jpg');
    });

    it('should handle background image with no quotes', () => {
      divElement.style.backgroundImage = 'url(https://example.com/noquotes.jpg)';
      
      const value = editor.extractValue();
      
      expect(value).toBe('https://example.com/noquotes.jpg');
    });

    it('should handle malformed background image CSS', () => {
      divElement.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url("https://example.com/bg.jpg")';
      
      const value = editor.extractValue();
      
      // Should extract the last URL from complex background
      expect(value).toBe('https://example.com/bg.jpg');
    });
  });
});