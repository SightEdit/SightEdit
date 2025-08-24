import { MarkdownRenderer } from './renderer';
import type { MarkdownPluginOptions } from './index';

export class MarkdownPreview {
  private container: HTMLElement;
  private renderer: MarkdownRenderer;
  private content: string = '';
  private isFullscreen: boolean = false;
  
  constructor(container: HTMLElement, options: MarkdownPluginOptions = {}) {
    this.container = container;
    this.renderer = new MarkdownRenderer(options);
    this.setupPreview();
  }
  
  private setupPreview(): void {
    this.container.classList.add('sightedit-markdown-preview-component');
    
    // Create preview header
    const header = document.createElement('div');
    header.className = 'preview-header';
    header.innerHTML = `
      <h4>Preview</h4>
      <div class="preview-actions">
        <button class="preview-action" data-action="refresh" title="Refresh">🔄</button>
        <button class="preview-action" data-action="fullscreen" title="Fullscreen">⛶</button>
        <button class="preview-action" data-action="copy" title="Copy HTML">📋</button>
        <button class="preview-action" data-action="export" title="Export">💾</button>
      </div>
    `;
    
    // Create preview content area
    const content = document.createElement('div');
    content.className = 'preview-content';
    
    this.container.appendChild(header);
    this.container.appendChild(content);
    
    // Setup event handlers
    header.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('preview-action')) {
        const action = target.dataset.action;
        if (action) {
          this.handleAction(action);
        }
      }
    });
  }
  
  setContent(markdown: string): void {
    this.content = markdown;
    this.render();
  }
  
  private render(): void {
    const contentEl = this.container.querySelector('.preview-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderer.render(this.content);
      this.highlightCode();
    }
  }
  
  private highlightCode(): void {
    // Simple code highlighting
    const codeBlocks = this.container.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
      const lang = block.className.match(/language-(\w+)/)?.[1];
      if (lang) {
        this.applyBasicHighlighting(block as HTMLElement, lang);
      }
    });
  }
  
  private applyBasicHighlighting(element: HTMLElement, language: string): void {
    const code = element.textContent || '';
    let highlighted = code;
    
    // Basic syntax highlighting patterns
    const patterns: Record<string, RegExp[]> = {
      javascript: [
        /\b(const|let|var|function|return|if|else|for|while|class|extends|new|this|import|export|from|default)\b/g,
        /(["'`])(?:(?=(\\?))\2.)*?\1/g,
        /\/\/.*$/gm,
        /\/\*[\s\S]*?\*\//g,
        /\b(\d+)\b/g
      ],
      typescript: [
        /\b(const|let|var|function|return|if|else|for|while|class|extends|new|this|import|export|from|default|interface|type|enum|namespace|module|declare|implements|private|public|protected|static|readonly|abstract)\b/g,
        /(["'`])(?:(?=(\\?))\2.)*?\1/g,
        /\/\/.*$/gm,
        /\/\*[\s\S]*?\*\//g,
        /\b(\d+)\b/g
      ],
      python: [
        /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|lambda|pass|break|continue|yield|global|nonlocal|assert|del|raise|and|or|not|in|is)\b/g,
        /(["'])(?:(?=(\\?))\2.)*?\1/g,
        /#.*$/gm,
        /\b(\d+)\b/g
      ],
      css: [
        /([.#][\w-]+)(?=\s*\{)/g,
        /\b([\w-]+)(?=\s*:)/g,
        /(["'])(?:(?=(\\?))\2.)*?\1/g,
        /\/\*[\s\S]*?\*\//g,
        /\b(\d+(?:px|em|rem|%|vh|vw|deg|s|ms))\b/g
      ],
      html: [
        /(&lt;\/?)([\w-]+)/g,
        /\s([\w-]+)(?==)/g,
        /(["'])(?:(?=(\\?))\2.)*?\1/g,
        /&lt;!--[\s\S]*?--&gt;/g
      ]
    };
    
    const langPatterns = patterns[language.toLowerCase()] || [];
    const classes = ['keyword', 'string', 'comment', 'comment', 'number'];
    
    langPatterns.forEach((pattern, index) => {
      const className = classes[index] || 'token';
      highlighted = highlighted.replace(pattern, (match) => {
        return `<span class="token ${className}">${match}</span>`;
      });
    });
    
    element.innerHTML = highlighted;
  }
  
  private handleAction(action: string): void {
    switch (action) {
      case 'refresh':
        this.render();
        break;
      
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      
      case 'copy':
        this.copyHTML();
        break;
      
      case 'export':
        this.exportContent();
        break;
    }
  }
  
  private toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    
    if (this.isFullscreen) {
      this.container.classList.add('fullscreen');
      document.body.classList.add('sightedit-fullscreen-active');
    } else {
      this.container.classList.remove('fullscreen');
      document.body.classList.remove('sightedit-fullscreen-active');
    }
    
    const btn = this.container.querySelector('[data-action="fullscreen"]');
    if (btn) {
      btn.textContent = this.isFullscreen ? '⛶' : '⛶';
    }
  }
  
  private copyHTML(): void {
    const html = this.renderer.render(this.content);
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(html).then(() => {
        this.showNotification('HTML copied to clipboard!');
      }).catch(() => {
        this.fallbackCopy(html);
      });
    } else {
      this.fallbackCopy(html);
    }
  }
  
  private fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    this.showNotification('HTML copied to clipboard!');
  }
  
  private exportContent(): void {
    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.innerHTML = `
      <button data-format="html">Export as HTML</button>
      <button data-format="markdown">Export as Markdown</button>
      <button data-format="pdf">Export as PDF</button>
    `;
    
    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON') {
        const format = target.dataset.format;
        if (format) {
          this.doExport(format);
          menu.remove();
        }
      }
    });
    
    // Position menu
    const exportBtn = this.container.querySelector('[data-action="export"]');
    if (exportBtn) {
      const rect = exportBtn.getBoundingClientRect();
      menu.style.position = 'absolute';
      menu.style.top = rect.bottom + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
    }
    
    document.body.appendChild(menu);
    
    // Close menu on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }
  
  private doExport(format: string): void {
    let content: string;
    let filename: string;
    let mimeType: string;
    
    switch (format) {
      case 'html':
        content = this.getFullHTML();
        filename = 'document.html';
        mimeType = 'text/html';
        break;
      
      case 'markdown':
        content = this.content;
        filename = 'document.md';
        mimeType = 'text/markdown';
        break;
      
      case 'pdf':
        this.exportPDF();
        return;
      
      default:
        return;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showNotification(`Exported as ${format.toUpperCase()}`);
  }
  
  private getFullHTML(): string {
    const html = this.renderer.render(this.content);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; }
    code { background: #f4f4f4; padding: 0.2rem 0.4rem; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
  }
  
  private exportPDF(): void {
    // Simple PDF export using browser print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(this.getFullHTML());
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  }
  
  private showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'sightedit-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
  
  destroy(): void {
    this.container.innerHTML = '';
    this.container.classList.remove('sightedit-markdown-preview-component');
    if (this.isFullscreen) {
      document.body.classList.remove('sightedit-fullscreen-active');
    }
  }
}