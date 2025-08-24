import { Editor } from '../types';

export interface EditorContext {
  element: Element;
  sight: string;
  type: string;
  config?: Record<string, any>;
  onSave?: (data: any) => Promise<void>;
  onChange?: (value: any, previousValue: any) => void;
  onDestroy?: () => void;
}

export interface EditorFactory {
  create(type: string, element: Element, context?: Partial<EditorContext>): Promise<Editor>;
  canHandle(element: Element): boolean;
  getPriority(): number;
  getSupportedTypes(): string[];
}

export interface EditorConstructor {
  new (context: EditorContext): Editor;
}

export class EditorRegistry {
  private factories = new Map<string, EditorFactory>();
  private typeFactories: EditorFactory[] = [];

  register(type: string, factory: EditorFactory): void {
    this.factories.set(type, factory);
    
    // Also add to type-based factories and sort by priority
    if (!this.typeFactories.includes(factory)) {
      this.typeFactories.push(factory);
      this.typeFactories.sort((a, b) => b.getPriority() - a.getPriority());
    }
  }

  unregister(type: string): void {
    const factory = this.factories.get(type);
    if (factory) {
      this.factories.delete(type);
      const index = this.typeFactories.indexOf(factory);
      if (index > -1) {
        this.typeFactories.splice(index, 1);
      }
    }
  }

  async createEditor(
    element: Element,
    context?: Partial<EditorContext>
  ): Promise<Editor> {
    const sight = element.getAttribute('data-sight');
    if (!sight) {
      throw new Error('Element must have data-sight attribute');
    }

    // Try explicit type first
    const explicitType = element.getAttribute('data-sight-type') || context?.type;
    if (explicitType) {
      const factory = this.factories.get(explicitType);
      if (factory) {
        return this.createWithFactory(factory, element, {
          sight,
          type: explicitType,
          ...context
        });
      }
    }

    // Try auto-detection based on element
    for (const factory of this.typeFactories) {
      if (factory.canHandle(element)) {
        const supportedTypes = factory.getSupportedTypes();
        const detectedType = supportedTypes[0]; // Use the first supported type
        
        return this.createWithFactory(factory, element, {
          sight,
          type: detectedType,
          ...context
        });
      }
    }

    throw new EditorNotFoundError(element, explicitType);
  }

  private async createWithFactory(
    factory: EditorFactory,
    element: Element,
    context: Partial<EditorContext> & { sight: string; type: string }
  ): Promise<Editor> {
    const fullContext: EditorContext = {
      element,
      sight: context.sight,
      type: context.type,
      config: context.config || {},
      onSave: context.onSave,
      onChange: context.onChange,
      onDestroy: context.onDestroy
    };

    return factory.create(context.type, element, fullContext);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  hasFactory(type: string): boolean {
    return this.factories.has(type);
  }
}

export class LazyEditorFactory implements EditorFactory {
  private editorCache = new Map<string, Promise<EditorConstructor>>();

  constructor(
    private supportedTypes: string[],
    private priority: number = 1
  ) {}

  async create(type: string, element: Element, context?: Partial<EditorContext>): Promise<Editor> {
    const EditorClass = await this.loadEditor(type);
    
    const fullContext: EditorContext = {
      element,
      sight: context?.sight || element.getAttribute('data-sight') || '',
      type,
      config: context?.config || {},
      onSave: context?.onSave,
      onChange: context?.onChange,
      onDestroy: context?.onDestroy
    };

    return new EditorClass(fullContext);
  }

  canHandle(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const className = element.className;
    const dataType = element.getAttribute('data-sight-type');

    // Basic element type detection
    switch (tagName) {
      case 'input':
      case 'textarea':
      case 'p':
      case 'span':
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return this.supportedTypes.includes('text');
      
      case 'img':
        return this.supportedTypes.includes('image');
      
      case 'a':
        return this.supportedTypes.includes('link');
      
      case 'div':
        // Check for rich text indicators
        if (className.includes('richtext') || 
            className.includes('editor') ||
            element.hasAttribute('contenteditable')) {
          return this.supportedTypes.includes('richtext');
        }
        return this.supportedTypes.includes('text');
    }

    // Check explicit type
    if (dataType && this.supportedTypes.includes(dataType)) {
      return true;
    }

    return false;
  }

  getPriority(): number {
    return this.priority;
  }

  getSupportedTypes(): string[] {
    return [...this.supportedTypes];
  }

  private async loadEditor(type: string): Promise<EditorConstructor> {
    if (this.editorCache.has(type)) {
      return this.editorCache.get(type)!;
    }

    const editorPromise = this.dynamicImport(type);
    this.editorCache.set(type, editorPromise);
    return editorPromise;
  }

  private async dynamicImport(type: string): Promise<EditorConstructor> {
    switch (type) {
      case 'text':
        return (await import('../editors/text')).TextEditor;
      case 'richtext':
        return (await import('../editors/richtext')).RichTextEditor;
      case 'image':
        return (await import('../editors/image')).ImageEditor;
      case 'link':
        return (await import('../editors/link')).LinkEditor;
      case 'color':
        return (await import('../editors/color')).ColorEditor;
      case 'date':
        return (await import('../editors/date')).DateEditor;
      case 'number':
        return (await import('../editors/number')).NumberEditor;
      case 'select':
        return (await import('../editors/select')).SelectEditor;
      case 'json':
        return (await import('../editors/json')).JSONEditor;
      case 'collection':
        return (await import('../editors/collection')).CollectionEditor;
      default:
        throw new Error(`Unknown editor type: ${type}`);
    }
  }
}

export class EditorNotFoundError extends Error {
  constructor(element: Element, requestedType?: string) {
    const tagName = element.tagName.toLowerCase();
    const sight = element.getAttribute('data-sight');
    const message = requestedType
      ? `No editor found for type "${requestedType}" (element: ${tagName}, sight: ${sight})`
      : `No suitable editor found for element ${tagName} (sight: ${sight})`;
    
    super(message);
    this.name = 'EditorNotFoundError';
  }
}