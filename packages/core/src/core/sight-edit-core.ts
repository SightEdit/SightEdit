import { SightEditConfig, SaveData, SaveResponse, BatchOperation, BatchResponse } from '../types';
import { EventBus } from '../services/event-bus';
import { EditorService } from '../services/editor-service';
import { APIService } from '../services/api-service';
import { EditorFactory } from '../services/editor-factory';
import { SecurityManager } from '../security/security-manager';
import { CommandHistory } from '../commands/command';
import { ContentRepository } from '../repositories/content-repository';
import { EventManager, EditorLifecycleManager } from '../services/event-manager';
import { container, SERVICE_TOKENS } from '../container';

export interface SightEditCoreConfig extends SightEditConfig {
  container?: typeof container;
}

export class SightEditCore {
  private static instance: SightEditCore | null = null;
  private isInitialized = false;
  private mode: 'view' | 'edit' = 'view';

  // Core services
  private eventBus!: EventBus;
  private editorService!: EditorService;
  private apiService!: APIService;
  private editorFactory!: EditorFactory;
  private securityManager!: SecurityManager;
  private commandHistory!: CommandHistory;
  private contentRepository!: ContentRepository;
  private eventManager!: EventManager;
  private lifecycleManager!: EditorLifecycleManager;

  constructor(private config: SightEditCoreConfig) {
    this.validateConfig(config);
    this.setupDependencies();
  }

  static getInstance(config?: SightEditCoreConfig): SightEditCore {
    if (!SightEditCore.instance) {
      if (!config) {
        throw new Error('SightEditCore must be initialized with config on first call');
      }
      SightEditCore.instance = new SightEditCore(config);
    }
    return SightEditCore.instance;
  }

  static resetInstance(): void {
    if (SightEditCore.instance) {
      SightEditCore.instance.destroy();
      SightEditCore.instance = null;
    }
  }

  private validateConfig(config: SightEditCoreConfig): void {
    if (!config.endpoint && !config.apiService) {
      throw new Error('Either endpoint or apiService must be provided');
    }
  }

  private setupDependencies(): void {
    const serviceContainer = this.config.container || container;

    try {
      this.eventBus = serviceContainer.resolve(SERVICE_TOKENS.EventBus);
      this.editorService = serviceContainer.resolve(SERVICE_TOKENS.EditorService);
      this.apiService = serviceContainer.resolve(SERVICE_TOKENS.APIService);
      this.editorFactory = serviceContainer.resolve(SERVICE_TOKENS.EditorFactory);
      this.securityManager = serviceContainer.resolve(SERVICE_TOKENS.SecurityManager);
      this.eventManager = new EventManager();
      this.lifecycleManager = new EditorLifecycleManager();
    } catch (error) {
      throw new Error(`Failed to resolve dependencies: ${(error as Error).message}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize all services
      await this.securityManager.initialize?.();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Set up keyboard shortcuts
      this.setupKeyboardShortcuts();
      
      // Set up mutation observer for dynamic content
      this.setupMutationObserver();
      
      // Initial document scan
      await this.scanDocument();
      
      this.isInitialized = true;
      this.eventBus.emit('core:initialized', { config: this.config });

      if (this.config.debug) {
        console.log('SightEditCore initialized successfully');
      }
    } catch (error) {
      this.eventBus.emit('core:initialization-failed', { error });
      throw new Error(`Failed to initialize SightEditCore: ${(error as Error).message}`);
    }
  }

  private setupEventListeners(): void {
    // Listen for editor lifecycle events
    this.eventBus.on('editor:created', ({ editor, element }) => {
      this.lifecycleManager.createEditor(element, editor);
    });

    this.eventBus.on('editor:destroyed', ({ element }) => {
      this.lifecycleManager.destroyEditor(element);
    });

    // Listen for content changes
    this.eventBus.on('content:changed', async ({ sight, value, previous }) => {
      try {
        await this.save({ sight, value, previous });
      } catch (error) {
        this.eventBus.emit('error:occurred', { 
          error, 
          context: 'auto-save',
          sight 
        });
      }
    });

    // Listen for security threats
    this.eventBus.on('security:threat-detected', ({ threat }) => {
      if (this.config.debug) {
        console.warn('Security threat detected:', threat);
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    const keydownHandler = (event: KeyboardEvent) => {
      // Toggle edit mode: Ctrl/Cmd + E
      if ((event.ctrlKey || event.metaKey) && event.key === (this.config.editModeKey || 'e')) {
        event.preventDefault();
        this.toggleEditMode();
        return;
      }

      // Save all: Ctrl/Cmd + S (in edit mode)
      if ((event.ctrlKey || event.metaKey) && event.key === 's' && this.mode === 'edit') {
        event.preventDefault();
        this.saveAll();
        return;
      }

      // Undo: Ctrl/Cmd + Z (in edit mode)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && this.mode === 'edit') {
        event.preventDefault();
        if (event.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      // Exit edit mode: Escape
      if (event.key === 'Escape' && this.mode === 'edit') {
        this.exitEditMode();
        return;
      }
    };

    this.eventManager.addEventListener(document, 'keydown', keydownHandler);
  }

  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.hasAttribute('data-sight') || element.querySelector('[data-sight]')) {
              shouldScan = true;
            }
          }
        });
      });

      if (shouldScan && this.mode === 'edit') {
        this.scanDocument();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sight', 'data-type']
    });

    this.eventManager.addCleanupHandler({
      cleanup: () => observer.disconnect()
    });
  }

  private async scanDocument(): Promise<void> {
    try {
      const elements = document.querySelectorAll('[data-sight]');
      
      for (const element of elements) {
        if (element.hasAttribute('data-sight-ready')) {
          continue; // Already processed
        }

        const sight = element.getAttribute('data-sight');
        const type = element.getAttribute('data-type') || 'text';

        if (!sight) continue;

        // Security validation
        const validationResult = this.securityManager.validateInput(sight, 'sight-attribute');
        if (!validationResult.isValid) {
          console.warn('Invalid sight attribute:', sight, validationResult.errors);
          continue;
        }

        if (this.mode === 'edit') {
          await this.createEditor(element as HTMLElement, type, sight);
        }

        element.setAttribute('data-sight-ready', 'true');
      }
    } catch (error) {
      this.eventBus.emit('error:occurred', { 
        error, 
        context: 'document-scan' 
      });
    }
  }

  private async createEditor(element: HTMLElement, type: string, sight: string): Promise<void> {
    try {
      const editor = await this.editorService.createEditor(type, element);
      
      // Configure editor with save callback
      editor.onSave = async (value: any, previous?: any) => {
        await this.save({ sight, value, type, previous });
      };

      this.eventBus.emit('editor:created', { editor, element, sight, type });
    } catch (error) {
      this.eventBus.emit('error:occurred', { 
        error, 
        context: 'editor-creation',
        sight 
      });
    }
  }

  // Public API Methods

  async save(data: Partial<SaveData>): Promise<SaveResponse> {
    if (!data.sight || data.value === undefined) {
      throw new Error('Save data must include sight and value');
    }

    // Security validation
    const sightValidation = this.securityManager.validateInput(data.sight, 'sight');
    if (!sightValidation.isValid) {
      throw new Error(`Invalid sight: ${sightValidation.errors.join(', ')}`);
    }

    const saveData: SaveData = {
      sight: data.sight,
      value: data.value,
      type: data.type || 'text',
      timestamp: Date.now(),
      context: data.context,
      previous: data.previous
    };

    try {
      this.eventBus.emit('content:before-save', saveData);
      
      const response = await this.apiService.save(saveData);
      
      // Store in content repository for caching
      if (this.contentRepository) {
        await this.contentRepository.save({
          sight: saveData.sight,
          value: saveData.value,
          type: saveData.type,
          metadata: { 
            context: saveData.context,
            response 
          }
        });
      }

      this.eventBus.emit('content:saved', { saveData, response });
      
      return response;
    } catch (error) {
      this.eventBus.emit('content:save-failed', { saveData, error });
      throw error;
    }
  }

  async batch(operations: BatchOperation[]): Promise<BatchResponse> {
    // Validate all operations
    for (const op of operations) {
      if (op.data?.sight) {
        const validation = this.securityManager.validateInput(op.data.sight, 'batch-sight');
        if (!validation.isValid) {
          throw new Error(`Invalid sight in batch operation: ${validation.errors.join(', ')}`);
        }
      }
    }

    try {
      const response = await this.apiService.batch(operations);
      this.eventBus.emit('content:batch-saved', { operations, response });
      return response;
    } catch (error) {
      this.eventBus.emit('content:batch-failed', { operations, error });
      throw error;
    }
  }

  toggleEditMode(): void {
    if (this.mode === 'edit') {
      this.exitEditMode();
    } else {
      this.enterEditMode();
    }
  }

  enterEditMode(): void {
    if (this.mode === 'edit') return;

    this.mode = 'edit';
    document.body.setAttribute('data-sight-edit-mode', 'edit');
    
    this.scanDocument();
    this.eventBus.emit('edit-mode:entered', { mode: this.mode });
  }

  exitEditMode(): void {
    if (this.mode === 'view') return;

    this.mode = 'view';
    document.body.setAttribute('data-sight-edit-mode', 'view');
    
    // Destroy all active editors
    const activeEditors = this.editorService.getActiveEditors();
    activeEditors.forEach(editor => {
      this.editorService.destroyEditor(editor);
    });

    this.eventBus.emit('edit-mode:exited', { mode: this.mode });
  }

  setEditMode(enabled: boolean): void {
    if (enabled) {
      this.enterEditMode();
    } else {
      this.exitEditMode();
    }
  }

  isEditMode(): boolean {
    return this.mode === 'edit';
  }

  getActiveEditors(): readonly any[] {
    return this.editorService.getActiveEditors();
  }

  async refresh(): Promise<void> {
    await this.scanDocument();
  }

  // Command pattern methods for undo/redo
  async undo(): Promise<void> {
    if (this.commandHistory && this.commandHistory.canUndo()) {
      await this.commandHistory.undo();
    }
  }

  async redo(): Promise<void> {
    if (this.commandHistory && this.commandHistory.canRedo()) {
      await this.commandHistory.redo();
    }
  }

  canUndo(): boolean {
    return this.commandHistory?.canUndo() || false;
  }

  canRedo(): boolean {
    return this.commandHistory?.canRedo() || false;
  }

  private async saveAll(): Promise<void> {
    const activeEditors = this.editorService.getActiveEditors();
    const operations: BatchOperation[] = [];

    activeEditors.forEach(editor => {
      const element = editor.getElement?.();
      const sight = element?.getAttribute('data-sight');
      
      if (sight && editor.isDirty?.()) {
        operations.push({
          type: 'update',
          data: {
            sight,
            value: editor.getValue(),
            type: element?.getAttribute('data-type') || 'text',
            timestamp: Date.now()
          }
        });
      }
    });

    if (operations.length > 0) {
      await this.batch(operations);
      this.eventBus.emit('content:all-saved', { count: operations.length });
    }
  }

  async destroy(): Promise<void> {
    try {
      // Exit edit mode first
      this.exitEditMode();

      // Destroy all managers and services
      await this.lifecycleManager.destroyAll();
      await this.eventManager.destroy();
      
      // Clear command history
      if (this.commandHistory) {
        this.commandHistory.clear();
      }

      // Remove all event listeners
      this.eventBus.removeAllListeners();

      this.isInitialized = false;
      
      this.eventBus.emit('core:destroyed', {});
      
      if (this.config.debug) {
        console.log('SightEditCore destroyed successfully');
      }
    } catch (error) {
      console.error('Error during SightEditCore destruction:', error);
    }
  }

  // Event system delegation
  on(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.off(event, listener);
  }

  emit(event: string, data?: any): void {
    this.eventBus.emit(event, data);
  }

  // Configuration access
  getConfig(): Readonly<SightEditCoreConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SightEditCoreConfig>): void {
    this.config = { ...this.config, ...updates };
    this.eventBus.emit('config:updated', { config: this.config, updates });
  }
}