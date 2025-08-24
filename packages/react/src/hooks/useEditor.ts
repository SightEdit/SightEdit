import { useCallback, useEffect, useState, useRef } from 'react';
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

  // Initialize SightEdit instance
  useEffect(() => {
    if (!sightEditRef.current) {
      sightEditRef.current = SightEditCore.getInstance();
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
          const result = await editor.validate(value);
          setValidationResult(result);
          
          if (autoSave && result.isValid && isDirty) {
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
  }, [value, editor, isDirty, autoSave, debounceMs]);

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
        
        if (validation) {
          element.setAttribute('data-validation', JSON.stringify(validation));
        }

        const newEditor = await sightEditRef.current.createEditor(element, type);
        
        if (mounted) {
          setEditor(newEditor);
        }
      } catch (error) {
        if (mounted && onError) {
          onError(error as Error);
        }
      }
    }

    createEditor();

    return () => {
      mounted = false;
    };
  }, [sight, type, validation, onError]);

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
      
      if (onSave) {
        onSave(value);
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }, [sight, value, type, validationResult, onSave, onError]);

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