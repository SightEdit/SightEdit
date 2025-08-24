import { 
  SightEditConfig, 
  Editor, 
  EditorConstructor, 
  Plugin, 
  SaveData, 
  SaveResponse,
  BatchOperation,
  BatchResponse,
  ElementType,
  ElementSchema 
} from './types';
import { ElementDetector, DetectedElement } from './detector';
import { SightEditAPI } from './api';
import { EditModeUI } from './ui/edit-mode';
import { EventEmitter } from './utils/event-emitter';
import { ErrorHandler, SightEditError, ValidationError, NetworkError, CircuitBreaker } from './utils/error-handler';
import { logger, StructuredLogger } from './utils/logger';
import { SentryIntegration } from './utils/sentry-integration';
import { NotificationSystem } from './utils/notification-system';
import { TelemetrySystem } from './utils/telemetry';
import { MonitoringDashboard } from './utils/monitoring-dashboard';
import { 
  debounce, 
  throttle, 
  ViewportObserver, 
  EventDelegator, 
  DataCache, 
  PerformanceMonitor 
} from './utils/performance';
import { SightEditCache, createSightEditCache, SightEditCacheConfig } from './cache';
import AccessibilityManager, { addScreenReaderStyles, A11yConfig } from './utils/accessibility';
import { HTMLSanitizer, JSONValidator, TextSanitizer } from './utils/sanitizer';
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
import { FileEditor } from './editors/file';
import { CollaborationManager, CollaborationConfig } from './collaboration';
import { SchemaRegistry, SchemaEditorFactory, AdvancedSchema } from './schema/advanced-schema';
import { ProductSelectorEditor } from './editors/product-selector';
import { HTMLDesignerEditor } from './editors/html-designer';

export * from './types';
export { CollaborationManager } from './collaboration';
export { BaseEditor } from './editors/base';
export { SchemaRegistry, SchemaEditorFactory } from './schema/advanced-schema';
export { ProductSelectorEditor } from './editors/product-selector';
export { HTMLDesignerEditor } from './editors/html-designer';
export { HTMLSanitizer, JSONValidator, TextSanitizer } from './utils/sanitizer';
export { SafeJSONParser, JSONSchemas, safeParseJSON, ValidationError as SafeJSONValidationError } from './utils/safe-json';
export { ErrorMessages } from './utils/error-messages';
export { OptimizedDOMManager, DOM } from './utils/dom-optimizer';
export { StructuredLogger, LogLevel, logger, log } from './utils/logger';
export { ErrorHandler, SightEditError, ValidationError, NetworkError, CircuitBreaker } from './utils/error-handler';
export { SentryIntegration } from './utils/sentry-integration';
export { NotificationSystem } from './utils/notification-system';
export { TelemetrySystem } from './utils/telemetry';
export { MonitoringDashboard } from './utils/monitoring-dashboard';
export { CSPManager, CSPConfig, CSPDirectives, CSPViolation } from './security/csp-manager';
export { CSPReporter } from './security/csp-reporter';
export { ExpressCSPMiddleware, BrowserCSPHelper, NodeCSPUtils, CSPTestingUtils } from './security/csp-middleware';
export { CSPComplianceUtils } from './security/csp-compliance-utils';
export { CSPInjectionPrevention } from './security/csp-injection-prevention';
export { SecurityManager, SecurityConfig, ThreatInfo, ValidationResult } from './security/security-manager';
export { 
  SightEditCache, 
  createSightEditCache, 
  CacheManager, 
  RedisCacheClient, 
  DBQueryCache,
  CacheInvalidationManager,
  CacheWarmingManager,
  CacheMonitor,
  CacheFallbackManager,
  CDNCacheManager
} from './cache';

// Type-only exports separated for Rollup compatibility
export type { 
  SightEditCacheConfig,
  CacheConfig,
  CacheSetOptions,
  CacheStats
} from './cache';

// Error handling types export
export type { ErrorType } from './utils/error-handler';

// Additional missing types
export { SightEditCore };

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
  
  // Memory leak prevention
  private eventCleanupFunctions: (() => void)[] = [];
  private boundEventHandlers: Map<string, EventListener> = new Map();
  
  // Performance optimizations
  private viewportObserver!: ViewportObserver;
  private eventDelegator!: EventDelegator;
  private cache!: DataCache<any>;
  private performanceMonitor!: PerformanceMonitor;
  private debouncedDetection!: () => void;
  private throttledSave!: (data: SaveData) => void;
  
  // Accessibility
  private a11y: AccessibilityManager;
  
  // Collaboration
  private collaboration: CollaborationManager | null = null;
  private schemaRegistry: SchemaRegistry | null = null;
  private schemaEditorFactory: SchemaEditorFactory;
  
  // Error handling and monitoring
  private errorHandler: ErrorHandler;
  private sentryIntegration: SentryIntegration | null = null;
  private notificationSystem: NotificationSystem;
  private telemetrySystem: TelemetrySystem | null = null;
  private monitoringDashboard: MonitoringDashboard | null = null;
  private circuitBreaker: CircuitBreaker;
  
  // Advanced caching system
  private cacheSystem: SightEditCache | null = null;

  static init(config: SightEditConfig): SightEditCore {
    if (!this.instance) {
      this.instance = new SightEditCore(config);
    }
    return this.instance;
  }

  static getInstance(): SightEditCore | null {
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
    
    // Initialize error handling and monitoring systems first
    this.errorHandler = new ErrorHandler();
    this.circuitBreaker = new CircuitBreaker();
    this.notificationSystem = new NotificationSystem();
    
    // Initialize Sentry if configured
    if (this.config.sentry) {
      try {
        this.sentryIntegration = new SentryIntegration();
        this.sentryIntegration.initialize(this.config.sentry);
      } catch (error) {
        logger.error('Failed to initialize Sentry integration', { error });
      }
    }
    
    // Initialize telemetry if configured
    if (this.config.telemetry !== false) {
      try {
        this.telemetrySystem = new TelemetrySystem({
          enabled: this.config.telemetry?.enabled ?? true,
          endpoint: this.config.telemetry?.endpoint,
          apiKey: this.config.telemetry?.apiKey,
          userId: this.config.telemetry?.userId,
          sessionId: this.config.telemetry?.sessionId || crypto.randomUUID()
        });
      } catch (error) {
        logger.error('Failed to initialize telemetry system', { error });
      }
    }
    
    // Initialize monitoring dashboard if configured
    if (this.config.monitoring) {
      try {
        this.monitoringDashboard = new MonitoringDashboard();
      } catch (error) {
        logger.error('Failed to initialize monitoring dashboard', { error });
      }
    }
    
    // Initialize advanced caching system if configured
    if (this.config.caching) {
      try {
        this.cacheSystem = createSightEditCache(this.config.caching);
        logger.info('Advanced caching system initialized', { 
          component: 'SightEditCore',
          layers: Object.keys(this.config.caching.layers || {}).filter(l => 
            this.config.caching?.layers?.[l as keyof typeof this.config.caching.layers]
          )
        });
      } catch (error) {
        logger.error('Failed to initialize caching system', { error });
      }
    }
    try {
      this.api = new SightEditAPI(this.config);
      this.ui = new EditModeUI(this.config.theme);
      this.a11y = new AccessibilityManager(this.config.accessibility);
      this.schemaEditorFactory = new SchemaEditorFactory();
      
      // Track initialization
      if (this.telemetrySystem) {
        this.telemetrySystem.track('system', 'core_initialized', {
          config: {
            mode: this.config.mode,
            debug: this.config.debug,
            hasCollaboration: !!this.config.collaboration,
            hasTelemetry: !!this.telemetrySystem,
            hasMonitoring: !!this.monitoringDashboard
          }
        });
      }
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'INITIALIZATION_ERROR', {
        component: 'SightEditCore',
        operation: 'constructor',
        config: { mode: this.config.mode, debug: this.config.debug }
      });
      
      logger.error('Failed to initialize core components', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      this.notificationSystem.showError('Failed to initialize SightEdit', {
        message: 'There was an error setting up the editor. Please refresh the page.',
        canRecover: true,
        actions: [{
          label: 'Refresh Page',
          action: () => window.location.reload()
        }]
      });
      
      throw wrappedError;
    }
    
    // Initialize schema registry if configured
    const schemaConfig = (this.config as any).schemaRegistry;
    if (schemaConfig) {
      this.schemaRegistry = new SchemaRegistry(
        schemaConfig.endpoint || this.config.endpoint + '/schema'
      );
    }
    
    // Initialize collaboration if configured
    if (this.config.collaboration) {
      this.setupCollaboration(this.config.collaboration);
    }
    
    this.initialize().catch(error => {
      logger.error('Failed to initialize SightEdit', { error: error.message });
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Add screen reader styles
      addScreenReaderStyles();
      
      this.registerBuiltInEditors();
      this.loadPlugins();
      this.setupEventListeners();
      this.scanDocument();
      this.setupMutationObserver();
      
      // Initialize caching system
      if (this.cacheSystem) {
        try {
          await this.cacheSystem.initialize();
          this.setupCacheEventHandlers();
        } catch (error) {
          logger.error('Failed to initialize cache system during startup', { error });
        }
      }
      
      this.initialized = true;
      
      // Track successful initialization
      if (this.telemetrySystem) {
        this.telemetrySystem.track('system', 'initialization_completed', {
          editorsCount: this.editors.size,
          hasPlugins: this.config.plugins && this.config.plugins.length > 0
        });
      }
      
      this.notificationSystem.showSuccess('SightEdit is ready!', {
        message: `Press ${this.config.editModeKey.toUpperCase()} + Ctrl/Cmd to start editing`,
        duration: 3000
      });
      
      if (this.config.debug) {
        logger.info('SightEdit initialized successfully', {
          config: this.config,
          editorsCount: this.editors.size,
          mode: this.mode
        });
      }
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'INITIALIZATION_ERROR', {
        component: 'SightEditCore',
        operation: 'initialize',
        initialized: this.initialized
      });
      
      logger.error('Failed during initialization', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      this.notificationSystem.showError('Initialization failed', {
        message: 'SightEdit failed to initialize properly. Some features may not work.',
        canRecover: true,
        actions: [{
          label: 'Retry',
          action: () => {
            this.initialized = false;
            this.initialize().catch(error => {
              logger.error('Failed to re-initialize SightEdit', { error: error.message });
            });
          }
        }]
      });
      
      throw wrappedError;
    }
  }

  private registerBuiltInEditors(): void {
    this.registerEditor('text', TextEditor);
    this.registerEditor('richtext', RichTextEditor);
    this.registerEditor('image', ImageEditor);
    this.registerEditor('file', FileEditor);
    this.registerEditor('link', LinkEditor);
    this.registerEditor('color', ColorEditor);
    this.registerEditor('collection', CollectionEditor);
    this.registerEditor('date', DateEditor);
    this.registerEditor('number', NumberEditor);
    this.registerEditor('select', SelectEditor);
    this.registerEditor('json', JSONEditor);
    this.registerEditor('product-selector', ProductSelectorEditor);
    this.registerEditor('html-designer', HTMLDesignerEditor);
  }

  private loadPlugins(): void {
    if (!this.config.plugins) return;
    
    const loadedPlugins: string[] = [];
    const failedPlugins: string[] = [];
    
    this.config.plugins.forEach(plugin => {
      try {
        plugin.init(this as any);
        loadedPlugins.push(`${plugin.name}@${plugin.version}`);
        
        if (this.telemetrySystem) {
          this.telemetrySystem.track('plugin', 'loaded', {
            name: plugin.name,
            version: plugin.version
          });
        }
        
        if (this.config.debug) {
          logger.info(`Plugin loaded successfully`, {
            name: plugin.name,
            version: plugin.version
          });
        }
      } catch (error) {
        const wrappedError = this.errorHandler.wrapError(error, 'PLUGIN_LOAD_ERROR', {
          pluginName: plugin.name,
          pluginVersion: plugin.version
        });
        
        failedPlugins.push(plugin.name);
        
        logger.error(`Failed to load plugin`, {
          error: wrappedError,
          plugin: { name: plugin.name, version: plugin.version }
        });
        
        if (this.sentryIntegration) {
          this.sentryIntegration.captureException(wrappedError, {
            tags: {
              component: 'plugin_loader',
              pluginName: plugin.name
            }
          });
        }
        
        // Continue loading other plugins instead of failing completely
      }
    });
    
    // Show summary notification
    if (loadedPlugins.length > 0) {
      this.notificationSystem.showSuccess(`Plugins loaded: ${loadedPlugins.length}`, {
        message: loadedPlugins.join(', '),
        duration: 2000
      });
    }
    
    if (failedPlugins.length > 0) {
      this.notificationSystem.showWarning(`Plugin loading issues: ${failedPlugins.length}`, {
        message: `Failed to load: ${failedPlugins.join(', ')}`,
        duration: 5000
      });
    }
  }

  private setupEventListeners(): void {
    // Create bound handlers to enable proper cleanup
    const keydownHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === this.config.editModeKey) {
        e.preventDefault();
        this.toggleEditMode();
      }
      
      // Save shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.mode === 'edit') {
        e.preventDefault();
        this.saveAll();
      }
    };
    
    const escapeHandler = () => {
      if (this.mode === 'edit') {
        this.exitEditMode();
      }
    };
    
    // Store handlers for cleanup
    this.boundEventHandlers.set('keydown', keydownHandler as EventListener);
    this.boundEventHandlers.set('escape', escapeHandler);
    
    // Add event listeners
    document.addEventListener('keydown', keydownHandler as EventListener);
    document.addEventListener('sightEditEscape', escapeHandler);
    
    // Store cleanup functions
    this.eventCleanupFunctions.push(
      () => document.removeEventListener('keydown', keydownHandler),
      () => document.removeEventListener('sightEditEscape', escapeHandler)
    );

    // UI toggle handler
    const toggleHandler = () => this.toggleEditMode();
    this.ui.onToggle(toggleHandler);
    this.eventCleanupFunctions.push(() => {
      // UI cleanup will be handled in ui.destroy()
    });
  }

  private setupMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      const addedNodes = new Set<Node>();
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => addedNodes.add(node));
      });
      
      addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.scanElement(node as HTMLElement);
        }
      });
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
      
      if (this.telemetrySystem) {
        this.telemetrySystem.track('scanner', 'scan_completed', {
          elementsFound: elements.length,
          rootElement: root.tagName,
          mode: this.mode
        });
      }
      
      const editablePromises: Promise<void>[] = [];
      
      for (const detected of elements) {
        if (this.mode === 'edit') {
          editablePromises.push(
            this.makeEditable(detected.element, detected).catch(error => {
              const wrappedError = this.errorHandler.wrapError(error, 'ELEMENT_SETUP_ERROR', {
                sight: detected.sight,
                type: detected.type,
                element: detected.element.tagName
              });
              
              logger.warn('Failed to make element editable', {
                error: wrappedError,
                element: {
                  sight: detected.sight,
                  type: detected.type,
                  tag: detected.element.tagName
                }
              });
              
              // Continue with other elements instead of failing completely
            })
          );
        }
        
        detected.element.dataset.sightEditReady = 'true';
      }
      
      // Wait for all editors to be set up (with error handling)
      if (editablePromises.length > 0) {
        await Promise.allSettled(editablePromises);
      }
      
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'SCAN_ERROR', {
        rootElement: root.tagName,
        mode: this.mode
      });
      
      logger.error('Failed to scan element', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      this.notificationSystem.showError('Element scanning failed', {
        message: 'Some editable elements may not be available',
        canRecover: true,
        actions: [{
          label: 'Refresh Editors',
          action: () => this.refresh()
        }]
      });
      
      throw wrappedError;
    }
  }

  private async makeEditable(element: HTMLElement, detected: DetectedElement): Promise<void> {
    // Try to fetch schema from backend if registry is available
    let schema = detected.schema;
    if (this.schemaRegistry && detected.sight) {
      try {
        const advancedSchema = await this.schemaRegistry.getSchema(
          detected.sight,
          detected.context
        );
        
        // Use advanced schema if available
        if (advancedSchema.editor) {
          // Create editor using schema factory if it's a special type
          if (['product-selector', 'html-designer', 'custom'].includes(advancedSchema.editor.type)) {
            const editor = this.schemaEditorFactory.createEditor(element, advancedSchema);
            if (editor) {
              this.setupEditor(editor, element, detected, advancedSchema);
              return;
            }
          }
          
          // Update detected type from schema
          detected.type = advancedSchema.editor.type as ElementType;
          detected.mode = advancedSchema.editor.mode || 'modal';
          
          // Use the advanced schema directly for advanced editors
          if (advancedSchema.editor.type === 'product-selector' || 
              advancedSchema.editor.type === 'html-designer') {
            schema = advancedSchema as any; // Advanced schemas extend ElementSchema conceptually
          } else {
            // Convert advanced schema to element schema for standard editors
            const elementSchema: ElementSchema = {
              type: advancedSchema.editor.type as ElementType,
              label: advancedSchema.ui?.title,
              placeholder: advancedSchema.ui?.description, // Use description as placeholder
              required: advancedSchema.validation?.required,
              // Skip complex validation objects, use simple validation if available
              validation: typeof advancedSchema.validation === 'function' 
                ? advancedSchema.validation 
                : undefined
            };
            schema = elementSchema;
          }
        }
      } catch (error) {
        if (this.config.debug) {
          console.error('Failed to fetch schema:', error);
        }
      }
    }
    
    const EditorClass = this.editors.get(detected.type);
    if (!EditorClass) {
      console.warn(`No editor registered for type: ${detected.type}`);
      return;
    }

    // Add accessibility attributes
    this.a11y.addAriaAttributes(
      element,
      detected.type,
      schema?.label || `Edit ${detected.sight}`,
      schema?.placeholder
    );

    const editor = new EditorClass(element, {
      mode: detected.mode,
      schema,
      theme: this.config.theme,
      locale: this.config.locale,
      a11y: this.a11y
    });

    editor.onSave = async (value: any) => {
      const saveData = {
        sight: detected.sight,
        value,
        type: detected.type,
        id: detected.id,
        context: detected.context
      };
      
      await this.save(saveData);
      
      // Send to collaboration if connected
      if (this.collaboration?.isConnectedToServer()) {
        this.collaboration.sendEdit(saveData);
      }
    };

    this.setupEditor(editor, element, detected, schema);
  }
  
  private setupEditor(
    editor: any,
    element: HTMLElement,
    detected: DetectedElement,
    schema?: any
  ): void {
    editor.onSave = async (value: any) => {
      const saveData = {
        sight: detected.sight,
        value,
        type: detected.type,
        id: detected.id,
        context: detected.context
      };
      
      await this.save(saveData);
      
      // Send to collaboration if connected
      if (this.collaboration?.isConnectedToServer()) {
        this.collaboration.sendEdit(saveData);
      }
    };

    editor.render();
    this.activeEditors.set(element, editor);
    
    // Create bound focus handlers for proper cleanup
    const focusHandler = () => {
      this.a11y.applyFocusStyles(element);
    };
    
    const blurHandler = () => {
      this.a11y.removeFocusStyles(element);
    };
    
    // Add focus listeners
    element.addEventListener('focus', focusHandler);
    element.addEventListener('blur', blurHandler);
    
    // Store cleanup functions in editor for later removal
    if (!editor._cleanupFunctions) {
      editor._cleanupFunctions = [];
    }
    
    editor._cleanupFunctions.push(
      () => element.removeEventListener('focus', focusHandler),
      () => element.removeEventListener('blur', blurHandler)
    );
  }

  enterEditMode(): void {
    if (this.mode === 'edit') return;
    
    try {
      // Track edit mode entry
      if (this.telemetrySystem) {
        this.telemetrySystem.track('mode', 'edit_mode_entered', {
          timestamp: Date.now(),
          activeEditorsCount: this.activeEditors.size
        });
      }
      
      this.mode = 'edit';
      document.body.dataset.sightEditMode = 'edit';
      this.ui.show();
      this.ui.setEditMode(true);
      
      // Scan document with error handling
      this.scanDocument().catch(error => {
        const wrappedError = this.errorHandler.wrapError(error, 'EDIT_MODE_SCAN_ERROR', {
          operation: 'enterEditMode',
          mode: this.mode
        });
        
        logger.error('Failed to scan document in edit mode', { error: wrappedError });
        
        this.notificationSystem.showWarning('Some elements may not be editable', {
          message: 'There was an issue setting up some editable elements',
          duration: 4000
        });
      });
      
      this.a11y.announce('Edit mode enabled. Press Tab to navigate between editable elements.');
      
      // Show monitoring dashboard if configured
      if (this.monitoringDashboard && this.config.monitoring?.showOnErrors === false) {
        this.monitoringDashboard.show();
      }
      
      this.emit('editModeEntered');
      
      logger.info('Edit mode entered successfully', {
        activeEditors: this.activeEditors.size,
        mode: this.mode
      });
      
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'EDIT_MODE_ERROR', {
        operation: 'enterEditMode',
        currentMode: this.mode
      });
      
      logger.error('Failed to enter edit mode', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      this.notificationSystem.showError('Failed to enter edit mode', {
        message: 'There was an error activating the editor',
        canRecover: true,
        actions: [{
          label: 'Try Again',
          action: () => this.enterEditMode()
        }]
      });
      
      throw wrappedError;
    }
  }

  exitEditMode(): void {
    if (this.mode === 'view') return;
    
    try {
      // Track edit mode exit
      if (this.telemetrySystem) {
        this.telemetrySystem.track('mode', 'edit_mode_exited', {
          timestamp: Date.now(),
          activeEditorsCount: this.activeEditors.size,
          sessionDuration: Date.now() - (this.telemetrySystem as any).sessionStartTime
        });
      }
      
      const editorsToCleanup = this.activeEditors.size;
      logger.info(`Exiting edit mode, cleaning up ${editorsToCleanup} editors`);
      
      this.mode = 'view';
      document.body.dataset.sightEditMode = 'view';
      this.ui.setEditMode(false);
      
      // Cleanup active editors with comprehensive error handling
      const cleanupErrors: any[] = [];
      
      this.activeEditors.forEach((editor, element) => {
        try {
          // Cleanup editor-specific event listeners
          if (editor._cleanupFunctions) {
            editor._cleanupFunctions.forEach((cleanup: () => void) => {
              try {
                cleanup();
              } catch (error) {
                cleanupErrors.push({
                  type: 'cleanup_function',
                  error,
                  element: element.tagName,
                  sight: element.dataset.sight
                });
              }
            });
            editor._cleanupFunctions = [];
          }
          
          // Destroy the editor
          editor.destroy();
        } catch (error) {
          cleanupErrors.push({
            type: 'editor_destroy',
            error,
            element: element.tagName,
            sight: element.dataset.sight
          });
        }
      });
      
      this.activeEditors.clear();
      
      // Log cleanup errors if any occurred
      if (cleanupErrors.length > 0) {
        logger.warn(`${cleanupErrors.length} errors during editor cleanup`, {
          errors: cleanupErrors,
          totalEditorsCount: editorsToCleanup
        });
        
        // Don't show user notification for cleanup errors unless they're severe
        if (cleanupErrors.length > editorsToCleanup * 0.5) {
          this.notificationSystem.showWarning('Some cleanup issues occurred', {
            message: 'Memory cleanup had some issues, but edit mode was disabled',
            duration: 3000
          });
        }
      }
      
      // Hide monitoring dashboard if it was shown
      if (this.monitoringDashboard) {
        this.monitoringDashboard.hide();
      }
      
      this.a11y.announce('Edit mode disabled');
      this.emit('editModeExited');
      
      logger.info('Edit mode exited successfully', {
        cleanedUpEditors: editorsToCleanup,
        cleanupErrors: cleanupErrors.length,
        mode: this.mode
      });
      
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'EXIT_EDIT_MODE_ERROR', {
        operation: 'exitEditMode',
        activeEditorsCount: this.activeEditors.size,
        currentMode: this.mode
      });
      
      logger.error('Failed to exit edit mode cleanly', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      // Force mode change even if cleanup failed
      this.mode = 'view';
      document.body.dataset.sightEditMode = 'view';
      this.ui.setEditMode(false);
      
      this.notificationSystem.showWarning('Edit mode disabled with issues', {
        message: 'There were some cleanup issues, but edit mode was disabled',
        duration: 4000
      });
      
      // Don't throw error as we want edit mode to be disabled regardless
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
      // Show loading notification
      const loadingNotification = this.notificationSystem.showLoading('Saving changes...', {
        message: `Saving ${saveData.sight}`,
        showProgress: true
      });
      
      // Track save attempt
      if (this.telemetrySystem) {
        this.telemetrySystem.track('editor', 'save_attempt', {
          sight: saveData.sight,
          type: saveData.type,
          hasId: !!saveData.id,
          hasContext: !!saveData.context
        });
      }
      
      this.emit('beforeSave', saveData);
      
      // Use circuit breaker for save operations
      const response = await this.circuitBreaker.execute(async () => {
        return await this.api.save(saveData);
      });
      
      // Dismiss loading notification
      this.notificationSystem.dismiss(loadingNotification.id);
      
      this.emit('afterSave', response);
      
      // Track successful save
      if (this.telemetrySystem) {
        this.telemetrySystem.track('editor', 'save_success', {
          sight: saveData.sight,
          type: saveData.type,
          responseTime: Date.now() - saveData.timestamp
        });
      }
      
      if (this.config.onSave) {
        this.config.onSave(saveData);
      }
      
      this.a11y.announce('Changes saved successfully');
      this.notificationSystem.showSuccess('Saved!', {
        message: `${saveData.sight} updated successfully`,
        duration: 2000
      });
      
      return response;
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'SAVE_ERROR', {
        sight: saveData.sight,
        type: saveData.type,
        operation: 'save'
      });
      
      // Track save failure
      if (this.telemetrySystem) {
        this.telemetrySystem.track('editor', 'save_error', {
          sight: saveData.sight,
          type: saveData.type,
          error: wrappedError.code,
          message: wrappedError.message
        });
      }
      
      logger.error('Save operation failed', {
        error: wrappedError,
        saveData
      });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError, {
          contexts: {
            saveData: {
              sight: saveData.sight,
              type: saveData.type,
              hasValue: saveData.value !== undefined
            }
          }
        });
      }
      
      this.emit('saveError', wrappedError);
      this.a11y.announce('Failed to save changes. Please try again.', 'assertive');
      
      // Show user-friendly error notification
      this.notificationSystem.showError('Save failed', {
        message: this.errorHandler.getUserMessage(wrappedError),
        canRecover: wrappedError.recoverable,
        actions: wrappedError.recoverable ? [{
          label: 'Retry Save',
          action: () => this.save(data)
        }] : undefined
      });
      
      if (this.config.onError) {
        this.config.onError(wrappedError);
      }
      
      throw wrappedError;
    }
  }

  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    try {
      // Show loading notification for batch operations
      const loadingNotification = this.notificationSystem.showLoading('Processing batch operations...', {
        message: `Processing ${operations.length} operations`,
        showProgress: true
      });
      
      // Track batch attempt
      if (this.telemetrySystem) {
        this.telemetrySystem.track('batch', 'batch_attempt', {
          operationsCount: operations.length,
          operationTypes: operations.map(op => op.type)
        });
      }
      
      // Use circuit breaker for batch operations
      const response = await this.circuitBreaker.execute(async () => {
        return await this.api.batch(operations);
      });
      
      // Dismiss loading notification
      this.notificationSystem.dismiss(loadingNotification.id);
      
      // Track successful batch
      if (this.telemetrySystem) {
        this.telemetrySystem.track('batch', 'batch_success', {
          operationsCount: operations.length,
          successfulCount: response.results?.filter(r => r.success).length || 0,
          failedCount: response.results?.filter(r => !r.success).length || 0
        });
      }
      
      // Show success notification
      const successCount = response.results?.filter(r => r.success).length || 0;
      const failedCount = response.results?.filter(r => !r.success).length || 0;
      
      if (successCount > 0) {
        this.notificationSystem.showSuccess(`Batch completed: ${successCount} successful`, {
          message: failedCount > 0 ? `${failedCount} operations failed` : 'All operations completed successfully',
          duration: 3000
        });
      }
      
      if (failedCount > 0) {
        this.notificationSystem.showWarning(`${failedCount} operations failed`, {
          message: 'Some batch operations could not be completed',
          duration: 5000
        });
      }
      
      return response;
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'BATCH_ERROR', {
        operationsCount: operations.length,
        operation: 'batch'
      });
      
      // Track batch failure
      if (this.telemetrySystem) {
        this.telemetrySystem.track('batch', 'batch_error', {
          operationsCount: operations.length,
          error: wrappedError.code,
          message: wrappedError.message
        });
      }
      
      logger.error('Batch operation failed', {
        error: wrappedError,
        operationsCount: operations.length
      });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError, {
          contexts: {
            batch: {
              operationsCount: operations.length,
              operationTypes: operations.map(op => op.type)
            }
          }
        });
      }
      
      this.notificationSystem.showError('Batch operation failed', {
        message: this.errorHandler.getUserMessage(wrappedError),
        canRecover: wrappedError.recoverable,
        actions: wrappedError.recoverable ? [{
          label: 'Retry Batch',
          action: () => this.batch(operations)
        }] : undefined
      });
      
      this.emit('batchError', wrappedError);
      throw wrappedError;
    }
  }

  registerEditor(type: string, editor: EditorConstructor): void {
    this.editors.set(type, editor);
  }

  registerPlugin(plugin: Plugin): void {
    plugin.init(this as any);
  }

  refresh(): void {
    this.scanDocument();
  }

  destroy(): void {
    this.destroyAsync().catch(error => {
      logger.error('Failed to destroy SightEdit', { error: error.message });
    });
  }

  private async destroyAsync(): Promise<void> {
    try {
      logger.info('Starting SightEdit cleanup and destruction');
      
      // Track destruction
      if (this.telemetrySystem) {
        this.telemetrySystem.track('system', 'destruction_started', {
          activeEditorsCount: this.activeEditors.size,
          mode: this.mode
        });
      }
      
      // Exit edit mode and cleanup active editors
      this.exitEditMode();
      
      // Disconnect mutation observer
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      
      // Cleanup all event listeners
      this.eventCleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          logger.warn('Error during event cleanup', { error });
        }
      });
      this.eventCleanupFunctions = [];
      this.boundEventHandlers.clear();
      
      // Cleanup UI components
      try {
        this.ui.destroy();
      } catch (error) {
        logger.warn('Error destroying UI', { error });
      }
      
      // Cleanup accessibility manager
      try {
        this.a11y.destroy();
      } catch (error) {
        logger.warn('Error destroying accessibility manager', { error });
      }
      
      // Cleanup collaboration
      if (this.collaboration) {
        try {
          this.collaboration.disconnect();
          this.collaboration.removeAllListeners();
        } catch (error) {
          logger.warn('Error disconnecting collaboration', { error });
        }
        this.collaboration = null;
      }
      
      // Cleanup monitoring and error handling systems
      try {
        if (this.monitoringDashboard) {
          this.monitoringDashboard.destroy();
          this.monitoringDashboard = null;
        }
        
        if (this.telemetrySystem) {
          this.telemetrySystem.flush();
          this.telemetrySystem = null;
        }
        
        if (this.sentryIntegration) {
          this.sentryIntegration.flush();
          this.sentryIntegration = null;
        }
        
        this.notificationSystem.clearAll();
      } catch (error) {
        logger.warn('Error cleaning up monitoring systems', { error });
      }
      
      // Cleanup schema registry
      if (this.schemaRegistry) {
        this.schemaRegistry = null;
      }
      
      // Cleanup cache system
      if (this.cacheSystem) {
        try {
          await this.cacheSystem.destroy();
          this.cacheSystem = null;
        } catch (error) {
          logger.warn('Error cleaning up cache system', { error });
        }
      }
      
      // Clear all maps and arrays
      this.editors.clear();
      this.activeEditors.clear();
      
      // Remove all event listeners from EventEmitter
      this.removeAllListeners();
      
      // Reset instance
      this.initialized = false;
      SightEditCore.instance = null as any;
      
      logger.info('SightEdit cleanup completed successfully');
      
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'CLEANUP_ERROR', {
        component: 'SightEditCore',
        operation: 'destroy'
      });
      
      logger.error('Error during SightEdit destruction', { error: wrappedError });
      
      // Still reset instance even if cleanup failed
      this.initialized = false;
      SightEditCore.instance = null as any;
      
      throw wrappedError;
    }
  }
  
  private setupCollaboration(config: CollaborationConfig): void {
    this.collaboration = new CollaborationManager(config);
    
    // Handle remote edits
    this.collaboration.on('remoteEdit', (operation) => {
      const element = document.querySelector(`[data-sight="${operation.sight}"]`) as HTMLElement;
      if (element && this.activeEditors.has(element)) {
        const editor = this.activeEditors.get(element)!;
        editor.applyValue(operation.value);
      }
    });
    
    // Show collaborator cursors
    this.collaboration.on('cursorUpdate', ({ userId, cursor }) => {
      this.updateCollaboratorCursor(userId, cursor);
    });
    
    // Show collaborator selections
    this.collaboration.on('selectionUpdate', ({ userId, selection }) => {
      this.updateCollaboratorSelection(userId, selection);
    });
    
    // Handle element locks
    this.collaboration.on('elementLocked', ({ element, userId }) => {
      const el = document.querySelector(`[data-sight="${element}"]`) as HTMLElement;
      if (el) {
        el.dataset.lockedBy = userId;
        el.classList.add('sight-edit-locked');
      }
    });
    
    this.collaboration.on('elementUnlocked', ({ element }) => {
      const el = document.querySelector(`[data-sight="${element}"]`) as HTMLElement;
      if (el) {
        delete el.dataset.lockedBy;
        el.classList.remove('sight-edit-locked');
      }
    });
    
    // Connect to collaboration server
    this.collaboration.connect();
  }
  
  private updateCollaboratorCursor(userId: string, cursor: { x: number; y: number }): void {
    let cursorEl = document.getElementById(`collab-cursor-${userId}`);
    
    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.id = `collab-cursor-${userId}`;
      cursorEl.className = 'sight-edit-collaborator-cursor';
      cursorEl.style.position = 'fixed';
      cursorEl.style.pointerEvents = 'none';
      cursorEl.style.zIndex = '10000';
      document.body.appendChild(cursorEl);
    }
    
    cursorEl.style.left = `${cursor.x}px`;
    cursorEl.style.top = `${cursor.y}px`;
  }
  
  private updateCollaboratorSelection(userId: string, selection: any): void {
    // Implementation for showing collaborator text selections
    // This would require more complex DOM manipulation
  }
  
  private setupCacheEventHandlers(): void {
    if (!this.cacheSystem) return;
    
    // Handle cache alerts
    this.cacheSystem.on('alert', (alert) => {
      logger.warn('Cache system alert', {
        component: 'SightEditCore',
        alertType: alert.type,
        severity: alert.severity,
        metric: alert.metric,
        message: alert.message
      });
      
      // Show user notification for critical alerts
      if (alert.severity === 'critical') {
        this.notificationSystem.showWarning('Cache Performance Issue', {
          message: alert.message,
          duration: 10000
        });
      }
    });
    
    // Handle layer health changes
    this.cacheSystem.on('layerHealthChanged', ({ layerName, isHealthy }) => {
      logger.info('Cache layer health changed', {
        component: 'SightEditCore',
        layer: layerName,
        isHealthy
      });
      
      if (!isHealthy) {
        this.notificationSystem.showWarning('Cache Layer Issue', {
          message: `Cache layer "${layerName}" is experiencing issues`,
          duration: 5000
        });
      }
    });
    
    // Handle degradation level changes
    this.cacheSystem.on('degradationLevelChanged', ({ newLevel }) => {
      logger.warn('Cache degradation level changed', {
        component: 'SightEditCore',
        level: newLevel.level,
        description: newLevel.description
      });
      
      if (newLevel.level === 'critical' || newLevel.level === 'emergency') {
        this.notificationSystem.showError('Cache System Critical', {
          message: newLevel.description,
          duration: 15000
        });
      }
    });
  }
  
  private async saveAll(): Promise<void> {
    try {
      const operations: BatchOperation[] = [];
      const extractionErrors: any[] = [];
      
      // Track save all attempt
      if (this.telemetrySystem) {
        this.telemetrySystem.track('editor', 'save_all_attempt', {
          activeEditorsCount: this.activeEditors.size
        });
      }
      
      logger.info('Starting save all operation', {
        activeEditorsCount: this.activeEditors.size
      });
      
      // Extract values with error handling for each editor
      this.activeEditors.forEach((editor, element) => {
        try {
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
        } catch (error) {
          const sight = element.dataset.sight || 'unknown';
          extractionErrors.push({
            sight,
            element: element.tagName,
            error
          });
          
          logger.warn('Failed to extract value from editor', {
            sight,
            element: element.tagName,
            error
          });
        }
      });
      
      // Show extraction errors if any
      if (extractionErrors.length > 0) {
        this.notificationSystem.showWarning(`${extractionErrors.length} editors had extraction issues`, {
          message: 'Some changes could not be prepared for saving',
          duration: 4000
        });
        
        // Track extraction errors
        if (this.telemetrySystem) {
          this.telemetrySystem.track('editor', 'extraction_errors', {
            errorCount: extractionErrors.length,
            totalEditors: this.activeEditors.size
          });
        }
      }
      
      if (operations.length > 0) {
        try {
          await this.batch(operations);
          
          const savedCount = operations.length;
          const failedCount = extractionErrors.length;
          
          if (failedCount === 0) {
            this.a11y.announce(`All ${savedCount} changes saved successfully`);
          } else {
            this.a11y.announce(`${savedCount} changes saved successfully, ${failedCount} had issues`);
          }
          
          // Track successful save all
          if (this.telemetrySystem) {
            this.telemetrySystem.track('editor', 'save_all_success', {
              savedCount,
              failedCount,
              totalEditors: this.activeEditors.size
            });
          }
          
          logger.info('Save all operation completed', {
            savedCount,
            failedCount,
            totalEditors: this.activeEditors.size
          });
          
        } catch (error) {
          const wrappedError = this.errorHandler.wrapError(error, 'SAVE_ALL_BATCH_ERROR', {
            operationsCount: operations.length,
            extractionErrors: extractionErrors.length,
            operation: 'saveAll'
          });
          
          logger.error('Batch operation failed in save all', {
            error: wrappedError,
            operationsCount: operations.length
          });
          
          if (this.sentryIntegration) {
            this.sentryIntegration.captureException(wrappedError, {
              contexts: {
                saveAll: {
                  operationsCount: operations.length,
                  extractionErrors: extractionErrors.length,
                  activeEditors: this.activeEditors.size
                }
              }
            });
          }
          
          this.a11y.announce('Failed to save changes. Please try individual saves.', 'assertive');
          
          this.notificationSystem.showError('Save all failed', {
            message: 'There was an error saving all changes. Try saving individual elements.',
            canRecover: true,
            actions: [{
              label: 'Retry Save All',
              action: () => this.saveAll()
            }]
          });
          
          throw wrappedError;
        }
      } else {
        // No operations to save
        if (extractionErrors.length > 0) {
          this.a11y.announce('No changes could be saved due to extraction errors', 'assertive');
          
          this.notificationSystem.showError('No changes to save', {
            message: 'All editors had issues extracting their values',
            duration: 4000
          });
        } else {
          this.a11y.announce('No changes to save');
          
          this.notificationSystem.showInfo('No changes to save', {
            message: 'All editors are up to date',
            duration: 2000
          });
        }
        
        // Track no-op save all
        if (this.telemetrySystem) {
          this.telemetrySystem.track('editor', 'save_all_noop', {
            activeEditorsCount: this.activeEditors.size,
            extractionErrors: extractionErrors.length
          });
        }
      }
      
    } catch (error) {
      const wrappedError = this.errorHandler.wrapError(error, 'SAVE_ALL_ERROR', {
        operation: 'saveAll',
        activeEditorsCount: this.activeEditors.size
      });
      
      logger.error('Save all operation failed', { error: wrappedError });
      
      if (this.sentryIntegration) {
        this.sentryIntegration.captureException(wrappedError);
      }
      
      if (this.telemetrySystem) {
        this.telemetrySystem.track('editor', 'save_all_error', {
          error: wrappedError.code,
          activeEditorsCount: this.activeEditors.size
        });
      }
      
      this.a11y.announce('Save all operation failed completely', 'assertive');
      
      this.notificationSystem.showError('Save operation failed', {
        message: 'There was a system error during the save operation',
        canRecover: true,
        actions: [{
          label: 'Try Again',
          action: () => this.saveAll()
        }]
      });
      
      throw wrappedError;
    }
  }
  
  /**
   * Get cache system instance (if configured)
   */
  getCacheSystem(): SightEditCache | null {
    return this.cacheSystem;
  }
  
  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    if (!this.cacheSystem) {
      return null;
    }
    
    return await this.cacheSystem.getStats();
  }
  
  /**
   * Warm critical cache paths
   */
  async warmCriticalCache(userContext?: any): Promise<void> {
    if (!this.cacheSystem) {
      logger.warn('Cache system not configured for warming', {
        component: 'SightEditCore'
      });
      return;
    }
    
    try {
      await this.cacheSystem.warmCriticalPath(userContext);
      logger.info('Critical cache paths warmed', {
        component: 'SightEditCore'
      });
    } catch (error) {
      logger.error('Failed to warm critical cache paths', {
        component: 'SightEditCore',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

const SightEdit = {
  init: (config: SightEditConfig) => SightEditCore.init(config),
  getInstance: () => SightEditCore.getInstance()
};

if (typeof window !== 'undefined') {
  (window as any).SightEdit = SightEdit;
}

export default SightEdit;
export { SightEdit, SightEditCore };