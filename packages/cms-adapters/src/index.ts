/**
 * SightEdit CMS Adapters
 *
 * Headless CMS adapters for SightEdit
 */

// Export base adapter
export {
  CMSAdapter,
  AdapterRegistry,
  adapterRegistry
} from './base/Adapter';

export type {
  CMSConfig,
  FetchQuery,
  FetchResponse,
  UpdateSchemaOptions,
  AssetUploadOptions,
  AssetUploadResponse
} from './base/Adapter';

// Export Contentful adapter
export { ContentfulAdapter } from './contentful/ContentfulAdapter';
export type { ContentfulConfig } from './contentful/ContentfulAdapter';

// Export Strapi adapter
export { StrapiAdapter } from './strapi/StrapiAdapter';
export type { StrapiConfig } from './strapi/StrapiAdapter';

// Export Sanity adapter
export { SanityAdapter } from './sanity/SanityAdapter';
export type { SanityConfig } from './sanity/SanityAdapter';

// Export WordPress adapter
export { WordPressAdapter } from './wordpress/WordPressAdapter';
export type { WordPressConfig } from './wordpress/WordPressAdapter';

// Version
export const VERSION = '2.0.0-alpha.1';
