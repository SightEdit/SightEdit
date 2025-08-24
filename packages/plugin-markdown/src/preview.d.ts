import type { MarkdownPluginOptions } from './index';
export declare class MarkdownPreview {
    private container;
    private renderer;
    private content;
    private isFullscreen;
    constructor(container: HTMLElement, options?: MarkdownPluginOptions);
    private setupPreview;
    setContent(markdown: string): void;
    private render;
    private highlightCode;
    private applyBasicHighlighting;
    private handleAction;
    private toggleFullscreen;
    private copyHTML;
    private fallbackCopy;
    private exportContent;
    private doExport;
    private getFullHTML;
    private exportPDF;
    private showNotification;
    destroy(): void;
}
//# sourceMappingURL=preview.d.ts.map