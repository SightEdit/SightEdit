// Advanced editors bundle - lazy loaded
export { ProductSelectorEditor } from './product-selector';
export { HTMLDesignerEditor } from './html-designer';
export { CollectionEditor } from './collection';
export { JSONEditor } from './json';
export { FileEditor } from './file';

// Re-export for better tree shaking
import { ProductSelectorEditor } from './product-selector';
import { HTMLDesignerEditor } from './html-designer';
import { CollectionEditor } from './collection';
import { JSONEditor } from './json';
import { FileEditor } from './file';

export default {
  ProductSelectorEditor,
  HTMLDesignerEditor,
  CollectionEditor,
  JSONEditor,
  FileEditor
};