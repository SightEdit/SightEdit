export interface SightEditConfig {
  endpoint: string;
  apiKey?: string;
  mode?: 'development' | 'production';
  auth?: AuthConfig;
  plugins?: Plugin[];
  theme?: ThemeConfig;
  debug?: boolean;
  locale?: string;
  translations?: Record<string, string>;
  onSave?: (data: SaveData) => void | Promise<void>;
  onChange?: (data: any) => void | Promise<void>;
  onError?: (error: Error) => void;
  editModeKey?: string;
  schemaRegistry?: {
    endpoint?: string;
    cache?: boolean;
    ttl?: number;
  };
  accessibility?: {
    announceChanges?: boolean;
    keyboardShortcuts?: boolean;
    focusIndicator?: boolean;
    highContrast?: boolean;
    reducedMotion?: boolean;
  };
  collaboration?: {
    websocketUrl: string;
    roomId: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  };
  sentry?: {
    dsn: string;
    environment?: string;
    release?: string;
    sampleRate?: number;
    tracesSampleRate?: number;
    debug?: boolean;
  };
  telemetry?: {
    enabled?: boolean;
    endpoint?: string;
    apiKey?: string;
    userId?: string;
    sessionId?: string;
    sampleRate?: number;
    enableWebVitals?: boolean;
    enablePerformance?: boolean;
  } | false;
  monitoring?: {
    enabled?: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    theme?: 'light' | 'dark' | 'auto';
    collapsed?: boolean;
    showOnErrors?: boolean;
  };
  circuitBreakerOptions?: {
    failureThreshold?: number;
    timeout?: number;
    monitoringPeriod?: number;
  };
}

export interface AuthConfig {
  type?: 'bearer' | 'cookie' | 'custom';
  token?: string;
  getToken?: () => string | Promise<string>;
  headers?: Record<string, string>;
}

export interface ThemeConfig {
  primaryColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  zIndex?: number;
}

// Advanced Theme Configuration for v2.0
export interface AdvancedThemeConfig {
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    onPrimary: string;
    secondary: string;
    secondaryLight: string;
    secondaryDark: string;
    onSecondary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    background: string;
    surface: string;
    onBackground: string;
    onSurface: string;
    neutral: {
      50: string;
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
      800: string;
      900: string;
    };
  };
  typography: {
    fontFamily: {
      sans: string;
      serif: string;
      mono: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      '2xl': string;
      '3xl': string;
      '4xl': string;
    };
    fontWeight: {
      light: number;
      normal: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };
  spacing: {
    0: string;
    1: string;
    2: string;
    3: string;
    4: string;
    5: string;
    6: string;
    8: string;
    10: string;
    12: string;
    16: string;
    20: string;
    24: string;
  };
  borderRadius: {
    none: string;
    sm: string;
    base: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    full: string;
  };
  shadows: {
    sm: string;
    base: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    none: string;
  };
  zIndex: {
    base: number;
    dropdown: number;
    sticky: number;
    fixed: number;
    modalBackdrop: number;
    modal: number;
    popover: number;
    tooltip: number;
    toolbar: number;
  };
  components?: {
    toolbar?: ComponentTheme;
    modal?: ComponentTheme;
    editor?: ComponentTheme;
    [key: string]: ComponentTheme | undefined;
  };
}

export interface ComponentTheme {
  background?: string;
  color?: string;
  padding?: string;
  borderRadius?: string;
  border?: string;
  boxShadow?: string;
  hover?: Partial<ComponentTheme>;
  active?: Partial<ComponentTheme>;
  disabled?: Partial<ComponentTheme>;
  sm?: Partial<ComponentTheme>;
  md?: Partial<ComponentTheme>;
  lg?: Partial<ComponentTheme>;
}

export interface Plugin {
  name: string;
  version: string;
  init(sightEdit: SightEdit): void;
  editors?: Record<string, EditorConstructor>;
  toolbar?: ToolbarItem[];
  hooks?: Hooks;
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
  position?: 'left' | 'right';
}

export interface Hooks {
  beforeSave?: (data: SaveData) => SaveData | Promise<SaveData>;
  afterSave?: (response: SaveResponse) => void;
  beforeEdit?: (element: HTMLElement) => boolean;
  afterEdit?: (element: HTMLElement, value: any) => void;
}

export type ElementType = 
  | 'text'
  | 'richtext'
  | 'image'
  | 'file'
  | 'link'
  | 'collection'
  | 'color'
  | 'date'
  | 'select'
  | 'number'
  | 'json'
  | 'markdown'
  | 'product-selector'
  | 'html-designer'
  | 'custom';

export type EditMode = 'inline' | 'modal' | 'sidebar' | 'tooltip' | 'visual' | 'code' | 'split';

export interface DetectedElement {
  element: HTMLElement;
  type: ElementType;
  sight: string;
  mode: EditMode;
  id?: string;
  context?: ElementContext;
  schema?: ElementSchema;
}

export interface ElementContext {
  recordId?: string;
  pageType?: string;
  section?: string;
  index?: number;
  parent?: string;
  metadata?: Record<string, any>;
}

export interface ElementSchema {
  type: ElementType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
  validation?: (value: any) => boolean | string;
  
  // Additional properties for different editor types
  maxSize?: string;
  aspectRatio?: string;
  step?: number;
  format?: string;
  currency?: string;
  toolbar?: string[] | any[];
  crop?: boolean;
  multiple?: boolean;
  itemType?: string;
  minItems?: number;
  maxItems?: number;
  includeTime?: boolean;
}

export interface Editor {
  element: HTMLElement;
  value: any;
  render(): void;
  getValue(): any;
  setValue(value: any): void;
  applyValue(value: any): void;
  validate(value?: any): boolean | string | ValidationResult;
  destroy(): void;
  onSave?: (value: any) => Promise<void>;
  extractValue(): any; // Added for saveAll functionality
  _cleanupFunctions?: (() => void)[];
  
  // Additional methods expected by tests
  getId(): string;
  getElement(): Element;
  isDestroyed(): boolean;
  focus(): void;
  blur(): void;
  
  // Properties for editor metadata
  sight?: string;
  type?: string;
}

export interface EditorConfig {
  mode?: EditMode;
  schema?: ElementSchema | any; // Allow advanced schemas as well
  theme?: ThemeConfig;
  locale?: string;
  a11y?: any; // AccessibilityManager instance
  sight?: string; // For legacy compatibility
  type?: string; // For type metadata
}

export type EditorOptions = EditorConfig;

export interface EditorConstructor {
  new (element: HTMLElement, options?: EditorOptions): Editor;
}

export interface SaveData {
  sight: string;
  value: any;
  id?: string;
  type: ElementType;
  context?: ElementContext;
  timestamp?: number;
  previous?: any; // Previous value for undo functionality
  skipHistory?: boolean; // Skip adding to history
}

export interface SaveResponse {
  success: boolean;
  data?: any;
  error?: string;
  version?: number;
  queued?: boolean;
}

export interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  data: SaveData;
}

export interface BatchResponse {
  success: boolean;
  results: SaveResponse[];
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: any;
}

export interface SightEdit {
  init(config: SightEditConfig): void;
  enterEditMode(): void;
  exitEditMode(): void;
  toggleEditMode(): void;
  isEditMode(): boolean;
  save(sight: string, value: any): Promise<SaveResponse>;
  batch(operations: BatchOperation[]): Promise<BatchResponse>;
  registerEditor(type: string, editor: EditorConstructor): void;
  registerPlugin(plugin: Plugin): void;
  refresh(): void;
  destroy(): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  emit(event: string, data?: any): void;
}