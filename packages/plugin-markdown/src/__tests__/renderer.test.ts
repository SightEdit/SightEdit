import { MarkdownRenderer } from '../renderer';

describe('MarkdownRenderer', () => {
  let renderer: MarkdownRenderer;

  beforeEach(() => {
    renderer = new MarkdownRenderer();
  });

  describe('basic markdown rendering', () => {
    test.each([
      ['# Heading 1', '<h1>Heading 1</h1>'],
      ['## Heading 2', '<h2>Heading 2</h2>'],
      ['**bold**', '<p><strong>bold</strong></p>'],
      ['*italic*', '<p><em>italic</em></p>'],
      ['`code`', '<p><code>code</code></p>'],
      ['[link](https://example.com)', '<p><a href="https://example.com">link</a></p>'],
      ['![alt](image.jpg)', '<p><img src="image.jpg" alt="alt"></p>']
    ])('should render %s correctly', (markdown, expected) => {
      const result = renderer.render(markdown);
      expect(result.trim()).toContain(expected.trim());
    });
  });

  describe('lists', () => {
    it('should render unordered lists', () => {
      const markdown = `- Item 1\n- Item 2\n- Item 3`;
      const result = renderer.render(markdown);
      
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('should render ordered lists', () => {
      const markdown = `1. First\n2. Second\n3. Third`;
      const result = renderer.render(markdown);
      
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
      expect(result).toContain('<li>Second</li>');
      expect(result).toContain('<li>Third</li>');
      expect(result).toContain('</ol>');
    });

    it('should render task lists', () => {
      const markdown = `- [x] Completed\n- [ ] Pending`;
      const result = renderer.render(markdown);
      
      expect(result).toContain('class="task-list-item"');
      expect(result).toContain('<input type="checkbox" disabled checked>');
      expect(result).toContain('<input type="checkbox" disabled>');
    });
  });

  describe('code blocks', () => {
    it('should render code blocks with language', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<pre class="language-javascript">');
      expect(result).toContain('<code>const x = 1;</code>');
    });

    it('should render code blocks without language', () => {
      const markdown = '```\nplain text\n```';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<pre>');
      expect(result).toContain('<code>plain text</code>');
    });
  });

  describe('tables', () => {
    it('should render tables when enabled', () => {
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
      
      const result = renderer.render(markdown);
      
      expect(result).toContain('<table class="sightedit-table">');
      expect(result).toContain('<th>Header 1</th>');
      expect(result).toContain('<th>Header 2</th>');
      expect(result).toContain('<td>Cell 1</td>');
      expect(result).toContain('<td>Cell 2</td>');
    });

    it('should not render tables when disabled', () => {
      renderer = new MarkdownRenderer({ tables: false });
      
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
      
      const result = renderer.render(markdown);
      
      expect(result).not.toContain('<table');
    });
  });

  describe('breaks option', () => {
    it('should convert line breaks when enabled', () => {
      renderer = new MarkdownRenderer({ breaks: true });
      
      const markdown = 'Line 1\nLine 2';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<br>');
    });

    it('should not convert line breaks when disabled', () => {
      renderer = new MarkdownRenderer({ breaks: false });
      
      const markdown = 'Line 1\nLine 2';
      const result = renderer.render(markdown);
      
      expect(result).not.toContain('<br>');
    });
  });

  describe('sanitization', () => {
    it('should sanitize dangerous HTML by default', () => {
      const markdown = '<script>alert("xss")</script>';
      const result = renderer.render(markdown);
      
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should allow safe HTML', () => {
      const markdown = '<div class="safe">Content</div>';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<div class="safe">Content</div>');
    });

    it('should not sanitize when disabled', () => {
      renderer = new MarkdownRenderer({ sanitize: false });
      
      const markdown = '<script>console.log("test")</script>';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<script>');
    });
  });

  describe('emoji support', () => {
    test.each([
      [':smile:', '😊'],
      [':heart:', '❤️'],
      [':thumbsup:', '👍'],
      [':fire:', '🔥'],
      [':star:', '⭐']
    ])('should replace %s with %s', (code, emoji) => {
      const result = renderer.render(`Text with ${code} emoji`);
      expect(result).toContain(emoji);
    });
  });

  describe('custom renderer', () => {
    it('should use custom renderer when provided', () => {
      const customRenderer = jest.fn().mockReturnValue('<p>Custom output</p>');
      renderer = new MarkdownRenderer({ customRenderer });
      
      const markdown = '# Test';
      const result = renderer.render(markdown);
      
      expect(customRenderer).toHaveBeenCalledWith(markdown);
      expect(result).toBe('<p>Custom output</p>');
    });
  });

  describe('heading anchors', () => {
    it('should add IDs to headings', () => {
      const markdown = '# Hello World\n## Sub Heading';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<h1 id="hello-world">');
      expect(result).toContain('<h2 id="sub-heading">');
    });
  });

  describe('blockquotes', () => {
    it('should render blockquotes', () => {
      const markdown = '> This is a quote\n> With multiple lines';
      const result = renderer.render(markdown);
      
      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
      expect(result).toContain('With multiple lines');
    });
  });
});