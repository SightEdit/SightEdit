'use client'

import React, { 
  createContext, 
  useContext, 
  useEffect, 
  useRef, 
  useState,
  useCallback,
  ReactNode 
} from 'react';
import SightEdit, { SightEditConfig } from '@sightedit/core';

type SightEditCore = ReturnType<typeof SightEdit.init>;

interface SightEditContextValue {
  instance: SightEditCore | null;
  isEditMode: boolean;
  toggleEditMode: () => void;
  save: (sight: string, value: any) => Promise<void>;
}

const SightEditContext = createContext<SightEditContextValue>({
  instance: null,
  isEditMode: false,
  toggleEditMode: () => {},
  save: async () => {}
});

interface SightEditProviderProps {
  config: SightEditConfig;
  children: ReactNode;
}

export const SightEditProvider: React.FC<SightEditProviderProps> = ({ 
  config, 
  children 
}) => {
  const [instance, setInstance] = useState<SightEditCore | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const instanceRef = useRef<SightEditCore | null>(null);

  useEffect(() => {
    // Initialize SightEdit
    const sightEditInstance = SightEdit.init(config);
    instanceRef.current = sightEditInstance;
    setInstance(sightEditInstance);

    // Listen for edit mode changes
    const handleEditModeEntered = () => setIsEditMode(true);
    const handleEditModeExited = () => setIsEditMode(false);

    sightEditInstance.on('editModeEntered', handleEditModeEntered);
    sightEditInstance.on('editModeExited', handleEditModeExited);

    // Set initial edit mode state
    setIsEditMode(sightEditInstance.isEditMode());

    return () => {
      sightEditInstance.off('editModeEntered', handleEditModeEntered);
      sightEditInstance.off('editModeExited', handleEditModeExited);
      sightEditInstance.destroy();
    };
  }, []);

  const toggleEditMode = useCallback(() => {
    if (instanceRef.current) {
      instanceRef.current.toggleEditMode();
    }
  }, []);

  const save = useCallback(async (sight: string, value: any) => {
    if (instanceRef.current) {
      await instanceRef.current.save({ sight, value });
    }
  }, []);

  return (
    <SightEditContext.Provider value={{ instance, isEditMode, toggleEditMode, save }}>
      {children}
    </SightEditContext.Provider>
  );
};

export const useSightEdit = () => {
  const context = useContext(SightEditContext);
  if (!context) {
    throw new Error('useSightEdit must be used within a SightEditProvider');
  }
  return context;
};

interface EditableProps {
  sight: string;
  type?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string | Array<{ value: string; label: string }>;
  validation?: (value: any) => boolean | string;
  onChange?: (value: any) => void;
  [key: string]: any;
}

export const Editable: React.FC<EditableProps> = ({
  sight,
  type,
  children,
  className,
  style,
  placeholder,
  required,
  minLength,
  maxLength,
  min,
  max,
  options,
  validation,
  onChange,
  ...props
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { instance } = useSightEdit();

  useEffect(() => {
    if (!elementRef.current || !instance) return;

    const element = elementRef.current;
    
    // Add data attributes
    element.dataset.sight = sight;
    if (type) element.dataset.sightType = type;
    if (placeholder) element.dataset.sightPlaceholder = placeholder;
    if (required) element.dataset.sightRequired = 'true';
    if (minLength !== undefined) element.dataset.sightMinLength = minLength.toString();
    if (maxLength !== undefined) element.dataset.sightMaxLength = maxLength.toString();
    if (min !== undefined) element.dataset.sightMin = min.toString();
    if (max !== undefined) element.dataset.sightMax = max.toString();
    if (options) {
      element.dataset.sightOptions = typeof options === 'string' 
        ? options 
        : JSON.stringify(options);
    }
    if (validation) {
      element.dataset.sightValidation = validation.toString();
    }

    // Trigger refresh to detect the element
    instance.refresh();

    // Handle change callback
    if (onChange) {
      const handleChange = (e: any) => {
        if (e.detail?.sight === sight) {
          onChange(e.detail.value);
        }
      };
      
      element.addEventListener('sightEditChange', handleChange);
      return () => {
        element.removeEventListener('sightEditChange', handleChange);
      };
    }
  }, [instance, sight, type, placeholder, required, minLength, maxLength, min, max, options, validation, onChange]);

  return (
    <div ref={elementRef} className={className} style={style} {...props}>
      {children}
    </div>
  );
};

interface EditModeToggleProps {
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export const EditModeToggle: React.FC<EditModeToggleProps> = ({
  className,
  style,
  children
}) => {
  const { isEditMode, toggleEditMode } = useSightEdit();

  return (
    <button
      className={className}
      style={style}
      onClick={toggleEditMode}
      aria-label={isEditMode ? 'Exit edit mode' : 'Enter edit mode'}
    >
      {children || (isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode')}
    </button>
  );
};

// HOC for class components
export function withSightEdit<P extends object>(
  Component: React.ComponentType<P & SightEditContextValue>
): React.FC<P> {
  return (props: P) => {
    const sightEditProps = useSightEdit();
    return <Component {...props} {...sightEditProps} />;
  };
}

// Utility hooks
export const useEditMode = () => {
  const { isEditMode, toggleEditMode } = useSightEdit();
  return { isEditMode, toggleEditMode };
};

export const useSightEditSave = () => {
  const { save } = useSightEdit();
  return save;
};

// Export error boundary components
export {
  SightEditErrorBoundary,
  withErrorBoundary,
  useErrorHandler
} from './components/ErrorBoundary';

// Export additional components
export { Toolbar } from './components/Toolbar';
export { Preview } from './components/Preview';
export { CollaboratorList } from './components/CollaboratorList';

// Export main hooks
export { useSightEdit as useSightEditHook, useSightEditContext } from './hooks/useSightEdit';
export { useEditor } from './hooks/useEditor';

// Export hooks
export { useCollaboration } from './hooks/useCollaboration';
export { useHistory } from './hooks/useHistory';
export { useAutoSave } from './hooks/useAutoSave';

// Export component override system (v2.0)
export {
  createReactComponentRenderer,
  useComponentOverride,
  ComponentOverrideProvider,
  CustomToolbar,
  CustomModal,
  CustomButton,
  CustomMessage
} from './components/ComponentOverride';

// Re-export types from core
export type {
  SightEditConfig,
  SaveData,
  ElementType,
  EditMode,
  Plugin,
  ThemeConfig,
  AuthConfig
} from '@sightedit/core';