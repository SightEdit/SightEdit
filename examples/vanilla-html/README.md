# SightEdit Vanilla HTML Example

This example demonstrates how to use SightEdit with plain HTML and JavaScript, including both traditional and advanced schema-driven features.

## Running the Example

1. First, build the core library:
   ```bash
   cd ../../packages/core
   npm run build
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000 in your browser

5. Press `Ctrl/Cmd + E` to toggle edit mode

## Features Demonstrated

### Traditional Editors
- Text editing (inline)
- Link editing (modal)
- Rich text editing (WYSIWYG)
- Image editing (upload/URL)
- Collection management (lists)
- Color picker
- Date picker
- Number input
- Select dropdown
- JSON editor

### Advanced Schema-Driven Editors
- Product selector with database integration
- HTML designer for visual section editing
- Backend-driven configuration
- Context-aware editor selection

## Schema Examples

The example includes both traditional and schema-driven approaches:

### Traditional Approach
```html
<h1 data-sight="text" data-sight-id="title">Traditional Title</h1>
```

### Schema-Driven Approach
```html
<section data-sight="products.featured">Product Grid</section>
<div data-sight="hero.main">Hero Section</div>
```

Configuration comes from the backend schema API.
- Image editing (sidebar)
- Rich text editing (modal)
- Collection editing (modal)
- Color picker (tooltip)

## How It Works

The example includes:
- A simple Express server that handles SightEdit API requests
- In-memory storage for demo purposes
- Various content types marked with `data-sight` attributes
- Automatic content type detection