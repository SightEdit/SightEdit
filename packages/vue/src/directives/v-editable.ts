import { Directive, DirectiveBinding } from 'vue';

interface EditableBinding {
  sight: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string | Array<{ value: string; label: string }>;
  validation?: (value: any) => boolean | string;
}

export const vEditable: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | EditableBinding>) {
    let config: EditableBinding;
    
    if (typeof binding.value === 'string') {
      config = { sight: binding.value };
    } else {
      config = binding.value;
    }

    // Add data attributes
    el.dataset.sight = config.sight;
    
    if (config.type) el.dataset.sightType = config.type;
    if (config.placeholder) el.dataset.sightPlaceholder = config.placeholder;
    if (config.required) el.dataset.sightRequired = 'true';
    if (config.minLength !== undefined) el.dataset.sightMinLength = config.minLength.toString();
    if (config.maxLength !== undefined) el.dataset.sightMaxLength = config.maxLength.toString();
    if (config.min !== undefined) el.dataset.sightMin = config.min.toString();
    if (config.max !== undefined) el.dataset.sightMax = config.max.toString();
    
    if (config.options) {
      el.dataset.sightOptions = typeof config.options === 'string' 
        ? config.options 
        : JSON.stringify(config.options);
    }
    
    if (config.validation) {
      el.dataset.sightValidation = config.validation.toString();
    }

    // Trigger SightEdit refresh
    const sightEditInstance = (window as any).SightEdit?.getInstance();
    if (sightEditInstance) {
      sightEditInstance.refresh();
    }
  },

  updated(el: HTMLElement, binding: DirectiveBinding<string | EditableBinding>) {
    let config: EditableBinding;
    
    if (typeof binding.value === 'string') {
      config = { sight: binding.value };
    } else {
      config = binding.value;
    }

    // Update data attributes if changed
    if (el.dataset.sight !== config.sight) {
      el.dataset.sight = config.sight;
      
      const sightEditInstance = (window as any).SightEdit?.getInstance();
      if (sightEditInstance) {
        sightEditInstance.refresh();
      }
    }
  },

  unmounted(el: HTMLElement) {
    // Clean up if necessary
    const sightEditInstance = (window as any).SightEdit?.getInstance();
    if (sightEditInstance) {
      // Remove editor instance for this element
      const editors = (sightEditInstance as any).editors;
      if (editors && editors.has(el)) {
        const editor = editors.get(el);
        if (editor && editor.destroy) {
          editor.destroy();
        }
        editors.delete(el);
      }
    }
  }
};