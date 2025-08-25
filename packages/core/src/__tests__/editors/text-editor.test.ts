import { TextEditor } from '../../editors/text';
import { EditorConfig } from '../../types';


// Mock debounce utility
jest.mock('../../utils/dom', () => ({
  debounce: jest.fn((fn) => fn),
  addClass: jest.fn((element: HTMLElement, className: string) => {
    element.classList.add(className);
  }),
  removeClass: jest.fn((element: HTMLElement, className: string) => {
    element.classList.remove(className);
  }),
  hasClass: jest.fn((element: HTMLElement, className: string) => {
    return element.classList.contains(className);
  })
}));
describe('TextEditor', () => {
  let editor: TextEditor;
  let element: HTMLElement;
  let config: EditorConfig;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<p id="test-element">Initial text content</p>';
    element = document.getElementById('test-element')!;
    
    config = {
      mode: 'inline',
      theme: {
        primaryColor: '#007bff'
      }
    };
    
    // Mock DOM methods
    jest.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents: jest.fn(),
      setStart: jest.fn(),
      setEnd: jest.fn()
    } as any));

    // Mock element.focus
    element.focus = jest.fn();

    // Mock requestAnimationFrame
    global.requestAnimationFrame = jest.fn((callback) => setTimeout(callback, 0));

    jest.spyOn(window, 'getSelection').mockImplementation(() => ({
      removeAllRanges: jest.fn(),
      addRange: jest.fn()
    } as any));

    editor = new TextEditor(element, config);
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[id*="sight-edit"]').forEach(el => el.remove());
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with debounced save function', () => {
      expect(editor).toBeInstanceOf(TextEditor);
      expect(editor['saveDebounced']).toBeDefined();
    });

    it('should extract initial text content', () => {
      expect(editor.extractValue()).toBe('Initial text content');
    });
  });

  describe('extractValue and applyValue', () => {
    it('should extract text content from element', () => {
      element.textContent = 'Test content';
      
      const value = editor.extractValue();
      
      expect(value).toBe('Test content');
    });

    it('should extract trimmed text content', () => {
      element.textContent = '  Whitespace content  ';
      
      const value = editor.extractValue();
      
      expect(value).toBe('Whitespace content');
    });

    it('should handle empty element', () => {
      element.textContent = '';
      
      const value = editor.extractValue();
      
      expect(value).toBe('');
    });

    it('should handle element with no text content', () => {
      element.innerHTML = '<br>';
      element.textContent = null;
      
      const value = editor.extractValue();
      
      expect(value).toBe('');
    });

    it('should apply value to element text content', () => {
      editor.applyValue('New content');
      
      expect(element.textContent).toBe('New content');
    });
  });

  describe('render', () => {
    beforeEach(() => {
      jest.spyOn(editor as any, 'injectStyles').mockImplementation();
      jest.spyOn(editor as any, 'makeEditable').mockImplementation();
    });

    it('should inject styles and make element editable', () => {
      editor.render();
      
      expect(editor['injectStyles']).toHaveBeenCalled();
      expect(editor['makeEditable']).toHaveBeenCalled();
    });
  });

  describe('makeEditable', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should set initial contenteditable to false', () => {
      expect(element.getAttribute('contenteditable')).toBe('false');
      expect(element.getAttribute('spellcheck')).toBe('true');
    });

    it('should start editing on click', () => {
      const startEditingSpy = jest.spyOn(editor as any, 'startEditing');
      
      element.click();
      
      expect(startEditingSpy).toHaveBeenCalled();
    });

    it('should not start editing on click if already editing', () => {
      const startEditingSpy = jest.spyOn(editor as any, 'startEditing');
      editor['isEditing'] = true;
      
      element.click();
      
      expect(startEditingSpy).not.toHaveBeenCalled();
    });

    it('should handle input events', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      const saveDebounced = jest.fn();
      editor['saveDebounced'] = saveDebounced;
      
      element.textContent = 'New input text';
      element.dispatchEvent(new Event('input'));
      
      expect(editor.value).toBe('New input text');
      expect(emitSpy).toHaveBeenCalledWith('input', 'New input text');
    });

    it('should trigger debounced save on input in inline mode', () => {
      editor.config.mode = 'inline';
      const saveDebounced = jest.fn();
      editor['saveDebounced'] = saveDebounced;
      
      element.dispatchEvent(new Event('input'));
      
      expect(saveDebounced).toHaveBeenCalled();
    });

    it('should not trigger debounced save on input in non-inline mode', () => {
      editor.config.mode = 'modal';
      const saveDebounced = jest.fn();
      editor['saveDebounced'] = saveDebounced;
      
      element.dispatchEvent(new Event('input'));
      
      expect(saveDebounced).not.toHaveBeenCalled();
    });

    it('should stop editing on blur', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      editor['isEditing'] = true;
      
      element.dispatchEvent(new Event('blur'));
      
      expect(stopEditingSpy).toHaveBeenCalledWith(true);
    });

    it('should not stop editing on blur if not editing', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      editor['isEditing'] = false;
      
      element.dispatchEvent(new Event('blur'));
      
      expect(stopEditingSpy).not.toHaveBeenCalled();
    });
  });

  describe('editing lifecycle', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should start editing mode', () => {
      const superStartSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'startEditing');
      const selectAllSpy = jest.spyOn(editor as any, 'selectAll').mockImplementation();
      element.innerHTML = '<span>Original HTML</span>';
      
      editor['startEditing']();
      
      expect(superStartSpy).toHaveBeenCalled();
      expect(editor['originalHTML']).toBe('<span>Original HTML</span>');
      expect(element.getAttribute('contenteditable')).toBe('true');
      
      // Test requestAnimationFrame callback
      jest.advanceTimersByTime(0);
      expect(element.focus).toHaveBeenCalled();
      expect(selectAllSpy).toHaveBeenCalled();
    });

    it('should stop editing with save', async () => {
      const superStopSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'stopEditing');
      editor['originalHTML'] = '<span>Original</span>';
      
      await editor['stopEditing'](true);
      
      expect(element.getAttribute('contenteditable')).toBe('false');
      expect(superStopSpy).toHaveBeenCalledWith(true);
    });

    it('should stop editing without save and restore HTML', async () => {
      const superStopSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'stopEditing');
      editor['originalHTML'] = '<span>Original HTML</span>';
      element.innerHTML = '<span>Modified HTML</span>';
      
      await editor['stopEditing'](false);
      
      expect(element.innerHTML).toBe('<span>Original HTML</span>');
      expect(editor.value).toBe('Original HTML'); // Text content extracted
      expect(superStopSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('text selection', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should select all text content', () => {
      const mockRange = {
        selectNodeContents: jest.fn()
      };
      const mockSelection = {
        removeAllRanges: jest.fn(),
        addRange: jest.fn()
      };
      
      (document.createRange as jest.Mock).mockReturnValue(mockRange);
      (window.getSelection as jest.Mock).mockReturnValue(mockSelection);
      
      editor['selectAll']();
      
      expect(mockRange.selectNodeContents).toHaveBeenCalledWith(element);
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
      expect(mockSelection.addRange).toHaveBeenCalledWith(mockRange);
    });

    it('should handle missing selection gracefully', () => {
      const mockRange = {
        selectNodeContents: jest.fn()
      };
      
      (document.createRange as jest.Mock).mockReturnValue(mockRange);
      (window.getSelection as jest.Mock).mockReturnValue(null);
      
      expect(() => editor['selectAll']()).not.toThrow();
    });
  });

  describe('auto-save', () => {
    beforeEach(() => {
      editor.render();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not auto-save if not editing', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      editor['isEditing'] = false;
      
      await editor['autoSave']();
      
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should not auto-save if value unchanged', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      const hasChangedSpy = jest.spyOn(editor as any, 'hasChanged').mockReturnValue(false);
      editor['isEditing'] = true;
      
      await editor['autoSave']();
      
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should not auto-save if validation fails', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save');
      const validateSpy = jest.spyOn(editor, 'validate').mockReturnValue('Validation error');
      const hasChangedSpy = jest.spyOn(editor as any, 'hasChanged').mockReturnValue(true);
      editor['isEditing'] = true;
      
      await editor['autoSave']();
      
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should auto-save when conditions are met', async () => {
      const saveSpy = jest.spyOn(editor as any, 'save').mockResolvedValue(undefined);
      const validateSpy = jest.spyOn(editor, 'validate').mockReturnValue(true);
      const hasChangedSpy = jest.spyOn(editor as any, 'hasChanged').mockReturnValue(true);
      editor['isEditing'] = true;
      
      await editor['autoSave']();
      
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should clean up editor and remove attributes', () => {
      const superDestroySpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'destroy');
      
      // Verify attributes are initially set by render()
      expect(element.getAttribute('contenteditable')).toBe('false');
      expect(element.getAttribute('spellcheck')).toBe('true');
      
      editor.destroy();
      
      expect(element.hasAttribute('contenteditable')).toBe(false);
      expect(element.hasAttribute('spellcheck')).toBe(false);
      expect(superDestroySpy).toHaveBeenCalled();
    });
  });

  describe('style injection', () => {
    it('should inject text-specific styles', () => {
      const superInjectSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'injectStyles');
      
      editor['injectStyles']();
      
      expect(superInjectSpy).toHaveBeenCalled();
      
      const textStyles = document.getElementById('sight-edit-text-styles');
      expect(textStyles).toBeTruthy();
      
      const styleContent = textStyles?.textContent || '';
      expect(styleContent).toContain('[contenteditable="true"]');
      expect(styleContent).toContain('outline: none');
      expect(styleContent).toContain('data-sight-placeholder');
    });

    it('should only inject text styles once', () => {
      editor['injectStyles']();
      const stylesBefore = document.querySelectorAll('#sight-edit-text-styles').length;
      
      editor['injectStyles']();
      const stylesAfter = document.querySelectorAll('#sight-edit-text-styles').length;
      
      expect(stylesBefore).toBe(1);
      expect(stylesAfter).toBe(1);
    });
  });

  describe('keyboard shortcuts', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should handle Enter key to stop editing', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      const enterEvent = new KeyboardEvent('keydown', { 
        key: 'Enter',
        bubbles: true
      });
      element.dispatchEvent(enterEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(true);
    });

    it('should handle Escape key to cancel editing', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      const escapeEvent = new KeyboardEvent('keydown', { 
        key: 'Escape',
        bubbles: true
      });
      element.dispatchEvent(escapeEvent);
      
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('placeholder functionality', () => {
    beforeEach(() => {
      element.setAttribute('data-sight-placeholder', 'Enter text here...');
      editor.render();
    });

    it('should show placeholder when element is empty', () => {
      editor['injectStyles']();
      
      const textStyles = document.getElementById('sight-edit-text-styles');
      const styleContent = textStyles?.textContent || '';
      
      // The placeholder is shown via CSS ::before pseudo-element
      expect(styleContent).toContain('[contenteditable="true"]:empty::before');
      expect(styleContent).toContain('content: attr(data-sight-placeholder)');
    });
  });

  describe('focus behavior', () => {
    beforeEach(() => {
      editor.render();
      jest.spyOn(element, 'focus').mockImplementation();
    });

    it('should focus element when starting edit', () => {
      jest.useFakeTimers();
      
      editor['startEditing']();
      
      // requestAnimationFrame is mocked to execute immediately in tests
      jest.runAllTimers();
      
      expect(element.focus).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('content preservation', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should preserve original HTML when editing starts', () => {
      element.innerHTML = '<em>Formatted</em> text';
      
      editor['startEditing']();
      
      expect(editor['originalHTML']).toBe('<em>Formatted</em> text');
    });

    it('should restore original HTML when canceling edit', async () => {
      element.innerHTML = '<em>Original</em>';
      editor['startEditing']();
      
      element.innerHTML = '<strong>Modified</strong>';
      
      await editor['stopEditing'](false);
      
      expect(element.innerHTML).toBe('<em>Original</em>');
    });
  });

  describe('integration with base editor', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should inherit validation from base editor', () => {
      editor.config.schema = {
        type: 'text',
        required: true,
        minLength: 5
      };
      
      editor.setValue('abc');
      const result = editor.validate();
      
      expect(result).toBe('Minimum length is 5');
    });

    it('should inherit error handling from base editor', () => {
      editor.showError('Custom error');
      
      expect(element.classList.contains('sight-edit-error')).toBe(true);
      expect(element.getAttribute('data-sight-error')).toBe('Custom error');
    });

    it('should emit events from base editor', () => {
      const emitSpy = jest.spyOn(editor, 'emit');
      
      editor.setValue('new value');
      
      expect(emitSpy).toHaveBeenCalledWith('change', 'new value');
    });
  });
});