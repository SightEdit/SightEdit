# SightEdit Documentation Website

**Live Demo**: https://sightedit.github.io/sightedit/

Professional documentation and demo website for SightEdit v2.0 built with React + Vite + Tailwind CSS.

## Features

- 🏠 **Landing Page** - Features showcase with live demos
- 📚 **Documentation** - Complete API reference and guides
- 🎨 **Interactive Examples** - Working code examples you can try
- 🚀 **GitHub Pages** - Automated deployment

## Development

### Using Monorepo (Recommended)

Since the website is part of the SightEdit monorepo, install dependencies from the root:

```bash
# From project root
npm install --legacy-peer-deps

# Or use lerna
npm run bootstrap

# Then run website dev server
cd website
npm run dev
# Opens at http://localhost:3001
```

### Standalone Development

For standalone development of just the website:

```bash
# Install dependencies
cd website
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

**Note**: The website examples are self-contained React components that demonstrate SightEdit concepts without requiring the actual SightEdit packages.

## Structure

```
website/
├── src/
│   ├── components/           # Reusable React components
│   │   └── Header.tsx        # Navigation header
│   ├── pages/                # Route pages
│   │   ├── HomePage.tsx      # Landing page with features
│   │   ├── ExamplesPage.tsx  # Interactive examples showcase
│   │   └── DocsPage.tsx      # Documentation hub
│   ├── examples/             # Interactive demo components
│   │   ├── BasicEditing.tsx  # Inline editing demo
│   │   ├── ThemeSwitching.tsx # Theme system demo
│   │   ├── DataTransforms.tsx # Transform pipeline demo
│   │   └── HookSystem.tsx    # Event hooks demo
│   ├── App.tsx               # Main app with routing
│   ├── main.tsx              # Entry point
│   └── index.css             # Tailwind + custom styles
├── public/                   # Static assets
├── index.html                # HTML template
├── vite.config.ts            # Vite configuration
├── tailwind.config.js        # Tailwind theme
├── tsconfig.json             # TypeScript config
├── postcss.config.js         # PostCSS config
└── package.json              # Dependencies
```

## Interactive Examples

The website includes 4 fully functional interactive examples:

### 1. Basic Editing
- Demonstrates inline contentEditable functionality
- Shows state management for editable content
- Real-time preview of changes
- Edit/view mode switching

### 2. Theme Switching
- 4 pre-built themes (Default Purple, Ocean Blue, Sunset Orange, Forest Green)
- Runtime theme switching
- Design token demonstration
- Theme configuration preview

### 3. Data Transforms
- 5 built-in transforms (uppercase, lowercase, capitalize, slugify, reverse)
- Real-time transformation pipeline
- Input/output visualization
- Custom transform examples

### 4. Hook System
- 4 lifecycle hooks (beforeEdit, afterEdit, beforeSave, afterSave)
- Event log viewer
- Hook enable/disable toggles
- Live event tracking

All examples are self-contained and don't require SightEdit packages to run.

## Building

The website is configured for GitHub Pages deployment with base URL `/sightedit/`.

Build command automatically sets the correct base path:
```bash
npm run build
```

## Deployment

Automated deployment via GitHub Actions on push to `main` branch.

Manual deployment:
```bash
npm run deploy
```

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **Prism.js** - Code highlighting
- **gh-pages** - GitHub Pages deployment

## License

MIT © SightEdit
