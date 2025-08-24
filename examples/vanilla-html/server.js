const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve the built SightEdit library
app.use('/packages', express.static(path.join(__dirname, '../../packages')));

// In-memory storage for demo
const storage = new Map();

// API endpoints
app.post('/api/sightedit/save', (req, res) => {
    const { sight, value, type, context, timestamp } = req.body;
    
    if (!sight) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing sight parameter' 
        });
    }
    
    // Store the data
    storage.set(sight, {
        value,
        type,
        context,
        timestamp,
        lastModified: Date.now()
    });
    
    console.log(`Saved ${sight}:`, value);
    
    res.json({
        success: true,
        data: value,
        version: Date.now()
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
        if (op.type === 'update') {
            const { sight, value } = op.data;
            storage.set(sight, {
                value,
                lastModified: Date.now()
            });
            
            return {
                success: true,
                data: value,
                version: Date.now()
            };
        }
        
        return {
            success: false,
            error: 'Unsupported operation'
        };
    });
    
    res.json({
        success: true,
        results
    });
});

app.get('/api/sightedit/schema/:sight', (req, res) => {
    const { sight } = req.params;
    
    // Return mock schema for demo
    res.json({
        type: 'text',
        label: sight,
        placeholder: `Enter ${sight}...`
    });
});

// Upload endpoint
app.post('/api/sightedit/upload', (req, res) => {
    // Mock upload response
    res.json({
        url: 'https://via.placeholder.com/400x300?text=Uploaded+Image'
    });
});

// Get all stored data (for debugging)
app.get('/api/sightedit/data', (req, res) => {
    const data = Object.fromEntries(storage);
    res.json(data);
});

app.listen(PORT, () => {
    console.log(`SightEdit demo server running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});