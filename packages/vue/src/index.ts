import {
  App,
  Plugin,
  ref,
  reactive,
  provide,
  inject,
  onMounted,
  onUnmounted,
  defineComponent,
  h,
  VNode,
  PropType,
  InjectionKey
} from 'vue';
import SightEdit, { SightEditConfig } from '@sightedit/core';

type SightEditCore = ReturnType<typeof SightEdit.init>;

import { SightEditKey, SightEditState, SightEditApi } from './keys';

// Import directives at the top
import { vEditable } from './directives/v-editable';
import { vSight } from './directives/v-sight';

export const SightEditPlugin: Plugin = {
  install(app: App, config: SightEditConfig) {
    const state = reactive<SightEditState>({
      instance: null,
      isEditMode: false
    });

    const api: SightEditApi = {
      state,
      toggleEditMode: () => {
        if (state.instance) {
          state.instance.toggleEditMode();
        }
      },
      save: async (sight: string, value: any, type: string = 'text') => {
        if (state.instance) {
          await state.instance.save({ sight, value, type });
        }
      }
    };

    // Initialize SightEdit
    const instance = SightEdit.init(config);
    state.instance = instance;

    // Listen for edit mode changes
    instance.on('editModeEntered', () => {
      state.isEditMode = true;
    });
    
    instance.on('editModeExited', () => {
      state.isEditMode = false;
    });

    // Set initial state
    state.isEditMode = instance.isEditMode();

    // Provide globally
    app.provide(SightEditKey, api);

    // Add global properties for Options API
    app.config.globalProperties.$sightEdit = api;

    // Register directives
    app.directive('editable', vEditable);
    app.directive('sight', vSight);
  }
};

export const useSightEdit = (): SightEditApi => {
  const api = inject(SightEditKey);
  if (!api) {
    throw new Error('useSightEdit must be used within an app with SightEditPlugin installed');
  }
  return api;
};

export const SightEditProvider = defineComponent({
  name: 'SightEditProvider',
  props: {
    config: {
      type: Object as PropType<SightEditConfig>,
      required: true
    }
  },
  setup(props, { slots }) {
    const state = reactive<SightEditState>({
      instance: null,
      isEditMode: false
    });

    const api: SightEditApi = {
      state,
      toggleEditMode: () => {
        if (state.instance) {
          state.instance.toggleEditMode();
        }
      },
      save: async (sight: string, value: any) => {
        if (state.instance) {
          await state.instance.save({ sight, value });
        }
      }
    };

    onMounted(() => {
      const instance = SightEdit.init(props.config);
      state.instance = instance;

      instance.on('editModeEntered', () => {
        state.isEditMode = true;
      });
      
      instance.on('editModeExited', () => {
        state.isEditMode = false;
      });

      state.isEditMode = instance.isEditMode();
    });

    onUnmounted(() => {
      if (state.instance) {
        state.instance.destroy();
      }
    });

    provide(SightEditKey, api);

    return () => slots.default?.();
  }
});

export const Editable = defineComponent({
  name: 'Editable',
  props: {
    sight: {
      type: String,
      required: true
    },
    type: String,
    tag: {
      type: String,
      default: 'div'
    },
    placeholder: String,
    required: Boolean,
    minLength: Number,
    maxLength: Number,
    min: Number,
    max: Number,
    options: [String, Array] as PropType<string | Array<{ value: string; label: string }>>,
    validation: Function as PropType<(value: any) => boolean | string>
  },
  emits: ['change'],
  setup(props, { slots, emit }) {
    const { state } = useSightEdit();
    const elementRef = ref<HTMLElement | null>(null);

    onMounted(() => {
      if (!elementRef.value || !state.instance) return;

      const element = elementRef.value;
      
      // Add data attributes
      element.dataset.sight = props.sight;
      if (props.type) element.dataset.sightType = props.type;
      if (props.placeholder) element.dataset.sightPlaceholder = props.placeholder;
      if (props.required) element.dataset.sightRequired = 'true';
      if (props.minLength !== undefined) element.dataset.sightMinLength = props.minLength.toString();
      if (props.maxLength !== undefined) element.dataset.sightMaxLength = props.maxLength.toString();
      if (props.min !== undefined) element.dataset.sightMin = props.min.toString();
      if (props.max !== undefined) element.dataset.sightMax = props.max.toString();
      if (props.options) {
        element.dataset.sightOptions = typeof props.options === 'string' 
          ? props.options 
          : JSON.stringify(props.options);
      }
      if (props.validation) {
        element.dataset.sightValidation = props.validation.toString();
      }

      // Trigger refresh
      state.instance.refresh();

      // Handle change events
      const handleChange = (e: any) => {
        if (e.detail?.sight === props.sight) {
          emit('change', e.detail.value);
        }
      };
      
      element.addEventListener('sightEditChange', handleChange);
      
      onUnmounted(() => {
        element.removeEventListener('sightEditChange', handleChange);
      });
    });

    return () => h(
      props.tag,
      { ref: elementRef },
      slots.default?.()
    );
  }
});

export const EditModeToggle = defineComponent({
  name: 'EditModeToggle',
  setup(props, { slots }) {
    const { state, toggleEditMode } = useSightEdit();

    return () => h(
      'button',
      {
        onClick: toggleEditMode,
        'aria-label': state.isEditMode ? 'Exit edit mode' : 'Enter edit mode'
      },
      slots.default?.() || (state.isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode')
    );
  }
});

// Composables
export const useEditMode = () => {
  const { state, toggleEditMode } = useSightEdit();
  return {
    isEditMode: state.isEditMode,
    toggleEditMode
  };
};

export const useSightEditSave = () => {
  const { save } = useSightEdit();
  return save;
};

// Export main composables
export { useSightEdit as useSightEditComposable, useEditor } from './composables/useSightEdit';
export { useEditorState } from './composables/useEditorState';

// Export additional composables
export { useCollaboration } from './composables/useCollaboration';
export { useHistory } from './composables/useHistory';
export { useAutoSave } from './composables/useAutoSave';

// Export directives
export { vEditable } from './directives/v-editable';
export { vSight } from './directives/v-sight';

// Register directives globally when plugin is installed
export const registerDirectives = (app: any) => {
  app.directive('editable', vEditable);
  app.directive('sight', vSight);
};

// Re-export key and types
export { SightEditKey } from './keys';
export type { SightEditState, SightEditApi } from './keys';

// Re-export types
export type { 
  SightEditConfig,
  SaveData,
  ElementType,
  EditMode,
  Plugin as SightEditPluginType,
  ThemeConfig,
  AuthConfig
} from '@sightedit/core';