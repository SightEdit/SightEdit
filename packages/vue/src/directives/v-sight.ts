import { Directive, DirectiveBinding } from 'vue';

export const vSight: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
    if (!binding.value) {
      console.warn('v-sight directive requires a value');
      return;
    }

    // Set the sight identifier
    el.dataset.sight = binding.value;

    // Auto-detect the type based on element
    if (!el.dataset.sightType) {
      const tagName = el.tagName.toLowerCase();
      const contentEditable = el.contentEditable === 'true';
      
      if (tagName === 'img') {
        el.dataset.sightType = 'image';
      } else if (tagName === 'a') {
        el.dataset.sightType = 'link';
      } else if (tagName === 'select') {
        el.dataset.sightType = 'select';
      } else if (tagName === 'input') {
        const inputType = (el as HTMLInputElement).type;
        switch (inputType) {
          case 'color':
            el.dataset.sightType = 'color';
            break;
          case 'date':
          case 'datetime-local':
            el.dataset.sightType = 'date';
            break;
          case 'number':
            el.dataset.sightType = 'number';
            break;
          case 'file':
            el.dataset.sightType = 'file';
            break;
          default:
            el.dataset.sightType = 'text';
        }
      } else if (tagName === 'textarea' || contentEditable) {
        el.dataset.sightType = 'richtext';
      } else if (el.querySelector('h1, h2, h3, p, ul, ol, blockquote')) {
        el.dataset.sightType = 'richtext';
      } else {
        el.dataset.sightType = 'text';
      }
    }

    // Add modifiers as attributes
    if (binding.modifiers) {
      if (binding.modifiers.required) {
        el.dataset.sightRequired = 'true';
      }
      if (binding.modifiers.readonly) {
        el.dataset.sightReadonly = 'true';
      }
      if (binding.modifiers.inline) {
        el.dataset.sightMode = 'inline';
      }
      if (binding.modifiers.modal) {
        el.dataset.sightMode = 'modal';
      }
      if (binding.modifiers.sidebar) {
        el.dataset.sightMode = 'sidebar';
      }
    }

    // Trigger SightEdit refresh
    const sightEditInstance = (window as any).SightEdit?.getInstance();
    if (sightEditInstance) {
      sightEditInstance.refresh();
    }
  },

  updated(el: HTMLElement, binding: DirectiveBinding<string>) {
    if (el.dataset.sight !== binding.value) {
      el.dataset.sight = binding.value;
      
      const sightEditInstance = (window as any).SightEdit?.getInstance();
      if (sightEditInstance) {
        sightEditInstance.refresh();
      }
    }
  }
};