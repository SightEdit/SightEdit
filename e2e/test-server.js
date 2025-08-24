#!/usr/bin/env node
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3333;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'fixtures', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static(path.join(__dirname, 'fixtures')));
app.use('/dist', express.static(path.join(__dirname, '../packages/core/dist')));
app.use('/uploads', express.static(uploadsDir));

// Test data storage
let testData = {
  'hero-title': 'Welcome to SightEdit',
  'hero-subtitle': 'Transform any website into a visual editor',
  'feature-1-title': 'Easy Integration',
  'feature-1-desc': 'Add a single script tag and data attributes',
  'feature-2-title': 'Framework Agnostic',
  'feature-2-desc': 'Works with React, Vue, plain HTML, or any framework',
  'feature-3-title': 'Real-time Editing',
  'feature-3-desc': 'See changes instantly without page reload',
  'site-title': 'My Awesome Site',
  'theme-color': '#667eea',
  'launch-date': '2024-01-01',
  'max-users': 1000,
  'site-status': 'active',
  'api-config': {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3,
    endpoints: {
      users: '/users',
      posts: '/posts',
      comments: '/comments'
    }
  },
  'docs-content': `# Getting Started

Welcome to **SightEdit**! This is a powerful visual editing system.

## Features

- ✅ Real-time editing
- ✅ Framework agnostic
- ✅ Easy integration
- ✅ Plugin system

## Quick Start

\`\`\`javascript
SightEdit.init({
  endpoint: '/api/sightedit'
});
\`\`\`

> **Note**: Make sure to include the SightEdit script in your HTML.`,
  'nav-links': [
    { text: 'Home', url: '/', target: '_self' },
    { text: 'Features', url: '/features', target: '_self' },
    { text: 'Docs', url: '/docs', target: '_blank' }
  ]
};

// API endpoints
app.get('/api/sightedit/data/:sight', (req, res) => {
  const { sight } = req.params;
  res.json({
    success: true,
    data: testData[sight] || null
  });
});

app.post('/api/sightedit/save', (req, res) => {
  const { sight, value, type } = req.body;
  
  if (!sight) {
    return res.status(400).json({
      success: false,
      error: 'Missing sight identifier'
    });
  }
  
  testData[sight] = value;
  
  res.json({
    success: true,
    data: { sight, value, type, timestamp: Date.now() }
  });
});

app.post('/api/sightedit/batch', (req, res) => {
  const { operations } = req.body;
  
  if (!Array.isArray(operations)) {
    return res.status(400).json({
      success: false,
      error: 'Operations must be an array'
    });
  }
  
  const results = operations.map(op => {
    if (op.action === 'save') {
      testData[op.sight] = op.value;
      return {
        success: true,
        sight: op.sight,
        value: op.value
      };
    }
    return {
      success: false,
      error: 'Unknown operation'
    };
  });
  
  res.json({
    success: true,
    results
  });
});

app.post('/api/sightedit/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }
  
  res.json({
    success: true,
    data: {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`
    }
  });
});

app.get('/api/sightedit/schema/:sight', (req, res) => {
  const schemas = {
    'hero-title': {
      type: 'text',
      validation: {
        required: true,
        maxLength: 100
      }
    },
    'nav-links': {
      type: 'collection',
      itemSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', required: true },
          url: { type: 'string', required: true },
          target: { type: 'string', enum: ['_self', '_blank'] }
        }
      }
    }
  };
  
  res.json({
    success: true,
    schema: schemas[req.params.sight] || null
  });
});

// Reset endpoint for tests
app.post('/api/test/reset', (req, res) => {
  testData = {
    'hero-title': 'Welcome to SightEdit',
    'hero-subtitle': 'Transform any website into a visual editor',
    'feature-1-title': 'Easy Integration',
    'feature-1-desc': 'Add a single script tag and data attributes',
    'feature-2-title': 'Framework Agnostic',
    'feature-2-desc': 'Works with React, Vue, plain HTML, or any framework',
    'feature-3-title': 'Real-time Editing',
    'feature-3-desc': 'See changes instantly without page reload',
    'site-title': 'My Awesome Site',
    'theme-color': '#667eea',
    'launch-date': '2024-01-01',
    'max-users': 1000,
    'site-status': 'active',
    'api-config': {
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      retries: 3,
      endpoints: {
        users: '/users',
        posts: '/posts',
        comments: '/comments'
      }
    },
    'docs-content': `# Getting Started

Welcome to **SightEdit**! This is a powerful visual editing system.

## Features

- ✅ Real-time editing
- ✅ Framework agnostic
- ✅ Easy integration
- ✅ Plugin system

## Quick Start

\`\`\`javascript
SightEdit.init({
  endpoint: '/api/sightedit'
});
\`\`\`

> **Note**: Make sure to include the SightEdit script in your HTML.`,
    'nav-links': [
      { text: 'Home', url: '/', target: '_self' },
      { text: 'Features', url: '/features', target: '_self' },
      { text: 'Docs', url: '/docs', target: '_blank' }
    ]
  };
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Test server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Test server stopped');
    process.exit(0);
  });
});

module.exports = app;