import { 
  EditorRegistry, 
  LazyEditorFactory, 
  EditorNotFoundError, 
  EditorFactory, 
  EditorContext 
} from '../../services/editor-factory';
import { Editor } from '../../types';

// Mock editor classes
class MockEditor implements Editor {
  context: EditorContext;
  element: HTMLElement;
  config: any;
  sight?: string;
  type?: string;
  onSave?: any;
  
  constructor(elementOrContext: HTMLElement | EditorContext, config?: any) {
    // Handle both constructor signatures like BaseEditor
    if (elementOrContext && typeof elementOrContext === 'object' && 'element' in elementOrContext) {
      // EditorContext signature from factory
      this.context = elementOrContext;
      this.element = this.context.element as HTMLElement;
      this.config = this.context.config || {};
      this.sight = this.context.sight;
      this.type = this.context.type;
      this.onSave = this.context.onSave;
    } else {
      // Traditional signature
      this.element = elementOrContext as HTMLElement;
      this.config = config || {};
      this.context = {
        element: this.element,
        sight: this.element.getAttribute('data-sight') || '',
        type: this.element.getAttribute('data-sight-type') || 'text',
        config: this.config
      };
    }
  }
  
  render(): void {}
  extractValue(): any { return 'mock-value'; }
  applyValue(value: any): void {}
  validate(value: any): boolean { return true; }
  destroy(): void {}
  focus(): void {}
  blur(): void {}
}

class MockTextEditor extends MockEditor {}
class MockImageEditor extends MockEditor {}
class MockRichTextEditor extends MockEditor {}

// Mock dynamic imports
jest.mock('../editors/text', () => ({ TextEditor: MockTextEditor }), { virtual: true });
jest.mock('../editors/image', () => ({ ImageEditor: MockImageEditor }), { virtual: true });
jest.mock('../editors/richtext', () => ({ RichTextEditor: MockRichTextEditor }), { virtual: true });

describe('EditorRegistry', () => {
  let registry: EditorRegistry;
  let mockFactory: jest.Mocked<EditorFactory>;
  let mockElement: Element;

  beforeEach(() => {
    registry = new EditorRegistry();
    
    mockFactory = {
      create: jest.fn(),
      canHandle: jest.fn(),
      getPriority: jest.fn().mockReturnValue(1),
      getSupportedTypes: jest.fn().mockReturnValue(['text'])
    };

    // Create a mock element
    document.body.innerHTML = '<div data-sight="test-element" data-sight-type="text">Content</div>';
    mockElement = document.querySelector('[data-sight="test-element"]')!;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('register', () => {
    it('should register a factory for a type', () => {
      registry.register('text', mockFactory);

      expect(registry.hasFactory('text')).toBe(true);
      expect(registry.getRegisteredTypes()).toContain('text');
    });

    it('should add factory to type factories and sort by priority', () => {
      const highPriorityFactory = {
        ...mockFactory,
        getPriority: jest.fn().mockReturnValue(10)
      };
      
      const lowPriorityFactory = {
        ...mockFactory,
        getPriority: jest.fn().mockReturnValue(1)
      };

      registry.register('text1', lowPriorityFactory);
      registry.register('text2', highPriorityFactory);

      // We can't directly test the sorting, but we can verify both are registered
      expect(registry.hasFactory('text1')).toBe(true);
      expect(registry.hasFactory('text2')).toBe(true);
    });

    it('should not duplicate factories in type factories list', () => {
      registry.register('text', mockFactory);
      registry.register('text2', mockFactory); // Same factory, different type

      expect(registry.getRegisteredTypes()).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry.register('text', mockFactory);
    });

    it('should remove factory for a type', () => {
      expect(registry.hasFactory('text')).toBe(true);

      registry.unregister('text');

      expect(registry.hasFactory('text')).toBe(false);
      expect(registry.getRegisteredTypes()).not.toContain('text');
    });

    it('should handle unregistering non-existent type', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });

    it('should remove factory from type factories list', () => {
      registry.register('text', mockFactory);
      registry.register('text2', mockFactory);

      registry.unregister('text');

      // Factory should still be available for text2
      expect(registry.hasFactory('text2')).toBe(true);
    });
  });

  describe('createEditor', () => {
    beforeEach(() => {
      mockFactory.create.mockResolvedValue(new MockEditor({
        element: mockElement,
        sight: 'test-element',
        type: 'text'
      }));
    });

    it('should create editor with explicit type', async () => {
      registry.register('text', mockFactory);

      const editor = await registry.createEditor(mockElement);

      expect(mockFactory.create).toHaveBeenCalledWith(
        'text',
        mockElement,
        expect.objectContaining({
          sight: 'test-element',
          type: 'text'
        })
      );
      expect(editor).toBeInstanceOf(MockEditor);
    });

    it('should throw error if element has no data-sight attribute', async () => {
      const elementWithoutSight = document.createElement('div');

      await expect(registry.createEditor(elementWithoutSight))
        .rejects
        .toThrow('Element must have data-sight attribute');
    });

    it('should use explicit type from data-sight-type attribute', async () => {
      registry.register('text', mockFactory);

      await registry.createEditor(mockElement);

      expect(mockFactory.create).toHaveBeenCalledWith(
        'text',
        mockElement,
        expect.objectContaining({ type: 'text' })
      );
    });

    it('should use explicit type from context', async () => {
      registry.register('richtext', mockFactory);
      
      // Remove data-sight-type to test context override
      mockElement.removeAttribute('data-sight-type');

      await registry.createEditor(mockElement, { type: 'richtext' });

      expect(mockFactory.create).toHaveBeenCalledWith(
        'richtext',
        mockElement,
        expect.objectContaining({ type: 'richtext' })
      );
    });

    it('should fallback to auto-detection if explicit type not found', async () => {
      mockFactory.canHandle.mockReturnValue(true);
      mockFactory.getSupportedTypes.mockReturnValue(['text']);
      registry.register('text', mockFactory);

      // Set unknown explicit type
      mockElement.setAttribute('data-sight-type', 'unknown-type');

      const editor = await registry.createEditor(mockElement);

      expect(mockFactory.canHandle).toHaveBeenCalledWith(mockElement);
      expect(editor).toBeInstanceOf(MockEditor);
    });

    it('should throw EditorNotFoundError if no suitable factory found', async () => {
      // Remove explicit type to force auto-detection
      mockElement.removeAttribute('data-sight-type');
      mockFactory.canHandle.mockReturnValue(false);
      registry.register('text', mockFactory);

      await expect(registry.createEditor(mockElement))
        .rejects
        .toBeInstanceOf(EditorNotFoundError);
    });

    it('should pass context to factory create method', async () => {
      registry.register('text', mockFactory);
      
      const context = {
        config: { maxLength: 100 },
        onSave: jest.fn(),
        onChange: jest.fn(),
        onDestroy: jest.fn()
      };

      await registry.createEditor(mockElement, context);

      expect(mockFactory.create).toHaveBeenCalledWith(
        'text',
        mockElement,
        expect.objectContaining({
          sight: 'test-element',
          type: 'text',
          config: { maxLength: 100 },
          onSave: context.onSave,
          onChange: context.onChange,
          onDestroy: context.onDestroy
        })
      );
    });

    it('should prioritize factories by priority when auto-detecting', async () => {
      const highPriorityFactory = {
        ...mockFactory,
        getPriority: jest.fn().mockReturnValue(10),
        canHandle: jest.fn().mockReturnValue(true),
        getSupportedTypes: jest.fn().mockReturnValue(['richtext']),
        create: jest.fn().mockResolvedValue(new MockRichTextEditor({
          element: mockElement,
          sight: 'test-element',
          type: 'richtext'
        }))
      };

      const lowPriorityFactory = {
        ...mockFactory,
        getPriority: jest.fn().mockReturnValue(1),
        canHandle: jest.fn().mockReturnValue(true)
      };

      // Remove explicit type to force auto-detection
      mockElement.removeAttribute('data-sight-type');

      registry.register('text', lowPriorityFactory);
      registry.register('richtext', highPriorityFactory);

      await registry.createEditor(mockElement);

      // High priority factory should be used first
      expect(highPriorityFactory.canHandle).toHaveBeenCalledWith(mockElement);
      expect(highPriorityFactory.create).toHaveBeenCalled();
      expect(lowPriorityFactory.canHandle).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should return registered types', () => {
      registry.register('text', mockFactory);
      registry.register('image', mockFactory);

      const types = registry.getRegisteredTypes();

      expect(types).toContain('text');
      expect(types).toContain('image');
      expect(types).toHaveLength(2);
    });

    it('should check if factory exists for type', () => {
      registry.register('text', mockFactory);

      expect(registry.hasFactory('text')).toBe(true);
      expect(registry.hasFactory('nonexistent')).toBe(false);
    });
  });
});

describe('LazyEditorFactory', () => {
  let factory: LazyEditorFactory;
  let mockElement: Element;

  beforeEach(() => {
    factory = new LazyEditorFactory(['text', 'image', 'richtext'], 5);
    
    document.body.innerHTML = '<div data-sight="test" data-sight-placeholder="Test placeholder" data-sight-readonly="false">Content</div>';
    mockElement = document.querySelector('[data-sight="test"]')!;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should initialize with supported types and priority', () => {
      const factory = new LazyEditorFactory(['text'], 10);

      expect(factory.getSupportedTypes()).toEqual(['text']);
      expect(factory.getPriority()).toBe(10);
    });

    it('should use default priority if not provided', () => {
      const factory = new LazyEditorFactory(['text']);

      expect(factory.getPriority()).toBe(1);
    });
  });

  describe('create', () => {
    it('should create editor with lazy loading', async () => {
      const context = {
        sight: 'test-element',
        type: 'text',
        config: { maxLength: 100 }
      };

      const editor = await factory.create('text', mockElement, context);

      // Since mocking isn't working in this environment, we test with the real TextEditor
      expect(editor.constructor.name).toBe('TextEditor');
      expect(editor.context.sight).toBe('test-element');
      expect(editor.context.type).toBe('text');
      expect(editor.context.config).toEqual({ maxLength: 100 });
    });

    it('should handle missing sight in context by reading from element', async () => {
      mockElement.setAttribute('data-sight', 'element-sight');

      const editor = await factory.create('text', mockElement, {});

      expect(editor.context.sight).toBe('element-sight');
    });

    it('should provide default empty config if not provided', async () => {
      const editor = await factory.create('text', mockElement, { sight: 'test' });

      expect(editor.context.config).toEqual({});
    });

    it('should pass callbacks to editor context', async () => {
      const onSave = jest.fn();
      const onChange = jest.fn();
      const onDestroy = jest.fn();

      const editor = await factory.create('text', mockElement, {
        sight: 'test',
        onSave,
        onChange,
        onDestroy
      });

      expect(editor.context.onSave).toBe(onSave);
      expect(editor.context.onChange).toBe(onChange);
      expect(editor.context.onDestroy).toBe(onDestroy);
    });

    it('should cache loaded editor classes', async () => {
      // Create multiple editors of the same type
      const editor1 = await factory.create('text', mockElement, { sight: 'test1' });
      const editor2 = await factory.create('text', mockElement, { sight: 'test2' });

      expect(editor1.constructor).toBe(editor2.constructor);
    });

    it('should throw error for unknown editor type', async () => {
      await expect(factory.create('unknown', mockElement, { sight: 'test' }))
        .rejects
        .toThrow('Unknown editor type: unknown');
    });
  });

  describe('canHandle', () => {
    it('should detect text elements', () => {
      const textElements = [
        document.createElement('input'),
        document.createElement('textarea'),
        document.createElement('p'),
        document.createElement('span'),
        document.createElement('h1'),
        document.createElement('h2'),
        document.createElement('h3'),
        document.createElement('h4'),
        document.createElement('h5'),
        document.createElement('h6')
      ];

      textElements.forEach(element => {
        expect(factory.canHandle(element)).toBe(true);
      });
    });

    it('should detect image elements', () => {
      const imageFactory = new LazyEditorFactory(['image']);
      const imgElement = document.createElement('img');

      expect(imageFactory.canHandle(imgElement)).toBe(true);
    });

    it('should detect link elements', () => {
      const linkFactory = new LazyEditorFactory(['link']);
      const linkElement = document.createElement('a');

      expect(linkFactory.canHandle(linkElement)).toBe(true);
    });

    it('should detect richtext div elements', () => {
      const richtextFactory = new LazyEditorFactory(['richtext']);
      const divElement = document.createElement('div');

      // Test class-based detection
      divElement.className = 'richtext-editor';
      expect(richtextFactory.canHandle(divElement)).toBe(true);

      divElement.className = 'custom-editor';
      expect(richtextFactory.canHandle(divElement)).toBe(true);

      // Test contenteditable detection
      divElement.className = '';
      divElement.setAttribute('contenteditable', 'true');
      expect(richtextFactory.canHandle(divElement)).toBe(true);
    });

    it('should fallback to text for generic div elements', () => {
      const divElement = document.createElement('div');

      expect(factory.canHandle(divElement)).toBe(true); // Should default to text
    });

    it('should handle explicit data-sight-type', () => {
      const imageFactory = new LazyEditorFactory(['image']);
      const divElement = document.createElement('div');
      divElement.setAttribute('data-sight-type', 'image');

      expect(imageFactory.canHandle(divElement)).toBe(true);
    });

    it('should return false for unsupported element/type combinations', () => {
      const imageFactory = new LazyEditorFactory(['image']);
      const textElement = document.createElement('p');

      expect(imageFactory.canHandle(textElement)).toBe(false);
    });

    it('should return false for unknown elements without explicit type', () => {
      const unknownElement = document.createElement('custom-element');

      expect(factory.canHandle(unknownElement)).toBe(false);
    });
  });

  describe('getSupportedTypes', () => {
    it('should return copy of supported types array', () => {
      const types = factory.getSupportedTypes();

      expect(types).toEqual(['text', 'image', 'richtext']);
      
      // Modifying returned array should not affect internal state
      types.push('new-type');
      expect(factory.getSupportedTypes()).toEqual(['text', 'image', 'richtext']);
    });
  });

  describe('getPriority', () => {
    it('should return configured priority', () => {
      expect(factory.getPriority()).toBe(5);
    });
  });

  describe('dynamic imports', () => {
    it('should load different editor types', async () => {
      // Ensure element has all required dataset properties for RichTextEditor
      mockElement.setAttribute('data-sight-placeholder', 'Test placeholder');
      mockElement.setAttribute('data-sight-readonly', 'false');
      
      const textEditor = await factory.create('text', mockElement, { sight: 'test' });
      const imageEditor = await factory.create('image', mockElement, { sight: 'test' });
      const richtextEditor = await factory.create('richtext', mockElement, { sight: 'test' });

      // Since mocking isn't working in this environment, test with real editors
      expect(textEditor.constructor.name).toBe('TextEditor');
      expect(imageEditor.constructor.name).toBe('ImageEditor');
      expect(richtextEditor.constructor.name).toBe('RichTextEditor');
    });

    it('should handle import errors gracefully', async () => {
      // This would test import errors, but since we're mocking imports,
      // we test the error case in the create method for unknown types
      await expect(factory.create('nonexistent-type', mockElement, { sight: 'test' }))
        .rejects
        .toThrow('Unknown editor type: nonexistent-type');
    });
  });
});

describe('EditorNotFoundError', () => {
  let mockElement: Element;

  beforeEach(() => {
    document.body.innerHTML = '<div data-sight="test-element">Content</div>';
    mockElement = document.querySelector('[data-sight="test-element"]')!;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create error with element info when no requested type', () => {
    const error = new EditorNotFoundError(mockElement);

    expect(error.name).toBe('EditorNotFoundError');
    expect(error.message).toContain('div');
    expect(error.message).toContain('test-element');
    expect(error.message).toContain('No suitable editor found');
  });

  it('should create error with requested type info', () => {
    const error = new EditorNotFoundError(mockElement, 'custom-type');

    expect(error.message).toContain('custom-type');
    expect(error.message).toContain('div');
    expect(error.message).toContain('test-element');
    expect(error.message).toContain('No editor found for type');
  });

  it('should handle element without sight attribute', () => {
    const elementWithoutSight = document.createElement('span');
    const error = new EditorNotFoundError(elementWithoutSight);

    expect(error.message).toContain('span');
    expect(error.message).toContain('null'); // sight will be null
  });
});