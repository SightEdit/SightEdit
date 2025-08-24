import { SightEditConfig, ElementType, SaveData } from './types';
import { ElementDetector } from './detector';
import { SightEditAPI } from './api';
import { EventEmitter } from './utils/event-emitter';

// Basic editors only
import { TextEditor } from './editors/text';
import { ImageEditor } from './editors/image';
import { LinkEditor } from './editors/link';
import { ColorEditor } from './editors/color';
import { DateEditor } from './editors/date';
import { NumberEditor } from './editors/number';
import { SelectEditor } from './editors/select';
import { JSONEditor } from './editors/json';

export * from './types';
export { ElementDetector } from './detector';
export { BaseEditor } from './editors/base';
export { SightEditAPI } from './api';

class SightEditCore extends EventEmitter {
  private static instance: SightEditCore | null = null;
  private config: SightEditConfig;
  private editors: Map<string, any> = new Map();
  private activeEditors: Map<HTMLElement, any> = new Map();
  private mode: 'view' | 'edit' = 'view';
  private api: SightEditAPI;
  private initialized = false;

  constructor(config: SightEditConfig) {
    super();
    this.config = config;
    this.api = new SightEditAPI(config.apiEndpoint || '/api/sightedit', config);
    this.registerBuiltInEditors();
  }

  static getInstance(config?: SightEditConfig): SightEditCore {
    if (!SightEditCore.instance && config) {
      SightEditCore.instance = new SightEditCore(config);
    }
    return SightEditCore.instance!;
  }

  private registerBuiltInEditors(): void {
    this.editors.set('text', TextEditor);
    this.editors.set('image', ImageEditor);
    this.editors.set('link', LinkEditor);
    this.editors.set('color', ColorEditor);
    this.editors.set('date', DateEditor);
    this.editors.set('number', NumberEditor);
    this.editors.set('select', SelectEditor);
    this.editors.set('json', JSONEditor);
  }

  toggleEditMode(): void {
    this.mode = this.mode === 'view' ? 'edit' : 'view';
    this.emit('modeChanged', this.mode);
    
    if (this.mode === 'edit') {
      this.scanDocument();
    } else {
      this.clearEditors();
    }
  }

  private scanDocument(): void {
    const elements = ElementDetector.scan();
    
    elements.forEach(detected => {
      const EditorClass = this.editors.get(detected.type);
      if (EditorClass && !this.activeEditors.has(detected.element)) {
        try {
          const editor = new EditorClass(detected.element, detected.schema, this.api);
          this.activeEditors.set(detected.element, editor);
          editor.render();
        } catch (error) {
          console.warn('Failed to create editor for element:', error);
        }
      }
    });
  }

  private clearEditors(): void {
    this.activeEditors.forEach(editor => {
      if (editor && typeof editor.destroy === 'function') {
        editor.destroy();
      }
    });
    this.activeEditors.clear();
  }

  isEditMode(): boolean {
    return this.mode === 'edit';
  }

  destroy(): void {
    this.clearEditors();
    SightEditCore.instance = null;
  }
}

// Global initialization
export function initializeSightEdit(config: SightEditConfig): SightEditCore {
  const instance = SightEditCore.getInstance(config);
  
  // Add keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      instance.toggleEditMode();
    }
  });

  return instance;
}

export { SightEditCore };
export default SightEditCore;