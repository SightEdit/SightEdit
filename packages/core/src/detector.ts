import { DetectedElement, ElementType, EditMode, ElementContext, ElementSchema } from './types';

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
    
    // Support both data-sight and data-sightedit attributes
    const sightElements = root.querySelectorAll('[data-sight]');
    const sightEditElements = root.querySelectorAll('[data-sightedit]');

    // Process data-sight elements (legacy format)
    sightElements.forEach(element => {
      if (element instanceof HTMLElement && !element.dataset.sightEditReady) {
        const detected = this.detectElement(element);
        if (detected) {
          elements.push(detected);
        }
      }
    });

    // Process data-sightedit elements (new format)  
    sightEditElements.forEach(element => {
      if (element instanceof HTMLElement && !element.dataset.sightEditReady) {
        const detected = this.detectElementNewFormat(element);
        if (detected) {
          elements.push(detected);
        }
      }
    });

    return elements;
  }

  /**
   * Detect element with new data-sightedit format
   */
  static detectElementNewFormat(element: HTMLElement): DetectedElement | null {
    const sightEditValue = element.dataset.sightedit;
    if (!sightEditValue) return null;

    // Parse the configuration
    const config = this.parseSimpleConfig(sightEditValue);
    const type = config.type || this.detectType(element);
    
    // For mode detection, create a temporary element dataset to use existing logic
    const tempElement = element.cloneNode(true) as HTMLElement;
    if (config.type) {
      tempElement.dataset.sightType = config.type;
    }
    if (config.mode) {
      tempElement.dataset.sightMode = config.mode;
    }
    
    const mode = config.mode as EditMode || this.detectMode(tempElement);
    const context = this.extractContext(element);
    
    // Build schema from config and merge with element data attributes
    const schema: ElementSchema = { type };
    
    // Copy all config properties to schema (except type, id, mode)
    Object.keys(config).forEach(key => {
      if (!['type', 'id', 'mode'].includes(key)) {
        (schema as any)[key] = config[key];
      }
    });
    
    // Also extract from data attributes for backward compatibility
    const extractedSchema = this.extractSchema(element);
    if (extractedSchema) {
      Object.assign(schema, extractedSchema);
      // Config overrides data attributes
      Object.keys(config).forEach(key => {
        if (!['type', 'id', 'mode'].includes(key)) {
          (schema as any)[key] = config[key];
        }
      });
    }

    return {
      element,
      type,
      sight: config.id || element.dataset.sightId || this.generateSightId(element),
      mode,
      id: config.id,
      context,
      schema: Object.keys(schema).length > 1 ? schema : undefined
    };
  }

  /**
   * Simple config parser for data-sightedit attribute
   * Supports formats:
   * - JSON: {"type":"text","id":"name"}
   * - Simple: text#id
   * - Bracket: text#id[required,maxLength:100]
   * - Key-value: type=text;id=name
   */
  private static parseSimpleConfig(value: string): any {
    // If it clearly looks like JSON (starts and ends with braces), try JSON first
    if (value.trim().startsWith('{') && value.trim().endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to other parsing methods
      }
    }
    
    // Handle bracket notation: text#id[required,maxLength:100]
    const bracketMatch = value.match(/^([^\[#]+)(?:#([^\[]+))?(?:\[([^\]]+)\])?$/);
    if (bracketMatch) {
      const [, type, id, params] = bracketMatch;
      const config: any = { type: type.trim() };
      
      if (id) {
        config.id = id.trim();
      }
      
      if (params) {
        // Parse parameters: required,maxLength:100,placeholder:"Enter text"
        const paramPairs = params.split(',');
        for (const param of paramPairs) {
          if (param.includes(':')) {
            const [key, val] = param.split(':').map(s => s.trim());
            if (key && val) {
              // Handle quoted values
              let parsedVal = val.replace(/^["']|["']$/g, '');
              // Convert numbers and booleans
              if (parsedVal === 'true') parsedVal = true as any;
              else if (parsedVal === 'false') parsedVal = false as any;
              else if (!isNaN(Number(parsedVal)) && parsedVal !== '') parsedVal = Number(parsedVal) as any;
              config[key] = parsedVal;
            }
          } else {
            // Boolean flag like "required"
            config[param.trim()] = true;
          }
        }
      }
      
      return config;
    }
    
    // Handle simple format: text#id
    const simpleMatch = value.match(/^([^#]+)(?:#(.+))?$/);
    if (simpleMatch) {
      const [, type, id] = simpleMatch;
      const config: any = { type: type.trim() };
      if (id) {
        config.id = id.trim();
      }
      return config;
    }
    
    // Fall back to key=value parsing
    const config: any = {};
    const pairs = value.split(';');
    
    for (const pair of pairs) {
      const [key, val] = pair.split('=').map(s => s.trim());
      if (key && val) {
        config[key] = val === 'true' ? true : val === 'false' ? false : val;
      }
    }
    
    return config;
  }

  /**
   * Generate a unique sight ID for elements without explicit IDs
   */
  private static generateSightId(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();
    const className = element.className.split(' ')[0] || '';
    const index = Array.from(element.parentElement?.children || []).indexOf(element);
    return `${tag}${className ? `-${className}` : ''}-${index}`;
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
      if (type === 'file') return 'file';
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
      
      // Simple JSON detection with size limit to prevent DoS
      if ((content.startsWith('{') && content.endsWith('}')) ||
          (content.startsWith('[') && content.endsWith(']'))) {
        // Limit JSON size to prevent DoS attacks
        if (content.length < 10000) {
          try {
            JSON.parse(content);
            return 'json';
          } catch {
            // Not JSON, continue
          }
        }
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
    
    if (type === 'richtext' || type === 'json') {
      return 'modal';
    }
    
    if (type === 'collection') {
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

    // Look for parent record context
    let current = element.parentElement;
    while (current) {
      if (current.dataset.sightRecord) {
        context.recordId = current.dataset.sightRecord;
        break;
      }
      if (current.dataset.sightContext) {
        try {
          // Size limit to prevent DoS
          if (current.dataset.sightContext.length > 10000) {
            console.warn('sightContext data exceeds size limit');
            break;
          }

          const parsed = JSON.parse(current.dataset.sightContext);

          // Validate it's a plain object to prevent prototype pollution
          if (parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed) &&
              parsed.constructor === Object) {

            // Safely copy properties, excluding dangerous keys
            const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
            for (const key of Object.keys(parsed)) {
              if (!dangerousKeys.includes(key)) {
                context[key] = parsed[key];
              }
            }
            break;
          }
        } catch {
          // Invalid JSON, skip
        }
      }
      current = current.parentElement;
    }

    // Extract context from URL
    try {
      const url = new URL(window.location.href);
      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts.length > 0) {
        context.pageType = pathParts[0];
      }

      if (pathParts.length > 1 && /^\d+$/.test(pathParts[1])) {
        context.recordId = context.recordId || pathParts[1];
      }
    } catch (error) {
      // URL construction failed - likely malformed location.href
      console.warn('Failed to parse URL for context extraction:', error);
    }

    // Extract section context
    const section = element.closest('section, article, header, footer, aside');
    if (section) {
      context.section = section.tagName.toLowerCase();
      if (section.id) {
        context.section = section.id;
      } else if (section.className) {
        context.section = section.className.split(' ')[0];
      }
    }

    // Extract item index for collections
    if (element.dataset.sightItem) {
      context.index = parseInt(element.dataset.sightItem, 10);
    }

    // Extract metadata
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

    // Extract from data-sight-* attributes (legacy format)
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

    if (element.dataset.sightMaxSize) {
      schema.maxSize = element.dataset.sightMaxSize;
    }

    if (element.dataset.sightAspectRatio) {
      schema.aspectRatio = element.dataset.sightAspectRatio;
    }

    if (element.dataset.sightStep) {
      schema.step = parseFloat(element.dataset.sightStep);
    }

    if (element.dataset.sightFormat) {
      schema.format = element.dataset.sightFormat;
    }

    if (element.dataset.sightCurrency) {
      schema.currency = element.dataset.sightCurrency;
    }

    if (element.dataset.sightToolbar) {
      try {
        schema.toolbar = JSON.parse(element.dataset.sightToolbar);
      } catch {
        schema.toolbar = element.dataset.sightToolbar.split(',').map(t => t.trim());
      }
    }

    if (element.dataset.sightCrop === 'true') {
      schema.crop = true;
    }

    if (element.dataset.sightMultiple === 'true') {
      schema.multiple = true;
    }

    if (element.dataset.sightItemType) {
      schema.itemType = element.dataset.sightItemType;
    }

    if (element.dataset.sightMinItems) {
      schema.minItems = parseInt(element.dataset.sightMinItems, 10);
    }

    if (element.dataset.sightMaxItems) {
      schema.maxItems = parseInt(element.dataset.sightMaxItems, 10);
    }

    if (element.dataset.sightIncludeTime === 'true') {
      schema.includeTime = true;
    }

    if (element.dataset.sightOptions) {
      try {
        const parsed = JSON.parse(element.dataset.sightOptions);
        if (parsed && Array.isArray(parsed)) {
          schema.options = parsed;
        }
      } catch {
        // Fallback to comma-separated string parsing
        schema.options = element.dataset.sightOptions.split(',').map(opt => ({
          value: opt.trim(),
          label: opt.trim()
        }));
      }
    }

    return Object.keys(schema).length > 1 ? schema : undefined;
  }

  private static isValidType(type: string): boolean {
    const validTypes = [
      'text', 'richtext', 'image', 'link', 'collection',
      'color', 'date', 'select', 'number', 'json'
    ];
    return validTypes.includes(type);
  }
}