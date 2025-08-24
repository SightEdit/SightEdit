import { Editor } from '../types';
import { EditorFactory } from './editor-factory';
import { EventBus } from './event-bus';

export interface EditorService {
  createEditor(type: string, element: Element): Promise<Editor>;
  destroyEditor(editor: Editor): Promise<void>;
  getActiveEditors(): readonly Editor[];
  getEditor(element: Element): Editor | null;
}

export class EditorServiceImpl implements EditorService {
  private readonly activeEditors = new WeakMap<Element, Editor>();
  private readonly editorInstances = new Set<Editor>();

  constructor(
    private readonly editorFactory: EditorFactory,
    private readonly eventBus: EventBus
  ) {}

  async createEditor(type: string, element: Element): Promise<Editor> {
    // Check if editor already exists for this element
    const existing = this.activeEditors.get(element);
    if (existing) {
      return existing;
    }

    try {
      // Create editor using factory
      const editor = await this.editorFactory.create(type, element);
      
      // Store references
      this.activeEditors.set(element, editor);
      this.editorInstances.add(editor);

      // Emit creation event
      this.eventBus.emit('editor:created', { editor, element });

      return editor;
    } catch (error) {
      this.eventBus.emit('error:occurred', {
        error: error as Error,
        context: `Failed to create editor of type "${type}"`
      });
      throw error;
    }
  }

  async destroyEditor(editor: Editor): Promise<void> {
    const element = editor.getElement();
    
    try {
      // Remove from collections first
      this.activeEditors.delete(element);
      this.editorInstances.delete(editor);

      // Destroy the editor
      await editor.destroy();

      // Emit destruction event
      this.eventBus.emit('editor:destroyed', { 
        editorId: editor.getId(),
        element 
      });
    } catch (error) {
      this.eventBus.emit('error:occurred', {
        error: error as Error,
        context: `Failed to destroy editor for element`
      });
      // Re-add to collections if destruction failed
      this.activeEditors.set(element, editor);
      this.editorInstances.add(editor);
      throw error;
    }
  }

  getActiveEditors(): readonly Editor[] {
    return Array.from(this.editorInstances);
  }

  getEditor(element: Element): Editor | null {
    return this.activeEditors.get(element) || null;
  }

  async destroyAllEditors(): Promise<void> {
    const editors = Array.from(this.editorInstances);
    const destroyPromises = editors.map(editor => 
      this.destroyEditor(editor).catch(error => {
        console.warn('Failed to destroy editor:', error);
      })
    );

    await Promise.all(destroyPromises);
  }
}