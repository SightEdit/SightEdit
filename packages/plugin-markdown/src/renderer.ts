import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { MarkdownPluginOptions } from './index';

export class MarkdownRenderer {
  private md: MarkdownIt;
  private options: MarkdownPluginOptions;
  
  constructor(options: MarkdownPluginOptions = {}) {
    this.options = options;
    
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      breaks: options.breaks !== false,
      highlight: (str, lang) => {
        // Basic syntax highlighting
        if (lang) {
          try {
            return `<pre class="language-${lang}"><code>${this.escapeHtml(str)}</code></pre>`;
          } catch {
            // Fallback
          }
        }
        return `<pre><code>${this.escapeHtml(str)}</code></pre>`;
      }
    });
    
    // Enable tables if requested
    if (options.tables !== false) {
      this.setupTables();
    }
    
    // Add custom plugins
    this.setupPlugins();
  }
  
  render(markdown: string): string {
    // Use custom renderer if provided
    if (this.options.customRenderer) {
      return this.options.customRenderer(markdown);
    }
    
    // Render markdown to HTML
    let html = this.md.render(markdown);
    
    // Sanitize if enabled (default)
    if (this.options.sanitize !== false) {
      html = this.sanitize(html);
    }
    
    return html;
  }
  
  private sanitize(html: string): string {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'rel'],
      ADD_TAGS: ['iframe'],
      ALLOW_DATA_ATTR: false,
      SAFE_FOR_TEMPLATES: true
    });
  }
  
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  private setupTables(): void {
    // Enable table support
    this.md.enable('table');
    
    // Add table classes
    const defaultTableRender = this.md.renderer.rules.table_open || 
      function(tokens, idx, options, env, renderer) {
        return '<table>\n';
      };
    
    this.md.renderer.rules.table_open = function(tokens, idx, options, env, renderer) {
      return '<table class="sightedit-table">\n';
    };
  }
  
  private setupPlugins(): void {
    // Add task lists support
    this.setupTaskLists();
    
    // Add emoji support
    this.setupEmoji();
    
    // Add footnotes
    this.setupFootnotes();
    
    // Add anchor links to headings
    this.setupHeadingAnchors();
  }
  
  private setupTaskLists(): void {
    // Override list item rendering to support checkboxes
    const defaultListItemRender = this.md.renderer.rules.list_item_open ||
      function(tokens, idx, options, env, renderer) {
        return '<li>';
      };
    
    this.md.renderer.rules.list_item_open = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      const nextToken = tokens[idx + 1];
      
      if (nextToken && nextToken.type === 'inline' && nextToken.content) {
        const checkboxMatch = nextToken.content.match(/^\[([ x])\]\s/i);
        if (checkboxMatch) {
          const checked = checkboxMatch[1].toLowerCase() === 'x';
          nextToken.content = nextToken.content.slice(4);
          return `<li class="task-list-item"><input type="checkbox" disabled${checked ? ' checked' : ''}>`;
        }
      }
      
      return defaultListItemRender(tokens, idx, options, env, renderer);
    };
  }
  
  private setupEmoji(): void {
    // Simple emoji support
    const emojiMap: Record<string, string> = {
      ':smile:': '😊',
      ':laugh:': '😄',
      ':heart:': '❤️',
      ':thumbsup:': '👍',
      ':thumbsdown:': '👎',
      ':fire:': '🔥',
      ':star:': '⭐',
      ':check:': '✅',
      ':x:': '❌',
      ':warning:': '⚠️',
      ':info:': 'ℹ️',
      ':bulb:': '💡',
      ':rocket:': '🚀',
      ':bug:': '🐛',
      ':sparkles:': '✨'
    };
    
    this.md.renderer.rules.text = (tokens, idx) => {
      let content = tokens[idx].content;
      
      // Replace emoji codes
      Object.entries(emojiMap).forEach(([code, emoji]) => {
        content = content.replace(new RegExp(code, 'g'), emoji);
      });
      
      return content;
    };
  }
  
  private setupFootnotes(): void {
    // Simple footnote support
    let footnotes: { id: string; content: string }[] = [];
    let footnoteCounter = 0;
    
    // Override inline rendering to capture footnotes
    const defaultInlineRender = this.md.renderer.rules.inline;
    
    this.md.renderer.rules.inline = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      let content = token.content;
      
      // Match footnote references [^1]
      content = content.replace(/\[\^(\d+)\]/g, (match, num) => {
        return `<sup><a href="#fn${num}" id="ref${num}">${num}</a></sup>`;
      });
      
      // Match footnote definitions [^1]: Text
      const footnoteDefRegex = /\[\^(\d+)\]:\s*(.+)/g;
      let footnoteDef;
      while ((footnoteDef = footnoteDefRegex.exec(content)) !== null) {
        footnotes.push({ id: footnoteDef[1], content: footnoteDef[2] });
        content = content.replace(footnoteDef[0], '');
      }
      
      token.content = content;
      return defaultInlineRender ? defaultInlineRender(tokens, idx, options, env, renderer) : content;
    };
  }
  
  private setupHeadingAnchors(): void {
    // Add anchor links to headings
    const defaultHeadingOpen = this.md.renderer.rules.heading_open ||
      function(tokens, idx, options, env, renderer) {
        return '<h' + tokens[idx].tag + '>';
      };
    
    this.md.renderer.rules.heading_open = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      const nextToken = tokens[idx + 1];
      
      if (nextToken && nextToken.type === 'inline' && nextToken.content) {
        const slug = nextToken.content
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        
        return `<h${token.tag} id="${slug}">`;
      }
      
      return defaultHeadingOpen(tokens, idx, options, env, renderer);
    };
  }
}