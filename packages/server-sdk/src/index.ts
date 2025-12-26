/**
 * SightEdit Server SDK
 *
 * Build custom backend adapters for SightEdit
 */

// Export adapter builder
export {
  AdapterBuilder,
  CustomAdapter,
  createAdapter,
  RESTAdapterHelper,
  ValidationHelper,
  ErrorHelper
} from './AdapterBuilder';

export type {
  AdapterConfig,
  AdapterHooks,
  AdapterMethods,
  AdapterMappers
} from './AdapterBuilder';

// Version
export const VERSION = '2.0.0-alpha.1';
