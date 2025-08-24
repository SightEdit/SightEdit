/**
 * E-Commerce Backend Server with Schema Support
 * Demonstrates advanced SightEdit features
 */

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Mock product database
const products = [
  { id: 1, name: 'Premium Headphones', price: 299.99, image: 'https://via.placeholder.com/300x200/4F46E5/ffffff?text=Headphones', description: 'Wireless noise-cancelling headphones', category: 'electronics', stock: 15 },
  { id: 2, name: 'Smart Watch', price: 399.99, image: 'https://via.placeholder.com/300x200/7C3AED/ffffff?text=Smart+Watch', description: 'Fitness tracking and notifications', category: 'electronics', stock: 8 },
  { id: 3, name: 'Laptop Stand', price: 49.99, image: 'https://via.placeholder.com/300x200/EC4899/ffffff?text=Laptop+Stand', description: 'Ergonomic aluminum laptop stand', category: 'accessories', stock: 25 },
  { id: 4, name: 'Wireless Mouse', price: 39.99, image: 'https://via.placeholder.com/300x200/F59E0B/ffffff?text=Mouse', description: 'Ergonomic wireless mouse', category: 'accessories', stock: 30 },
  { id: 5, name: 'Mechanical Keyboard', price: 149.99, image: 'https://via.placeholder.com/300x200/10B981/ffffff?text=Keyboard', description: 'RGB mechanical keyboard', category: 'accessories', stock: 12 },
  { id: 6, name: 'USB-C Hub', price: 59.99, image: 'https://via.placeholder.com/300x200/EF4444/ffffff?text=USB+Hub', description: '7-in-1 USB-C hub', category: 'accessories', stock: 20 },
  { id: 7, name: 'Webcam HD', price: 79.99, image: 'https://via.placeholder.com/300x200/3B82F6/ffffff?text=Webcam', description: '1080p HD webcam', category: 'electronics', stock: 18 },
  { id: 8, name: 'Monitor 27"', price: 349.99, image: 'https://via.placeholder.com/300x200/8B5CF6/ffffff?text=Monitor', description: '4K IPS monitor', category: 'electronics', stock: 5 },
  { id: 9, name: 'Desk Lamp', price: 34.99, image: 'https://via.placeholder.com/300x200/06B6D4/ffffff?text=Lamp', description: 'LED desk lamp with dimmer', category: 'furniture', stock: 40 },
  { id: 10, name: 'Office Chair', price: 299.99, image: 'https://via.placeholder.com/300x200/DC2626/ffffff?text=Chair', description: 'Ergonomic office chair', category: 'furniture', stock: 10 }
];

// Schema definitions for different sight types
const schemas = {
  'products.featured': {
    sight: 'products.featured',
    version: '1.0.0',
    editor: {
      type: 'product-selector',
      mode: 'modal',
      position: 'modal',
      size: 'large'
    },
    dataSource: {
      type: 'api',
      endpoint: '/api/products',
      cache: {
        enabled: true,
        ttl: 60000
      }
    },
    productConfig: {
      source: {
        endpoint: '/api/products'
      },
      display: {
        layout: 'grid',
        itemsPerRow: 3,
        fields: [
          { field: 'image', type: 'image' },
          { field: 'name', type: 'text', label: 'Product Name' },
          { field: 'price', type: 'price', format: 'currency' },
          { field: 'description', type: 'text' },
          { field: 'stock', type: 'badge' }
        ]
      },
      selection: {
        mode: 'replacement',
        min: 3,
        max: 3,
        currentItems: [1, 2, 3]
      },
      filters: [
        {
          field: 'category',
          label: 'Category',
          type: 'select',
          options: [
            { value: 'electronics', label: 'Electronics' },
            { value: 'accessories', label: 'Accessories' },
            { value: 'furniture', label: 'Furniture' }
          ]
        }
      ],
      sorting: [
        { field: 'price', label: 'Price: Low to High' },
        { field: 'name', label: 'Name: A to Z' },
        { field: 'stock', label: 'Stock: High to Low' }
      ]
    },
    ui: {
      title: 'Select Featured Products',
      description: 'Choose 3 products to feature on the homepage',
      icon: '🛍️'
    },
    permissions: {
      read: true,
      write: ['admin', 'editor'],
      roles: ['admin', 'editor', 'manager']
    }
  },
  
  'hero.main': {
    sight: 'hero.main',
    version: '1.0.0',
    editor: {
      type: 'html-designer',
      mode: 'visual',
      position: 'fullscreen'
    },
    designerConfig: {
      allowedElements: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'img', 'div', 'span'],
      templates: [
        {
          id: 'hero-1',
          name: 'Hero with CTA',
          thumbnail: 'https://via.placeholder.com/200x150/667eea/ffffff?text=Hero+1',
          html: '<div class="hero-content"><h2 class="hero-title">Amazing Deals Await</h2><p class="hero-description">Shop our collection with exclusive discounts</p><a href="#" class="hero-button">Shop Now</a></div>'
        },
        {
          id: 'hero-2',
          name: 'Split Hero',
          thumbnail: 'https://via.placeholder.com/200x150/ec4899/ffffff?text=Hero+2',
          html: '<div style="display: flex; align-items: center; gap: 40px;"><div style="flex: 1;"><h2 class="hero-title">New Arrivals</h2><p class="hero-description">Be the first to get our latest products</p></div><div style="flex: 1;"><img src="https://via.placeholder.com/400x300" style="width: 100%; border-radius: 8px;"></div></div>'
        }
      ],
      components: [
        { id: 'heading', name: 'Heading', icon: 'H', html: '<h2>New Heading</h2>', editable: true },
        { id: 'button', name: 'Button', icon: 'B', html: '<button class="hero-button">Click Me</button>', editable: true },
        { id: 'image', name: 'Image', icon: '🖼', html: '<img src="https://via.placeholder.com/400x300" alt="Image">', editable: true }
      ],
      styles: {
        presets: [
          { name: 'Primary Button', css: { background: '#667eea', color: 'white', padding: '12px 24px', borderRadius: '6px' } },
          { name: 'Secondary Button', css: { background: 'white', color: '#667eea', padding: '12px 24px', borderRadius: '6px', border: '2px solid #667eea' } }
        ],
        allowCustomCSS: true,
        allowInlineStyles: true
      },
      responsive: {
        breakpoints: [
          { name: 'Desktop', width: 1200, icon: '🖥' },
          { name: 'Tablet', width: 768, icon: '📱' },
          { name: 'Mobile', width: 375, icon: '📱' }
        ],
        defaultBreakpoint: 'Desktop'
      }
    },
    ui: {
      title: 'Design Hero Section',
      description: 'Customize the hero section with visual designer',
      icon: '🎨'
    }
  },
  
  'categories.grid': {
    sight: 'categories.grid',
    version: '1.0.0',
    editor: {
      type: 'collection',
      mode: 'modal',
      position: 'sidebar'
    },
    fields: {
      icon: {
        type: 'select',
        label: 'Icon',
        options: [
          { value: '💻', label: 'Electronics' },
          { value: '👕', label: 'Clothing' },
          { value: '🏠', label: 'Home' },
          { value: '⚽', label: 'Sports' },
          { value: '📚', label: 'Books' },
          { value: '🎮', label: 'Gaming' },
          { value: '🎨', label: 'Art' },
          { value: '🍔', label: 'Food' }
        ]
      },
      name: {
        type: 'text',
        label: 'Category Name',
        required: true,
        maxLength: 30
      },
      link: {
        type: 'text',
        label: 'Category Link',
        placeholder: '/category/...'
      }
    },
    ui: {
      title: 'Edit Categories',
      description: 'Manage product categories',
      layout: 'vertical'
    }
  }
};

// Storage for edits
const edits = {};

// API Routes

// Get products
app.get('/api/products', (req, res) => {
  res.json(products);
});

// Get schema for a sight
app.post('/api/schema/:sight', (req, res) => {
  const { sight } = req.params;
  const { context } = req.body;
  
  console.log(`Fetching schema for: ${sight}`, context);
  
  const schema = schemas[sight];
  if (schema) {
    // Could modify schema based on context (user role, etc.)
    res.json(schema);
  } else {
    // Return default schema
    res.json({
      sight,
      editor: {
        type: 'text',
        mode: 'inline'
      },
      ui: {
        title: `Edit ${sight}`
      }
    });
  }
});

// Save endpoint
app.post('/api/save', (req, res) => {
  const { sight, value, type, context } = req.body;
  
  console.log('Saving:', { sight, type, context });
  
  // Store the edit
  edits[sight] = {
    value,
    type,
    context,
    timestamp: new Date()
  };
  
  // Special handling for product updates
  if (sight === 'products.featured' && Array.isArray(value)) {
    console.log('Updated featured products:', value.map(p => p.name));
  }
  
  res.json({
    success: true,
    message: 'Saved successfully',
    data: { sight, value }
  });
});

// Batch save endpoint
app.post('/api/batch', (req, res) => {
  const { changes } = req.body;
  
  console.log(`Batch saving ${changes.length} changes`);
  
  changes.forEach(change => {
    edits[change.sight] = {
      value: change.value,
      type: change.type,
      context: change.context,
      timestamp: new Date()
    };
  });
  
  res.json({
    success: true,
    message: `Saved ${changes.length} changes`,
    count: changes.length
  });
});

// Get current edits
app.get('/api/edits', (req, res) => {
  res.json(edits);
});

// Upload endpoint (for images)
app.post('/api/upload', (req, res) => {
  // In real implementation, handle file upload
  res.json({
    success: true,
    url: 'https://via.placeholder.com/400x300/4F46E5/ffffff?text=Uploaded+Image'
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
🚀 E-Commerce Backend Server Running
====================================
Server: http://localhost:${PORT}
API: http://localhost:${PORT}/api

Available Endpoints:
- GET  /api/products          - Get all products
- POST /api/schema/:sight     - Get schema for element
- POST /api/save              - Save single edit
- POST /api/batch             - Save multiple edits
- GET  /api/edits             - View all edits
- POST /api/upload            - Upload files

Schema-enabled sights:
- products.featured  - Product selector with database
- hero.main          - HTML designer for sections
- categories.grid    - Collection editor

Press Ctrl+C to stop
  `);
});