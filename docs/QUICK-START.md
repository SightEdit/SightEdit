# Quick Start Guide

Get SightEdit running in under 5 minutes!

## 🚀 Fastest Setup (CDN)

Add this to any HTML page:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Editable Page</title>
</head>
<body>
    <!-- Mark any element as editable -->
    <h1 data-sightedit="text">Click to edit me!</h1>
    <p data-sightedit="richtext">This supports <b>rich text</b> editing.</p>
    
    <!-- Add SightEdit -->
    <script src="https://cdn.jsdelivr.net/npm/@sightedit/core/dist/core.esm.js"></script>
    <script>
        SightEdit.init({
            endpoint: '/api/sightedit'  // Your backend endpoint
        });
    </script>
</body>
</html>
```

Press `Ctrl+E` (or `Cmd+E` on Mac) to toggle edit mode!

## 📦 NPM Installation

For modern JavaScript projects:

```bash
npm install @sightedit/core
```

```javascript
import SightEdit from '@sightedit/core';

SightEdit.init({
    endpoint: 'https://api.example.com/sightedit'
});
```

## 🎯 Basic Examples

### Simple Text Editing
```html
<h1 data-sightedit="text">Editable Heading</h1>
<p data-sightedit="text">Editable paragraph</p>
```

### Text with ID and Validation
```html
<h2 data-sightedit="text#page-title[required,maxLength:60]">
    Page Title (max 60 chars)
</h2>
```

### Rich Text Editor
```html
<div data-sightedit="richtext#content">
    <p>This content supports <strong>formatting</strong>!</p>
    <ul>
        <li>Lists</li>
        <li>Links</li>
        <li>And more...</li>
    </ul>
</div>
```

### Number Input with Constraints
```html
<span data-sightedit="number#price[min:0,max:9999,step:0.01]">
    $29.99
</span>
```

### Date Picker
```html
<time data-sightedit="date#event-date[min:2024-01-01]">
    2024-06-15
</time>
```

### Color Picker
```html
<div data-sightedit="color#theme-color" style="background: #667eea;">
    #667eea
</div>
```

### Dropdown Select
```html
<span data-sightedit='{"type":"select","id":"status","options":["Draft","Published","Archived"]}'>
    Published
</span>
```

### Image Upload
```html
<img data-sightedit="image#hero-image[maxSize:5MB]" 
     src="hero.jpg" 
     alt="Hero Image">
```

### Collection (Repeatable Items)
```html
<ul data-sightedit='{"type":"collection","id":"features","itemType":"text"}'>
    <li>Feature 1</li>
    <li>Feature 2</li>
    <li>Feature 3</li>
</ul>
```

## 🔧 Basic Backend Setup

### Node.js / Express
```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Save endpoint
app.post('/api/sightedit/save', async (req, res) => {
    const { sight, value, type, context } = req.body;
    
    // Save to your database
    await db.update(sight, value);
    
    res.json({ success: true });
});

// Batch endpoint
app.post('/api/sightedit/batch', async (req, res) => {
    const { operations } = req.body;
    
    // Process all operations
    for (const op of operations) {
        await db.update(op.sight, op.value);
    }
    
    res.json({ success: true });
});
```

### PHP
```php
<?php
// save.php
$data = json_decode(file_get_contents('php://input'), true);

$sight = $data['sight'];
$value = $data['value'];
$type = $data['type'];

// Save to database
$stmt = $pdo->prepare("UPDATE content SET value = ? WHERE sight = ?");
$stmt->execute([$value, $sight]);

echo json_encode(['success' => true]);
?>
```

### Python / Flask
```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/sightedit/save', methods=['POST'])
def save():
    data = request.json
    sight = data['sight']
    value = data['value']
    
    # Save to database
    db.update(sight, value)
    
    return jsonify({'success': True})
```

## ⚡ Common Patterns

### Blog Post Editor
```html
<article>
    <h1 data-sightedit="text#post-title[required,maxLength:100]">
        Blog Post Title
    </h1>
    
    <div data-sightedit="richtext#post-content">
        <p>Your blog content here...</p>
    </div>
    
    <time data-sightedit="date#publish-date">
        2024-01-15
    </time>
    
    <span data-sightedit='{"type":"select","id":"category","options":["Tech","Business","Lifestyle"]}'>
        Tech
    </span>
</article>
```

### Product Card
```html
<div class="product-card">
    <img data-sightedit="image#product-image" src="product.jpg">
    
    <h3 data-sightedit="text#product-name">Product Name</h3>
    
    <p data-sightedit="text#product-description[maxLength:200]">
        Product description...
    </p>
    
    <span data-sightedit="number#product-price[min:0,step:0.01]">
        $19.99
    </span>
    
    <span data-sightedit='{"type":"select","id":"availability","options":["In Stock","Out of Stock","Pre-order"]}'>
        In Stock
    </span>
</div>
```

### Settings Panel
```html
<div class="settings">
    <label>
        Site Title:
        <input data-sightedit="text#site-title" value="My Website">
    </label>
    
    <label>
        Theme Color:
        <input data-sightedit="color#theme-color" value="#667eea">
    </label>
    
    <label>
        Items per Page:
        <input data-sightedit="number#items-per-page[min:10,max:100,step:10]" value="20">
    </label>
    
    <label>
        Language:
        <select data-sightedit='{"type":"select","id":"language","options":["English","Spanish","French"]}'>
            <option>English</option>
        </select>
    </label>
</div>
```

## 🎨 Styling Edit Mode

### Custom Edit Mode Styles
```css
/* Highlight editable elements in edit mode */
[data-sightedit]:hover {
    outline: 2px dashed #667eea;
    outline-offset: 2px;
}

/* Style the edit mode indicator */
.sightedit-edit-mode-active [data-sightedit] {
    position: relative;
}

.sightedit-edit-mode-active [data-sightedit]::after {
    content: "✏️";
    position: absolute;
    top: -10px;
    right: -10px;
    font-size: 12px;
}
```

### Custom Button Position
```javascript
SightEdit.init({
    endpoint: '/api/sightedit',
    ui: {
        position: 'top-right',  // or 'top-left', 'bottom-left', 'bottom-right'
        theme: 'dark'           // or 'light', 'auto'
    }
});
```

## 🔐 Authentication

### With JWT Tokens
```javascript
SightEdit.init({
    endpoint: '/api/sightedit',
    auth: {
        headers: async () => ({
            'Authorization': `Bearer ${localStorage.getItem('jwt')}`
        })
    }
});
```

### With Session Cookies
```javascript
SightEdit.init({
    endpoint: '/api/sightedit',
    auth: {
        credentials: 'include'  // Send cookies with requests
    }
});
```

### With API Keys
```javascript
SightEdit.init({
    endpoint: '/api/sightedit',
    auth: {
        headers: async () => ({
            'X-API-Key': 'your-api-key-here'
        })
    }
});
```

## 🚦 Next Steps

1. **Explore Editor Types**: See [EDITORS.md](EDITORS.md) for all 11+ editor types
2. **Advanced Configuration**: Check [CONFIGURATION.md](CONFIGURATION.md) for all options
3. **API Reference**: Read [API.md](API.md) for complete API documentation
4. **Real Examples**: Browse [EXAMPLES.md](EXAMPLES.md) for production use cases

## 💡 Tips

- Press `Esc` to cancel editing without saving
- Use `Tab` to navigate between editable elements
- Hold `Shift` while clicking to edit multiple elements
- Changes are auto-saved after 500ms of inactivity
- Offline changes are queued and synced when online

## 🆘 Need Help?

- 📖 [Full Documentation](https://docs.sightedit.com)
- 💬 [Discord Community](https://discord.gg/sightedit)
- 🐛 [Report Issues](https://github.com/sightedit/sightedit/issues)
- 📧 [Email Support](mailto:support@sightedit.com)