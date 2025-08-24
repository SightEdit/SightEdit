import { MarkdownEditor } from './editor';
import { MarkdownPreview } from './preview';
export class MarkdownPlugin {
    constructor(options = {}) {
        this.name = 'markdown';
        this.version = '1.0.0';
        this.stylesInjected = false;
        this.options = {
            preview: true,
            toolbar: true,
            theme: 'light',
            sanitize: true,
            breaks: true,
            tables: true,
            ...options
        };
    }
    init(sightEdit) {
        // Inject styles if not already done
        if (!this.stylesInjected) {
            this.injectStyles();
            this.stylesInjected = true;
        }
        // Register markdown editor
        sightEdit.registerEditor('markdown', MarkdownEditor, this.options);
        // Register additional element type detection
        sightEdit.on('detectElement', (element) => {
            // Auto-detect markdown content
            if (element.dataset.sight === 'auto') {
                const content = element.textContent || '';
                if (this.looksLikeMarkdown(content)) {
                    element.dataset.sight = 'markdown';
                }
            }
            // Elements with markdown class
            if (element.classList.contains('markdown') && !element.dataset.sight) {
                element.dataset.sight = 'markdown';
            }
        });
        // Add preview component if enabled
        if (this.options.preview) {
            sightEdit.registerComponent('markdown-preview', MarkdownPreview);
        }
        // Add toolbar actions
        if (this.options.toolbar) {
            this.registerToolbarActions(sightEdit);
        }
    }
    looksLikeMarkdown(content) {
        // Simple heuristic to detect markdown content
        const markdownPatterns = [
            /^#{1,6}\s/m, // Headers
            /\*\*[^*]+\*\*/, // Bold
            /\*[^*]+\*/, // Italic  
            /\[[^\]]+\]\([^)]+\)/, // Links
            /!\[[^\]]*\]\([^)]+\)/, // Images
            /^[-*+]\s/m, // Lists
            /^>\s/m, // Blockquotes
            /```[\s\S]*?```/, // Code blocks
            /`[^`]+`/ // Inline code
        ];
        return markdownPatterns.some(pattern => pattern.test(content));
    }
    registerToolbarActions(sightEdit) {
        const actions = [
            {
                id: 'markdown-bold',
                label: 'Bold',
                icon: 'B',
                shortcut: 'Ctrl+B',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.toggleBold();
                    }
                }
            },
            {
                id: 'markdown-italic',
                label: 'Italic',
                icon: 'I',
                shortcut: 'Ctrl+I',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.toggleItalic();
                    }
                }
            },
            {
                id: 'markdown-heading',
                label: 'Heading',
                icon: 'H',
                shortcut: 'Ctrl+H',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.cycleHeading();
                    }
                }
            },
            {
                id: 'markdown-link',
                label: 'Link',
                icon: '🔗',
                shortcut: 'Ctrl+K',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.insertLink();
                    }
                }
            },
            {
                id: 'markdown-image',
                label: 'Image',
                icon: '🖼️',
                shortcut: 'Ctrl+Shift+I',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.insertImage();
                    }
                }
            },
            {
                id: 'markdown-code',
                label: 'Code',
                icon: '</>',
                shortcut: 'Ctrl+`',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.toggleCode();
                    }
                }
            },
            {
                id: 'markdown-list',
                label: 'List',
                icon: '☰',
                shortcut: 'Ctrl+L',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.toggleList();
                    }
                }
            },
            {
                id: 'markdown-quote',
                label: 'Quote',
                icon: '"',
                shortcut: 'Ctrl+Q',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.toggleQuote();
                    }
                }
            },
            {
                id: 'markdown-preview',
                label: 'Preview',
                icon: '👁️',
                shortcut: 'Ctrl+P',
                action: (editor) => {
                    if (editor instanceof MarkdownEditor) {
                        editor.togglePreview();
                    }
                }
            }
        ];
        actions.forEach(action => {
            sightEdit.registerToolbarAction(action);
        });
    }
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        document.head.appendChild(style);
    }
    getStyles() {
        // Return minified CSS
        return `.sightedit-markdown-modal .sightedit-modal-content{width:90vw;max-width:1200px;height:80vh}.sightedit-markdown-container{display:flex;flex-direction:column;height:calc(100% - 60px)}.sightedit-markdown-toolbar{display:flex;align-items:center;padding:8px;border-bottom:1px solid #e0e0e0;background:#f5f5f5;gap:4px}.sightedit-toolbar-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid transparent;background:transparent;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;transition:all .2s}.sightedit-toolbar-btn:hover{background:#e0e0e0}.sightedit-toolbar-divider{width:1px;height:24px;background:#d0d0d0;margin:0 8px}.sightedit-markdown-editor{flex:1;display:flex;overflow:hidden}.sightedit-markdown-editor.with-preview{width:50%}.sightedit-markdown-editor .cm-editor{flex:1;height:100%}.sightedit-markdown-editor .cm-scroller{font-family:'Consolas','Monaco','Courier New',monospace;font-size:14px;line-height:1.5}.sightedit-markdown-preview{flex:1;width:50%;padding:16px;overflow-y:auto;background:#fafafa;border-left:1px solid #e0e0e0}`;
    }
    destroy() {
        // Cleanup if needed
    }
}
// Export everything needed
export { MarkdownEditor } from './editor';
export { MarkdownPreview } from './preview';
export { MarkdownRenderer } from './renderer';
// Default export for easy plugin registration
export default MarkdownPlugin;
