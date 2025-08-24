# @sightedit/plugin-image-crop

Advanced image cropping and editing plugin for SightEdit with filters, adjustments, and presets.

## Features

- 🖼️ Advanced image cropping with Cropper.js
- 🎨 Built-in image filters (grayscale, sepia, vintage, etc.)
- 🎛️ Image adjustments (brightness, contrast, saturation, blur)
- 📐 Aspect ratio presets (square, 16:9, 4:3, etc.)
- 🔧 Comprehensive toolbar with all crop tools
- ↻ Rotate and flip functionality
- 🔍 Zoom controls with mouse wheel support
- 📱 Touch gesture support
- ⌨️ Keyboard shortcuts
- 💾 Multiple export formats (JPEG, PNG, WebP)
- 🎯 High-quality image processing

## Installation

```bash
npm install @sightedit/plugin-image-crop
```

## Usage

### Basic Setup

```javascript
import SightEdit from '@sightedit/core';
import ImageCropPlugin from '@sightedit/plugin-image-crop';

// Initialize SightEdit with Image Crop plugin
const sightEdit = new SightEdit({
  plugins: [
    new ImageCropPlugin({
      aspectRatio: null, // Free crop
      filters: true,
      toolbar: true
    })
  ]
});
```

### HTML Markup

```html
<!-- Basic image with crop enabled -->
<img src="photo.jpg" data-sight="image" alt="Editable image">

<!-- Image with specific aspect ratio -->
<img src="photo.jpg" 
     data-sight="image" 
     data-sight-aspect-ratio="16:9"
     alt="16:9 image">

<!-- Disable crop for specific image -->
<img src="logo.png" 
     data-sight="image" 
     data-sight-crop="false"
     alt="Logo without crop">

<!-- Custom crop options -->
<img src="photo.jpg"
     data-sight="image"
     data-sight-min-width="200"
     data-sight-min-height="200"
     data-sight-format="webp"
     data-sight-quality="0.85"
     alt="Custom crop settings">
```

## Options

```typescript
interface ImageCropPluginOptions {
  // Aspect ratio
  aspectRatio?: number | null;          // null for free crop
  initialAspectRatio?: number;          // Initial aspect ratio
  
  // View modes
  viewMode?: 0 | 1 | 2 | 3;            // 0: no restrictions, 1: restrict crop box, 2: restrict canvas, 3: restrict canvas with image
  dragMode?: 'crop' | 'move' | 'none';  // Default drag mode
  
  // Features
  responsive?: boolean;                 // Responsive container (default: true)
  restore?: boolean;                    // Restore cropped area (default: true)
  checkCrossOrigin?: boolean;           // Check cross origin (default: true)
  checkOrientation?: boolean;           // Check orientation (default: true)
  modal?: boolean;                      // Show modal backdrop (default: true)
  guides?: boolean;                     // Show guides (default: true)
  center?: boolean;                     // Center crop box (default: true)
  highlight?: boolean;                  // Highlight crop area (default: true)
  background?: boolean;                 // Show grid background (default: true)
  autoCrop?: boolean;                   // Auto create crop box (default: true)
  autoCropArea?: number;                // Auto crop area size (default: 0.8)
  
  // Controls
  movable?: boolean;                    // Move image (default: true)
  rotatable?: boolean;                  // Rotate image (default: true)
  scalable?: boolean;                   // Scale image (default: true)
  zoomable?: boolean;                   // Zoom image (default: true)
  zoomOnTouch?: boolean;                // Zoom on touch (default: true)
  zoomOnWheel?: boolean;                // Zoom on wheel (default: true)
  wheelZoomRatio?: number;              // Wheel zoom ratio (default: 0.1)
  cropBoxMovable?: boolean;             // Move crop box (default: true)
  cropBoxResizable?: boolean;           // Resize crop box (default: true)
  toggleDragModeOnDblclick?: boolean;   // Toggle drag mode on double click (default: true)
  
  // Size constraints
  minContainerWidth?: number;
  minContainerHeight?: number;
  minCanvasWidth?: number;
  minCanvasHeight?: number;
  minCropBoxWidth?: number;
  minCropBoxHeight?: number;
  
  // Plugin features
  filters?: boolean;                    // Enable filters (default: true)
  toolbar?: boolean;                    // Show toolbar (default: true)
  presets?: CropPreset[];              // Aspect ratio presets
  quality?: number;                     // Export quality (default: 0.92)
  format?: 'jpeg' | 'png' | 'webp';    // Export format (default: 'jpeg')
}
```

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl/Cmd + Shift + C` | Open crop editor | Image selected |
| `Enter` | Apply crop | Crop editor |
| `Escape` | Cancel crop | Crop editor |
| `R` | Rotate right 90° | Crop editor |
| `Shift + R` | Rotate left 90° | Crop editor |
| `F` | Flip horizontal | Crop editor |
| `Delete` | Clear crop box | Crop editor |

## Filters

The plugin includes these built-in filters:

- **None**: Original image
- **Grayscale**: Black and white
- **Sepia**: Vintage brown tone
- **Vintage**: Aged photo effect
- **Cold**: Blue-tinted cool effect
- **Warm**: Orange-tinted warm effect
- **Dramatic**: High contrast dramatic look
- **Vivid**: Enhanced colors
- **Muted**: Desaturated soft colors

## API

### Plugin Methods

```javascript
const cropPlugin = sightEdit.getPlugin('image-crop');

// Open crop editor for specific image
cropPlugin.openCropEditor(imageEditor);

// Register custom filter
cropPlugin.registerFilter({
  name: 'custom',
  css: 'hue-rotate(90deg) saturate(150%)'
});

// Add custom preset
cropPlugin.addPreset({
  name: 'Banner',
  aspectRatio: 3 / 1,
  icon: '🎯'
});
```

### Editor Methods

```javascript
// Get crop editor instance
const editor = sightEdit.getActiveEditor();

if (editor instanceof ImageCropEditor) {
  // Get crop data
  const cropData = editor.getCropData();
  
  // Set aspect ratio
  editor.setAspectRatio(16 / 9);
  
  // Rotate
  editor.rotate(90);
  
  // Zoom
  editor.zoom(0.1);
  
  // Get result
  const result = await editor.getCropResult();
}
```

### Events

```javascript
// Listen to crop events
sightEdit.on('cropstart', (event) => {
  console.log('Crop started', event.detail);
});

sightEdit.on('crop', (event) => {
  console.log('Cropping', event.detail.cropData);
});

sightEdit.on('cropend', (event) => {
  console.log('Crop ended');
});

// Image saved with crop
sightEdit.on('imageSaved', (data) => {
  if (data.cropData) {
    console.log('Image cropped and saved', data);
  }
});
```

## Advanced Usage

### Custom Filters

```javascript
// Register custom filter
const plugin = new ImageCropPlugin({
  filters: true,
  customFilters: [
    {
      name: 'noir',
      css: 'grayscale(100%) contrast(150%) brightness(70%)',
      matrix: [
        0.2, 0.2, 0.2, 0, 0,
        0.2, 0.2, 0.2, 0, 0,
        0.2, 0.2, 0.2, 0, 0,
        0, 0, 0, 1, 0
      ]
    }
  ]
});
```

### Programmatic Cropping

```javascript
// Crop image programmatically
async function cropImage(img, cropData) {
  const editor = new ImageCropEditor(img);
  
  await editor.ready();
  editor.setCropData(cropData);
  
  const result = await editor.getCropResult();
  return result.dataUrl;
}

// Usage
const croppedUrl = await cropImage(imageElement, {
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  rotate: 0,
  scaleX: 1,
  scaleY: 1
});
```

### Batch Processing

```javascript
// Process multiple images
async function batchCrop(images, aspectRatio) {
  const results = [];
  
  for (const img of images) {
    const editor = new ImageCropEditor(img, {
      aspectRatio,
      autoCrop: true,
      autoCropArea: 1
    });
    
    await editor.ready();
    const result = await editor.getCropResult();
    results.push(result);
    
    editor.destroy();
  }
  
  return results;
}
```

## Styling

The plugin uses customizable CSS classes:

```css
/* Custom modal styles */
.sightedit-image-crop-modal {
  background: rgba(0, 0, 0, 0.95);
}

/* Custom toolbar */
.sightedit-image-crop-header {
  background: #1a1a1a;
}

/* Custom buttons */
.sightedit-image-crop-btn.primary {
  background: #00a8ff;
}

/* Custom sidebar */
.sightedit-image-crop-sidebar {
  width: 350px;
  background: #262626;
}

/* Custom filter thumbnails */
.sightedit-image-crop-filter {
  border-radius: 8px;
}

/* Active filter */
.sightedit-image-crop-filter.active {
  border-color: #00a8ff;
  box-shadow: 0 0 0 3px rgba(0, 168, 255, 0.3);
}
```

## Performance Tips

1. **Image Size**: Limit maximum dimensions for better performance
   ```javascript
   new ImageCropPlugin({
     minCanvasWidth: 100,
     maxCanvasWidth: 4096,
     minCanvasHeight: 100,
     maxCanvasHeight: 4096
   })
   ```

2. **Quality Settings**: Adjust quality based on use case
   ```javascript
   // High quality for print
   { quality: 0.95, format: 'png' }
   
   // Web optimized
   { quality: 0.85, format: 'webp' }
   
   // Thumbnail
   { quality: 0.7, format: 'jpeg' }
   ```

3. **Lazy Loading**: Use with lazy-loaded images
   ```html
   <img loading="lazy" 
        data-sight="image" 
        data-src="large-photo.jpg">
   ```

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari 14+, Chrome Android

## Dependencies

- [Cropper.js](https://fengyuanchen.github.io/cropperjs/) - Core cropping functionality
- @sightedit/core - Required peer dependency

## License

MIT