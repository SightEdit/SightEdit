import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSightEdit } from '../index';

export interface UseAutoSaveOptions {
  interval?: number;
  debounce?: number;
  onSave?: (data: any) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function useAutoSave(options: UseAutoSaveOptions = {}) {
  const { state } = useSightEdit();
  const isSaving = ref(false);
  const lastSaved = ref<Date | null>(null);
  const pendingChanges = ref<Map<string, any>>(new Map());
  const saveError = ref<Error | null>(null);
  const enabled = ref(options.enabled !== false);

  let intervalId: NodeJS.Timeout | null = null;
  let debounceTimeout: NodeJS.Timeout | null = null;

  const hasPendingChanges = computed(() => pendingChanges.value.size > 0);

  const performSave = async () => {
    if (!state.instance || pendingChanges.value.size === 0 || isSaving.value) return;

    isSaving.value = true;
    saveError.value = null;

    try {
      const changes = Array.from(pendingChanges.value.values());

      if (changes.length === 1) {
        await state.instance.save(changes[0]);
      } else {
        await state.instance.batch(changes);
      }

      lastSaved.value = new Date();
      pendingChanges.value.clear();
      
      if (options.onSave) {
        options.onSave(changes);
      }
    } catch (error) {
      const err = error as Error;
      saveError.value = err;
      
      if (options.onError) {
        options.onError(err);
      } else {
        console.error('Auto-save failed:', err);
      }
    } finally {
      isSaving.value = false;
    }
  };

  const saveNow = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
    return performSave();
  };

  const pause = () => {
    enabled.value = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
  };

  const resume = () => {
    enabled.value = true;
    startInterval();
  };

  const clearPending = () => {
    pendingChanges.value.clear();
  };

  const startInterval = () => {
    if (!options.interval || !enabled.value) return;
    
    if (intervalId) {
      clearInterval(intervalId);
    }
    
    intervalId = setInterval(() => {
      if (pendingChanges.value.size > 0) {
        performSave();
      }
    }, options.interval);
  };

  onMounted(() => {
    if (!state.instance) return;

    const handleChange = (data: any) => {
      if (!enabled.value) return;

      pendingChanges.value.set(data.sight, data);

      // Debounce save
      if (options.debounce) {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(() => {
          performSave();
        }, options.debounce);
      }
    };

    state.instance.on('change', handleChange);

    // Start interval if configured
    startInterval();

    // Save on page unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges.value.size > 0 && enabled.value) {
        performSave();
        e.preventDefault();
        e.returnValue = 'You have unsaved changes';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    onUnmounted(() => {
      if (state.instance) {
        state.instance.off('change', handleChange);
      }
      
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Save pending changes on unmount
      if (pendingChanges.value.size > 0 && enabled.value) {
        performSave();
      }
    });
  });

  // Watch for enabled changes
  watch(enabled, (newValue) => {
    if (newValue) {
      startInterval();
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  });

  return {
    isSaving: computed(() => isSaving.value),
    lastSaved: computed(() => lastSaved.value),
    pendingChanges: computed(() => pendingChanges.value.size),
    hasPendingChanges,
    saveError: computed(() => saveError.value),
    saveNow,
    pause,
    resume,
    clearPending,
    isEnabled: computed(() => enabled.value)
  };
}