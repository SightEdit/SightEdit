import { MarkdownPlugin } from '../index';
import { MarkdownEditor } from '../editor';

describe('MarkdownPlugin', () => {
  let plugin: MarkdownPlugin;
  let mockSightEdit: any;

  beforeEach(() => {
    plugin = new MarkdownPlugin({
      preview: true,
      toolbar: true,
      theme: 'light'
    });

    mockSightEdit = {
      registerEditor: jest.fn(),
      registerComponent: jest.fn(),
      registerToolbarAction: jest.fn(),
      on: jest.fn()
    };
  });

  describe('initialization', () => {
    it('should have correct name and version', () => {
      expect(plugin.name).toBe('markdown');
      expect(plugin.version).toBe('1.0.0');
    });

    it('should register markdown editor', () => {
      plugin.initialize(mockSightEdit);
      
      expect(mockSightEdit.registerEditor).toHaveBeenCalledWith(
        'markdown',
        MarkdownEditor,
        expect.objectContaining({
          preview: true,
          toolbar: true,
          theme: 'light'
        })
      );
    });

    it('should register preview component when enabled', () => {
      plugin.initialize(mockSightEdit);
      
      expect(mockSightEdit.registerComponent).toHaveBeenCalledWith(
        'markdown-preview',
        expect.any(Function)
      );
    });

    it('should not register preview component when disabled', () => {
      plugin = new MarkdownPlugin({ preview: false });
      plugin.initialize(mockSightEdit);
      
      expect(mockSightEdit.registerComponent).not.toHaveBeenCalled();
    });

    it('should register toolbar actions when enabled', () => {
      plugin.initialize(mockSightEdit);
      
      expect(mockSightEdit.registerToolbarAction).toHaveBeenCalled();
      const calls = mockSightEdit.registerToolbarAction.mock.calls;
      
      const actionIds = calls.map((call: any[]) => call[0].id);
      expect(actionIds).toContain('markdown-bold');
      expect(actionIds).toContain('markdown-italic');
      expect(actionIds).toContain('markdown-heading');
      expect(actionIds).toContain('markdown-link');
    });

    it('should register element detection handler', () => {
      plugin.initialize(mockSightEdit);
      
      expect(mockSightEdit.on).toHaveBeenCalledWith(
        'detectElement',
        expect.any(Function)
      );
    });
  });

  describe('markdown detection', () => {
    let detectHandler: (element: HTMLElement) => void;

    beforeEach(() => {
      plugin.initialize(mockSightEdit);
      detectHandler = mockSightEdit.on.mock.calls[0][1];
    });

    it('should detect markdown content in auto elements', () => {
      const element = document.createElement('div');
      element.dataset.sight = 'auto';
      element.textContent = '# This is a heading\n\nWith **bold** text.';
      
      detectHandler(element);
      
      expect(element.dataset.sight).toBe('markdown');
    });

    it('should detect elements with markdown class', () => {
      const element = document.createElement('div');
      element.classList.add('markdown');
      element.textContent = 'Regular text';
      
      detectHandler(element);
      
      expect(element.dataset.sight).toBe('markdown');
    });

    it('should not change non-auto elements', () => {
      const element = document.createElement('div');
      element.dataset.sight = 'text';
      element.textContent = '# This is a heading';
      
      detectHandler(element);
      
      expect(element.dataset.sight).toBe('text');
    });

    test.each([
      ['# Heading', true],
      ['## Subheading', true],
      ['**bold text**', true],
      ['*italic text*', true],
      ['[link](url)', true],
      ['![image](url)', true],
      ['- list item', true],
      ['> quote', true],
      ['```code```', true],
      ['`inline code`', true],
      ['Regular text', false],
      ['Email: test@example.com', false]
    ])('should detect "%s" as markdown: %s', (content, expected) => {
      const element = document.createElement('div');
      element.dataset.sight = 'auto';
      element.textContent = content;
      
      detectHandler(element);
      
      if (expected) {
        expect(element.dataset.sight).toBe('markdown');
      } else {
        expect(element.dataset.sight).toBe('auto');
      }
    });
  });

  describe('toolbar actions', () => {
    it('should execute bold action on editor', () => {
      plugin.initialize(mockSightEdit);
      
      const boldAction = mockSightEdit.registerToolbarAction.mock.calls
        .find((call: any[]) => call[0].id === 'markdown-bold')[0];
      
      const mockEditor = {
        toggleBold: jest.fn()
      };
      
      boldAction.action(mockEditor);
      
      expect(mockEditor.toggleBold).toHaveBeenCalled();
    });

    it('should have correct keyboard shortcuts', () => {
      plugin.initialize(mockSightEdit);
      
      const actions = mockSightEdit.registerToolbarAction.mock.calls
        .map((call: any[]) => call[0]);
      
      const shortcuts = actions.reduce((acc: any, action: any) => {
        acc[action.id] = action.shortcut;
        return acc;
      }, {});
      
      expect(shortcuts['markdown-bold']).toBe('Ctrl+B');
      expect(shortcuts['markdown-italic']).toBe('Ctrl+I');
      expect(shortcuts['markdown-heading']).toBe('Ctrl+H');
      expect(shortcuts['markdown-link']).toBe('Ctrl+K');
    });
  });

  describe('destroy', () => {
    it('should clean up without errors', () => {
      plugin.initialize(mockSightEdit);
      
      expect(() => plugin.destroy()).not.toThrow();
    });
  });
});