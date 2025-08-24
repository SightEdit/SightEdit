# Changelog

## [1.0.0] - 2025-01-21

### Features
- Full-featured Markdown editor using CodeMirror 6
- Live preview with synchronized scrolling
- Syntax highlighting for code blocks
- Toolbar with common formatting actions (bold, italic, heading, link, image, code, list, quote)
- Light and dark theme support
- Export to HTML, Markdown, or PDF
- Task lists support
- Emoji support (:smile:, :heart:, etc.)
- Table support with GitHub Flavored Markdown
- Auto-linking URLs
- Footnotes support
- Heading anchors for navigation
- Keyboard shortcuts for all major actions
- Auto-save functionality
- Markdown auto-detection for elements with data-sight="auto"
- Customizable markdown renderer
- Security features with DOMPurify sanitization
- Responsive modal interface
- Inline CSS injection (no external stylesheets needed)

### Technical Details
- Built with TypeScript
- Rollup for bundling
- Jest for testing
- Peer dependency on @sightedit/core
- ESM and CommonJS builds
- Full TypeScript definitions