# E-Commerce Advanced Features Demo

This example demonstrates SightEdit's advanced schema system and new editor types.

## Features

- **Product Selector**: Select/replace products from database
- **HTML Designer**: Visual editor for entire HTML sections
- **Backend Schema**: Minimal data attributes in HTML
- **Dynamic Configuration**: Context-aware editor selection

## Installation

```bash
npm install
npm start
```

Server will run at http://localhost:3001

## Usage

1. **Edit Mode**: Press `Ctrl/Cmd + E` to enter edit mode
2. **Product Selection**: Click Featured Products section to replace products
3. **HTML Designer**: Click Hero Section to open visual editor
4. **Real-time**: Changes save automatically

## Backend Schema Examples

### Product Selector Schema
```json
{
  "sight": "products.featured",
  "editor": {
    "type": "product-selector",
    "position": "modal"
  },
  "productConfig": {
    "selection": {
      "mode": "replacement",
      "min": 3,
      "max": 3
    },
    "filters": [...]
  }
}
```

### HTML Designer Schema
```json
{
  "sight": "hero.main", 
  "editor": {
    "type": "html-designer",
    "mode": "visual"
  },
  "designerConfig": {
    "templates": [...],
    "components": [...],
    "responsive": {...}
  }
}
```

## API Endpoints

- `GET /api/products` - Product list
- `POST /api/schema/:sight` - Element schema
- `POST /api/save` - Save changes
- `POST /api/batch` - Batch save

## Benefits

1. **Clean HTML**: Minimal data attributes
2. **Backend Control**: Schema comes from backend
3. **Context-Aware**: Different editors based on user role
4. **Scalable**: Easy to add new editor types
5. **Real-world**: Actual e-commerce scenarios