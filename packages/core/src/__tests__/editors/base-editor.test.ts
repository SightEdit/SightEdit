import { BaseEditor } from '../../editors/base';
import { EditorConfig, ElementSchema } from '../../types';

// Concrete implementation for testing
class TestEditor extends BaseEditor {
  private testValue = '';

  render(): void {
    this.injectStyles();
    this.element.addEventListener('click', () => this.startEditing());
    this.setupKeyboardHandlers(this.element);
  }

  extractValue(): string {
    return this.testValue;
  }

  applyValue(value: string): void {
    this.testValue = value;
    this.element.textContent = value;
  }

  // Expose protected methods for testing
  public testStartEditing(): void {
    this.startEditing();
  }

  public async testStopEditing(save = true): Promise<void> {
    await this.stopEditing(save);
  }

  public testHasChanged(): boolean {
    return this.hasChanged();
  }

  public testShowError(message: string): void {
    this.showError(message);
  }

  public testSetupKeyboardHandlers(element: HTMLElement): void {
    this.setupKeyboardHandlers(element);
  }
}

describe('BaseEditor', () => {
  let editor: TestEditor;
  let element: HTMLElement;
  let config: EditorConfig;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-element">Initial content</div>';
    element = document.getElementById('test-element')!;
    
    config = {
      mode: 'inline',
      theme: {
        primaryColor: '#007bff',
        borderRadius: '4px',
        zIndex: 9999
      }
    };
    
    editor = new TestEditor(element, config);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[id*="sight-edit"]').forEach(el => el.remove());
  });

  describe('constructor', () => {
    it('should initialize with element and config', () => {
      expect(editor.element).toBe(element);
      expect(editor.config).toEqual(config);
      expect(editor.value).toBe(''); // Initial extracted value
    });

    it('should initialize with default config when none provided', () => {
      const editorWithoutConfig = new TestEditor(element);
      
      expect(editorWithoutConfig.config).toEqual({});
      expect(editorWithoutConfig.element).toBe(element);
    });

    it('should extract and store original value', () => {
      const editorWithValue = new TestEditor(element, config);
      editorWithValue['testValue'] = 'test value';
      
      const newEditor = new TestEditor(element, config);
      expect(newEditor.getValue()).toBe('');
    });
  });

  describe('getValue and setValue', () => {
    it('should get current value', () => {
      editor.setValue('new value');
      
      expect(editor.getValue()).toBe('new value');
      expect(editor.value).toBe('new value');
    });

    it('should set value and apply it', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.setValue('new value');
      
      expect(editor.getValue()).toBe('new value');
      expect(element.textContent).toBe('new value');
      expect(emitSpy).toHaveBeenCalledWith('change', 'new value');
    });

    it('should apply value through applyValue method', () => {
      editor.applyValue('applied value');
      
      expect(element.textContent).toBe('applied value');
    });
  });

  describe('validation', () => {
    it('should return true when no schema provided', () => {
      const result = editor.validate();
      
      expect(result).toBe(true);
    });

    it('should validate required field', () => {
      editor.config.schema = { type: 'text', required: true };
      editor.setValue('');
      
      const result = editor.validate();
      
      expect(result).toBe('This field is required');
    });

    it('should validate minimum length', () => {
      editor.config.schema = { type: 'text', minLength: 5 };
      editor.setValue('abc');
      
      const result = editor.validate();
      
      expect(result).toBe('Minimum length is 5');
    });

    it('should validate maximum length', () => {
      editor.config.schema = { type: 'text', maxLength: 10 };
      editor.setValue('this is a very long text');
      
      const result = editor.validate();
      
      expect(result).toBe('Maximum length is 10');
    });

    it('should validate minimum value', () => {
      editor.config.schema = { type: 'number', min: 10 };
      editor.setValue(5);
      
      const result = editor.validate();
      
      expect(result).toBe('Minimum value is 10');
    });

    it('should validate maximum value', () => {
      editor.config.schema = { type: 'number', max: 100 };
      editor.setValue(150);
      
      const result = editor.validate();
      
      expect(result).toBe('Maximum value is 100');
    });

    it('should use custom validation function', () => {
      editor.config.schema = {
        type: 'text',
        validation: (value: string) => value.includes('@')
      };
      editor.setValue('invalid-email');
      
      const result = editor.validate();
      
      expect(result).toBe('Invalid value');
    });

    it('should return custom error message from validation function', () => {
      editor.config.schema = {
        type: 'text',
        validation: (value: string) => 
          value.includes('@') ? true : 'Must contain @ symbol'
      };
      editor.setValue('invalid-email');
      
      const result = editor.validate();
      
      expect(result).toBe('Must contain @ symbol');
    });

    it('should pass validation with valid value', () => {
      editor.config.schema = {
        type: 'text',
        required: true,
        minLength: 3,
        maxLength: 20,
        validation: (value: string) => value.length > 0
      };
      editor.setValue('valid value');
      
      const result = editor.validate();
      
      expect(result).toBe(true);
    });
  });

  describe('editing lifecycle', () => {
    it('should start editing mode', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.testStartEditing();
      
      expect(editor['isEditing']).toBe(true);
      expect(element.classList.contains('sight-edit-active')).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('editStart');
    });

    it('should not start editing if already editing', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.testStartEditing();
      emitSpy.mockClear();
      
      editor.testStartEditing(); // Should be ignored
      
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should stop editing with save', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save').mockResolvedValue(undefined);
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.testStartEditing();
      editor.setValue('changed value');
      
      await editor.testStopEditing(true);
      
      expect(editor['isEditing']).toBe(false);
      expect(element.classList.contains('sight-edit-active')).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith('editEnd');
      expect(saveSpy).toHaveBeenCalled();
    });

    it('should stop editing without save', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      editor.setValue('initial');
      
      editor.testStartEditing();
      editor.setValue('changed value');
      
      await editor.testStopEditing(false);
      
      expect(editor.getValue()).toBe('initial'); // Should revert to original value
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should not save if value unchanged', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      
      editor.testStartEditing();
      // Don't change value
      
      await editor.testStopEditing(true);
      
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should not stop editing if validation fails', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      editor.config.schema = { type: 'text', required: true };
      
      editor.testStartEditing();
      editor.setValue(''); // Invalid value
      
      await editor.testStopEditing(true);
      
      expect(editor['isEditing']).toBe(true); // Should still be editing
      expect(saveSpy).not.toHaveBeenCalled();
      expect(element.classList.contains('sight-edit-error')).toBe(true);
    });
  });

  describe('save functionality', () => {
    it('should save value successfully', async () => {
      const mockOnSave = jest.fn().mockResolvedValue(undefined);
      editor.onSave = mockOnSave;
      editor.setValue('test value');
      
      await editor['save']();
      
      expect(mockOnSave).toHaveBeenCalledWith('test value');
      expect(element.classList.contains('sight-edit-success')).toBe(true);
      expect(editor['originalValue']).toBe('test value');
    });

    it('should handle save errors', async () => {
      const mockOnSave = jest.fn().mockRejectedValue(new Error('Save failed'));
      editor.onSave = mockOnSave;
      editor.setValue('test value');
      
      await expect(editor['save']()).rejects.toThrow('Save failed');
      
      expect(element.classList.contains('sight-edit-error')).toBe(true);
      expect(element.getAttribute('data-sight-error')).toBe('Failed to save');
    });

    it('should show saving state during save', async () => {
      let saveResolve: Function;
      const mockOnSave = jest.fn(() => new Promise(resolve => saveResolve = resolve));
      editor.onSave = mockOnSave;
      
      const savePromise = editor['save']();
      
      expect(element.classList.contains('sight-edit-saving')).toBe(true);
      
      saveResolve!();
      await savePromise;
      
      expect(element.classList.contains('sight-edit-saving')).toBe(false);
    });

    it('should not save if no onSave callback', async () => {
      editor.onSave = undefined;
      
      await expect(editor['save']()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should show error message', () => {
      editor.testShowError('Test error message');
      
      expect(element.classList.contains('sight-edit-error')).toBe(true);
      expect(element.getAttribute('data-sight-error')).toBe('Test error message');
      expect(editor['isValid']).toBe(false);
    });

    it('should clear error after timeout', () => {
      editor.testShowError('Test error');
      
      jest.advanceTimersByTime(5000);
      
      expect(element.classList.contains('sight-edit-error')).toBe(false);
      expect(element.hasAttribute('data-sight-error')).toBe(false);
      expect(editor['isValid']).toBe(true);
    });

    it('should clear error manually', () => {
      editor.testShowError('Test error');
      
      editor['clearError']();
      
      expect(element.classList.contains('sight-edit-error')).toBe(false);
      expect(element.hasAttribute('data-sight-error')).toBe(false);
      expect(editor['isValid']).toBe(true);
    });

    it('should show success message', () => {
      editor['showSuccess']();
      
      expect(element.classList.contains('sight-edit-success')).toBe(true);
    });

    it('should clear success message after timeout', () => {
      editor['showSuccess']();
      
      jest.advanceTimersByTime(2000);
      
      expect(element.classList.contains('sight-edit-success')).toBe(false);
    });
  });

  describe('keyboard handling', () => {
    let keyboardElement: HTMLElement;

    beforeEach(() => {
      keyboardElement = document.createElement('div');
      editor.testSetupKeyboardHandlers(keyboardElement);
    });

    it('should handle Escape key to cancel editing', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      keyboardElement.dispatchEvent(escapeEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
    });

    it('should handle Enter key to save editing', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      editor.config.mode = 'modal'; // Not inline mode
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      keyboardElement.dispatchEvent(enterEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(true);
    });

    it('should allow Enter in inline mode if line breaks allowed', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      editor.config.mode = 'inline';
      // BaseEditor.allowsLineBreaks() returns false by default
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      keyboardElement.dispatchEvent(enterEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(true);
    });

    it('should ignore Enter+Shift in non-inline mode', () => {
      const stopEditingSpy = jest.spyOn(editor, 'testStopEditing');
      
      const enterShiftEvent = new KeyboardEvent('keydown', { 
        key: 'Enter', 
        shiftKey: true 
      });
      keyboardElement.dispatchEvent(enterShiftEvent);
      
      expect(stopEditingSpy).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clean up editor', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      const removeListenersSpy = jest.spyOn(editor, 'removeAllListeners');
      
      editor.destroy();
      
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
      expect(removeListenersSpy).toHaveBeenCalled();
      expect(element.classList.contains('sight-edit-ready')).toBe(false);
    });
  });

  describe('change detection', () => {
    it('should detect changes correctly', () => {
      editor.setValue('initial');
      expect(editor.testHasChanged()).toBe(false);
      
      editor.testStartEditing(); // Sets original value
      
      editor.setValue('changed');
      expect(editor.testHasChanged()).toBe(true);
      
      editor.setValue('initial');
      expect(editor.testHasChanged()).toBe(false);
    });
  });

  describe('style injection', () => {
    it('should inject base styles only once', () => {
      editor.render();
      
      const styleBefore = document.querySelectorAll('#sight-edit-styles').length;
      
      editor.render(); // Call again
      
      const styleAfter = document.querySelectorAll('#sight-edit-styles').length;
      
      expect(styleBefore).toBe(1);
      expect(styleAfter).toBe(1);
    });

    it('should inject styles with theme configuration', () => {
      editor.render();
      
      const styleElement = document.getElementById('sight-edit-styles');
      const styleContent = styleElement?.textContent || '';
      
      expect(styleContent).toContain('#007bff'); // Primary color
      expect(styleContent).toContain('4px'); // Border radius
      expect(styleContent).toContain('9999'); // Z-index
    });

    it('should use default theme values when not configured', () => {
      const editorWithoutTheme = new TestEditor(element, {});
      editorWithoutTheme.render();
      
      const styleElement = document.getElementById('sight-edit-styles');
      const styleContent = styleElement?.textContent || '';
      
      expect(styleContent).toContain('#007bff'); // Default primary color
      expect(styleContent).toContain('4px'); // Default border radius
      expect(styleContent).toContain('9999'); // Default z-index
    });
  });

  describe('event emission', () => {
    it('should emit events during editing lifecycle', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      // Test change event
      editor.setValue('new value');
      expect(emitSpy).toHaveBeenCalledWith('change', 'new value');
      
      // Test edit start event
      emitSpy.mockClear();
      editor.testStartEditing();
      expect(emitSpy).toHaveBeenCalledWith('editStart');
      
      // Test edit end event
      emitSpy.mockClear();
      editor.testStopEditing(false);
      expect(emitSpy).toHaveBeenCalledWith('editEnd');
    });
  });
});