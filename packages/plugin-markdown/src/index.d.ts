import type { Plugin } from '@sightedit/core';
export interface MarkdownPluginOptions {
    preview?: boolean;
    toolbar?: boolean;
    theme?: 'light' | 'dark';
    sanitize?: boolean;
    breaks?: boolean;
    tables?: boolean;
    customRenderer?: (markdown: string) => string;
}
export declare class MarkdownPlugin implements Plugin {
    name: string;
    version: string;
    private options;
    private stylesInjected;
    constructor(options?: MarkdownPluginOptions);
    init(sightEdit: any): void;
    private looksLikeMarkdown;
    private registerToolbarActions;
    private injectStyles;
    private getStyles;
    destroy(): void;
}
export { MarkdownEditor } from './editor';
export { MarkdownPreview } from './preview';
export { MarkdownRenderer } from './renderer';
export default MarkdownPlugin;
//# sourceMappingURL=index.d.ts.map