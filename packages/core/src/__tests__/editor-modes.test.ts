/**
 * Tests for all editor modes and types
 * Ensures no editor "breaks" under any condition
 */

import SightEditCore from '../index';
import { ElementDetector } from '../detector';
import { TextEditor } from '../editors/text';
import { RichTextEditor } from '../editors/richtext';
import { ImageEditor } from '../editors/image';
import { ColorEditor } from '../editors/color';
import { DateEditor } from '../editors/date';
import { NumberEditor } from '../editors/number';
import { SelectEditor } from '../editors/select';
import { CollectionEditor } from '../editors/collection';
import { JsonEditor } from '../editors/json';

// Make SightEdit available globally for tests
const SightEdit = SightEditCore;

describe('Editor Modes', () => {
  let container: HTMLElement;
  let sightEdit: SightEditCore;

  beforeEach(() => {
    // Create test container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Initialize SightEdit
    sightEdit = SightEdit.init({
      endpoint: '/test-api',
      debug: false
    });
  });

  afterEach(() => {
    // Cleanup
    if (sightEdit) {
      sightEdit.destroy();
    }
    document.body.removeChild(container);
  });

  describe('Inline Mode', () => {
    test('text editor should work in inline mode', () => {
      container.innerHTML = `
        <div data-sightedit="text#title">Test Title</div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('text');
      expect(elements[0].mode).toBe('inline');
    });

    test('number editor should work in inline mode', () => {
      container.innerHTML = `
        <span data-sightedit="number#price[min:0,max:9999]">99.99</span>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('number');
      expect(elements[0].mode).toBe('inline');
    });

    test('should handle complex inline configurations', () => {
      container.innerHTML = `
        <div data-sightedit='{"type":"text","id":"complex","required":true,"maxLength":100,"placeholder":"Enter text"}'>
          Complex inline text
        </div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].schema?.required).toBe(true);
      expect(elements[0].schema?.maxLength).toBe(100);
    });
  });

  describe('Modal Mode', () => {
    test('richtext editor should work in modal mode', () => {
      container.innerHTML = `
        <div data-sightedit='{"type":"richtext","id":"content","mode":"modal"}'>
          <p>Rich content</p>
        </div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('richtext');
      expect(elements[0].mode).toBe('modal');
    });

    test('json editor should default to modal mode', () => {
      container.innerHTML = `
        <div data-sightedit="json#config">{"key": "value"}</div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('json');
      expect(elements[0].mode).toBe('modal');
    });

    test('collection editor should work in modal mode', () => {
      container.innerHTML = `
        <div data-sightedit='{"type":"collection","id":"items","itemType":"text"}'>
          <div data-sightedit-item>Item 1</div>
          <div data-sightedit-item>Item 2</div>
        </div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('collection');
      expect(elements[0].mode).toBe('modal');
    });
  });

  describe('Sidebar Mode', () => {
    test('image editor should default to sidebar mode', () => {
      container.innerHTML = `
        <img data-sightedit="image#photo" src="test.jpg" alt="Test">
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('image');
      expect(elements[0].mode).toBe('sidebar');
    });

    test('should handle image with constraints', () => {
      container.innerHTML = `
        <img data-sightedit='{"type":"image","id":"avatar","maxSize":"5MB","aspectRatio":"1:1"}' 
             src="avatar.jpg" alt="Avatar">
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].schema?.maxSize).toBe('5MB');
      expect(elements[0].schema?.aspectRatio).toBe('1:1');
    });
  });

  describe('Tooltip Mode', () => {
    test('color editor should default to tooltip mode', () => {
      container.innerHTML = `
        <span data-sightedit="color#theme">#667eea</span>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('color');
      expect(elements[0].mode).toBe('tooltip');
    });

    test('date editor should default to tooltip mode', () => {
      container.innerHTML = `
        <span data-sightedit="date#release">2024-01-01</span>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('date');
      expect(elements[0].mode).toBe('tooltip');
    });

    test('select editor should default to tooltip mode', () => {
      container.innerHTML = `
        <span data-sightedit='{"type":"select","id":"status","options":["Active","Pending","Archived"]}'>
          Active
        </span>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('select');
      expect(elements[0].mode).toBe('tooltip');
    });
  });
});

describe('Editor Type Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Text Editor', () => {
    test('should handle all text configurations', () => {
      const configs = [
        'text',
        'text#id',
        'text#id[required]',
        'text#id[required,maxLength:100]',
        'text#id[required,maxLength:100,placeholder:"Enter text"]',
        '{"type":"text","id":"id","required":true,"maxLength":100}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<div data-sightedit="${escapedConfig}">Text</div>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('text');
        container.innerHTML = '';
      });
    });

    test('should create text editor instance', () => {
      const element = document.createElement('div');
      element.textContent = 'Test text';
      
      const editor = new TextEditor(element, 'test-sight');
      expect(editor.getType()).toBe('text');
      expect(editor.extractValue()).toBe('Test text');
      
      editor.applyValue('New text');
      expect(element.textContent).toBe('New text');
    });
  });

  describe('RichText Editor', () => {
    test('should handle richtext configurations', () => {
      const configs = [
        'richtext',
        'richtext#content',
        '{"type":"richtext","toolbar":["bold","italic","link"]}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<div data-sightedit="${escapedConfig}"><p>Rich</p></div>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('richtext');
        container.innerHTML = '';
      });
    });
  });

  describe('Image Editor', () => {
    test('should handle image configurations', () => {
      const configs = [
        'image',
        'image#photo',
        'image#photo[maxSize:5MB]',
        '{"type":"image","crop":true,"aspectRatio":"16:9"}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<img data-sightedit="${escapedConfig}" src="test.jpg">`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('image');
        container.innerHTML = '';
      });
    });
  });

  describe('Number Editor', () => {
    test('should handle number configurations', () => {
      const configs = [
        'number',
        'number#price',
        'number#price[min:0,max:100]',
        'number#price[min:0,max:100,step:0.01]',
        '{"type":"number","format":"currency","currency":"USD"}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<span data-sightedit="${escapedConfig}">42</span>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('number');
        container.innerHTML = '';
      });
    });

    test('should validate number constraints', () => {
      const element = document.createElement('span');
      element.textContent = '50';
      
      const editor = new NumberEditor(element, 'test-number');
      editor.setValidation({ min: 0, max: 100 });
      
      expect(editor.validate(50)).toBe(true);
      expect(editor.validate(-10)).not.toBe(true);
      expect(editor.validate(150)).not.toBe(true);
    });
  });

  describe('Date Editor', () => {
    test('should handle date configurations', () => {
      const configs = [
        'date',
        'date#birthday',
        'date#birthday[min:2000-01-01,max:2030-12-31]',
        '{"type":"date","includeTime":true}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<span data-sightedit="${escapedConfig}">2024-01-01</span>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('date');
        container.innerHTML = '';
      });
    });
  });

  describe('Select Editor', () => {
    test('should handle select configurations', () => {
      const configs = [
        '{"type":"select","options":["A","B","C"]}',
        '{"type":"select","options":[{"value":"a","label":"Option A"}]}',
        '{"type":"select","multiple":true,"options":["X","Y","Z"]}'
      ];

      configs.forEach(config => {
        // Handle single quotes by using double quote escaping
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<span data-sightedit="${escapedConfig}">A</span>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('select');
        container.innerHTML = '';
      });
    });
  });

  describe('Collection Editor', () => {
    test('should handle collection configurations', () => {
      container.innerHTML = `
        <div data-sightedit='{"type":"collection","itemType":"text","minItems":1,"maxItems":10}'>
          <div data-sightedit-item>Item 1</div>
          <div data-sightedit-item>Item 2</div>
        </div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('collection');
    });
  });

  describe('JSON Editor', () => {
    test('should handle JSON configurations', () => {
      container.innerHTML = `
        <script type="application/json" data-sightedit="json#config">
          {"key": "value", "number": 123}
        </script>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('json');
    });

    test('should handle JSON in div', () => {
      container.innerHTML = `
        <div data-sightedit='{"type":"json","schema":{"type":"object"}}'>
          {"setting": true}
        </div>
      `;

      const elements = ElementDetector.scan(container);
      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('json');
    });
  });

  describe('Color Editor', () => {
    test('should handle color configurations', () => {
      const configs = [
        'color',
        'color#theme',
        '{"type":"color","format":"hex"}'
      ];

      configs.forEach(config => {
        // Properly escape quotes for HTML attributes
        const escapedConfig = config.replace(/"/g, '&quot;');
        container.innerHTML = `<span data-sightedit="${escapedConfig}">#ff0000</span>`;
        const elements = ElementDetector.scan(container);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('color');
        container.innerHTML = '';
      });
    });

    test('should validate color values', () => {
      const element = document.createElement('span');
      element.textContent = '#667eea';
      
      const editor = new ColorEditor(element, 'test-color');
      
      expect(editor.validate('#ff0000')).toBe(true);
      expect(editor.validate('#f00')).toBe(true);
      expect(editor.validate('invalid')).not.toBe(true);
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('should handle empty data-sightedit attribute', () => {
    container.innerHTML = `<div data-sightedit="">Empty</div>`;
    const elements = ElementDetector.scan(container);
    expect(elements).toHaveLength(0);
  });

  test('should handle malformed JSON gracefully', () => {
    container.innerHTML = `<div data-sightedit='{invalid json}'>Content</div>`;
    const elements = ElementDetector.scan(container);
    // Should either parse as text or skip
    expect(elements.length).toBeLessThanOrEqual(1);
  });

  test('should handle very long attribute values', () => {
    const longValue = 'a'.repeat(10000);
    container.innerHTML = `<div data-sightedit="text[placeholder:'${longValue}']">Text</div>`;
    
    const elements = ElementDetector.scan(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].schema?.placeholder).toBe(longValue);
  });

  test('should handle special characters in values', () => {
    const specialChars = `Special: "'<>&@#$%^*()[]{}|\\`;
    container.innerHTML = `
      <div data-sightedit='{"type":"text","placeholder":"${specialChars.replace(/"/g, '\\"')}"}'>
        Text
      </div>
    `;
    
    const elements = ElementDetector.scan(container);
    expect(elements).toHaveLength(1);
  });

  test('should handle multiple elements with same ID', () => {
    container.innerHTML = `
      <div data-sightedit="text#same-id">Text 1</div>
      <div data-sightedit="text#same-id">Text 2</div>
    `;
    
    const elements = ElementDetector.scan(container);
    expect(elements).toHaveLength(2);
    // Both should be detected
    expect(elements[0].id).toBe('same-id');
    expect(elements[1].id).toBe('same-id');
  });

  test('should handle nested editable elements', () => {
    container.innerHTML = `
      <div data-sightedit="richtext#parent">
        <p>Parent content</p>
        <div data-sightedit="text#child">Child content</div>
      </div>
    `;
    
    const elements = ElementDetector.scan(container);
    // Should detect both parent and child
    expect(elements).toHaveLength(2);
  });

  test('should handle dynamically added elements', async () => {
    container.innerHTML = `<div id="container"></div>`;
    
    // Add element dynamically
    const newElement = document.createElement('div');
    newElement.setAttribute('data-sightedit', 'text#dynamic');
    newElement.textContent = 'Dynamic content';
    container.appendChild(newElement);
    
    // Scan should find it
    const elements = ElementDetector.scan(container);
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBe('dynamic');
  });
});