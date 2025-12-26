/**
 * SightEdit Admin Panel
 * Visual Builder for SightEdit CMS
 */

// Export stores
export { useSchemaStore, validateSchema } from './core/schema-store';
export type { ElementSchema, SchemaEntry } from './core/schema-store';

export { useThemeStore, isValidColor, generateColorVariants } from './core/theme-store';
export type { AdvancedThemeConfig, ThemeEntry } from './core/theme-store';

export {
  StorageManager,
  LocalStorageAdapter,
  APIStorageAdapter,
  FileSystemAdapter,
  getGlobalStorage
} from './core/storage';
export type { ProjectConfig, StorageAdapter } from './core/storage';

// Export builders
export { SchemaBuilder } from './builders/SchemaBuilder';
export { AttributeGenerator } from './builders/AttributeGenerator';
export { ThemeBuilder } from './builders/ThemeBuilder';

// Export components
export { LivePreview } from './components/LivePreview';

// Export main app (to be created)
export { AdminPanel } from './AdminPanel';

// Version
export const VERSION = '2.0.0-alpha.1';
