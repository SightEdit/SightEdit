// Core SightEdit - Minimal bundle with basic text editing only
import { SightEditConfig } from '../types';
import { SightEditCore } from './sight-edit-core';

export { SightEditCore };
export * from '../types';
export { BaseEditor } from '../editors/base';
export { TextEditor } from '../editors/text';
export { ElementDetector } from '../detector';
export { SightEditAPI } from '../api';

// Minimal SightEdit interface - renamed to avoid conflict
const SightEditCoreInterface = {
  init: (config) => SightEditCore.init(config),
  getInstance: () => SightEditCore.getInstance()
};

// Global export for browser environments
if (typeof window !== 'undefined') {
  (window as any).SightEditCore = SightEditCoreInterface;
}

export default SightEditCoreInterface;