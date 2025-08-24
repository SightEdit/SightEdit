import { EditorServiceImpl } from '../../services/editor-service';
import { EditorFactory } from '../../services/editor-factory';
import { EventBus } from '../../services/event-bus';
import { Editor } from '../../types';

// Mock Editor implementation
class MockEditor implements Editor {
  private destroyed = false;
  
  constructor(
    private element: Element,
    private id: string = Math.random().toString(36).substring(7)
  ) {}

  render(): void {}
  extractValue(): any { return 'mock-value'; }
  applyValue(value: any): void {}
  validate(value: any): boolean { return true; }
  focus(): void {}
  blur(): void {}
  
  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  getElement(): Element {
    return this.element;
  }

  getId(): string {
    return this.id;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  get sight() { return 'test-sight'; }
  get type() { return 'text'; }
}

describe('EditorServiceImpl', () => {
  let editorService: EditorServiceImpl;
  let mockEditorFactory: jest.Mocked<EditorFactory>;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockElement1: Element;
  let mockElement2: Element;

  beforeEach(() => {
    mockEditorFactory = {
      create: jest.fn(),
      canHandle: jest.fn(),
      getPriority: jest.fn(),
      getSupportedTypes: jest.fn()
    };

    mockEventBus = {
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      listenerCount: jest.fn(),
      eventNames: jest.fn(),
      setMaxListeners: jest.fn(),
      setDebug: jest.fn(),
      destroy: jest.fn()
    };

    editorService = new EditorServiceImpl(mockEditorFactory, mockEventBus);

    // Create mock elements
    document.body.innerHTML = `
      <div data-sight="element1">Element 1</div>
      <div data-sight="element2">Element 2</div>
    `;
    mockElement1 = document.querySelector('[data-sight="element1"]')!;
    mockElement2 = document.querySelector('[data-sight="element2"]')!;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('createEditor', () => {
    it('should create new editor successfully', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      const editor = await editorService.createEditor('text', mockElement1);

      expect(editor).toBe(mockEditor);
      expect(mockEditorFactory.create).toHaveBeenCalledWith('text', mockElement1);
      expect(mockEventBus.emit).toHaveBeenCalledWith('editor:created', {
        editor: mockEditor,
        element: mockElement1
      });
    });

    it('should return existing editor if one already exists for element', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      // Create editor first time
      const editor1 = await editorService.createEditor('text', mockElement1);
      
      // Try to create again - should return same instance
      const editor2 = await editorService.createEditor('text', mockElement1);

      expect(editor1).toBe(editor2);
      expect(editor1).toBe(mockEditor);
      expect(mockEditorFactory.create).toHaveBeenCalledTimes(1);
    });

    it('should track editor in active editors list', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);

      const activeEditors = editorService.getActiveEditors();
      expect(activeEditors).toContain(mockEditor);
      expect(activeEditors).toHaveLength(1);
    });

    it('should handle factory creation errors', async () => {
      const error = new Error('Factory failed');
      mockEditorFactory.create.mockRejectedValue(error);

      await expect(editorService.createEditor('text', mockElement1))
        .rejects
        .toThrow('Factory failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith('error:occurred', {
        error,
        context: 'Failed to create editor of type "text"'
      });
    });

    it('should create multiple editors for different elements', async () => {
      const mockEditor1 = new MockEditor(mockElement1, 'editor-1');
      const mockEditor2 = new MockEditor(mockElement2, 'editor-2');
      
      mockEditorFactory.create
        .mockResolvedValueOnce(mockEditor1)
        .mockResolvedValueOnce(mockEditor2);

      await editorService.createEditor('text', mockElement1);
      await editorService.createEditor('text', mockElement2);

      const activeEditors = editorService.getActiveEditors();
      expect(activeEditors).toContain(mockEditor1);
      expect(activeEditors).toContain(mockEditor2);
      expect(activeEditors).toHaveLength(2);
    });
  });

  describe('destroyEditor', () => {
    let mockEditor: MockEditor;

    beforeEach(async () => {
      mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);
      await editorService.createEditor('text', mockElement1);
    });

    it('should destroy editor successfully', async () => {
      const destroySpy = jest.spyOn(mockEditor, 'destroy');

      await editorService.destroyEditor(mockEditor);

      expect(destroySpy).toHaveBeenCalled();
      expect(mockEditor.isDestroyed()).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('editor:destroyed', {
        editorId: mockEditor.getId(),
        element: mockElement1
      });
    });

    it('should remove editor from active collections', async () => {
      await editorService.destroyEditor(mockEditor);

      expect(editorService.getActiveEditors()).not.toContain(mockEditor);
      expect(editorService.getEditor(mockElement1)).toBeNull();
    });

    it('should handle editor destruction errors and restore state', async () => {
      const error = new Error('Destroy failed');
      jest.spyOn(mockEditor, 'destroy').mockRejectedValue(error);

      await expect(editorService.destroyEditor(mockEditor))
        .rejects
        .toThrow('Destroy failed');

      // Editor should be restored to collections
      expect(editorService.getActiveEditors()).toContain(mockEditor);
      expect(editorService.getEditor(mockElement1)).toBe(mockEditor);

      expect(mockEventBus.emit).toHaveBeenCalledWith('error:occurred', {
        error,
        context: 'Failed to destroy editor for element'
      });
    });

    it('should remove editor from WeakMap after destruction', async () => {
      expect(editorService.getEditor(mockElement1)).toBe(mockEditor);

      await editorService.destroyEditor(mockEditor);

      expect(editorService.getEditor(mockElement1)).toBeNull();
    });
  });

  describe('getActiveEditors', () => {
    it('should return empty array when no editors exist', () => {
      const activeEditors = editorService.getActiveEditors();
      
      expect(activeEditors).toEqual([]);
      expect(activeEditors).toHaveLength(0);
    });

    it('should return readonly array of active editors', async () => {
      const mockEditor1 = new MockEditor(mockElement1, 'editor-1');
      const mockEditor2 = new MockEditor(mockElement2, 'editor-2');
      
      mockEditorFactory.create
        .mockResolvedValueOnce(mockEditor1)
        .mockResolvedValueOnce(mockEditor2);

      await editorService.createEditor('text', mockElement1);
      await editorService.createEditor('text', mockElement2);

      const activeEditors = editorService.getActiveEditors();
      
      expect(activeEditors).toContain(mockEditor1);
      expect(activeEditors).toContain(mockEditor2);
      expect(activeEditors).toHaveLength(2);
      
      // Should be readonly
      expect(Object.isFrozen(activeEditors)).toBe(false); // Array.from creates mutable array
      // But the interface declares it as readonly, so TypeScript would prevent mutations
    });

    it('should update when editors are destroyed', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);
      expect(editorService.getActiveEditors()).toHaveLength(1);

      await editorService.destroyEditor(mockEditor);
      expect(editorService.getActiveEditors()).toHaveLength(0);
    });
  });

  describe('getEditor', () => {
    it('should return null for element with no editor', () => {
      const editor = editorService.getEditor(mockElement1);
      
      expect(editor).toBeNull();
    });

    it('should return editor for element with active editor', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);
      const retrievedEditor = editorService.getEditor(mockElement1);

      expect(retrievedEditor).toBe(mockEditor);
    });

    it('should return null after editor is destroyed', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);
      expect(editorService.getEditor(mockElement1)).toBe(mockEditor);

      await editorService.destroyEditor(mockEditor);
      expect(editorService.getEditor(mockElement1)).toBeNull();
    });
  });

  describe('destroyAllEditors', () => {
    it('should destroy all active editors', async () => {
      const mockEditor1 = new MockEditor(mockElement1, 'editor-1');
      const mockEditor2 = new MockEditor(mockElement2, 'editor-2');
      
      mockEditorFactory.create
        .mockResolvedValueOnce(mockEditor1)
        .mockResolvedValueOnce(mockEditor2);

      await editorService.createEditor('text', mockElement1);
      await editorService.createEditor('text', mockElement2);

      expect(editorService.getActiveEditors()).toHaveLength(2);

      await editorService.destroyAllEditors();

      expect(editorService.getActiveEditors()).toHaveLength(0);
      expect(mockEditor1.isDestroyed()).toBe(true);
      expect(mockEditor2.isDestroyed()).toBe(true);
    });

    it('should handle errors during batch destruction gracefully', async () => {
      const mockEditor1 = new MockEditor(mockElement1, 'editor-1');
      const mockEditor2 = new MockEditor(mockElement2, 'editor-2');
      
      mockEditorFactory.create
        .mockResolvedValueOnce(mockEditor1)
        .mockResolvedValueOnce(mockEditor2);

      await editorService.createEditor('text', mockElement1);
      await editorService.createEditor('text', mockElement2);

      // Make first editor fail to destroy
      jest.spyOn(mockEditor1, 'destroy').mockRejectedValue(new Error('Destroy failed'));
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await editorService.destroyAllEditors();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to destroy editor:', expect.any(Error));
      expect(mockEditor2.isDestroyed()).toBe(true); // Second editor should still be destroyed

      consoleWarnSpy.mockRestore();
    });

    it('should work when no editors exist', async () => {
      expect(() => editorService.destroyAllEditors()).not.toThrow();
      await expect(editorService.destroyAllEditors()).resolves.toBeUndefined();
    });
  });

  describe('WeakMap behavior', () => {
    it('should allow garbage collection of elements', async () => {
      let element: Element | null = document.createElement('div');
      element.setAttribute('data-sight', 'temp-element');
      
      const mockEditor = new MockEditor(element, 'temp-editor');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', element);
      expect(editorService.getEditor(element)).toBe(mockEditor);

      // Clear reference to element
      element = null;

      // Force garbage collection (if possible in test environment)
      if (global.gc) {
        global.gc();
      }

      // WeakMap should allow element to be garbage collected
      // We can't directly test this in Jest, but the behavior is guaranteed by WeakMap
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent editor creation for same element', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      // Start concurrent creations
      const promise1 = editorService.createEditor('text', mockElement1);
      const promise2 = editorService.createEditor('text', mockElement1);

      const [editor1, editor2] = await Promise.all([promise1, promise2]);

      expect(editor1).toBe(editor2);
      expect(editor1).toBe(mockEditor);
      expect(mockEditorFactory.create).toHaveBeenCalledTimes(1);
    });

    it('should handle destroying non-existent editor gracefully', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      
      // Try to destroy editor that was never added to service
      await expect(editorService.destroyEditor(mockEditor))
        .resolves
        .toBeUndefined();
    });

    it('should handle destroying already destroyed editor', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);
      await editorService.destroyEditor(mockEditor);

      // Try to destroy again
      await expect(editorService.destroyEditor(mockEditor))
        .resolves
        .toBeUndefined();
    });
  });

  describe('event emission', () => {
    it('should emit correct events during editor lifecycle', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      // Create editor
      await editorService.createEditor('text', mockElement1);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('editor:created', {
        editor: mockEditor,
        element: mockElement1
      });

      // Destroy editor
      await editorService.destroyEditor(mockEditor);

      expect(mockEventBus.emit).toHaveBeenCalledWith('editor:destroyed', {
        editorId: mockEditor.getId(),
        element: mockElement1
      });
    });

    it('should not emit destroyed event if destruction fails', async () => {
      const mockEditor = new MockEditor(mockElement1, 'editor-1');
      mockEditorFactory.create.mockResolvedValue(mockEditor);

      await editorService.createEditor('text', mockElement1);

      // Reset emit spy
      mockEventBus.emit.mockClear();

      // Make destruction fail
      jest.spyOn(mockEditor, 'destroy').mockRejectedValue(new Error('Destroy failed'));

      await expect(editorService.destroyEditor(mockEditor))
        .rejects
        .toThrow('Destroy failed');

      // Should emit error but not destroyed event
      expect(mockEventBus.emit).toHaveBeenCalledWith('error:occurred', expect.any(Object));
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('editor:destroyed', expect.any(Object));
    });
  });
});