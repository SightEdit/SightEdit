import { ElementDetector } from '../detector';
import { ElementType } from '../types';

describe('ElementDetector', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('scan', () => {
    it('should detect elements with data-sight attribute', () => {
      container.innerHTML = `
        <h1 data-sight="title">Hello</h1>
        <p data-sight="description">World</p>
        <div>No sight attribute</div>
      `;

      const elements = ElementDetector.scan(container);
      
      expect(elements).toHaveLength(2);
      expect(elements[0].sight).toBe('title');
      expect(elements[1].sight).toBe('description');
    });

    it('should skip already initialized elements', () => {
      container.innerHTML = `
        <h1 data-sight="title" data-sight-edit-ready="true">Hello</h1>
        <p data-sight="description">World</p>
      `;

      const elements = ElementDetector.scan(container);
      
      expect(elements).toHaveLength(1);
      expect(elements[0].sight).toBe('description');
    });
  });

  describe('detectType', () => {
    it('should detect explicit type from data-sight-type', () => {
      const element = document.createElement('div');
      element.dataset.sightType = 'richtext';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('richtext');
    });

    it('should detect image type from img tag', () => {
      const element = document.createElement('img');
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('image');
    });

    it('should detect link type from a tag', () => {
      const element = document.createElement('a');
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('link');
    });

    it('should detect select type from select tag', () => {
      const element = document.createElement('select');
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('select');
    });

    it('should detect color type from color input', () => {
      const element = document.createElement('input');
      element.type = 'color';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('color');
    });

    it('should detect date type from date input', () => {
      const element = document.createElement('input');
      element.type = 'date';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('date');
    });

    it('should detect number type from number input', () => {
      const element = document.createElement('input');
      element.type = 'number';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('number');
    });

    it('should detect collection type from data-sight-collection', () => {
      const element = document.createElement('div');
      element.dataset.sightCollection = 'true';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('collection');
    });

    it('should detect collection type from child items', () => {
      const element = document.createElement('div');
      element.innerHTML = '<div data-sight-item="1">Item</div>';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('collection');
    });

    it('should detect richtext type from block elements', () => {
      const element = document.createElement('div');
      element.innerHTML = '<p>Paragraph</p><h2>Heading</h2>';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('richtext');
    });

    it('should detect color type from hex color content', () => {
      const element = document.createElement('span');
      element.textContent = '#ff0000';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('color');
    });

    it('should detect date type from date format content', () => {
      const element = document.createElement('span');
      element.textContent = '2024-01-15';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('date');
    });

    it('should detect number type from numeric content', () => {
      const element = document.createElement('span');
      element.textContent = '42.5';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('number');
    });

    it('should detect json type from JSON content', () => {
      const element = document.createElement('div');
      element.textContent = '{"key": "value"}';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('json');
    });

    it('should default to text type', () => {
      const element = document.createElement('div');
      element.textContent = 'Regular text';
      
      const type = ElementDetector.detectType(element);
      expect(type).toBe('text');
    });
  });

  describe('detectMode', () => {
    it('should use explicit mode from data-sight-mode', () => {
      const element = document.createElement('div');
      element.dataset.sightMode = 'modal';
      
      const detected = ElementDetector.detectElement(element);
      expect(detected?.mode).toBe('modal');
    });

    it('should use modal mode for richtext', () => {
      const element = document.createElement('div');
      element.dataset.sightType = 'richtext';
      element.dataset.sight = 'content';
      
      const detected = ElementDetector.detectElement(element);
      expect(detected?.mode).toBe('modal');
    });

    it('should use sidebar mode for images', () => {
      const element = document.createElement('img');
      element.dataset.sight = 'image';
      
      const detected = ElementDetector.detectElement(element);
      expect(detected?.mode).toBe('sidebar');
    });

    it('should use tooltip mode for color picker', () => {
      const element = document.createElement('span');
      element.dataset.sight = 'color';
      element.textContent = '#ff0000';
      
      const detected = ElementDetector.detectElement(element);
      expect(detected?.mode).toBe('tooltip');
    });

    it('should default to inline mode', () => {
      const element = document.createElement('span');
      element.dataset.sight = 'text';
      element.textContent = 'Text';
      
      const detected = ElementDetector.detectElement(element);
      expect(detected?.mode).toBe('inline');
    });
  });

  describe('extractContext', () => {
    it('should extract record ID from parent', () => {
      container.innerHTML = `
        <div data-sight-record="123">
          <h1 data-sight="title">Title</h1>
        </div>
      `;
      
      const h1 = container.querySelector('h1') as HTMLElement;
      const context = ElementDetector.extractContext(h1);
      
      expect(context.recordId).toBe('123');
    });

    it('should extract context from parent data attribute', () => {
      container.innerHTML = `
        <div data-sight-context='{"userId": "456", "section": "header"}'>
          <h1 data-sight="title">Title</h1>
        </div>
      `;
      
      const h1 = container.querySelector('h1') as HTMLElement;
      const context = ElementDetector.extractContext(h1);
      
      expect(context.userId).toBe('456');
      expect(context.section).toBe('header');
    });

    it('should extract page type from URL', () => {
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://example.com/products/123',
          pathname: '/products/123'
        },
        writable: true
      });
      
      const element = document.createElement('div');
      const context = ElementDetector.extractContext(element);
      
      expect(context.pageType).toBe('products');
      expect(context.recordId).toBe('123');
    });

    it('should extract section from closest semantic element', () => {
      container.innerHTML = `
        <article id="main-content" class="content-area">
          <h1 data-sight="title">Title</h1>
        </article>
      `;
      
      const h1 = container.querySelector('h1') as HTMLElement;
      const context = ElementDetector.extractContext(h1);
      
      expect(context.section).toBe('main-content');
    });

    it('should extract index from data-sight-item', () => {
      const element = document.createElement('div');
      element.dataset.sightItem = '5';
      
      const context = ElementDetector.extractContext(element);
      expect(context.index).toBe(5);
    });

    it('should extract metadata from data-sight-meta attributes', () => {
      const element = document.createElement('div');
      element.dataset.sightMetaCategory = 'electronics';
      element.dataset.sightMetaBrand = 'apple';
      
      const context = ElementDetector.extractContext(element);
      expect(context.metadata).toEqual({
        category: 'electronics',
        brand: 'apple'
      });
    });
  });

  describe('extractSchema', () => {
    it('should extract schema from data attributes', () => {
      const element = document.createElement('input');
      element.dataset.sight = 'field';
      element.dataset.sightType = 'text';
      element.dataset.sightLabel = 'Field Label';
      element.dataset.sightPlaceholder = 'Enter value';
      element.dataset.sightRequired = 'true';
      element.dataset.sightMinLength = '5';
      element.dataset.sightMaxLength = '100';
      
      const schema = ElementDetector.extractSchema(element);
      
      expect(schema).toEqual({
        type: 'text',
        label: 'Field Label',
        placeholder: 'Enter value',
        required: true,
        minLength: 5,
        maxLength: 100
      });
    });

    it('should parse options from JSON', () => {
      const element = document.createElement('select');
      element.dataset.sight = 'select';
      element.dataset.sightOptions = '[{"value":"a","label":"Option A"},{"value":"b","label":"Option B"}]';
      
      const schema = ElementDetector.extractSchema(element);
      
      expect(schema?.options).toEqual([
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' }
      ]);
    });

    it('should parse options from comma-separated values', () => {
      const element = document.createElement('select');
      element.dataset.sight = 'select';
      element.dataset.sightOptions = 'Red, Green, Blue';
      
      const schema = ElementDetector.extractSchema(element);
      
      expect(schema?.options).toEqual([
        { value: 'Red', label: 'Red' },
        { value: 'Green', label: 'Green' },
        { value: 'Blue', label: 'Blue' }
      ]);
    });

    it('should parse number constraints', () => {
      const element = document.createElement('input');
      element.type = 'number';
      element.dataset.sight = 'number';
      element.dataset.sightMin = '0';
      element.dataset.sightMax = '100';
      
      const schema = ElementDetector.extractSchema(element);
      
      expect(schema?.min).toBe(0);
      expect(schema?.max).toBe(100);
    });

    it('should return undefined if no schema attributes', () => {
      const element = document.createElement('div');
      element.dataset.sight = 'text';
      
      const schema = ElementDetector.extractSchema(element);
      expect(schema).toBeUndefined();
    });
  });
});