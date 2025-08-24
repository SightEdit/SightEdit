# SightEdit Node.js Backend Handler

Official Node.js/Express backend handler for SightEdit visual editing system.

## Installation

```bash
npm install @sightedit/server-node express
```

### Optional Database Dependencies

Install the database driver for your chosen storage:

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite
npm install sqlite sqlite3

# MongoDB
npm install mongodb
```

## Basic Usage

```javascript
const express = require('express');
const { sightEditHandler } = require('@sightedit/server-node');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Add SightEdit handler
app.use('/api/sightedit', sightEditHandler({
  storage: 'memory', // or 'file'
  cors: true
}));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## Configuration Options

### Storage Options

#### Memory Storage (default)
```javascript
sightEditHandler({
  storage: 'memory'
})
```

#### File Storage
```javascript
sightEditHandler({
  storage: 'file',
  storagePath: './data' // default: './sightedit-data'
})
```

#### Database Storage

##### PostgreSQL
```javascript
sightEditHandler({
  storage: 'database',
  databaseConfig: {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    username: 'user',
    password: 'password',
    tableName: 'sightedit_content' // Optional
  }
})
```

##### MySQL
```javascript
sightEditHandler({
  storage: 'database',
  databaseConfig: {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'myapp',
    username: 'user',
    password: 'password'
  }
})
```

##### SQLite
```javascript
sightEditHandler({
  storage: 'database',
  databaseConfig: {
    type: 'sqlite',
    database: './myapp.db' // Path to SQLite file
  }
})
```

##### MongoDB
```javascript
sightEditHandler({
  storage: 'database',
  databaseConfig: {
    type: 'mongodb',
    connectionString: 'mongodb://localhost:27017/myapp',
    // Or use individual options:
    host: 'localhost',
    port: 27017,
    database: 'myapp',
    username: 'user',
    password: 'password'
  }
})
```

#### Custom Storage Adapter
```javascript
sightEditHandler({
  storage: {
    async get(key) { /* ... */ },
    async set(key, value) { /* ... */ },
    async delete(key) { /* ... */ },
    async list(prefix) { /* ... */ }
  }
})
```

### Authentication

```javascript
sightEditHandler({
  auth: async (req) => {
    // Return true if authorized
    const token = req.headers.authorization;
    return await validateToken(token);
  }
})
```

### CORS Configuration

```javascript
sightEditHandler({
  cors: {
    origin: 'https://mysite.com',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
})
```

### Rate Limiting

```javascript
sightEditHandler({
  rateLimit: {
    windowMs: 60000, // 1 minute
    max: 60, // 60 requests per window
    message: 'Too many requests'
  }
})
```

### Hooks

```javascript
sightEditHandler({
  beforeSave: async (data) => {
    // Modify data before saving
    data.modifiedAt = new Date();
    return data;
  },
  
  afterSave: async (data, result) => {
    // Log, notify, etc.
    console.log('Saved:', data.sight);
  }
})
```

## API Endpoints

The handler creates these endpoints:

- `POST /save` - Save a single change
- `POST /batch` - Save multiple changes
- `GET /schema/:sight` - Get element schema
- `POST /upload` - Handle file uploads

## Example with Authentication

```javascript
const jwt = require('jsonwebtoken');

app.use('/api/sightedit', sightEditHandler({
  storage: 'file',
  storagePath: './content',
  
  auth: async (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.role === 'editor' || decoded.role === 'admin';
    } catch {
      return false;
    }
  },
  
  beforeSave: async (data) => {
    data.lastModified = new Date().toISOString();
    data.modifiedBy = req.user?.id;
    return data;
  }
}));
```

## Database Storage Example

```javascript
const { MongoClient } = require('mongodb');

const mongoAdapter = {
  async get(key) {
    const doc = await collection.findOne({ _id: key });
    return doc?.data;
  },
  
  async set(key, value) {
    await collection.updateOne(
      { _id: key },
      { $set: { data: value, updatedAt: new Date() } },
      { upsert: true }
    );
  },
  
  async delete(key) {
    await collection.deleteOne({ _id: key });
  },
  
  async list(prefix) {
    const query = prefix ? { _id: { $regex: `^${prefix}` } } : {};
    const docs = await collection.find(query).toArray();
    return docs.map(doc => doc._id);
  }
};

app.use('/api/sightedit', sightEditHandler({
  storage: mongoAdapter
}));
```

## TypeScript Support

```typescript
import express from 'express';
import { sightEditHandler, SightEditHandlerOptions } from '@sightedit/server-node';

const options: SightEditHandlerOptions = {
  storage: 'file',
  auth: async (req) => {
    // Type-safe request object
    return req.headers['x-api-key'] === process.env.API_KEY;
  }
};

app.use('/api/sightedit', sightEditHandler(options));
```