import { ref, computed, watch, onUnmounted, Ref, ComputedRef } from 'vue';
import { Editor, ValidationResult, SaveData, ElementType } from '@sightedit/core';
import { useSightEdit } from './useSightEdit';

export interface UseEditorStateOptions {
  sight: string;
  type?: string;
  initialValue?: any;
  validation?: Record<string, any>;
  debounceMs?: number;
  autoSave?: boolean;
  onSave?: (value: any) => void;
  onError?: (error: Error) => void;
  onValidate?: (result: ValidationResult) => void;
}

export interface UseEditorStateReturn {
  // State
  value: Ref<any>;
  originalValue: Ref<any>;
  isDirty: ComputedRef<boolean>;
  isValid: Ref<boolean>;
  errors: Ref<string[]>;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  
  // Editor instance
  editor: Ref<Editor | null>;
  
  // Validation
  validationResult: Ref<ValidationResult | null>;
  
  // Actions
  setValue: (newValue: any) => void;
  save: () => Promise<void>;
  reset: () => void;
  validate: () => Promise<ValidationResult>;
  
  // Undo/Redo
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export function useEditorState(options: UseEditorStateOptions): UseEditorStateReturn {
  const {
    sight,
    type = 'text',
    initialValue,
    validation,
    debounceMs = 300,
    autoSave = false,
    onSave,
    onError,
    onValidate
  } = options;

  const { sightEdit, isInitialized } = useSightEdit();

  // State
  const value = ref(initialValue);
  const originalValue = ref(initialValue);
  const isValid = ref(true);
  const errors = ref<string[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const editor = ref<Editor | null>(null);
  const validationResult = ref<ValidationResult | null>(null);

  // History for undo/redo
  const history = ref<any[]>([initialValue]);
  const historyIndex = ref(0);

  // Computed
  const isDirty = computed(() => {
    return JSON.stringify(value.value) !== JSON.stringify(originalValue.value);
  });

  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Actions
  const setValue = (newValue: any): void => {
    const oldValue = value.value;
    value.value = newValue;

    // Add to history if value actually changed
    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      // Remove any future history entries
      history.value.splice(historyIndex.value + 1);
      
      // Add new value
      history.value.push(newValue);
      historyIndex.value = history.value.length - 1;

      // Limit history size
      if (history.value.length > 100) {
        history.value.shift();
        historyIndex.value--;
      }
    }

    debouncedValidate();
  };

  const validate = async (): Promise<ValidationResult> => {
    if (!editor.value) {
      const result: ValidationResult = {
        isValid: true,
        errors: []
      };
      validationResult.value = result;
      return result;
    }

    try {
      const result = editor.value.validate(value.value);
      
      // Handle both simple (boolean | string) and advanced (ValidationResult) validation
      if (typeof result === 'boolean') {
        const validationResultObj: ValidationResult = {
          isValid: result,
          errors: result ? [] : ['Validation failed']
        };
        isValid.value = result;
        errors.value = validationResultObj.errors;
        validationResult.value = validationResultObj;
        
        if (onValidate) {
          onValidate(validationResultObj);
        }
        
        return validationResultObj;
      } else if (typeof result === 'string') {
        const validationResultObj: ValidationResult = {
          isValid: false,
          errors: [result]
        };
        isValid.value = false;
        errors.value = [result];
        validationResult.value = validationResultObj;
        
        if (onValidate) {
          onValidate(validationResultObj);
        }
        
        return validationResultObj;
      } else if (result && typeof result === 'object' && 'isValid' in result) {
        // It's a ValidationResult object
        isValid.value = result.isValid;
        errors.value = result.errors || [];
        validationResult.value = result;

        if (onValidate) {
          onValidate(result);
        }

        return result;
      } else {
        // Fallback for unknown result type
        const fallbackResult: ValidationResult = {
          isValid: true,
          errors: []
        };
        validationResult.value = fallbackResult;
        return fallbackResult;
      }
    } catch (error) {
      const result: ValidationResult = {
        isValid: false,
        errors: [`Validation error: ${(error as Error).message}`]
      };

      isValid.value = false;
      errors.value = result.errors;
      validationResult.value = result;

      if (onError) {
        onError(error as Error);
      }

      return result;
    }
  };

  const save = async (): Promise<void> => {
    if (!sightEdit.value || isSaving.value) return;

    const currentValidationResult = validationResult.value || await validate();
    
    if (!currentValidationResult.isValid) {
      throw new Error(`Cannot save invalid data: ${currentValidationResult.errors.join(', ')}`);
    }

    isSaving.value = true;

    try {
      const saveData: SaveData = {
        sight,
        value: value.value,
        type: type as ElementType,
        previous: originalValue.value
      };

      await sightEdit.value.save(saveData);
      
      // Update original value after successful save
      originalValue.value = JSON.parse(JSON.stringify(value.value));

      if (onSave) {
        onSave(value.value);
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    } finally {
      isSaving.value = false;
    }
  };

  const reset = (): void => {
    value.value = JSON.parse(JSON.stringify(originalValue.value));
    
    // Reset history
    history.value = [originalValue.value];
    historyIndex.value = 0;
    
    errors.value = [];
    isValid.value = true;
    validationResult.value = null;
  };

  const undo = async (): Promise<void> => {
    if (!canUndo.value) return;

    historyIndex.value--;
    const previousValue = history.value[historyIndex.value];
    value.value = JSON.parse(JSON.stringify(previousValue));

    await validate();
  };

  const redo = async (): Promise<void> => {
    if (!canRedo.value) return;

    historyIndex.value++;
    const nextValue = history.value[historyIndex.value];
    value.value = JSON.parse(JSON.stringify(nextValue));

    await validate();
  };

  const debouncedValidate = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      const result = await validate();
      
      if (autoSave && result.isValid && isDirty.value) {
        try {
          await save();
        } catch (error) {
          console.warn('Auto-save failed:', error);
        }
      }
    }, debounceMs);
  };

  // Create editor when SightEdit is ready
  watch(isInitialized, async (initialized) => {
    if (initialized && sightEdit.value) {
      try {
        isLoading.value = true;
        
        // Create virtual element for editor
        const element = document.createElement('div');
        element.setAttribute('data-sight', sight);
        element.setAttribute('data-type', type);
        
        if (validation) {
          element.setAttribute('data-validation', JSON.stringify(validation));
        }

        editor.value = sightEdit.value.createEditor(element, type as ElementType);
        
        // Initial validation
        await validate();
      } catch (error) {
        if (onError) {
          onError(error as Error);
        }
      } finally {
        isLoading.value = false;
      }
    }
  }, { immediate: true });

  // Cleanup
  onUnmounted(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  return {
    // State
    value,
    originalValue,
    isDirty,
    isValid,
    errors,
    isLoading,
    isSaving,
    
    // Editor
    editor,
    validationResult,
    
    // Actions
    setValue,
    save,
    reset,
    validate,
    
    // Undo/Redo
    canUndo,
    canRedo,
    undo,
    redo
  };
}