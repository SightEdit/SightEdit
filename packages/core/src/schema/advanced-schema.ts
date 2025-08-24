/**
 * Advanced Schema System for SightEdit
 * Supports backend-driven editor configuration without cluttering HTML
 */

import { ElementType, EditMode } from '../types';

/**
 * Security error for schema validation
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Validation error for schema validation
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Allowed editor types for security validation
 */
export const ALLOWED_EDITOR_TYPES = new Set<string>([
  'text', 'richtext', 'number', 'date', 'select', 
  'image', 'link', 'json', 'color', 'collection',
  'product-selector', 'html-designer'
]);

/**
 * Async lock for preventing race conditions
 */
class AsyncLock {
  private locks = new Map<string, Promise<any>>();
  
  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock on this key
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    
    const promise = fn();
    this.locks.set(key, promise);
    
    try {
      return await promise;
    } finally {
      this.locks.delete(key);
    }
  }
}

/**
 * Enhanced schema that can be fetched from backend
 * Reduces need for data attributes in HTML
 */
export interface AdvancedSchema {
  // Basic identification
  sight: string;
  version?: string;
  
  // Editor configuration
  editor: {
    type: ElementType | 'custom' | 'product-selector' | 'html-designer';
    mode?: EditMode;
    position?: 'inline' | 'sidebar' | 'modal' | 'bottom-panel' | 'floating';
    size?: 'small' | 'medium' | 'large' | 'fullscreen';
    customComponent?: string; // For custom editor components
  };
  
  // Data source configuration
  dataSource?: {
    type: 'static' | 'api' | 'database' | 'graphql';
    endpoint?: string;
    query?: string;
    params?: Record<string, any>;
    transform?: string; // JS function as string to transform data
    cache?: {
      enabled: boolean;
      ttl?: number;
      key?: string;
    };
  };
  
  // Field configuration
  fields?: {
    [key: string]: FieldSchema;
  };
  
  // Validation rules
  validation?: {
    required?: boolean;
    rules?: ValidationRule[];
    async?: boolean; // For server-side validation
    endpoint?: string;
  };
  
  // UI configuration
  ui?: {
    title?: string;
    description?: string;
    icon?: string;
    theme?: 'light' | 'dark' | 'auto';
    layout?: 'vertical' | 'horizontal' | 'grid';
    sections?: SectionConfig[];
    toolbar?: ToolbarConfig;
  };
  
  // Permissions
  permissions?: {
    read?: string[] | boolean;
    write?: string[] | boolean;
    delete?: string[] | boolean;
    roles?: string[];
  };
  
  // Actions and hooks
  actions?: {
    beforeLoad?: string; // JS function as string
    afterLoad?: string;
    beforeSave?: string;
    afterSave?: string;
    onCancel?: string;
  };
  
  // Related data for complex editing
  relations?: {
    [key: string]: RelationSchema;
  };
}

export interface FieldSchema {
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'reference' | 'json' | 'html' | 'image' | 'file';
  label: string;
  placeholder?: string;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  defaultValue?: any;
  
  // Validation
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  
  // For select/multiselect
  options?: Array<{
    value: string | number;
    label: string;
    icon?: string;
    disabled?: boolean;
  }> | {
    source: 'api' | 'database';
    endpoint?: string;
    query?: string;
    valueField: string;
    labelField: string;
  };
  
  // For reference fields (foreign keys)
  reference?: {
    collection: string;
    displayField: string;
    searchFields?: string[];
    filters?: Record<string, any>;
    allowCreate?: boolean;
  };
  
  // UI hints
  ui?: {
    width?: string;
    rows?: number;
    format?: string; // For dates, numbers
    prefix?: string;
    suffix?: string;
    helpText?: string;
    showIf?: string; // Conditional display
  };
}

export interface ValidationRule {
  type: 'custom' | 'regex' | 'email' | 'url' | 'phone' | 'creditcard';
  pattern?: string;
  message: string;
  validator?: string; // JS function as string for custom validation
}

export interface SectionConfig {
  id: string;
  title: string;
  collapsible?: boolean;
  collapsed?: boolean;
  fields: string[];
  layout?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
}

export interface ToolbarConfig {
  actions: Array<{
    id: string;
    label: string;
    icon?: string;
    action: string; // JS function as string
    confirm?: boolean;
    confirmMessage?: string;
  }>;
}

export interface RelationSchema {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  collection: string;
  foreignKey?: string;
  localKey?: string;
  pivotTable?: string;
  displayField: string;
  editable?: boolean;
  addable?: boolean;
  removable?: boolean;
  reorderable?: boolean;
  
  // For inline editing
  inline?: boolean;
  fields?: string[]; // Which fields to show/edit
  
  // For product replacement scenario
  selector?: {
    mode: 'modal' | 'sidebar' | 'dropdown';
    search?: boolean;
    filters?: Array<{
      field: string;
      label: string;
      type: 'select' | 'range' | 'text';
      options?: any[];
    }>;
    preview?: boolean;
    multiple?: boolean;
    limit?: number;
  };
}

/**
 * Product selector specific schema
 * For scenarios like replacing 3 products with another 3
 */
export interface ProductSelectorSchema extends AdvancedSchema {
  editor: {
    type: 'product-selector';
    mode?: EditMode;
    position?: 'modal' | 'sidebar';
  };
  
  productConfig: {
    source: {
      endpoint: string;
      params?: Record<string, any>;
    };
    display: {
      layout: 'grid' | 'list' | 'carousel';
      itemsPerRow?: number;
      fields: Array<{
        field: string;
        label?: string;
        type: 'text' | 'image' | 'price' | 'badge';
        format?: string;
      }>;
    };
    selection: {
      mode: 'single' | 'multiple' | 'replacement';
      min?: number;
      max?: number;
      currentItems?: any[]; // Currently selected items
    };
    filters?: Array<{
      field: string;
      label: string;
      type: 'select' | 'range' | 'search' | 'checkbox';
      options?: any[];
    }>;
    sorting?: Array<{
      field: string;
      label: string;
      default?: boolean;
    }>;
  };
}

/**
 * HTML Designer schema for full section editing
 */
export interface HTMLDesignerSchema extends AdvancedSchema {
  editor: {
    type: 'html-designer';
    mode?: 'visual' | 'code' | 'split';
    position?: 'modal' | 'floating';
  };
  
  designerConfig: {
    allowedElements?: string[];
    blockedElements?: string[];
    templates?: Array<{
      id: string;
      name: string;
      thumbnail?: string;
      html: string;
      css?: string;
    }>;
    components?: Array<{
      id: string;
      name: string;
      icon?: string;
      html: string;
      editable?: boolean;
      droppable?: boolean;
    }>;
    styles?: {
      presets?: Array<{
        name: string;
        css: Record<string, string>;
      }>;
      allowCustomCSS?: boolean;
      allowInlineStyles?: boolean;
    };
    assets?: {
      images?: {
        library?: string;
        upload?: boolean;
        maxSize?: number;
      };
      icons?: {
        sets?: string[];
      };
    };
    responsive?: {
      breakpoints?: Array<{
        name: string;
        width: number;
        icon?: string;
      }>;
      defaultBreakpoint?: string;
    };
  };
}

/**
 * Type guards for schema validation
 */
export function isProductSelectorSchema(schema: AdvancedSchema): schema is ProductSelectorSchema {
  return schema.editor.type === 'product-selector' && 'productConfig' in schema;
}

export function isHTMLDesignerSchema(schema: AdvancedSchema): schema is HTMLDesignerSchema {
  return schema.editor.type === 'html-designer' && 'designerConfig' in schema;
}

/**
 * Schema Registry for managing backend schemas with thread safety
 */
export class SchemaRegistry {
  private schemas: Map<string, AdvancedSchema> = new Map();
  private cache: Map<string, { schema: AdvancedSchema; timestamp: number; accessCount: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes default
  private lock = new AsyncLock();
  private maxCacheSize = 1000; // Prevent memory leaks
  
  constructor(private apiEndpoint: string) {
    // Validate API endpoint
    if (!apiEndpoint || typeof apiEndpoint !== 'string') {
      throw new ValidationError('API endpoint is required and must be a string');
    }
    
    try {
      new URL(apiEndpoint);
    } catch {
      throw new ValidationError('API endpoint must be a valid URL');
    }
  }
  
  /**
   * Fetch schema from backend
   */
  async fetchSchema(sight: string, context?: Record<string, any>): Promise<AdvancedSchema> {
    // Check cache first
    const cached = this.cache.get(sight);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.schema;
    }
    
    try {
      const response = await fetch(`${this.apiEndpoint}/schema/${encodeURIComponent(sight)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ context })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch schema: ${response.statusText}`);
      }
      
      const schema = await response.json();
      
      // Validate schema before caching
      this.validateSchema(schema);
      
      // Evict old entries if cache is getting too large
      this.evictOldEntries();
      
      // Cache the schema
      this.cache.set(sight, {
        schema,
        timestamp: Date.now(),
        accessCount: 1
      });
      
      return schema;
    } catch (error) {
      console.error('Failed to fetch schema:', error);
      
      // Return a default schema as fallback
      return this.getDefaultSchema(sight);
    }
  }
  
  /**
   * Register a schema locally
   */
  registerSchema(sight: string, schema: AdvancedSchema): void {
    this.schemas.set(sight, schema);
  }
  
  /**
   * Get schema (local or remote) with race condition protection
   */
  async getSchema(sight: string, context?: Record<string, any>): Promise<AdvancedSchema> {
    // Input validation
    if (!sight || typeof sight !== 'string') {
      throw new ValidationError('Sight identifier is required and must be a string');
    }
    
    // Sanitize sight identifier
    const sanitizedSight = sight.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    return this.lock.acquire(`schema:${sanitizedSight}`, async () => {
      // Check local registry first (inside lock)
      if (this.schemas.has(sanitizedSight)) {
        return this.schemas.get(sanitizedSight)!;
      }
      
      // Check cache again inside lock
      const cached = this.cache.get(sanitizedSight);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        // Update access count for LRU
        cached.accessCount++;
        return cached.schema;
      }
      
      // Fetch from backend
      return this.fetchSchema(sanitizedSight, context);
    });
  }
  
  /**
   * Generate default schema based on element
   */
  private getDefaultSchema(sight: string): AdvancedSchema {
    return {
      sight,
      editor: {
        type: 'text' as ElementType,
        mode: 'inline'
      },
      ui: {
        title: `Edit ${sight}`
      }
    };
  }
  
  /**
   * Validate schema structure
   */
  private validateSchema(schema: any): void {
    if (!schema || typeof schema !== 'object') {
      throw new ValidationError('Schema must be an object');
    }
    
    if (!schema.sight || typeof schema.sight !== 'string') {
      throw new ValidationError('Schema must have a valid sight identifier');
    }
    
    if (!schema.editor || typeof schema.editor !== 'object') {
      throw new ValidationError('Schema must have an editor configuration');
    }
    
    if (!schema.editor.type || typeof schema.editor.type !== 'string') {
      throw new ValidationError('Schema editor must have a valid type');
    }
  }
  
  /**
   * Evict old entries using LRU strategy
   */
  private evictOldEntries(): void {
    if (this.cache.size <= this.maxCacheSize) {
      return;
    }
    
    const now = Date.now();
    const maxAge = this.cacheTTL * 2;
    
    // First, remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }
    
    // If still too large, remove least recently used entries
    if (this.cache.size > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].accessCount - b[1].accessCount);
      
      const toRemove = this.cache.size - this.maxCacheSize;
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }
  
  /**
   * Clear cache with validation
   */
  clearCache(sight?: string): void {
    if (sight) {
      if (typeof sight !== 'string') {
        throw new ValidationError('Sight identifier must be a string');
      }
      this.cache.delete(sight);
    } else {
      this.cache.clear();
    }
  }
}

/**
 * Schema-based Editor Factory with Security Validation
 */
export class SchemaEditorFactory {
  private editors: Map<string, any> = new Map();
  
  /**
   * Create editor based on schema with security validation
   */
  createEditor(element: HTMLElement, schema: AdvancedSchema): any {
    // Comprehensive input validation
    if (!schema?.editor?.type || typeof schema.editor.type !== 'string') {
      throw new SecurityError('Invalid schema: missing or invalid editor type');
    }
    
    if (!element || !(element instanceof HTMLElement)) {
      throw new ValidationError('Invalid element provided');
    }
    
    const editorType = schema.editor.type.toLowerCase().trim();
    
    // Whitelist validation - only allow approved editor types
    if (!ALLOWED_EDITOR_TYPES.has(editorType)) {
      throw new SecurityError(`Unauthorized editor type: ${editorType}`);
    }
    
    // Additional security checks for specific editor types
    this.validateEditorTypeSchema(editorType, schema);
    
    // Type-safe instantiation using explicit switch
    switch (editorType) {
      case 'product-selector':
        return this.createProductSelector(element, schema as ProductSelectorSchema);
      
      case 'html-designer':
        return this.createHTMLDesigner(element, schema as HTMLDesignerSchema);
      
      default:
        return this.createStandardEditor(element, schema, editorType);
    }
  }
  
  /**
   * Validate schema structure for specific editor types
   */
  private validateEditorTypeSchema(editorType: string, schema: AdvancedSchema): void {
    switch (editorType) {
      case 'product-selector':
        if (!isProductSelectorSchema(schema)) {
          throw new ValidationError('Invalid ProductSelector schema structure');
        }
        this.validateProductSelectorConfig(schema.productConfig);
        break;
        
      case 'html-designer':
        if (!isHTMLDesignerSchema(schema)) {
          throw new ValidationError('Invalid HTMLDesigner schema structure');
        }
        this.validateHTMLDesignerConfig(schema.designerConfig);
        break;
    }
  }
  
  /**
   * Validate ProductSelector configuration
   */
  private validateProductSelectorConfig(config: any): void {
    if (!config?.source?.endpoint || typeof config.source.endpoint !== 'string') {
      throw new ValidationError('ProductSelector requires valid source endpoint');
    }
    
    // Validate endpoint URL format
    try {
      new URL(config.source.endpoint);
    } catch {
      throw new ValidationError('ProductSelector endpoint must be a valid URL');
    }
    
    // Validate selection mode
    const allowedModes = ['single', 'multiple', 'replacement'];
    if (config.selection?.mode && !allowedModes.includes(config.selection.mode)) {
      throw new ValidationError(`Invalid selection mode: ${config.selection.mode}`);
    }
  }
  
  /**
   * Validate HTMLDesigner configuration
   */
  private validateHTMLDesignerConfig(config: any): void {
    // Validate allowed elements if provided
    if (config.allowedElements && !Array.isArray(config.allowedElements)) {
      throw new ValidationError('allowedElements must be an array');
    }
    
    // Validate blocked elements if provided
    if (config.blockedElements && !Array.isArray(config.blockedElements)) {
      throw new ValidationError('blockedElements must be an array');
    }
    
    // Ensure dangerous elements are blocked by default
    const dangerousElements = ['script', 'iframe', 'object', 'embed', 'form'];
    if (config.allowedElements) {
      const dangerous = config.allowedElements.filter((el: string) => 
        dangerousElements.includes(el.toLowerCase())
      );
      if (dangerous.length > 0) {
        throw new SecurityError(`Dangerous HTML elements not allowed: ${dangerous.join(', ')}`);
      }
    }
  }
  
  private createProductSelector(element: HTMLElement, schema: ProductSelectorSchema): any {
    // Implementation for product selector
    // This would create a modal/sidebar with product grid
    console.log('Creating product selector', schema);
    return null; // Placeholder
  }
  
  private createHTMLDesigner(element: HTMLElement, schema: HTMLDesignerSchema): any {
    // Implementation for HTML designer
    // This would create a visual editor for HTML sections
    console.log('Creating HTML designer', schema);
    return null; // Placeholder
  }
  
  private createCustomEditor(element: HTMLElement, schema: AdvancedSchema): any {
    // Load and instantiate custom editor component
    console.log('Creating custom editor', schema);
    return null; // Placeholder
  }
  
  private createStandardEditor(element: HTMLElement, schema: AdvancedSchema, editorType: string): any {
    // Create standard editor based on validated type
    console.log('Creating standard editor', { editorType, schema: schema.sight });
    
    // Additional validation for standard editor types
    const standardTypes = ['text', 'richtext', 'number', 'date', 'select', 'image', 'link', 'json', 'color', 'collection'];
    if (!standardTypes.includes(editorType)) {
      throw new ValidationError(`Unknown standard editor type: ${editorType}`);
    }
    
    return null; // Placeholder - would create appropriate editor instance
  }
}