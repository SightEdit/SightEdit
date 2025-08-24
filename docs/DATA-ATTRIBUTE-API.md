# SightEdit Data Attribute API

SightEdit supports both legacy and modern data attribute formats for maximum flexibility and cleaner HTML.

## Modern Format (Recommended)

The new `data-sightedit` attribute provides a cleaner, more concise API:

### Simple Usage

```html
<!-- Just the type -->
<div data-sightedit="text">Simple text</div>

<!-- With ID -->
<div data-sightedit="text#hero-title">Hero Title</div>

<!-- With properties -->
<div data-sightedit="text#hero[required,maxLength:100]">Required Title</div>
```

### JSON Format (Most Flexible)

```html
<div data-sightedit='{"type":"richtext","id":"content","toolbar":["bold","italic","link"],"maxLength":500}'>
  Rich content editor
</div>
```

### Short Syntax

```html
<!-- Type#ID[properties] -->
<div data-sightedit="image#avatar[required,maxSize:5MB,aspectRatio:1:1]">
  <img src="avatar.jpg" alt="Avatar">
</div>

<!-- Properties with values -->
<div data-sightedit="text#username[required,minLength:3,maxLength:20,placeholder:'Enter username']">
  Username
</div>

<!-- Boolean flags -->
<div data-sightedit="richtext#bio[required,spellcheck,maxLength:500]">
  User biography
</div>
```

## Syntax Reference

### Format Options

1. **Simple**: `type`
   ```html
   <div data-sightedit="text">Content</div>
   ```

2. **With ID**: `type#id`
   ```html
   <div data-sightedit="text#page-title">Title</div>
   ```

3. **With Properties**: `type#id[prop1,prop2:value]`
   ```html
   <div data-sightedit="text#title[required,maxLength:100]">Title</div>
   ```

4. **JSON**: Full configuration as JSON
   ```html
   <div data-sightedit='{"type":"text","id":"title","required":true}'>Title</div>
   ```

### Property Syntax

- **Boolean flags**: `required`, `disabled`, `readonly`
- **String values**: `placeholder:'Enter text'`, `label:'Name'`
- **Number values**: `maxLength:100`, `min:0`, `max:10`
- **Arrays**: `toolbar:['bold','italic']` (JSON format only)

### Quotes in Values

```html
<!-- Single quotes for strings with spaces -->
<div data-sightedit="text[placeholder:'Enter your name']">Name</div>

<!-- Double quotes also work -->
<div data-sightedit='text[placeholder:"Enter your name"]'>Name</div>

<!-- No quotes for single words -->
<div data-sightedit="text[placeholder:Username]">Username</div>
```

## Editor Type Reference

### Text Editor
```html
<!-- Simple -->
<div data-sightedit="text">Editable text</div>

<!-- With validation -->
<div data-sightedit="text#title[required,minLength:5,maxLength:100]">Title</div>

<!-- With placeholder -->
<div data-sightedit="text[placeholder:'Enter description...']">Description</div>
```

### Rich Text Editor
```html
<!-- Basic rich text -->
<div data-sightedit="richtext">Rich content</div>

<!-- Custom toolbar -->
<div data-sightedit='{"type":"richtext","toolbar":["bold","italic","underline","link"]}'>
  Content
</div>

<!-- With validation -->
<div data-sightedit="richtext#content[required,maxLength:5000]">Article content</div>
```

### Image Editor
```html
<!-- Basic image -->
<img data-sightedit="image" src="photo.jpg" alt="Photo">

<!-- With constraints -->
<img data-sightedit="image[maxSize:5MB,aspectRatio:16:9,formats:jpg|png|webp]" 
     src="banner.jpg" alt="Banner">

<!-- With cropping -->
<img data-sightedit='{"type":"image","crop":true,"aspectRatio":"1:1","minWidth":200}' 
     src="avatar.jpg" alt="Avatar">
```

### Number Editor
```html
<!-- Basic number -->
<span data-sightedit="number">42</span>

<!-- With range -->
<span data-sightedit="number[min:0,max:100,step:5]">50</span>

<!-- Currency -->
<span data-sightedit='{"type":"number","format":"currency","currency":"USD"}'>99.99</span>
```

### Date Editor
```html
<!-- Basic date -->
<span data-sightedit="date">2024-01-01</span>

<!-- Date with constraints -->
<span data-sightedit="date[min:2024-01-01,max:2024-12-31]">2024-06-15</span>

<!-- DateTime -->
<span data-sightedit='{"type":"date","includeTime":true,"format":"YYYY-MM-DD HH:mm"}'>
  2024-01-01 12:00
</span>
```

### Select Editor
```html
<!-- Simple select -->
<span data-sightedit='{"type":"select","options":["Small","Medium","Large"]}'>Medium</span>

<!-- With values -->
<span data-sightedit='{"type":"select","options":[{"value":"s","label":"Small"},{"value":"m","label":"Medium"},{"value":"l","label":"Large"}]}'>
  Medium
</span>

<!-- Multiple selection -->
<span data-sightedit='{"type":"select","multiple":true,"options":["Red","Green","Blue"]}'>
  Red, Blue
</span>
```

### Collection Editor
```html
<!-- Repeatable items -->
<div data-sightedit='{"type":"collection","itemType":"text","minItems":1,"maxItems":10}'>
  <div data-sightedit-item>Item 1</div>
  <div data-sightedit-item>Item 2</div>
</div>

<!-- Complex collection -->
<div data-sightedit='{"type":"collection","template":{"title":"text","description":"richtext","image":"image"}}'>
  <div data-sightedit-item>
    <h3 data-field="title">Title</h3>
    <p data-field="description">Description</p>
    <img data-field="image" src="image.jpg" alt="">
  </div>
</div>
```

### JSON Editor
```html
<!-- Basic JSON -->
<script type="application/json" data-sightedit="json">
{"key": "value"}
</script>

<!-- With schema validation -->
<div data-sightedit='{"type":"json","schema":{"type":"object","required":["name"]}}'>
  {"name": "John", "age": 30}
</div>
```

## Common Properties

### Validation Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `required` | boolean | Field is required | `[required]` |
| `minLength` | number | Minimum text length | `[minLength:3]` |
| `maxLength` | number | Maximum text length | `[maxLength:100]` |
| `min` | number/date | Minimum value | `[min:0]` |
| `max` | number/date | Maximum value | `[max:100]` |
| `pattern` | regex | Validation pattern | `[pattern:'^[A-Z]']` |
| `step` | number | Number increment | `[step:0.01]` |

### Display Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `placeholder` | string | Placeholder text | `[placeholder:'Enter text']` |
| `label` | string | Field label | `[label:'Full Name']` |
| `tooltip` | string | Help tooltip | `[tooltip:'Max 100 chars']` |
| `readonly` | boolean | Read-only field | `[readonly]` |
| `disabled` | boolean | Disabled field | `[disabled]` |

### Editor Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `mode` | string | Edit mode | `[mode:modal]` |
| `toolbar` | array | Editor toolbar | JSON only |
| `spellcheck` | boolean | Enable spellcheck | `[spellcheck]` |
| `autoSave` | boolean | Auto-save changes | `[autoSave]` |
| `debounce` | number | Save debounce (ms) | `[debounce:500]` |

## Migration from Legacy Format

### Before (Legacy)
```html
<div data-sight="text" 
     data-sight-id="hero-title"
     data-sight-required="true"
     data-sight-max-length="100"
     data-sight-placeholder="Enter title...">
  Editable Title
</div>
```

### After (Modern)
```html
<div data-sightedit="text#hero-title[required,maxLength:100,placeholder:'Enter title...']">
  Editable Title
</div>
```

### JSON Alternative
```html
<div data-sightedit='{"type":"text","id":"hero-title","required":true,"maxLength":100,"placeholder":"Enter title..."}'>
  Editable Title
</div>
```

## Advanced Examples

### Product Card
```html
<div class="product-card">
  <img data-sightedit="image#product-image[required,maxSize:2MB]" src="product.jpg" alt="">
  <h3 data-sightedit="text#product-name[required,maxLength:50]">Product Name</h3>
  <p data-sightedit="richtext#product-desc[maxLength:200]">Product description</p>
  <span data-sightedit='{"type":"number","id":"price","format":"currency","currency":"USD","min":0}'>
    29.99
  </span>
</div>
```

### Blog Post
```html
<article>
  <h1 data-sightedit="text#post-title[required,maxLength:100]">Blog Post Title</h1>
  
  <div data-sightedit='{"type":"date","id":"publish-date","format":"MMMM D, YYYY"}'>
    January 1, 2024
  </div>
  
  <div data-sightedit='{"type":"select","id":"category","options":["Tech","Design","Business"]}'>
    Tech
  </div>
  
  <div data-sightedit='{"type":"richtext","id":"content","toolbar":["heading","bold","italic","link","image","code"],"minLength":100,"maxLength":10000}'>
    <p>Blog post content...</p>
  </div>
  
  <div data-sightedit='{"type":"collection","id":"tags","itemType":"text","maxItems":5}'>
    <span data-sightedit-item>JavaScript</span>
    <span data-sightedit-item>Web Development</span>
  </div>
</article>
```

### User Profile
```html
<div class="user-profile">
  <img data-sightedit='{"type":"image","id":"avatar","crop":true,"aspectRatio":"1:1","maxSize":"500KB"}' 
       src="avatar.jpg" alt="Avatar">
  
  <h2 data-sightedit="text#username[required,pattern:'^[a-zA-Z0-9_]+$',minLength:3,maxLength:20]">
    username
  </h2>
  
  <p data-sightedit="richtext#bio[maxLength:500,placeholder:'Tell us about yourself...']">
    User bio
  </p>
  
  <div data-sightedit='{"type":"json","id":"preferences","schema":{"type":"object","properties":{"theme":{"type":"string","enum":["light","dark"]},"notifications":{"type":"boolean"}}}}'>
    {"theme": "light", "notifications": true}
  </div>
</div>
```

## Browser Compatibility

The modern format works in all modern browsers. For older browsers, use the JSON format with proper escaping:

```html
<!-- For maximum compatibility -->
<div data-sightedit="{&quot;type&quot;:&quot;text&quot;,&quot;required&quot;:true}">
  Content
</div>
```

## Performance Tips

1. **Use short syntax for simple cases** - Reduces HTML size
2. **Use JSON for complex configurations** - More readable for many properties
3. **Avoid inline validation functions** - Use predefined validation schemas
4. **Lazy load editors** - Only initialize visible elements
5. **Use IDs wisely** - IDs are used for saving, make them unique and descriptive

## Backward Compatibility

Both formats are supported simultaneously:

```html
<!-- Both work in the same page -->
<div data-sight="text">Old format (still supported)</div>
<div data-sightedit="text">New format (recommended)</div>
```

This ensures smooth migration without breaking existing implementations.