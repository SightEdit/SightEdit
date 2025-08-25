// Core SightEdit - Minimal Essential Build
import { 
  SightEditConfig, 
  Editor, 
  EditorConstructor, 
  SaveData, 
  SaveResponse,
  ElementType,
  ElementSchema,
  Plugin
} from './types';
import { ElementDetector, DetectedElement } from './detector';
import { SightEditAPI } from './api';
import { EventEmitter } from './utils/event-emitter';
import { changeTracker } from './utils/change-tracker';
import { editToolbar } from './ui/edit-toolbar';

// Export all types
export * from './types';
export { ElementDetector } from './detector';
export type { DetectedElement } from './detector';
export { SightEditAPI } from './api';
export { EventEmitter } from './utils/event-emitter';
export { BaseEditor } from './editors/base';

// Export error handling utilities
export { 
  ErrorHandler, 
  ErrorType, 
  SightEditError,
  ValidationError,
  NetworkError,
  AuthenticationError,
  AuthorizationError,
  SecurityError,
  TimeoutError,
  RateLimitError,
  ExternalServiceError,
  ConfigurationError,
  DataCorruptionError,
  CircuitBreaker,
  UserErrorMessages
} from './utils/error-handler';

// Export validation utilities
export { ValidationEngine } from './utils/validation-engine';
export type { ValidationRule, ValidationSchema } from './utils/validation-engine';

// Editor imports - Using enhanced modal versions
import { BaseEditor } from './editors/base';
import { TextEditor } from './editors/text';
import { ImageModalEditor } from './editors/image-modal';
import { RichTextModalEditor } from './editors/richtext-modal';
import { LinkEditor } from './editors/link';
import { ColorModalEditor } from './editors/color-modal';
import { DateModalEditor } from './editors/date-modal';
import { NumberModalEditor } from './editors/number-modal';
import { SelectModalEditor } from './editors/select-modal';
import { FileModalEditor } from './editors/file-modal';
import { JSONModalEditor } from './editors/json-modal';
import { CollectionModalEditor } from './editors/collection-modal';

/**
 * Core SightEdit class - simplified version focusing on essential functionality
 */
class SightEditCore extends EventEmitter {
  private static instance: SightEditCore;
  private config: SightEditConfig;
  private editors: Map<string, EditorConstructor> = new Map();
  private activeEditors: Map<HTMLElement, Editor> = new Map();
  private mode: 'view' | 'edit' = 'view';
  private api: SightEditAPI;
  private observer: MutationObserver | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private initialized = false;

  static init(config: SightEditConfig): SightEditCore {
    if (!this.instance) {
      this.instance = new SightEditCore(config);
    }
    return this.instance;
  }

  static getInstance(config?: SightEditConfig): SightEditCore | null {
    if (!this.instance && config) {
      return this.init(config);
    }
    return this.instance || null;
  }

  private constructor(config: SightEditConfig) {
    super();
    this.config = {
      editModeKey: 'e',
      mode: 'production',
      debug: false,
      ...config
    };
    
    try {
      this.api = new SightEditAPI(this.config);
      this.initialize();
    } catch (error) {
      console.error('Failed to initialize SightEditCore:', error);
      throw error;
    }
  }


  private registerBuiltInEditors(): void {
    if (this.config.debug) {
      console.log('[SightEdit] Registering enhanced modal editors...');
    }
    
    // Basic editors - using modal versions where available
    this.registerEditor('text', TextEditor);
    this.registerEditor('image', ImageModalEditor);
    this.registerEditor('richtext', RichTextModalEditor);
    
    // Input editors - all using modal versions
    this.registerEditor('link', LinkEditor);
    this.registerEditor('color', ColorModalEditor);
    this.registerEditor('date', DateModalEditor);
    this.registerEditor('number', NumberModalEditor);
    this.registerEditor('select', SelectModalEditor);
    this.registerEditor('file', FileModalEditor);
    
    // Advanced editors - using modal versions
    this.registerEditor('json', JSONModalEditor);
    this.registerEditor('collection', CollectionModalEditor);
    
    if (this.config.debug) {
      console.log('[SightEdit] Registered editors:', Array.from(this.editors.keys()));
    }
  }

  private setupEventListeners(): void {
    const keydownHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === this.config.editModeKey) {
        e.preventDefault();
        this.toggleEditMode();
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.mode === 'edit') {
        e.preventDefault();
        this.saveAll();
      }
    };
    
    document.addEventListener('keydown', keydownHandler);
  }

  private setupMutationObserver(): void {
    // Disable MutationObserver in demo mode to prevent infinite loops
    if (this.config.mode === 'development' || this.config.endpoint?.includes('/api/test')) {
      if (this.config.debug) {
        console.log('[SightEdit] MutationObserver disabled in demo mode');
      }
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      let hasRelevantChanges = false;
      const addedNodes = new Set<Node>();
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          // Only scan if it's not a SightEdit internal element
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            if (!element.id?.startsWith('sight-edit-') && 
                !element.className?.includes('sight-') &&
                !element.closest('[id^="sight-edit-"]')) {
              addedNodes.add(node);
              hasRelevantChanges = true;
            }
          }
        });
      });
      
      // Only scan if there are relevant changes
      if (hasRelevantChanges) {
        // Debounce the scan to prevent excessive calls
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
        }
        
        this.scanTimeout = setTimeout(() => {
          addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanElement(node as HTMLElement);
            }
          });
        }, 100); // 100ms debounce
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private scanDocument(): void {
    this.scanElement(document.body);
  }

  private async scanElement(root: HTMLElement): Promise<void> {
    try {
      const elements = ElementDetector.scan(root);
      
      if (this.config.debug && elements.length > 0) {
        console.log('[SightEdit] Scanned elements:', elements.length, 'Mode:', this.mode);
        elements.forEach(el => {
          console.log('[SightEdit] Found element:', {
            sight: el.sight,
            type: el.type,
            element: el.element
          });
        });
      }
      
      for (const detected of elements) {
        if (this.mode === 'edit') {
          if (this.config.debug) {
            console.log('[SightEdit] Making editable in edit mode:', detected.sight);
          }
          await this.makeEditable(detected.element, detected).catch(error => {
            console.warn('Failed to make element editable:', error);
          });
        }
        
        detected.element.dataset.sightEditReady = 'true';
      }
    } catch (error) {
      console.error('Failed to scan element:', error);
    }
  }

  private async makeEditable(element: HTMLElement, detected: DetectedElement): Promise<void> {
    try {
      if (this.config.debug) {
        console.log('[SightEdit] Making element editable:', {
          sight: detected.sight,
          type: detected.type,
          element: element
        });
      }
      
      const EditorClass = this.editors.get(detected.type);
      if (!EditorClass) {
        console.warn(`No editor registered for type: ${detected.type}`);
        return;
      }

      const editorConfig: any = {
        mode: detected.mode || 'inline',
        schema: detected.schema || {},
        theme: this.config.theme,
        locale: this.config.locale || 'en',
        debug: this.config.debug || false,
        sight: detected.sight || ''
      };

      let editor: Editor;
      
      // Try the EditorContext signature first, then fall back to traditional
      try {
        const context = {
          element: element,
          sight: detected.sight,
          type: detected.type,
          config: editorConfig
        };
        editor = new EditorClass(context as any);
      } catch (contextError) {
        // Fallback to traditional constructor
        try {
          editor = new EditorClass(element, editorConfig);
        } catch (fallbackError) {
          console.error('Failed to create editor:', fallbackError);
          return;
        }
      }

    // Instead of saving immediately, track changes locally
    editor.onSave = async (value: any) => {
      try {
        // Get original value from editor's initial state
        const originalValue = (editor as any).originalValue !== undefined ? (editor as any).originalValue : (editor.extractValue ? editor.extractValue() : '');
        
        // Track the change locally
        changeTracker.track(
          detected.sight || '',
          value,
          originalValue,
          detected.type || 'text',
          element
        );
        
        // Update UI to show change count
        editToolbar.updateCount(changeTracker.getChangeCount());
        
        // Apply value to element for visual feedback
        if (editor.applyValue) {
          editor.applyValue(value);
        }
        
        if (this.config.debug) {
          console.log('[SightEdit] Change tracked:', {
            sight: detected.sight,
            value,
            pending: changeTracker.getChangeCount()
          });
        }
        
        // Emit change event
        this.emit('change', {
          sight: detected.sight,
          value,
          pendingChanges: changeTracker.getChangeCount()
        });
        
        if (this.config.onChange) {
          this.config.onChange({
            sight: detected.sight,
            value,
            pendingChanges: changeTracker.getChangeCount()
          });
        }
      } catch (error) {
        console.error('Error tracking change:', error);
      }
    };

      if (this.config.debug) {
        console.log('[SightEdit] Calling editor.render() for:', detected.sight);
      }
      
      editor.render();
      this.activeEditors.set(element, editor);
      
      if (this.config.debug) {
        console.log('[SightEdit] Editor registered, total active editors:', this.activeEditors.size);
      }
    } catch (error) {
      console.error('Failed to make element editable:', error);
    }
  }

  enterEditMode(): void {
    if (this.mode === 'edit') return;
    
    this.mode = 'edit';
    document.body.dataset.sightEditMode = 'edit';
    
    if (this.config.debug) {
      console.log('[SightEdit] Entering edit mode...');
    }
    
    // Load any persisted changes
    changeTracker.load();
    
    // Show edit toolbar
    editToolbar.show(changeTracker.getChangeCount());
    editToolbar.onSave(() => this.saveAllChanges());
    editToolbar.onDiscard(() => this.discardAllChanges());
    
    // Clear the ready flag so elements can be re-scanned for edit mode
    const elements = document.querySelectorAll('[data-sight-edit-ready="true"]');
    elements.forEach(el => {
      delete (el as HTMLElement).dataset.sightEditReady;
    });
    
    this.scanDocument();
    this.emit('editModeEntered');
    this.emit('modeChange', 'edit');
    
    if (this.config.debug) {
      console.log('[SightEdit] Edit mode entered, active editors:', this.activeEditors.size);
    }
  }

  exitEditMode(): void {
    if (this.mode === 'view') return;
    
    // Check for unsaved changes
    if (changeTracker.hasChanges()) {
      const confirmExit = confirm(`You have ${changeTracker.getChangeCount()} unsaved changes. Do you want to discard them?`);
      if (!confirmExit) {
        return; // Don't exit if user cancels
      }
      // Discard changes
      changeTracker.discardAll();
    }
    
    this.doExitEditMode();
  }
  
  private doExitEditMode(): void {
    this.mode = 'view';
    document.body.dataset.sightEditMode = 'view';
    
    // Hide toolbar
    editToolbar.destroy();
    
    // Clean up active editors
    this.activeEditors.forEach((editor) => {
      try {
        editor.destroy();
      } catch (error) {
        console.warn('Error destroying editor:', error);
      }
    });
    
    this.activeEditors.clear();
    
    // Clear ready flags so elements can be re-scanned next time
    const elements = document.querySelectorAll('[data-sight-edit-ready="true"]');
    elements.forEach(el => {
      delete (el as HTMLElement).dataset.sightEditReady;
    });
    
    this.emit('editModeExited');
    this.emit('modeChange', 'view');
    
    if (this.config.debug) {
      console.log('[SightEdit] Edit mode exited');
    }
  }

  toggleEditMode(): void {
    if (this.mode === 'edit') {
      this.exitEditMode();
    } else {
      this.enterEditMode();
    }
  }

  isEditMode(): boolean {
    return this.mode === 'edit';
  }

  async save(data: Partial<SaveData>): Promise<SaveResponse> {
    const saveData: SaveData = {
      sight: data.sight!,
      value: data.value,
      type: data.type || 'text' as ElementType,
      id: data.id,
      context: data.context,
      timestamp: Date.now()
    };

    try {
      this.emit('beforeSave', saveData);
      
      const response = await this.api.save(saveData);
      
      this.emit('afterSave', response);
      
      if (this.config.onSave) {
        this.config.onSave(saveData);
      }
      
      return response;
    } catch (error) {
      console.error('Save operation failed:', error);
      
      this.emit('saveError', error);
      
      if (this.config.onError) {
        this.config.onError(error as Error);
      }
      
      throw error;
    }
  }

  registerEditor(type: string, editor: EditorConstructor): void {
    this.editors.set(type, editor);
    
    if (this.config.debug) {
      console.log(`[SightEdit] Editor registered: ${type}, total editors: ${this.editors.size}`);
    }
  }

  getActiveEditors(): Map<HTMLElement, Editor> {
    return this.activeEditors;
  }

  createEditor(element: HTMLElement, type: ElementType | string, config?: any): Editor | null {
    const editorType = typeof type === 'string' ? type : type as string;
    const EditorClass = this.editors.get(editorType);
    if (!EditorClass) {
      console.warn(`No editor registered for type: ${editorType}`);
      return null;
    }

    const editor = new EditorClass(element, config);
    this.activeEditors.set(element, editor);
    return editor;
  }

  setEditMode(mode: 'view' | 'edit'): void {
    if (mode === 'edit') {
      this.enterEditMode();
    } else {
      this.exitEditMode();
    }
  }

  async batch(operations: any[]): Promise<any> {
    try {
      this.emit('beforeBatch', operations);
      
      const results = [];
      for (const operation of operations) {
        try {
          const result = await this.save(operation.data || operation);
          results.push({ success: true, data: result });
        } catch (error) {
          results.push({ success: false, error: (error as Error).message });
        }
      }
      
      const batchResult = { success: true, results };
      this.emit('afterBatch', batchResult);
      return batchResult;
    } catch (error) {
      this.emit('batchError', error);
      throw error;
    }
  }

  initialize(): void {
    // Make the private initialize method public
    if (this.initialized) return;
    
    try {
      this.registerBuiltInEditors();
      this.setupEventListeners();
      this.loadPlugins();
      this.scanDocument();
      this.setupMutationObserver();
      
      this.initialized = true;
      
      if (this.config.debug) {
        console.log('SightEdit initialized successfully', {
          config: this.config,
          editorsCount: this.editors.size,
          mode: this.mode
        });
      }
    } catch (error) {
      console.error('Failed during initialization:', error);
      throw error;
    }
  }

  private loadPlugins(): void {
    if (!this.config.plugins) return;
    
    for (const plugin of this.config.plugins) {
      this.registerPlugin(plugin);
    }
  }

  registerPlugin(plugin: any): void {
    try {
      if (plugin.init && typeof plugin.init === 'function') {
        plugin.init(this);
      }
      
      if (plugin.editors) {
        Object.entries(plugin.editors).forEach(([type, EditorClass]) => {
          this.registerEditor(type, EditorClass as any);
        });
      }
      
      if (this.config.debug) {
        console.log(`Plugin loaded: ${plugin.name} v${plugin.version}`);
      }
    } catch (error) {
      console.error(`Failed to load plugin: ${plugin.name}`, error);
    }
  }

  refresh(): void {
    this.scanDocument();
  }

  destroy(): void {
    this.exitEditMode();
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Clean up document body attributes
    delete document.body.dataset.sightEditMode;
    
    this.removeAllListeners();
    this.initialized = false;
    SightEditCore.instance = null as any;
  }

  async saveAllChanges(): Promise<void> {
    try {
      const changes = changeTracker.getChanges();
      
      if (changes.length === 0) {
        console.log('No changes to save');
        return;
      }
      
      if (this.config.debug) {
        console.log(`[SightEdit] Saving ${changes.length} changes...`);
      }
      
      // Batch save all changes
      const operations = changes.map(change => ({
        data: {
          sight: change.sight,
          value: change.value,
          type: change.type,
          timestamp: change.timestamp
        }
      }));
      
      try {
        await this.batch(operations);
        
        // Clear tracked changes after successful save
        changeTracker.clearAll();
        editToolbar.updateCount(0);
        
        this.emit('batchSaved', changes.length);
        
        if (this.config.debug) {
          console.log(`[SightEdit] Successfully saved ${changes.length} changes`);
        }
      } catch (error) {
        console.error('Batch save failed:', error);
        if (this.config.onError) {
          this.config.onError(error as Error);
        }
      }
    } catch (error) {
      console.error('Save all operation failed:', error);
    }
  }
  
  async discardAllChanges(): Promise<void> {
    if (!changeTracker.hasChanges()) return;
    
    const confirmDiscard = confirm(`Are you sure you want to discard ${changeTracker.getChangeCount()} changes?`);
    if (!confirmDiscard) return;
    
    // Restore original values
    changeTracker.discardAll();
    editToolbar.updateCount(0);
    
    // Re-scan to refresh editors
    this.scanDocument();
    
    this.emit('changesDiscarded');
    
    if (this.config.debug) {
      console.log('[SightEdit] All changes discarded');
    }
  }
  
  // Keep old saveAll for compatibility but redirect to new method
  async saveAll(): Promise<void> {
    return this.saveAllChanges();
  }
}

// Create the main SightEdit interface
const SightEdit = {
  init: (config: SightEditConfig) => SightEditCore.init(config),
  getInstance: () => SightEditCore.getInstance(),
  SightEditCore
};

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).SightEdit = SightEdit;
}

// For IIFE builds, return the SightEdit object
export default SightEdit;
export { SightEdit, SightEditCore };