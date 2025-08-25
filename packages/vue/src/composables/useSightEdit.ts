import { ref, computed, onMounted, onUnmounted, watch, nextTick, Ref } from 'vue';
import { SightEditCore, SightEditConfig, Editor, ElementType } from '@sightedit/core';

export interface UseSightEditOptions {
  config?: Partial<SightEditConfig>;
  autoInit?: boolean;
  immediate?: boolean;
}

export interface UseSightEditReturn {
  sightEdit: Ref<SightEditCore | null>;
  isInitialized: Ref<boolean>;
  isEditMode: Ref<boolean>;
  activeEditors: Ref<readonly Editor[]>;
  error: Ref<Error | null>;
  isLoading: Ref<boolean>;
  initialize: (config?: Partial<SightEditConfig>) => Promise<void>;
  destroy: () => Promise<void>;
  toggleEditMode: () => void;
  setEditMode: (enabled: boolean) => void;
  refresh: () => Promise<void>;
}

let globalInstance: SightEditCore | null = null;
let instancePromise: Promise<SightEditCore> | null = null;

export function useSightEdit(options: UseSightEditOptions = {}): UseSightEditReturn {
  const {
    config,
    autoInit = true,
    immediate = true
  } = options;

  // Reactive state
  const sightEdit = ref<SightEditCore | null>(globalInstance);
  const isInitialized = ref(false);
  const isEditMode = ref(false);
  const activeEditors = ref<readonly Editor[]>([]);
  const error = ref<Error | null>(null);
  const isLoading = ref(false);

  // Computed properties
  const canEdit = computed(() => isInitialized.value && !isLoading.value);
  const hasActiveEditors = computed(() => activeEditors.value.length > 0);

  // Event cleanup functions
  let eventCleanupFunctions: (() => void)[] = [];

  const setupEventListeners = (instance: SightEditCore) => {
    const editModeListener = () => {
      isEditMode.value = instance.isEditMode();
    };

    const editorsUpdatedListener = () => {
      const editorsMap = instance.getActiveEditors();
      activeEditors.value = Array.from(editorsMap.values());
    };

    const errorListener = (event: any) => {
      error.value = event.error;
    };

    const initializedListener = () => {
      isInitialized.value = true;
      isEditMode.value = instance.isEditMode();
      const editorsMap = instance.getActiveEditors();
      activeEditors.value = Array.from(editorsMap.values());
    };

    instance.on('edit-mode:toggled', editModeListener);
    instance.on('editors:updated', editorsUpdatedListener);
    instance.on('error:occurred', errorListener);
    instance.on('initialized', initializedListener);

    eventCleanupFunctions = [
      () => instance.off('edit-mode:toggled', editModeListener),
      () => instance.off('editors:updated', editorsUpdatedListener),
      () => instance.off('error:occurred', errorListener),
      () => instance.off('initialized', initializedListener)
    ];
  };

  const cleanupEventListeners = () => {
    eventCleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (err) {
        console.warn('Failed to cleanup event listener:', err);
      }
    });
    eventCleanupFunctions = [];
  };

  const initialize = async (initConfig?: Partial<SightEditConfig>): Promise<void> => {
    if (isLoading.value) return;
    if (globalInstance && isInitialized.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      let instance: SightEditCore;

      // Reuse existing promise if initialization is in progress
      if (instancePromise) {
        instance = await instancePromise;
      } else {
        instancePromise = (async () => {
          if (globalInstance) {
            return globalInstance;
          }

          let newInstance = SightEditCore.getInstance();
          if (!newInstance && (initConfig || config)) {
            newInstance = SightEditCore.init(initConfig || config);
            newInstance.initialize();
          }
          if (!newInstance) {
            throw new Error('Failed to create SightEditCore instance');
          }
          globalInstance = newInstance;
          return newInstance;
        })();

        instance = await instancePromise;
        instancePromise = null;
      }

      sightEdit.value = instance;
      setupEventListeners(instance);

      // Update state immediately
      isInitialized.value = true;
      isEditMode.value = instance.isEditMode();
      const editorsMap = instance.getActiveEditors();
      activeEditors.value = Array.from(editorsMap.values());
    } catch (err) {
      error.value = err as Error;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const destroy = async (): Promise<void> => {
    try {
      cleanupEventListeners();

      if (globalInstance) {
        await globalInstance.destroy();
        globalInstance = null;
      }

      sightEdit.value = null;
      isInitialized.value = false;
      isEditMode.value = false;
      activeEditors.value = [];
      error.value = null;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  };

  const toggleEditMode = (): void => {
    if (sightEdit.value && isInitialized.value) {
      sightEdit.value.toggleEditMode();
    }
  };

  const setEditMode = (enabled: boolean): void => {
    if (sightEdit.value && isInitialized.value) {
      sightEdit.value.setEditMode(enabled ? 'edit' : 'view');
    }
  };

  const refresh = async (): Promise<void> => {
    if (sightEdit.value && isInitialized.value) {
      try {
        isLoading.value = true;
        await sightEdit.value.refresh?.();
        const editorsMap = sightEdit.value.getActiveEditors();
        activeEditors.value = Array.from(editorsMap.values());
      } catch (err) {
        error.value = err as Error;
        throw err;
      } finally {
        isLoading.value = false;
      }
    }
  };

  // Auto-initialize
  onMounted(async () => {
    if (autoInit) {
      if (immediate) {
        await initialize();
      } else {
        await nextTick(() => initialize());
      }
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    cleanupEventListeners();
  });

  // Watch for config changes
  watch(
    () => config,
    async (newConfig) => {
      if (isInitialized.value && newConfig) {
        await destroy();
        await initialize(newConfig);
      }
    },
    { deep: true }
  );

  return {
    sightEdit,
    isInitialized,
    isEditMode,
    activeEditors,
    error,
    isLoading,
    initialize,
    destroy,
    toggleEditMode,
    setEditMode,
    refresh
  };
}

// Composable for editor-specific functionality
export function useEditor(sight: string, options: {
  type?: string;
  initialValue?: any;
  validation?: Record<string, any>;
  autoSave?: boolean;
  debounceMs?: number;
} = {}) {
  const { sightEdit, isInitialized } = useSightEdit();
  
  const {
    type = 'text',
    initialValue,
    validation,
    autoSave = false,
    debounceMs = 300
  } = options;

  const value = ref(initialValue);
  const isDirty = ref(false);
  const isValid = ref(true);
  const errors = ref<string[]>([]);
  const editor = ref<Editor | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const validate = async (): Promise<void> => {
    if (!editor.value) return;

    try {
      const result = editor.value.validate(value.value);
      
      // Handle validation result (boolean | string from BaseEditor)
      if (typeof result === 'boolean') {
        isValid.value = result;
        errors.value = result ? [] : ['Validation failed'];
      } else if (typeof result === 'string') {
        isValid.value = false;
        errors.value = [result];
      } else {
        // Fallback for unexpected result type
        isValid.value = true;
        errors.value = [];
      }
    } catch (err) {
      isValid.value = false;
      errors.value = [`Validation error: ${(err as Error).message}`];
    }
  };

  const save = async (): Promise<void> => {
    if (!sightEdit.value || !isValid.value) return;

    try {
      await sightEdit.value.save({
        sight,
        value: value.value,
        type,
        previous: initialValue
      });
      
      isDirty.value = false;
    } catch (err) {
      throw err;
    }
  };

  const debouncedValidate = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      await validate();
      
      if (autoSave && isValid.value && isDirty.value) {
        await save();
      }
    }, debounceMs);
  };

  // Watch for value changes
  watch(value, (newValue) => {
    isDirty.value = newValue !== initialValue;
    debouncedValidate();
  });

  // Create editor when SightEdit is ready
  watch(isInitialized, async (initialized) => {
    if (initialized && sightEdit.value) {
      try {
        const element = document.createElement('div');
        element.setAttribute('data-sight', sight);
        element.setAttribute('data-type', type);
        
        if (validation) {
          element.setAttribute('data-validation', JSON.stringify(validation));
        }

        editor.value = sightEdit.value.createEditor(element, type as ElementType);
      } catch (err) {
        console.error('Failed to create editor:', err);
      }
    }
  }, { immediate: true });

  onUnmounted(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  return {
    value,
    isDirty,
    isValid,
    errors,
    editor,
    validate,
    save
  };
}