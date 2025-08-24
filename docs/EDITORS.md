# Editor Types & Modes

Complete reference for all SightEdit editor types and modes.

## 📝 Editor Types

### Text Editor
Single-line text input with validation support.

```html
<!-- Basic -->
<h1 data-sightedit="text">Editable heading</h1>

<!-- With ID -->
<h2 data-sightedit="text#page-title">Page Title</h2>

<!-- With validation -->
<h3 data-sightedit="text#title[required,maxLength:60,minLength:10]">
    Title (10-60 characters)
</h3>

<!-- With pattern validation -->
<span data-sightedit="text#username[pattern:^[a-zA-Z0-9_]+$]">
    username123
</span>

<!-- With placeholder -->
<div data-sightedit="text#description[placeholder:'Enter description...']">
    Product description
</div>
```

**Options:**
- `required`: Field must have a value
- `maxLength`: Maximum character length
- `minLength`: Minimum character length
- `pattern`: Regular expression pattern
- `placeholder`: Placeholder text
- `readonly`: Make field read-only
- `transform`: Text transformation (uppercase, lowercase, capitalize)

---

### RichText Editor
Multi-line formatted text with toolbar.

```html
<!-- Basic rich text -->
<div data-sightedit="richtext">
    <p>Rich text with <strong>formatting</strong></p>
</div>

<!-- With custom toolbar -->
<div data-sightedit='{
    "type": "richtext",
    "id": "content",
    "toolbar": ["bold", "italic", "underline", "link", "bullet", "number", "blockquote", "code"],
    "maxLength": 5000
}'>
    <p>Article content...</p>
</div>

<!-- Minimal toolbar -->
<div data-sightedit='{
    "type": "richtext",
    "toolbar": ["bold", "italic", "link"]
}'>
    Simple formatted text
</div>
```

**Toolbar Options:**
- Text: `bold`, `italic`, `underline`, `strike`
- Headers: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- Lists: `bullet`, `number`, `checklist`
- Blocks: `blockquote`, `code`, `codeblock`
- Media: `link`, `image`, `video`, `embed`
- Format: `align`, `color`, `background`, `font`, `size`
- Advanced: `table`, `formula`, `clean`

---

### Number Editor
Numeric input with validation and formatting.

```html
<!-- Basic number -->
<span data-sightedit="number">42</span>

<!-- Price with constraints -->
<span data-sightedit="number#price[min:0,max:9999,step:0.01]">
    $99.99
</span>

<!-- Integer only -->
<span data-sightedit="number#quantity[min:1,max:100,step:1]">
    5
</span>

<!-- With currency formatting -->
<span data-sightedit='{
    "type": "number",
    "id": "price",
    "format": "currency",
    "currency": "USD",
    "min": 0
}'>$1,234.56</span>

<!-- Percentage -->
<span data-sightedit='{
    "type": "number",
    "id": "discount",
    "format": "percent",
    "min": 0,
    "max": 100
}'>25%</span>
```

**Options:**
- `min`: Minimum value
- `max`: Maximum value
- `step`: Increment step
- `format`: Number format (currency, percent, decimal)
- `currency`: Currency code (USD, EUR, etc.)
- `decimals`: Number of decimal places

---

### Date Editor
Date and time picker with constraints.

```html
<!-- Basic date -->
<time data-sightedit="date">2024-01-15</time>

<!-- With constraints -->
<time data-sightedit="date#event[min:2024-01-01,max:2024-12-31]">
    2024-06-15
</time>

<!-- Date and time -->
<time data-sightedit='{
    "type": "date",
    "id": "meeting",
    "includeTime": true,
    "format": "YYYY-MM-DD HH:mm"
}'>2024-01-15 14:30</time>

<!-- Time only -->
<time data-sightedit='{
    "type": "date",
    "id": "alarm",
    "mode": "time",
    "format": "HH:mm"
}'>09:00</time>

<!-- Date range -->
<span data-sightedit='{
    "type": "date",
    "id": "vacation",
    "mode": "range"
}'>Jan 15 - Jan 22, 2024</span>
```

**Options:**
- `min`: Minimum date
- `max`: Maximum date
- `includeTime`: Include time picker
- `mode`: Date mode (date, time, datetime, range)
- `format`: Display format
- `timezone`: Timezone handling

---

### Color Editor
Color picker with multiple formats.

```html
<!-- Basic color -->
<span data-sightedit="color">#667eea</span>

<!-- With swatches -->
<span data-sightedit='{
    "type": "color",
    "id": "theme",
    "swatches": ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000"]
}'>#{color}</span>

<!-- RGB format -->
<span data-sightedit='{
    "type": "color",
    "format": "rgb"
}'>rgb(102, 126, 234)</span>

<!-- With opacity -->
<span data-sightedit='{
    "type": "color",
    "id": "overlay",
    "alpha": true
}'>rgba(102, 126, 234, 0.8)</span>
```

**Options:**
- `format`: Color format (hex, rgb, hsl, hsv)
- `alpha`: Enable alpha channel
- `swatches`: Predefined color swatches
- `picker`: Picker type (wheel, square, slider)

---

### Image Editor
Image upload and management.

```html
<!-- Basic image -->
<img data-sightedit="image" src="photo.jpg" alt="Photo">

<!-- With constraints -->
<img data-sightedit='{
    "type": "image",
    "id": "avatar",
    "maxSize": "5MB",
    "accept": "image/jpeg,image/png",
    "aspectRatio": "1:1"
}' src="avatar.jpg">

<!-- With cropping -->
<img data-sightedit='{
    "type": "image",
    "id": "banner",
    "crop": true,
    "cropAspect": "16:9",
    "minWidth": 1920,
    "minHeight": 1080
}' src="banner.jpg">

<!-- Multiple images -->
<div data-sightedit='{
    "type": "image",
    "id": "gallery",
    "multiple": true,
    "maxFiles": 10
}'>
    <img src="photo1.jpg">
    <img src="photo2.jpg">
</div>
```

**Options:**
- `maxSize`: Maximum file size
- `accept`: Accepted file types
- `aspectRatio`: Required aspect ratio
- `crop`: Enable cropping
- `minWidth`/`minHeight`: Minimum dimensions
- `maxWidth`/`maxHeight`: Maximum dimensions
- `multiple`: Allow multiple images
- `compression`: Image compression quality

---

### File Editor
File upload for documents and other files.

```html
<!-- Basic file upload -->
<a data-sightedit="file" href="document.pdf">Download PDF</a>

<!-- With constraints -->
<a data-sightedit='{
    "type": "file",
    "id": "report",
    "accept": ".pdf,.doc,.docx",
    "maxSize": "10MB"
}' href="report.pdf">Annual Report</a>

<!-- Multiple files -->
<div data-sightedit='{
    "type": "file",
    "id": "attachments",
    "multiple": true,
    "maxFiles": 5
}'>
    <a href="file1.pdf">File 1</a>
    <a href="file2.doc">File 2</a>
</div>
```

**Options:**
- `accept`: Accepted file types
- `maxSize`: Maximum file size
- `multiple`: Allow multiple files
- `maxFiles`: Maximum number of files

---

### Link Editor
URL input with validation.

```html
<!-- Basic link -->
<a data-sightedit="link" href="https://example.com">Visit Site</a>

<!-- With validation -->
<a data-sightedit='{
    "type": "link",
    "id": "website",
    "validate": true,
    "allowedProtocols": ["https", "http"]
}' href="#">Website</a>

<!-- Email link -->
<a data-sightedit='{
    "type": "link",
    "id": "email",
    "mode": "email"
}' href="mailto:user@example.com">Email</a>

<!-- Phone link -->
<a data-sightedit='{
    "type": "link",
    "id": "phone",
    "mode": "tel"
}' href="tel:+1234567890">Call</a>
```

**Options:**
- `validate`: Validate URL format
- `allowedProtocols`: Allowed URL protocols
- `mode`: Link type (url, email, tel, anchor)
- `target`: Link target (_blank, _self, etc.)

---

### Select Editor
Dropdown selection with options.

```html
<!-- Basic select -->
<span data-sightedit='{
    "type": "select",
    "options": ["Option 1", "Option 2", "Option 3"]
}'>Option 1</span>

<!-- With labels and values -->
<span data-sightedit='{
    "type": "select",
    "id": "country",
    "options": [
        {"value": "us", "label": "United States"},
        {"value": "uk", "label": "United Kingdom"},
        {"value": "ca", "label": "Canada"}
    ]
}'>United States</span>

<!-- Multiple selection -->
<div data-sightedit='{
    "type": "select",
    "id": "tags",
    "multiple": true,
    "options": ["JavaScript", "TypeScript", "React", "Vue", "Angular"]
}'>JavaScript, React</div>

<!-- Searchable dropdown -->
<span data-sightedit='{
    "type": "select",
    "id": "product",
    "searchable": true,
    "options": ["Product A", "Product B", "Product C"]
}'>Product A</span>
```

**Options:**
- `options`: Available options
- `multiple`: Allow multiple selection
- `searchable`: Enable search in dropdown
- `placeholder`: Placeholder text
- `required`: Require selection
- `maxSelections`: Maximum selections (for multiple)

---

### Collection Editor
Manage lists of items.

```html
<!-- Simple list -->
<ul data-sightedit='{
    "type": "collection",
    "id": "features",
    "itemType": "text"
}'>
    <li>Feature 1</li>
    <li>Feature 2</li>
    <li>Feature 3</li>
</ul>

<!-- Complex items -->
<div data-sightedit='{
    "type": "collection",
    "id": "team",
    "itemSchema": {
        "name": {"type": "text", "required": true},
        "role": {"type": "text"},
        "photo": {"type": "image"}
    },
    "minItems": 1,
    "maxItems": 10
}'>
    <div class="member">
        <img src="john.jpg">
        <h3>John Doe</h3>
        <p>Developer</p>
    </div>
</div>

<!-- Sortable list -->
<ol data-sightedit='{
    "type": "collection",
    "id": "steps",
    "itemType": "richtext",
    "sortable": true
}'>
    <li>Step 1: Setup</li>
    <li>Step 2: Configure</li>
    <li>Step 3: Deploy</li>
</ol>
```

**Options:**
- `itemType`: Type of items in collection
- `itemSchema`: Schema for complex items
- `minItems`: Minimum number of items
- `maxItems`: Maximum number of items
- `sortable`: Enable drag-and-drop sorting
- `addButton`: Custom add button text
- `removeButton`: Custom remove button text

---

### JSON Editor
Edit JSON data with syntax highlighting.

```html
<!-- Basic JSON -->
<script type="application/json" data-sightedit="json">
{
    "name": "John",
    "age": 30
}
</script>

<!-- With schema validation -->
<div data-sightedit='{
    "type": "json",
    "id": "config",
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "age": {"type": "number"}
        }
    }
}'>
{"name": "John", "age": 30}
</div>

<!-- Pretty formatted -->
<pre data-sightedit='{
    "type": "json",
    "id": "settings",
    "format": "pretty"
}'>
{
    "theme": "dark",
    "fontSize": 14,
    "autoSave": true
}
</pre>
```

**Options:**
- `schema`: JSON Schema for validation
- `format`: Display format (pretty, compact)
- `syntax`: Enable syntax highlighting
- `validate`: Enable validation
- `maxSize`: Maximum JSON size

## 🎨 Editor Modes

### Inline Mode
Edit directly in place without modal.

```html
<h1 data-sightedit='{"type":"text","mode":"inline"}'>
    Click to edit inline
</h1>
```

**Best for:**
- Short text fields
- Numbers
- Single selections
- Quick edits

### Modal Mode
Full-screen editor overlay.

```html
<div data-sightedit='{"type":"richtext","mode":"modal"}'>
    Opens in modal...
</div>
```

**Best for:**
- Rich text content
- Long forms
- Complex editors
- Mobile editing

### Sidebar Mode
Editor opens in side panel.

```html
<img data-sightedit='{"type":"image","mode":"sidebar"}' src="photo.jpg">
```

**Best for:**
- Image editing
- File management
- Settings panels
- Multi-field forms

### Tooltip Mode
Small floating editor near element.

```html
<span data-sightedit='{"type":"color","mode":"tooltip"}'>#667eea</span>
```

**Best for:**
- Color pickers
- Date pickers
- Small selects
- Quick adjustments

## 🎯 Mode Selection Logic

SightEdit automatically selects the best mode if not specified:

| Editor Type | Default Mode | Why |
|------------|--------------|-----|
| text | inline | Quick in-place editing |
| richtext | modal | Needs space for toolbar |
| number | inline | Simple input |
| date | tooltip | Compact calendar |
| color | tooltip | Small color picker |
| image | sidebar | Preview and options |
| file | sidebar | File management |
| link | inline | Simple URL input |
| select | tooltip | Dropdown near element |
| collection | modal | Needs space for items |
| json | modal | Code editor needs space |

## 🔧 Custom Editor Registration

Create your own editor types:

```javascript
SightEdit.registerEditor('rating', {
    // Default mode for this editor
    defaultMode: 'inline',
    
    // Render the editor UI
    render(element, value, options) {
        const stars = [1, 2, 3, 4, 5].map(n => {
            const star = document.createElement('span');
            star.textContent = n <= value ? '★' : '☆';
            star.onclick = () => this.onChange(n);
            return star;
        });
        
        element.innerHTML = '';
        stars.forEach(star => element.appendChild(star));
    },
    
    // Extract value from element
    getValue(element) {
        return element.querySelectorAll('.filled').length;
    },
    
    // Validate value
    validate(value, options) {
        if (options.required && !value) {
            return 'Rating is required';
        }
        if (value < 1 || value > 5) {
            return 'Rating must be between 1 and 5';
        }
        return true;
    },
    
    // Apply value to element
    applyValue(element, value) {
        this.render(element, value);
    }
});
```

Use your custom editor:

```html
<div data-sightedit='{"type":"rating","id":"product-rating"}'>
    ★★★★☆
</div>
```

## 📋 Editor Capabilities Matrix

| Feature | text | richtext | number | date | color | image | file | link | select | collection | json |
|---------|------|----------|--------|------|-------|-------|------|------|--------|------------|------|
| Validation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Required | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Placeholder | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Min/Max | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Pattern | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Multiple | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Async Load | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Custom UI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 🎯 Best Practices

1. **Choose the right editor type** - Use `text` for short content, `richtext` for articles
2. **Set appropriate constraints** - Add min/max values to prevent invalid data
3. **Use IDs for important fields** - Makes backend integration easier
4. **Consider mobile users** - Some modes work better on mobile
5. **Add placeholders** - Help users understand what to enter
6. **Validate on both sides** - Client validation for UX, server for security
7. **Use collections wisely** - Great for dynamic lists but can be complex
8. **Optimize images** - Set max sizes and dimensions to prevent huge uploads
9. **Test all modes** - Ensure your content works in different editor modes
10. **Provide fallbacks** - Have sensible defaults when editors fail to load