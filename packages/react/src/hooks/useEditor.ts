import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Editor, ElementType, SaveData, ValidationResult } from '@sightedit/core';
import { SightEditCore } from '@sightedit/core';

export interface UseEditorOptions {
  sight: string;
  type?: ElementType;
  initialValue?: any;
  validation?: Record<string, any>;
  onSave?: (value: any) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
  autoSave?: boolean;
}

export interface UseEditorReturn {
  value: any;
  setValue: (value: any) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  isDirty: boolean;
  isValid: boolean;
  errors: string[];
  save: () => Promise<void>;
  reset: () => void;
  editor: Editor | null;
  validationResult: ValidationResult | null;
}

export function useEditor(options: UseEditorOptions): UseEditorReturn {
  const {
    sight,
    type,
    initialValue,
    validation,
    onSave,
    onError,
    debounceMs = 300,
    autoSave = false
  } = options;

  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  
  const initialValueRef = useRef(initialValue);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const sightEditRef = useRef<SightEditCore>();

  // BUG FIX: Memoize validation object to prevent infinite loops
  // Validation object is often created inline by parent components
  const validationStr = validation ? JSON.stringify(validation) : '';
  const stableValidation = useMemo(() => validation, [validationStr]);

  // BUG FIX: Memoize callback refs to prevent infinite loops
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSaveRef.current = onSave;
    onErrorRef.current = onError;
  });

  // Initialize SightEdit instance
  useEffect(() => {
    if (!sightEditRef.current) {
      sightEditRef.current = SightEditCore.getInstance() || undefined;
    }
  }, []);

  // Update initial value when it changes
  useEffect(() => {
    if (initialValue !== initialValueRef.current) {
      initialValueRef.current = initialValue;
      setValue(initialValue);
      setIsDirty(false);
    }
  }, [initialValue]);

  // Track dirty state
  useEffect(() => {
    setIsDirty(value !== initialValueRef.current);
  }, [value]);

  // Debounced validation
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      if (editor && value !== undefined) {
        try {
          const result = editor.validate(value);

          // Handle validation result (boolean | string from BaseEditor)
          let validationResult: ValidationResult;
          if (typeof result === 'boolean') {
            validationResult = {
              isValid: result,
              errors: result ? [] : ['Validation failed']
            };
          } else if (typeof result === 'string') {
            validationResult = {
              isValid: false,
              errors: [result]
            };
          } else if (result && typeof result === 'object' && 'isValid' in result) {
            // It's already a ValidationResult object
            validationResult = result;
          } else {
            // Fallback for unknown result type
            validationResult = {
              isValid: true,
              errors: []
            };
          }

          setValidationResult(validationResult);

          if (autoSave && validationResult.isValid && isDirty) {
            await save();
          }
        } catch (error) {
          setValidationResult({
            isValid: false,
            errors: [`Validation error: ${(error as Error).message}`]
          });
        }
      }
    }, debounceMs);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  // BUG FIX: Added 'save' to dependencies to prevent infinite loop
  // The save function is stable (created with useCallback) but must be included
  }, [value, editor, isDirty, autoSave, debounceMs, save]);

  // Create editor when element type is available
  useEffect(() => {
    let mounted = true;

    async function createEditor() {
      if (!sightEditRef.current || !type) return;

      try {
        // Create a virtual element for the editor
        const element = document.createElement('div');
        element.setAttribute('data-sight', sight);
        element.setAttribute('data-type', type);

        // BUG FIX: Use stableValidation instead of validation to prevent infinite loops
        if (stableValidation) {
          element.setAttribute('data-validation', JSON.stringify(stableValidation));
        }

        const newEditor = sightEditRef.current.createEditor(element, type);

        if (mounted) {
          setEditor(newEditor);
        }
      } catch (error) {
        // BUG FIX: Use onErrorRef.current to avoid unstable callback dependency
        if (mounted && onErrorRef.current) {
          onErrorRef.current(error as Error);
        }
      }
    }

    createEditor();

    return () => {
      mounted = false;
    };
  // BUG FIX: Use stableValidation instead of validation and onError to prevent infinite loops
  }, [sight, type, stableValidation]);

  const save = useCallback(async () => {
    if (!sightEditRef.current || !validationResult?.isValid) {
      return;
    }

    try {
      const saveData: SaveData = {
        sight,
        value,
        type: type || 'text',
        previous: initialValueRef.current
      };

      await sightEditRef.current.save(saveData);

      initialValueRef.current = value;
      setIsDirty(false);

      // BUG FIX: Use onSaveRef.current to avoid unstable callback dependency
      if (onSaveRef.current) {
        onSaveRef.current(value);
      }
    } catch (error) {
      // BUG FIX: Use onErrorRef.current to avoid unstable callback dependency
      if (onErrorRef.current) {
        onErrorRef.current(error as Error);
      }
      throw error;
    }
  // BUG FIX: Removed onSave and onError from dependencies - they're accessed via refs
  }, [sight, value, type, validationResult]);

  const reset = useCallback(() => {
    setValue(initialValueRef.current);
    setIsDirty(false);
    setIsEditing(false);
  }, []);

  const handleSetValue = useCallback((newValue: any) => {
    setValue(newValue);
  }, []);

  return {
    value,
    setValue: handleSetValue,
    isEditing,
    setIsEditing,
    isDirty,
    isValid: validationResult?.isValid ?? true,
    errors: validationResult?.errors ?? [],
    save,
    reset,
    editor,
    validationResult
  };
}