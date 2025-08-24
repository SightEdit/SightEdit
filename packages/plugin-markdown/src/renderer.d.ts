import type { MarkdownPluginOptions } from './index';
export declare class MarkdownRenderer {
    private md;
    private options;
    constructor(options?: MarkdownPluginOptions);
    render(markdown: string): string;
    private sanitize;
    private escapeHtml;
    private setupTables;
    private setupPlugins;
    private setupTaskLists;
    private setupEmoji;
    private setupFootnotes;
    private setupHeadingAnchors;
}
//# sourceMappingURL=renderer.d.ts.map