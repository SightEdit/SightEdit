import { DetectedElement, ElementType, EditMode, ElementContext, ElementSchema } from './types';
import { SafeJSONParser } from './utils/safe-json';
import { ValidationEngine } from './utils/validation-engine';

export type { DetectedElement };

export class ElementDetector {
  private static readonly TYPE_PATTERNS: Record<string, RegExp> = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^https?:\/\//,
    color: /^#[0-9a-f]{3,6}$/i,
    date: /^\d{4}-\d{2}-\d{2}$/,
    number: /^-?\d+\.?\d*$/
  };

  static scan(root: HTMLElement = document.body): DetectedElement[] {
    const elements: DetectedElement[] = [];
    const sightElements = root.querySelectorAll('[data-sight]');

    sightElements.forEach(element => {
      if (element instanceof HTMLElement && !element.dataset.sightEditReady) {
        const detected = this.detectElement(element);
        if (detected) {
          elements.push(detected);
        }
      }
    });

    return elements;
  }

  static detectElement(element: HTMLElement): DetectedElement | null {
    const sight = element.dataset.sight;
    if (!sight) return null;

    const type = this.detectType(element);
    const mode = this.detectMode(element);
    const context = this.extractContext(element);
    const schema = this.extractSchema(element);

    return {
      element,
      type,
      sight,
      mode,
      id: element.dataset.sightId,
      context,
      schema
    };
  }

  static detectType(element: HTMLElement): ElementType {
    const explicitType = element.dataset.sightType;
    if (explicitType && this.isValidType(explicitType)) {
      return explicitType as ElementType;
    }

    const tagName = element.tagName.toLowerCase();
    const content = element.textContent?.trim() || '';
    const hasChildren = element.children.length > 0;

    if (tagName === 'img') return 'image';
    if (tagName === 'a') return 'link';
    if (tagName === 'select') return 'select';
    if (tagName === 'input') {
      const type = element.getAttribute('type');
      if (type === 'color') return 'color';
      if (type === 'date' || type === 'datetime-local') return 'date';
      if (type === 'number') return 'number';
    }

    if (element.dataset.sightCollection || element.querySelector('[data-sight-item]')) {
      return 'collection';
    }

    if (hasChildren && (element.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote'))) {
      return 'richtext';
    }

    if (content) {
      if (this.TYPE_PATTERNS.color.test(content)) return 'color';
      if (this.TYPE_PATTERNS.date.test(content)) return 'date';
      if (this.TYPE_PATTERNS.number.test(content) && content.length < 20) return 'number';
      
      // Check if content is valid JSON
      if (SafeJSONParser.tryParse(content) !== null) {
        return 'json';
      }
    }

    return 'text';
  }

  static detectMode(element: HTMLElement): EditMode {
    const mode = element.dataset.sightMode;
    if (mode && ['inline', 'modal', 'sidebar', 'tooltip'].includes(mode)) {
      return mode as EditMode;
    }

    const type = this.detectType(element);
    
    if (type === 'richtext' || type === 'collection' || type === 'json') {
      return 'modal';
    }
    
    if (type === 'image') {
      return 'sidebar';
    }
    
    if (type === 'color' || type === 'date' || type === 'select') {
      return 'tooltip';
    }

    return 'inline';
  }

  static extractContext(element: HTMLElement): ElementContext {
    const context: ElementContext = {};

    let current = element.parentElement;
    while (current) {
      if (current.dataset.sightRecord) {
        context.recordId = current.dataset.sightRecord;
        break;
      }
      if (current.dataset.sightContext) {
        const parsed = SafeJSONParser.tryParse(current.dataset.sightContext);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(context, parsed);
          break;
        }
      }
      current = current.parentElement;
    }

    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    if (pathParts.length > 0) {
      context.pageType = pathParts[0];
    }
    
    if (pathParts.length > 1 && /^\d+$/.test(pathParts[1])) {
      context.recordId = context.recordId || pathParts[1];
    }

    const section = element.closest('section, article, header, footer, aside');
    if (section) {
      context.section = section.tagName.toLowerCase();
      if (section.id) {
        context.section = section.id;
      } else if (section.className) {
        context.section = section.className.split(' ')[0];
      }
    }

    if (element.dataset.sightItem) {
      context.index = parseInt(element.dataset.sightItem, 10);
    }

    const metaKeys = Object.keys(element.dataset).filter(key => key.startsWith('sightMeta'));
    if (metaKeys.length > 0) {
      context.metadata = {};
      metaKeys.forEach(key => {
        const metaKey = key.replace('sightMeta', '').toLowerCase();
        context.metadata![metaKey] = element.dataset[key];
      });
    }

    return context;
  }

  static extractSchema(element: HTMLElement): ElementSchema | undefined {
    const type = this.detectType(element);
    const schema: ElementSchema = { type };

    if (element.dataset.sightLabel) {
      schema.label = element.dataset.sightLabel;
    }

    if (element.dataset.sightPlaceholder) {
      schema.placeholder = element.dataset.sightPlaceholder;
    }

    if (element.dataset.sightRequired === 'true') {
      schema.required = true;
    }

    if (element.dataset.sightMinLength) {
      schema.minLength = parseInt(element.dataset.sightMinLength, 10);
    }

    if (element.dataset.sightMaxLength) {
      schema.maxLength = parseInt(element.dataset.sightMaxLength, 10);
    }

    if (element.dataset.sightMin) {
      schema.min = parseFloat(element.dataset.sightMin);
    }

    if (element.dataset.sightMax) {
      schema.max = parseFloat(element.dataset.sightMax);
    }

    if (element.dataset.sightOptions) {
      const parsed = SafeJSONParser.tryParse(element.dataset.sightOptions);
      if (parsed && Array.isArray(parsed)) {
        schema.options = parsed;
      } else {
        // Fallback to comma-separated string parsing
        schema.options = element.dataset.sightOptions.split(',').map(opt => ({
          value: opt.trim(),
          label: opt.trim()
        }));
      }
    }

    if (element.dataset.sightValidation) {
      try {
        // Use secure validation engine instead of Function constructor
        const validationSchema = ValidationEngine.parseValidationString(element.dataset.sightValidation);
        if (validationSchema) {
          schema.validation = (value: any) => {
            const result = ValidationEngine.validate(value, validationSchema);
            if (!result.isValid) {
              throw new Error(result.errors.join(', '));
            }
            return result.sanitizedValue;
          };
        }
      } catch (error) {
        console.warn('Invalid validation string:', error);
      }
    }

    return Object.keys(schema).length > 1 ? schema : undefined;
  }

  private static isValidType(type: string): boolean {
    const validTypes = [
      'text', 'richtext', 'image', 'link', 'collection',
      'color', 'date', 'select', 'number', 'json', 'markdown', 'custom'
    ];
    return validTypes.includes(type);
  }
}