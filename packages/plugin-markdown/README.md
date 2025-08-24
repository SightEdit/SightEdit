# @sightedit/plugin-markdown

Markdown editor plugin for SightEdit with live preview, syntax highlighting, and export capabilities.

## Features

- 📝 Full-featured Markdown editor with CodeMirror 6
- 👁️ Live preview with synchronized scrolling
- 🎨 Syntax highlighting for code blocks
- 🛠️ Toolbar with common formatting actions
- 🌓 Light and dark theme support
- 📋 Export to HTML, Markdown, or PDF
- ✅ Task lists support
- 😊 Emoji support
- 📑 Table support
- 🔗 Auto-linking URLs
- ⌨️ Keyboard shortcuts

## Installation

```bash
npm install @sightedit/plugin-markdown
```

## Usage

### Basic Setup

```javascript
import SightEdit from '@sightedit/core';
import MarkdownPlugin from '@sightedit/plugin-markdown';

// Initialize SightEdit with Markdown plugin
const sightEdit = new SightEdit({
  plugins: [
    new MarkdownPlugin({
      preview: true,
      toolbar: true,
      theme: 'light'
    })
  ]
});
```

### HTML Markup

```html
<!-- Auto-detect markdown content -->
<div data-sight="markdown">
# Hello World

This is **markdown** content with [links](https://example.com).

- List item 1
- List item 2
</div>

<!-- Or let plugin auto-detect -->
<div data-sight="auto">
# This will be detected as markdown

Because it contains markdown syntax.
</div>

<!-- With custom options -->
<div data-sight="markdown" 
     data-sight-theme="dark"
     data-sight-preview="true">
Your markdown content here...
</div>
```

## Options

```typescript
interface MarkdownPluginOptions {
  // Show live preview panel (default: true)
  preview?: boolean;
  
  // Show formatting toolbar (default: true)
  toolbar?: boolean;
  
  // Editor theme: 'light' or 'dark' (default: 'light')
  theme?: 'light' | 'dark';
  
  // Sanitize HTML output (default: true)
  sanitize?: boolean;
  
  // Convert line breaks to <br> (default: true)
  breaks?: boolean;
  
  // Enable table support (default: true)
  tables?: boolean;
  
  // Custom markdown renderer function
  customRenderer?: (markdown: string) => string;
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + H` | Cycle heading levels |
| `Ctrl/Cmd + K` | Insert link |
| `Ctrl/Cmd + Shift + I` | Insert image |
| `Ctrl/Cmd + `` ` `` | Toggle code |
| `Ctrl/Cmd + L` | Toggle list |
| `Ctrl/Cmd + Q` | Toggle quote |
| `Ctrl/Cmd + P` | Toggle preview |
| `Tab` | Indent |
| `Shift + Tab` | Outdent |

## Markdown Features

### Extended Syntax

The plugin supports GitHub Flavored Markdown (GFM) with additional features:

#### Task Lists
```markdown
- [x] Completed task
- [ ] Pending task
- [ ] Another todo
```

#### Tables
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

#### Emoji
```markdown
:smile: :heart: :thumbsup: :fire: :star:
```

#### Footnotes
```markdown
Here's a sentence with a footnote[^1].

[^1]: This is the footnote content.
```

## API

### Plugin Methods

```javascript
// Get plugin instance
const markdownPlugin = sightEdit.getPlugin('markdown');

// Register custom toolbar action
sightEdit.registerToolbarAction({
  id: 'custom-action',
  label: 'Custom',
  icon: '✨',
  action: (editor) => {
    if (editor instanceof MarkdownEditor) {
      // Custom action
    }
  }
});
```

### Editor Methods

```javascript
// Get active markdown editor
const editor = sightEdit.getActiveEditor();

if (editor instanceof MarkdownEditor) {
  // Formatting methods
  editor.toggleBold();
  editor.toggleItalic();
  editor.cycleHeading();
  editor.insertLink();
  editor.insertImage();
  editor.toggleCode();
  editor.toggleList();
  editor.toggleQuote();
  
  // Preview control
  editor.togglePreview();
  
  // Get/set content
  const markdown = editor.extractValue();
  editor.applyValue('# New content');
}
```

## Styling

The plugin comes with default styles, but you can customize them:

```css
/* Custom editor styles */
.sightedit-markdown-editor .cm-editor {
  font-family: 'Your Font', monospace;
  font-size: 16px;
}

/* Custom preview styles */
.sightedit-markdown-preview {
  font-family: 'Your Font', sans-serif;
  line-height: 1.8;
}

/* Custom toolbar */
.sightedit-markdown-toolbar {
  background: #f0f0f0;
}

/* Dark theme overrides */
.sightedit-markdown-modal[data-theme="dark"] {
  /* Your dark theme styles */
}
```

## Security

The plugin includes several security features:

1. **HTML Sanitization**: Uses DOMPurify to sanitize rendered HTML
2. **Safe Link Handling**: Adds `rel="noopener noreferrer"` to external links
3. **Script Prevention**: Removes script tags and event handlers
4. **Content Security**: Validates and escapes user input

To disable sanitization (not recommended):

```javascript
new MarkdownPlugin({
  sanitize: false
})
```

## Custom Renderer

You can provide a custom markdown renderer:

```javascript
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(str, { language: lang }).value;
    }
    return '';
  }
});

new MarkdownPlugin({
  customRenderer: (markdown) => {
    return md.render(markdown);
  }
})
```

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari 14+, Chrome Android

## License

MIT