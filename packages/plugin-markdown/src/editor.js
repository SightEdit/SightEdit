import { BaseEditor } from '@sightedit/core';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { insertTab, indentLess } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { MarkdownRenderer } from './renderer';
export class MarkdownEditor extends BaseEditor {
    getMode() {
        return 'modal';
    }
    constructor(element, config) {
        super(element, config);
        this.editorView = null;
        this.container = null;
        this.previewPane = null;
        this.toolbar = null;
        this.isPreviewMode = false;
        this.themeCompartment = new Compartment();
        this.pluginOptions = config?.pluginOptions || {};
        this.renderer = new MarkdownRenderer(this.pluginOptions);
    }
    render() {
        const modal = this.createModal();
        this.container = modal.querySelector('.sightedit-markdown-container');
        if (this.pluginOptions.toolbar !== false) {
            this.createToolbar();
        }
        this.createEditor();
        if (this.pluginOptions.preview !== false) {
            this.createPreviewPane();
        }
        document.body.appendChild(modal);
    }
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'sightedit-modal sightedit-markdown-modal';
        modal.innerHTML = `
      <div class="sightedit-modal-overlay"></div>
      <div class="sightedit-modal-content">
        <div class="sightedit-modal-header">
          <h3>Markdown Editor</h3>
          <button class="sightedit-modal-close">&times;</button>
        </div>
        <div class="sightedit-markdown-container"></div>
      </div>
    `;
        // Close handlers
        const overlay = modal.querySelector('.sightedit-modal-overlay');
        const closeBtn = modal.querySelector('.sightedit-modal-close');
        overlay?.addEventListener('click', () => this.close());
        closeBtn?.addEventListener('click', () => this.close());
        return modal;
    }
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'sightedit-markdown-toolbar';
        const buttons = [
            { action: 'bold', icon: 'B', title: 'Bold (Ctrl+B)' },
            { action: 'italic', icon: 'I', title: 'Italic (Ctrl+I)' },
            { action: 'heading', icon: 'H', title: 'Heading (Ctrl+H)' },
            { action: 'link', icon: '🔗', title: 'Link (Ctrl+K)' },
            { action: 'image', icon: '🖼️', title: 'Image' },
            { action: 'code', icon: '&lt;/&gt;', title: 'Code (Ctrl+`)' },
            { action: 'list', icon: '☰', title: 'List (Ctrl+L)' },
            { action: 'quote', icon: '&quot;', title: 'Quote (Ctrl+Q)' },
            { action: 'divider' },
            { action: 'preview', icon: '👁️', title: 'Toggle Preview (Ctrl+P)' },
            { action: 'help', icon: '?', title: 'Markdown Help' }
        ];
        buttons.forEach(btn => {
            if (btn.action === 'divider') {
                const divider = document.createElement('div');
                divider.className = 'sightedit-toolbar-divider';
                this.toolbar.appendChild(divider);
            }
            else {
                const button = document.createElement('button');
                button.className = 'sightedit-toolbar-btn';
                button.innerHTML = btn.icon || '';
                button.title = btn.title || '';
                button.onclick = () => this.handleToolbarAction(btn.action);
                this.toolbar.appendChild(button);
            }
        });
        this.container?.appendChild(this.toolbar);
    }
    createEditor() {
        const editorContainer = document.createElement('div');
        editorContainer.className = 'sightedit-markdown-editor';
        const currentValue = this.extractValue();
        const extensions = [
            basicSetup,
            markdown(),
            keymap.of([
                { key: 'Tab', run: insertTab },
                { key: 'Shift-Tab', run: indentLess },
                { key: 'Ctrl-b', run: () => { this.toggleBold(); return true; } },
                { key: 'Ctrl-i', run: () => { this.toggleItalic(); return true; } },
                { key: 'Ctrl-h', run: () => { this.cycleHeading(); return true; } },
                { key: 'Ctrl-k', run: () => { this.insertLink(); return true; } },
                { key: 'Ctrl-`', run: () => { this.toggleCode(); return true; } },
                { key: 'Ctrl-l', run: () => { this.toggleList(); return true; } },
                { key: 'Ctrl-q', run: () => { this.toggleQuote(); return true; } },
                { key: 'Ctrl-p', run: () => { this.togglePreview(); return true; } }
            ]),
            this.themeCompartment.of(this.pluginOptions.theme === 'dark' ? oneDark : []),
            EditorView.lineWrapping
        ];
        const state = EditorState.create({
            doc: currentValue,
            extensions
        });
        this.editorView = new EditorView({
            state,
            parent: editorContainer
        });
        this.container?.appendChild(editorContainer);
        // Auto-save on change
        let saveTimeout;
        this.editorView.dom.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                await this.save();
                if (this.previewPane && this.isPreviewMode) {
                    this.updatePreview();
                }
            }, 500);
        });
    }
    createPreviewPane() {
        this.previewPane = document.createElement('div');
        this.previewPane.className = 'sightedit-markdown-preview';
        this.previewPane.style.display = 'none';
        this.container?.appendChild(this.previewPane);
    }
    handleToolbarAction(action) {
        switch (action) {
            case 'bold':
                this.toggleBold();
                break;
            case 'italic':
                this.toggleItalic();
                break;
            case 'heading':
                this.cycleHeading();
                break;
            case 'link':
                this.insertLink();
                break;
            case 'image':
                this.insertImage();
                break;
            case 'code':
                this.toggleCode();
                break;
            case 'list':
                this.toggleList();
                break;
            case 'quote':
                this.toggleQuote();
                break;
            case 'preview':
                this.togglePreview();
                break;
            case 'help':
                this.showHelp();
                break;
        }
    }
    toggleBold() {
        this.wrapSelection('**', '**');
    }
    toggleItalic() {
        this.wrapSelection('*', '*');
    }
    cycleHeading() {
        if (!this.editorView)
            return;
        const state = this.editorView.state;
        const line = state.doc.lineAt(state.selection.main.head);
        const lineText = line.text;
        let newText = lineText;
        const headingMatch = lineText.match(/^(#{1,6})\s/);
        if (!headingMatch) {
            newText = '# ' + lineText;
        }
        else {
            const level = headingMatch[1].length;
            if (level < 6) {
                newText = '#'.repeat(level + 1) + lineText.substring(level);
            }
            else {
                newText = lineText.substring(7);
            }
        }
        this.editorView.dispatch({
            changes: { from: line.from, to: line.to, insert: newText }
        });
    }
    insertLink() {
        const url = prompt('Enter URL:');
        if (url) {
            const text = this.getSelectedText() || prompt('Enter link text:') || url;
            this.insertText(`[${text}](${url})`);
        }
    }
    insertImage() {
        const url = prompt('Enter image URL:');
        if (url) {
            const alt = prompt('Enter alt text:') || 'Image';
            this.insertText(`![${alt}](${url})`);
        }
    }
    toggleCode() {
        const selection = this.getSelectedText();
        if (selection && selection.includes('\n')) {
            this.wrapSelection('```\n', '\n```');
        }
        else {
            this.wrapSelection('`', '`');
        }
    }
    toggleList() {
        this.toggleLinePrefix('- ');
    }
    toggleQuote() {
        this.toggleLinePrefix('> ');
    }
    togglePreview() {
        if (!this.previewPane)
            return;
        this.isPreviewMode = !this.isPreviewMode;
        if (this.isPreviewMode) {
            this.updatePreview();
            this.previewPane.style.display = 'block';
            this.editorView?.dom.parentElement?.classList.add('with-preview');
        }
        else {
            this.previewPane.style.display = 'none';
            this.editorView?.dom.parentElement?.classList.remove('with-preview');
        }
    }
    updatePreview() {
        if (!this.previewPane || !this.editorView)
            return;
        const markdown = this.editorView.state.doc.toString();
        const html = this.renderer.render(markdown);
        this.previewPane.innerHTML = html;
    }
    showHelp() {
        const helpModal = document.createElement('div');
        helpModal.className = 'sightedit-help-modal';
        helpModal.innerHTML = `
      <div class="sightedit-help-content">
        <h4>Markdown Syntax</h4>
        <ul>
          <li><code># Heading 1</code> - Main heading</li>
          <li><code>## Heading 2</code> - Subheading</li>
          <li><code>**bold**</code> - Bold text</li>
          <li><code>*italic*</code> - Italic text</li>
          <li><code>[link](url)</code> - Link</li>
          <li><code>![alt](url)</code> - Image</li>
          <li><code>\`code\`</code> - Inline code</li>
          <li><code>\`\`\`
code block
\`\`\`</code> - Code block</li>
          <li><code>- item</code> - List item</li>
          <li><code>> quote</code> - Blockquote</li>
        </ul>
        <button class="sightedit-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
      </div>
    `;
        document.body.appendChild(helpModal);
    }
    wrapSelection(before, after) {
        if (!this.editorView)
            return;
        const state = this.editorView.state;
        const selection = state.selection.main;
        const selectedText = state.doc.sliceString(selection.from, selection.to);
        this.editorView.dispatch({
            changes: { from: selection.from, to: selection.to, insert: before + selectedText + after },
            selection: { anchor: selection.from + before.length + selectedText.length + after.length }
        });
    }
    toggleLinePrefix(prefix) {
        if (!this.editorView)
            return;
        const state = this.editorView.state;
        const line = state.doc.lineAt(state.selection.main.head);
        const lineText = line.text;
        let newText;
        if (lineText.startsWith(prefix)) {
            newText = lineText.substring(prefix.length);
        }
        else {
            newText = prefix + lineText;
        }
        this.editorView.dispatch({
            changes: { from: line.from, to: line.to, insert: newText }
        });
    }
    getSelectedText() {
        if (!this.editorView)
            return '';
        const state = this.editorView.state;
        const selection = state.selection.main;
        return state.doc.sliceString(selection.from, selection.to);
    }
    insertText(text) {
        if (!this.editorView)
            return;
        const state = this.editorView.state;
        const selection = state.selection.main;
        this.editorView.dispatch({
            changes: { from: selection.from, to: selection.to, insert: text },
            selection: { anchor: selection.from + text.length }
        });
    }
    extractValue() {
        return this.element.textContent || '';
    }
    getValue() {
        return this.editorView?.state.doc.toString() || this.extractValue();
    }
    setValue(value) {
        this.value = value;
        this.applyValue(value);
    }
    applyValue(value) {
        if (this.editorView) {
            this.editorView.dispatch({
                changes: { from: 0, to: this.editorView.state.doc.length, insert: value }
            });
        }
        // Update original element
        this.element.innerHTML = this.renderer.render(value);
    }
    close() {
        const modal = document.querySelector('.sightedit-markdown-modal');
        modal?.remove();
        this.editorView?.destroy();
        this.editorView = null;
    }
    destroy() {
        this.close();
    }
}
