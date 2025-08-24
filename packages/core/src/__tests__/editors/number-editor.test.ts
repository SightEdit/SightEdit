import { NumberEditor } from '../../editors/number';
import { EditorOptions } from '../../types';

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

// Mock window.getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  value: jest.fn(() => ({
    fontSize: '16px',
    fontFamily: 'Arial, sans-serif'
  }))
});

describe('NumberEditor', () => {
  let editor: NumberEditor;
  let element: HTMLElement;
  let options: EditorOptions;

  beforeEach(() => {
    document.body.innerHTML = '<span id="test-number">$123.45</span>';
    element = document.getElementById('test-number')!;
    
    options = {
      schema: {
        type: 'number',
        min: 0,
        max: 1000
      },
      theme: {
        primaryColor: '#007bff'
      },
      locale: 'en-US'
    };
    
    // Mock getBoundingClientRect
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 200,
      width: 100,
      height: 30,
      bottom: 130,
      right: 300,
      x: 200,
      y: 100,
      toJSON: () => ({})
    });
    
    editor = new NumberEditor(element, options);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with element and options', () => {
      expect(editor.element).toBe(element);
      expect(editor.options).toEqual(options);
    });
  });

  describe('extractValue', () => {
    it('should extract value from data-sight-value attribute', () => {
      element.dataset.sightValue = '456.78';
      
      const value = editor.extractValue();
      
      expect(value).toBe(456.78);
    });

    it('should extract numeric value from currency text', () => {
      element.textContent = '$123.45';
      
      const value = editor.extractValue();
      
      expect(value).toBe(123.45);
    });

    it('should extract value from percentage text', () => {
      element.textContent = '75%';
      
      const value = editor.extractValue();
      
      expect(value).toBe(75);
    });

    it('should extract value from formatted number with commas', () => {
      element.textContent = '1,234.56';
      
      const value = editor.extractValue();
      
      expect(value).toBe(1234.56);
    });

    it('should extract value from European currency', () => {
      element.textContent = '€100,50';
      
      const value = editor.extractValue();
      
      expect(value).toBe(100.5);
    });

    it('should return 0 for invalid number text', () => {
      element.textContent = 'Not a number';
      
      const value = editor.extractValue();
      
      expect(value).toBe(0);
    });

    it('should return 0 for empty text', () => {
      element.textContent = '';
      
      const value = editor.extractValue();
      
      expect(value).toBe(0);
    });
  });

  describe('applyValue', () => {
    it('should apply numeric value with currency formatting', () => {
      element.textContent = '$0.00'; // Indicates currency format
      
      editor.applyValue(123.45);
      
      expect(element.textContent).toBe('$123.45');
      expect(element.dataset.sightValue).toBe('123.45');
    });

    it('should apply value with percentage formatting', () => {
      element.textContent = '0%'; // Indicates percentage format
      
      editor.applyValue(75);
      
      expect(element.textContent).toBe('75%');
      expect(element.dataset.sightValue).toBe('75');
    });

    it('should apply value as regular formatted number', () => {
      element.textContent = '0'; // Regular number
      
      editor.applyValue(1234.567);
      
      expect(element.textContent).toBe('1,234.567');
      expect(element.dataset.sightValue).toBe('1234.567');
    });

    it('should handle string values by parsing them', () => {
      editor.applyValue('456.78');
      
      expect(element.dataset.sightValue).toBe('456.78');
    });

    it('should handle invalid string values', () => {
      editor.applyValue('invalid');
      
      // Should not update if value is invalid
      expect(element.dataset.sightValue).toBeUndefined();
    });
  });

  describe('number formatting', () => {
    it('should format currency with dollar sign', () => {
      element.textContent = '$100.00';
      
      const formatted = editor['formatNumber'](123.45);
      
      expect(formatted).toBe('$123.45');
    });

    it('should format currency with euro sign', () => {
      element.textContent = '€100.00';
      
      const formatted = editor['formatNumber'](123.45);
      
      expect(formatted).toBe('€123.45');
    });

    it('should format percentage', () => {
      element.textContent = '50%';
      
      const formatted = editor['formatNumber'](75);
      
      expect(formatted).toBe('75%');
    });

    it('should format regular number with proper decimals', () => {
      element.textContent = '123.456';
      
      const formatted = editor['formatNumber'](789.123456);
      
      expect(formatted).toBe('789.123');
    });

    it('should format integer without unnecessary decimals', () => {
      element.textContent = '123';
      
      const formatted = editor['formatNumber'](456);
      
      expect(formatted).toBe('456');
    });

    it('should use locale for number formatting', () => {
      editor.options.locale = 'de-DE';
      element.textContent = '123';
      
      const formatted = editor['formatNumber'](1234.56);
      
      // German locale uses different thousand separator
      expect(formatted).toBe('1.234,56');
    });
  });

  describe('render and interaction', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should set cursor pointer and position relative', () => {
      expect(element.style.cursor).toBe('pointer');
      expect(element.style.position).toBe('relative');
    });

    it('should add hover effects', () => {
      element.dispatchEvent(new Event('mouseenter'));
      
      expect(element.style.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
      expect(element.style.borderRadius).toBe('4px');
    });

    it('should remove hover effects on mouse leave', () => {
      element.dispatchEvent(new Event('mouseenter'));
      element.dispatchEvent(new Event('mouseleave'));
      
      expect(element.style.backgroundColor).toBe('');
      expect(element.style.borderRadius).toBe('');
    });

    it('should start inline edit on click', () => {
      const startInlineEditSpy = jest.spyOn(editor as any, 'startInlineEdit');
      
      element.click();
      
      expect(startInlineEditSpy).toHaveBeenCalled();
    });
  });

  describe('inline editing', () => {
    beforeEach(() => {
      editor.render();
      // Mock window.scrollX and scrollY
      Object.defineProperty(window, 'scrollY', { value: 50 });
      Object.defineProperty(window, 'scrollX', { value: 25 });
    });

    it('should create input element with correct positioning', () => {
      editor['startInlineEdit']();
      
      const input = editor['input'];
      expect(input).toBeTruthy();
      expect(input?.type).toBe('number');
      expect(input?.style.position).toBe('absolute');
      expect(input?.style.top).toBe('150px'); // 100 + 50 scrollY
      expect(input?.style.left).toBe('225px'); // 200 + 25 scrollX
      expect(input?.style.width).toBe('100px');
      expect(input?.style.height).toBe('30px');
    });

    it('should set input attributes based on schema', () => {
      editor['startInlineEdit']();
      
      const input = editor['input'];
      expect(input?.min).toBe('0');
      expect(input?.max).toBe('1000');
      expect(input?.step).toBe('0.01'); // For currency values
    });

    it('should detect step based on current value precision', () => {
      element.textContent = '123';
      const step1 = editor['detectStep'](123);
      expect(step1).toBe('1');
      
      const step2 = editor['detectStep'](123.45);
      expect(step2).toBe('0.01');
      
      const step3 = editor['detectStep'](123.456);
      expect(step3).toBe('0.001');
    });

    it('should not create input if already exists', () => {
      editor['startInlineEdit']();
      const firstInput = editor['input'];
      
      editor['startInlineEdit']();
      
      expect(editor['input']).toBe(firstInput);
    });

    it('should focus and select input text', () => {
      const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus');
      const selectSpy = jest.spyOn(HTMLInputElement.prototype, 'select');
      
      editor['startInlineEdit']();
      
      expect(focusSpy).toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts in input', () => {
    beforeEach(() => {
      editor.render();
      editor['startInlineEdit']();
    });

    it('should increment by 10 on Shift+ArrowUp', () => {
      const input = editor['input']!;
      input.value = '100';
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        shiftKey: true
      });
      input.dispatchEvent(event);
      
      expect(input.value).toBe('110');
    });

    it('should decrement by 10 on Shift+ArrowDown', () => {
      const input = editor['input']!;
      input.value = '100';
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true
      });
      input.dispatchEvent(event);
      
      expect(input.value).toBe('90');
    });

    it('should respect min value when decrementing', () => {
      const input = editor['input']!;
      input.value = '5';
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true
      });
      input.dispatchEvent(event);
      
      expect(input.value).toBe('0'); // Min value from schema
    });

    it('should respect max value when incrementing', () => {
      const input = editor['input']!;
      input.value = '995';
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        shiftKey: true
      });
      input.dispatchEvent(event);
      
      expect(input.value).toBe('1000'); // Max value from schema
    });

    it('should finish edit on Enter key', () => {
      const finishEditSpy = jest.spyOn(editor as any, 'finishEdit');
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      editor['input']!.dispatchEvent(event);
      
      expect(finishEditSpy).toHaveBeenCalled();
    });

    it('should cancel edit on Escape key', () => {
      const cancelEditSpy = jest.spyOn(editor as any, 'cancelEdit');
      
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      editor['input']!.dispatchEvent(event);
      
      expect(cancelEditSpy).toHaveBeenCalled();
    });
  });

  describe('input validation during editing', () => {
    beforeEach(() => {
      editor.render();
      editor['startInlineEdit']();
    });

    it('should show invalid border for values outside range', () => {
      const input = editor['input']!;
      input.value = '1500'; // Above max
      
      editor['validateInput']();
      
      expect(input.style.borderColor).toBe('#dc3545'); // Error color
    });

    it('should show valid border for values within range', () => {
      const input = editor['input']!;
      input.value = '500'; // Within range
      
      editor['validateInput']();
      
      expect(input.style.borderColor).toBe('#007bff'); // Primary color
    });

    it('should show invalid border for NaN values', () => {
      const input = editor['input']!;
      input.value = 'abc';
      
      editor['validateInput']();
      
      expect(input.style.borderColor).toBe('#dc3545');
    });
  });

  describe('finish editing', () => {
    let mockSave: jest.Mock;

    beforeEach(() => {
      mockSave = jest.fn().mockResolvedValue(undefined);
      editor.onSave = mockSave;
      editor.render();
      editor['startInlineEdit']();
    });

    it('should save valid value and update display', async () => {
      const input = editor['input']!;
      input.value = '456.78';
      element.textContent = '$123.45'; // Currency format
      
      await editor['finishEdit']();
      
      expect(element.textContent).toBe('$456.78');
      expect(element.dataset.sightValue).toBe('456.78');
      expect(mockSave).toHaveBeenCalledWith(456.78);
      expect(editor['input']).toBeNull();
    });

    it('should show error for invalid values', async () => {
      const showErrorSpy = jest.spyOn(editor, 'showError');
      const input = editor['input']!;
      input.value = '1500'; // Above max
      
      await editor['finishEdit']();
      
      expect(showErrorSpy).toHaveBeenCalledWith('Maximum value is 1000');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should handle NaN values gracefully', async () => {
      const input = editor['input']!;
      input.value = 'invalid';
      
      await editor['finishEdit']();
      
      expect(mockSave).not.toHaveBeenCalled();
      expect(editor['input']).toBeNull();
    });

    it('should finish edit on blur', () => {
      const finishEditSpy = jest.spyOn(editor as any, 'finishEdit');
      
      editor['input']!.dispatchEvent(new Event('blur'));
      
      expect(finishEditSpy).toHaveBeenCalled();
    });
  });

  describe('cancel editing', () => {
    beforeEach(() => {
      editor.render();
      editor['startInlineEdit']();
    });

    it('should cleanup input and stop editing without save', () => {
      const stopEditingSpy = jest.spyOn(editor as any, 'stopEditing');
      
      editor['cancelEdit']();
      
      expect(editor['input']).toBeNull();
      expect(stopEditingSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('validation', () => {
    it('should validate required field', () => {
      editor.options.schema = { type: 'number', required: true };
      element.textContent = '';
      
      const result = editor.validate();
      
      expect(result).toBe('This field is required');
    });

    it('should validate minimum value', () => {
      element.textContent = '-10';
      
      const result = editor.validate();
      
      expect(result).toBe('Minimum value is 0');
    });

    it('should validate maximum value', () => {
      element.textContent = '2000';
      
      const result = editor.validate();
      
      expect(result).toBe('Maximum value is 1000');
    });

    it('should pass validation for valid values', () => {
      element.textContent = '500';
      
      const result = editor.validate();
      
      expect(result).toBe(true);
    });

    it('should call parent validation', () => {
      const superValidateSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'validate');
      element.textContent = '500';
      
      editor.validate();
      
      expect(superValidateSpy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should cleanup input and reset styles', () => {
      const superDestroySpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(editor)), 'destroy');
      
      editor['startInlineEdit']();
      editor.destroy();
      
      expect(editor['input']).toBeNull();
      expect(element.style.cursor).toBe('');
      expect(element.style.backgroundColor).toBe('');
      expect(element.style.borderRadius).toBe('');
      expect(superDestroySpy).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should handle very large numbers', () => {
      element.textContent = '999999999.99';
      
      const value = editor.extractValue();
      
      expect(value).toBe(999999999.99);
    });

    it('should handle negative currency values', () => {
      element.textContent = '-$123.45';
      
      const value = editor.extractValue();
      
      expect(value).toBe(-123.45);
    });

    it('should handle zero values correctly', () => {
      element.textContent = '$0.00';
      
      const value = editor.extractValue();
      
      expect(value).toBe(0);
    });

    it('should handle decimal-only values', () => {
      element.textContent = '0.5';
      
      const value = editor.extractValue();
      
      expect(value).toBe(0.5);
    });

    it('should format very small decimals correctly', () => {
      const formatted = editor['formatNumber'](0.001234);
      
      expect(formatted).toContain('0.001'); // Should limit decimal places
    });

    it('should handle multiple currency symbols in text', () => {
      element.textContent = '$100 €200 £300';
      
      const value = editor.extractValue();
      
      expect(value).toBe(100200300); // Should extract all numbers
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      editor.render();
    });

    it('should maintain proper tab order', () => {
      editor['startInlineEdit']();
      
      const input = editor['input']!;
      expect(input.tabIndex).not.toBe(-1); // Should be focusable
    });

    it('should provide proper ARIA attributes if needed', () => {
      // This test could be expanded if ARIA attributes are added
      editor['startInlineEdit']();
      
      const input = editor['input']!;
      expect(input.type).toBe('number'); // Semantic input type
    });
  });
});