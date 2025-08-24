import { chromium, FullConfig } from '@playwright/test';
import express from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';

const app = express();
const port = 3333;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../fixtures/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static(path.join(__dirname, '../fixtures')));
app.use('/dist', express.static(path.join(__dirname, '../../packages/core/dist')));

// Test data storage
let testData: Record<string, any> = {
  'hero-title': 'Welcome to SightEdit',
  'hero-subtitle': 'Transform any website into a visual editor',
  'feature-1-title': 'Easy Integration',
  'feature-1-desc': 'Add a single script tag and data attributes',
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
  const schemas: Record<string, any> = {
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
    'nav-links': [
      { text: 'Home', url: '/', target: '_self' },
      { text: 'Features', url: '/features', target: '_self' },
      { text: 'Docs', url: '/docs', target: '_blank' }
    ]
  };
  res.json({ success: true });
});

let server: any;

async function globalSetup(config: FullConfig) {
  console.log('Starting test server...');
  
  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      console.log(`Test server running on http://localhost:${port}`);
      resolve();
    });
    
    server.on('error', reject);
  });
}

// Export server for teardown
(globalSetup as any).server = () => server;

export default globalSetup;