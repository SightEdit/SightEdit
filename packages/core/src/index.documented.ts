/**
 * @module @sightedit/core
 * @description Universal Visual Editing System - Core Library
 * @author SightEdit Contributors
 * @license MIT
 */

import { 
  SightEditConfig, 
  Editor, 
  EditorConstructor, 
  Plugin, 
  SaveData, 
  SaveResponse,
  BatchOperation,
  BatchResponse,
  ElementType 
} from './types';
import { ElementDetector, DetectedElement } from './detector';
import { SightEditAPI } from './api';
import { EditModeUI } from './ui/edit-mode';
import { EventEmitter } from './utils/event-emitter';
import { 
  debounce, 
  throttle, 
  ViewportObserver, 
  EventDelegator, 
  DataCache, 
  PerformanceMonitor 
} from './utils/performance';
import AccessibilityManager, { addScreenReaderStyles, A11yConfig } from './utils/accessibility';
import { TextEditor } from './editors/text';
import { ImageEditor } from './editors/image';
import { RichTextEditor } from './editors/richtext';
import { LinkEditor } from './editors/link';
import { ColorEditor } from './editors/color';
import { CollectionEditor } from './editors/collection';
import { DateEditor } from './editors/date';
import { NumberEditor } from './editors/number';
import { SelectEditor } from './editors/select';
import { JSONEditor } from './editors/json';

export * from './types';
export { BaseEditor } from './editors/base';

/**
 * Core class for SightEdit visual editing system.
 * Manages the lifecycle of visual editing including editor registration,
 * element detection, API communication, and UI management.
 * 
 * @class SightEditCore
 * @extends EventEmitter
 * @example
 * ```javascript
 * // Initialize SightEdit with basic configuration
 * const sightEdit = SightEdit.init({
 *   apiUrl: '/api/sightedit',
 *   debug: true
 * });
 * 
 * // Listen for events
 * sightEdit.on('editModeEntered', () => {
 *   console.log('Edit mode activated');
 * });
 * 
 * // Toggle edit mode programmatically
 * sightEdit.toggleEditMode();
 * ```
 */
class SightEditCore extends EventEmitter {
  private static instance: SightEditCore;
  private config: SightEditConfig;
  private editors: Map<string, EditorConstructor> = new Map();
  private activeEditors: Map<HTMLElement, Editor> = new Map();
  private mode: 'view' | 'edit' = 'view';
  private api: SightEditAPI;
  private ui: EditModeUI;
  private observer: MutationObserver | null = null;
  private initialized = false;
  
  // Performance optimizations
  private viewportObserver!: ViewportObserver;
  private eventDelegator!: EventDelegator;
  private cache!: DataCache<any>;
  private performanceMonitor!: PerformanceMonitor;
  private debouncedDetection!: () => void;
  private throttledSave!: (data: SaveData) => void;
  
  // Accessibility
  private a11y: AccessibilityManager;

  /**
   * Initializes a singleton instance of SightEdit.
   * If an instance already exists, returns the existing instance.
   * 
   * @static
   * @param {SightEditConfig} config - Configuration object for SightEdit
   * @param {string} [config.apiUrl] - Backend API URL for saving content
   * @param {boolean} [config.debug=false] - Enable debug logging
   * @param {string} [config.editModeKey='e'] - Keyboard key to toggle edit mode
   * @param {Object} [config.theme] - Theme configuration
   * @param {Object} [config.accessibility] - Accessibility configuration
   * @param {Plugin[]} [config.plugins] - Array of plugins to load
   * @returns {SightEditCore} The SightEdit instance
   * 
   * @example
   * ```javascript
   * const sightEdit = SightEdit.init({
   *   apiUrl: 'https://api.example.com/sightedit',
   *   debug: true,
   *   editModeKey: 'e',
   *   theme: {
   *     primary: '#3b82f6',
   *     background: '#ffffff'
   *   },
   *   accessibility: {
   *     announcements: true,
   *     highContrast: false
   *   },
   *   plugins: [myCustomPlugin]
   * });
   * ```
   */
  static init(config: SightEditConfig): SightEditCore {
    if (!this.instance) {
      this.instance = new SightEditCore(config);
    }
    return this.instance;
  }

  /**
   * Gets the current SightEdit instance if it exists.
   * 
   * @static
   * @returns {SightEditCore|null} The SightEdit instance or null if not initialized
   * 
   * @example
   * ```javascript
   * const instance = SightEdit.getInstance();
   * if (instance) {
   *   instance.toggleEditMode();
   * }
   * ```
   */
  static getInstance(): SightEditCore | null {
    return this.instance || null;
  }

  /**
   * Toggles between edit and view modes.
   * Emits 'editModeEntered' or 'editModeExited' events.
   * 
   * @public
   * @fires SightEditCore#editModeEntered
   * @fires SightEditCore#editModeExited
   * @returns {void}
   * 
   * @example
   * ```javascript
   * sightEdit.toggleEditMode();
   * ```
   */
  toggleEditMode(): void {
    if (this.mode === 'view') {
      this.enterEditMode();
    } else {
      this.exitEditMode();
    }
  }

  /**
   * Enters edit mode, making all marked elements editable.
   * 
   * @public
   * @fires SightEditCore#editModeEntered
   * @returns {void}
   * 
   * @example
   * ```javascript
   * sightEdit.enterEditMode();
   * ```
   */
  enterEditMode(): void {
    if (this.mode === 'edit') return;
    
    this.mode = 'edit';
    document.body.dataset.sightEditMode = 'edit';
    this.ui.show();
    this.scanDocument();
    this.a11y.announce('Edit mode enabled');
    
    /**
     * Edit mode entered event
     * @event SightEditCore#editModeEntered
     */
    this.emit('editModeEntered');
    
    if (this.config.debug) {
      console.log('Edit mode entered');
    }
  }

  /**
   * Exits edit mode, saving any pending changes.
   * 
   * @public
   * @fires SightEditCore#editModeExited
   * @returns {void}
   * 
   * @example
   * ```javascript
   * sightEdit.exitEditMode();
   * ```
   */
  exitEditMode(): void {
    if (this.mode === 'view') return;
    
    this.mode = 'view';
    document.body.dataset.sightEditMode = 'view';
    this.ui.hide();
    this.cleanupEditors();
    this.a11y.announce('Edit mode disabled');
    
    /**
     * Edit mode exited event
     * @event SightEditCore#editModeExited
     */
    this.emit('editModeExited');
    
    if (this.config.debug) {
      console.log('Edit mode exited');
    }
  }

  /**
   * Checks if edit mode is currently active.
   * 
   * @public
   * @returns {boolean} True if in edit mode, false otherwise
   * 
   * @example
   * ```javascript
   * if (sightEdit.isEditMode()) {
   *   console.log('Currently editing');
   * }
   * ```
   */
  isEditMode(): boolean {
    return this.mode === 'edit';
  }

  /**
   * Registers a custom editor for a specific element type.
   * 
   * @public
   * @param {string} type - The element type identifier
   * @param {EditorConstructor} editor - The editor class constructor
   * @returns {void}
   * 
   * @example
   * ```javascript
   * class CustomEditor extends BaseEditor {
   *   render() {
   *     // Custom editor implementation
   *   }
   * }
   * 
   * sightEdit.registerEditor('custom', CustomEditor);
   * ```
   */
  registerEditor(type: string, editor: EditorConstructor): void {
    this.editors.set(type, editor);
    
    if (this.config.debug) {
      console.log(`Registered editor for type: ${type}`);
    }
  }

  /**
   * Loads a plugin into SightEdit.
   * 
   * @public
   * @param {Plugin} plugin - The plugin to load
   * @returns {void}
   * 
   * @example
   * ```javascript
   * const myPlugin = {
   *   name: 'my-plugin',
   *   init: (sightEdit) => {
   *     // Plugin initialization
   *   }
   * };
   * 
   * sightEdit.loadPlugin(myPlugin);
   * ```
   */
  loadPlugin(plugin: Plugin): void {
    if (plugin.init) {
      plugin.init(this);
    }
    
    if (this.config.debug) {
      console.log(`Loaded plugin: ${plugin.name}`);
    }
  }

  /**
   * Manually saves content to the backend.
   * 
   * @public
   * @param {SaveData} data - The data to save
   * @param {string} data.sight - Unique identifier for the content
   * @param {any} data.value - The content value
   * @param {string} [data.type] - The content type
   * @fires SightEditCore#saved
   * @fires SightEditCore#saveError
   * @returns {Promise<SaveResponse>} Response from the backend
   * 
   * @example
   * ```javascript
   * const response = await sightEdit.save({
   *   sight: 'hero-title',
   *   value: 'New Title',
   *   type: 'text'
   * });
   * 
   * if (response.success) {
   *   console.log('Content saved successfully');
   * }
   * ```
   */
  async save(data: SaveData): Promise<SaveResponse> {
    try {
      const response = await this.api.save(data);
      
      /**
       * Content saved event
       * @event SightEditCore#saved
       * @type {SaveData}
       */
      this.emit('saved', data);
      
      return response;
    } catch (error) {
      /**
       * Save error event
       * @event SightEditCore#saveError
       * @type {Error}
       */
      this.emit('saveError', error);
      throw error;
    }
  }

  /**
   * Saves multiple content changes in a single batch.
   * 
   * @public
   * @param {BatchOperation[]} operations - Array of batch operations
   * @returns {Promise<BatchResponse>} Response from the backend
   * 
   * @example
   * ```javascript
   * const response = await sightEdit.batch([
   *   { type: 'update', data: { sight: 'title', value: 'New Title' } },
   *   { type: 'update', data: { sight: 'subtitle', value: 'New Subtitle' } }
   * ]);
   * ```
   */
  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    return this.api.batch(operations);
  }

  /**
   * Refreshes the document scan to detect new editable elements.
   * Useful when content is dynamically added to the page.
   * 
   * @public
   * @returns {void}
   * 
   * @example
   * ```javascript
   * // After adding new content dynamically
   * document.getElementById('container').innerHTML = newContent;
   * sightEdit.refresh();
   * ```
   */
  refresh(): void {
    if (this.mode === 'edit') {
      this.scanDocument();
    }
  }

  /**
   * Destroys the SightEdit instance and cleans up resources.
   * 
   * @public
   * @returns {void}
   * 
   * @example
   * ```javascript
   * sightEdit.destroy();
   * ```
   */
  destroy(): void {
    this.exitEditMode();
    this.removeEventListeners();
    this.observer?.disconnect();
    this.ui.destroy();
    this.a11y.cleanup();
    SightEditCore.instance = null as any;
  }

  /**
   * Gets the current configuration.
   * 
   * @public
   * @returns {SightEditConfig} The current configuration
   * 
   * @example
   * ```javascript
   * const config = sightEdit.getConfig();
   * console.log('API URL:', config.apiUrl);
   * ```
   */
  getConfig(): SightEditConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   * 
   * @public
   * @param {Partial<SightEditConfig>} config - Partial configuration to update
   * @returns {void}
   * 
   * @example
   * ```javascript
   * sightEdit.updateConfig({
   *   debug: true,
   *   apiUrl: 'https://new-api.example.com'
   * });
   * ```
   */
  updateConfig(config: Partial<SightEditConfig>): void {
    this.config = { ...this.config, ...config };
    this.api.updateConfig(this.config);
    
    if (config.theme) {
      this.ui.updateTheme(config.theme);
    }
    
    if (config.accessibility) {
      this.a11y.updateConfig(config.accessibility);
    }
  }

  /**
   * Private constructor to enforce singleton pattern.
   * Use SightEdit.init() to create an instance.
   * 
   * @private
   * @param {SightEditConfig} config - Configuration object
   */
  private constructor(config: SightEditConfig) {
    super();
    this.config = {
      editModeKey: 'e',
      mode: 'production',
      debug: false,
      ...config
    };
    this.api = new SightEditAPI(this.config);
    this.ui = new EditModeUI(this.config.theme);
    this.a11y = new AccessibilityManager(this.config.accessibility);
    this.initialize();
  }

  /**
   * Initializes the SightEdit system.
   * Sets up editors, plugins, event listeners, and observers.
   * 
   * @private
   * @returns {void}
   */
  private initialize(): void {
    if (this.initialized) return;
    
    // Add screen reader styles
    addScreenReaderStyles();
    
    this.registerBuiltInEditors();
    this.loadPlugins();
    this.setupEventListeners();
    this.setupPerformanceOptimizations();
    this.scanDocument();
    this.setupMutationObserver();
    this.initialized = true;
    
    if (this.config.debug) {
      console.log('SightEdit initialized', this.config);
    }
  }

  /**
   * Registers all built-in editor types.
   * 
   * @private
   * @returns {void}
   */
  private registerBuiltInEditors(): void {
    this.registerEditor('text', TextEditor);
    this.registerEditor('richtext', RichTextEditor);
    this.registerEditor('image', ImageEditor);
    this.registerEditor('link', LinkEditor);
    this.registerEditor('color', ColorEditor);
    this.registerEditor('collection', CollectionEditor);
    this.registerEditor('date', DateEditor);
    this.registerEditor('number', NumberEditor);
    this.registerEditor('select', SelectEditor);
    this.registerEditor('json', JSONEditor);
  }

  /**
   * Loads plugins from configuration.
   * 
   * @private
   * @returns {void}
   */
  private loadPlugins(): void {
    if (!this.config.plugins) return;
    
    this.config.plugins.forEach(plugin => {
      try {
        this.loadPlugin(plugin);
      } catch (error) {
        console.error(`Failed to load plugin: ${plugin.name}`, error);
      }
    });
  }

  /**
   * Sets up global event listeners for keyboard shortcuts and UI interactions.
   * 
   * @private
   * @returns {void}
   */
  private setupEventListeners(): void {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Toggle edit mode
      if ((e.ctrlKey || e.metaKey) && e.key === this.config.editModeKey) {
        e.preventDefault();
        this.toggleEditMode();
      }
      
      // Save shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.mode === 'edit') {
        e.preventDefault();
        this.saveAll();
      }
    });

    // UI toggle button
    this.ui.onToggle(() => this.toggleEditMode());
    
    // Accessibility escape handler
    document.addEventListener('sightEditEscape', () => {
      if (this.mode === 'edit') {
        this.exitEditMode();
      }
    });
  }

  /**
   * Sets up performance optimizations including viewport observation,
   * event delegation, caching, and debouncing.
   * 
   * @private
   * @returns {void}
   */
  private setupPerformanceOptimizations(): void {
    // Viewport observer for lazy loading
    this.viewportObserver = new ViewportObserver();
    
    // Event delegation for efficient event handling
    this.eventDelegator = new EventDelegator();
    
    // Data cache for API responses
    this.cache = new DataCache({
      maxSize: 100,
      ttl: 5 * 60 * 1000 // 5 minutes
    });
    
    // Performance monitoring
    this.performanceMonitor = new PerformanceMonitor();
    
    // Debounced detection for dynamic content
    this.debouncedDetection = debounce(() => {
      if (this.mode === 'edit') {
        this.scanDocument();
      }
    }, 300);
    
    // Throttled save for rapid edits
    this.throttledSave = throttle(async (data: SaveData) => {
      await this.save(data);
    }, 1000);
  }

  /**
   * Sets up mutation observer to detect dynamically added content.
   * 
   * @private
   * @returns {void}
   */
  private setupMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      const addedNodes = new Set<Node>();
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => addedNodes.add(node));
      });
      
      // Debounce detection for performance
      if (addedNodes.size > 0) {
        this.debouncedDetection();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Scans the entire document for editable elements.
   * 
   * @private
   * @returns {void}
   */
  private scanDocument(): void {
    const start = performance.now();
    this.scanElement(document.body);
    
    if (this.config.debug) {
      const duration = performance.now() - start;
      console.log(`Document scan completed in ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Scans an element and its children for editable elements.
   * 
   * @private
   * @param {HTMLElement} root - The root element to scan
   * @returns {void}
   */
  private scanElement(root: HTMLElement): void {
    const elements = ElementDetector.scan(root);
    
    elements.forEach(detected => {
      if (this.mode === 'edit' && !this.activeEditors.has(detected.element)) {
        this.makeEditable(detected.element, detected);
      }
      
      detected.element.dataset.sightEditReady = 'true';
    });
  }

  /**
   * Makes an element editable by attaching the appropriate editor.
   * 
   * @private
   * @param {HTMLElement} element - The element to make editable
   * @param {DetectedElement} detected - The detection information
   * @returns {void}
   */
  private makeEditable(element: HTMLElement, detected: DetectedElement): void {
    const EditorClass = this.editors.get(detected.type);
    if (!EditorClass) {
      console.warn(`No editor registered for type: ${detected.type}`);
      return;
    }

    // Add accessibility attributes
    this.a11y.addAriaAttributes(
      element,
      detected.type,
      detected.schema?.label || `Edit ${detected.sight}`,
      detected.schema?.placeholder
    );

    // Create and configure editor
    const editor = new EditorClass(element, {
      mode: detected.mode,
      schema: detected.schema,
      theme: this.config.theme,
      locale: this.config.locale,
      a11y: this.a11y
    });

    // Set up save handler
    editor.onSave = async (value: any) => {
      await this.throttledSave({
        sight: detected.sight,
        value,
        type: detected.type,
        id: detected.id,
        context: detected.context,
        timestamp: Date.now()
      });
    };

    editor.render();
    this.activeEditors.set(element, editor);
    
    // Add focus handlers for accessibility
    element.addEventListener('focus', () => {
      this.a11y.applyFocusStyles(element);
    });
    
    element.addEventListener('blur', () => {
      this.a11y.removeFocusStyles(element);
    });
  }

  /**
   * Removes all active editors and cleans up their resources.
   * 
   * @private
   * @returns {void}
   */
  private cleanupEditors(): void {
    this.activeEditors.forEach(editor => {
      editor.destroy();
    });
    this.activeEditors.clear();
  }

  /**
   * Removes all event listeners.
   * 
   * @private
   * @returns {void}
   */
  private removeEventListeners(): void {
    // Remove keyboard listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('sightEditEscape', this.handleEscape);
    
    // Cleanup delegated events
    if (this.eventDelegator) {
      this.eventDelegator.destroy();
    }
  }

  /**
   * Handles keyboard shortcuts.
   * 
   * @private
   * @param {KeyboardEvent} e - The keyboard event
   * @returns {void}
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === this.config.editModeKey) {
      e.preventDefault();
      this.toggleEditMode();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.mode === 'edit') {
      e.preventDefault();
      this.saveAll();
    }
  };

  /**
   * Handles escape key press.
   * 
   * @private
   * @returns {void}
   */
  private handleEscape = (): void => {
    if (this.mode === 'edit') {
      this.exitEditMode();
    }
  };

  /**
   * Saves all active editor content in a batch operation.
   * 
   * @private
   * @fires SightEditCore#batchSaved
   * @fires SightEditCore#batchSaveError
   * @returns {Promise<void>}
   */
  private async saveAll(): Promise<void> {
    const operations: BatchOperation[] = [];
    
    this.activeEditors.forEach((editor, element) => {
      const value = editor.extractValue();
      const sight = element.dataset.sight;
      if (sight && value !== undefined) {
        operations.push({
          type: 'update',
          data: {
            sight,
            value,
            type: element.dataset.sightType as ElementType || 'text',
            timestamp: Date.now()
          }
        });
      }
    });
    
    if (operations.length > 0) {
      try {
        await this.batch(operations);
        this.a11y.announce(`${operations.length} changes saved successfully`);
        
        /**
         * Batch save completed event
         * @event SightEditCore#batchSaved
         * @type {BatchOperation[]}
         */
        this.emit('batchSaved', operations);
      } catch (error) {
        this.a11y.announce('Failed to save some changes', 'assertive');
        
        /**
         * Batch save error event
         * @event SightEditCore#batchSaveError
         * @type {Error}
         */
        this.emit('batchSaveError', error);
      }
    }
  }
}

/**
 * Default export for easy importing
 * @example
 * ```javascript
 * import SightEdit from '@sightedit/core';
 * const sightEdit = SightEdit.init({ apiUrl: '/api' });
 * ```
 */
export default {
  init: SightEditCore.init.bind(SightEditCore),
  getInstance: SightEditCore.getInstance.bind(SightEditCore)
};