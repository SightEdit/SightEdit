# SightEdit Next.js Blog Example

A comprehensive Next.js blog application demonstrating SightEdit's visual editing capabilities.

## Features

- ✨ **Visual Editing**: Edit content directly on the page with SightEdit
- 🎨 **Modern Design**: Built with Tailwind CSS and responsive design
- 🌓 **Dark Mode**: Toggle between light and dark themes
- 📱 **Mobile Friendly**: Responsive design that works on all devices
- 🚀 **Next.js 14**: Latest Next.js with App Router
- 📝 **Rich Content**: Support for text and rich text editing
- 🏷️ **Blog Features**: Tags, author info, dates, and article content
- 🔧 **TypeScript**: Full type safety throughout the application

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

### Enabling Edit Mode

1. Click the **Edit Mode** toggle button in the bottom-right corner
2. Or use the keyboard shortcut: `Ctrl/Cmd + E`
3. Click on any content with a dashed blue outline to edit it
4. Changes are automatically saved to the backend

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/sightedit/     # SightEdit API endpoints
│   │   ├── save/          # Single content save
│   │   ├── batch/         # Batch content save
│   │   └── schema/        # Content schema definitions
│   ├── blog/[id]/         # Individual blog post pages
│   ├── layout.tsx         # Root layout with SightEdit provider
│   ├── page.tsx           # Homepage with blog listing
│   └── globals.css        # Global styles with SightEdit styles
├── components/            # Reusable components
│   ├── BlogCard.tsx       # Blog post card component
│   ├── Footer.tsx         # Site footer
│   ├── Header.tsx         # Site header with navigation
│   └── Hero.tsx           # Homepage hero section
└── data/                  # File-based storage (created at runtime)
    └── sightedit.json     # Stored content changes
```

## SightEdit Integration

### 1. Provider Setup

The app is wrapped with `SightEditProvider` in `layout.tsx`:

```tsx
import { SightEditProvider } from '@sightedit/react'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SightEditProvider 
          config={{
            apiUrl: '/api/sightedit',
            debug: true
          }}
        >
          {children}
        </SightEditProvider>
      </body>
    </html>
  )
}
```

### 2. Editable Content

Content is made editable using the `Editable` component:

```tsx
import { Editable } from '@sightedit/react'

<Editable sight="hero-title" type="text">
  <h1>Share Your Stories with the World</h1>
</Editable>

<Editable sight="hero-description" type="richtext">
  <p>Create beautiful blog posts with our intuitive visual editor.</p>
</Editable>
```

### 3. Edit Mode Toggle

Users can toggle edit mode with the `EditModeToggle` component:

```tsx
import { EditModeToggle } from '@sightedit/react'

<EditModeToggle className="bg-primary-600 text-white px-4 py-2 rounded-full">
  Edit Mode
</EditModeToggle>
```

## API Endpoints

### Save Content: `POST /api/sightedit/save`
Saves individual content changes.

```json
{
  "sight": "hero-title",
  "value": "New Title",
  "type": "text",
  "url": "/",
  "context": {}
}
```

### Batch Save: `POST /api/sightedit/batch`
Saves multiple content changes at once.

```json
{
  "changes": [
    {
      "sight": "hero-title",
      "value": "New Title",
      "type": "text"
    }
  ]
}
```

### Get Schema: `GET /api/sightedit/schema/{sight}`
Returns validation schema for specific content.

```json
{
  "sight": "hero-title",
  "schema": {
    "type": "text",
    "maxLength": 100,
    "required": true,
    "placeholder": "Main hero title"
  }
}
```

## Content Types

The example demonstrates various content types:

- **Text**: Simple text content (titles, labels, etc.)
- **Rich Text**: Formatted content with basic HTML tags
- **Dynamic Content**: Blog post titles, excerpts, and author names

## Styling

### Visual Edit Mode

When in edit mode, editable elements show visual indicators:

```css
[data-sight-edit-mode="edit"] [data-sight] {
  outline: 2px dashed #3b82f6;
  outline-offset: 2px;
  cursor: pointer;
}
```

### Loading States

Visual feedback during save operations:

```css
.sight-edit-loading {
  opacity: 0.6;
  pointer-events: none;
}
```

## Data Storage

This example uses file-based storage for simplicity:

- Content changes are stored in `data/sightedit.json`
- In production, you would typically use a database
- The storage format preserves metadata like update timestamps

## Customization

### Adding New Content Types

1. Add schema definition in `api/sightedit/schema/[sight]/route.ts`
2. Use `Editable` component with appropriate `type` prop
3. Style the content with Tailwind classes

### Custom Validation

Schemas support various validation rules:

```javascript
{
  type: 'richtext',
  maxLength: 300,
  allowedTags: ['p', 'strong', 'em', 'br'],
  required: true,
  placeholder: 'Enter content...'
}
```

## Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start production server**:
   ```bash
   npm start
   ```

3. **Deploy to Vercel**:
   ```bash
   npx vercel
   ```

## Learn More

- [SightEdit Documentation](../../README.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [React Integration Guide](../../packages/react/README.md)
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.