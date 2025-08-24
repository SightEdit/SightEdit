import { ImageCropEditor } from './editor';
import { ImageFilter } from './filters';
import { ImageCropToolbar } from './toolbar';
export class ImageCropPlugin {
    constructor(options = {}) {
        this.name = 'image-crop';
        this.version = '1.0.0';
        this.stylesInjected = false;
        this.options = {
            aspectRatio: null,
            viewMode: 1,
            dragMode: 'crop',
            responsive: true,
            restore: true,
            checkCrossOrigin: true,
            checkOrientation: true,
            modal: true,
            guides: true,
            center: true,
            highlight: true,
            background: true,
            autoCrop: true,
            autoCropArea: 0.8,
            movable: true,
            rotatable: true,
            scalable: true,
            zoomable: true,
            zoomOnTouch: true,
            zoomOnWheel: true,
            wheelZoomRatio: 0.1,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: true,
            filters: true,
            toolbar: true,
            quality: 0.92,
            format: 'jpeg',
            presets: [
                { name: 'Free', aspectRatio: NaN },
                { name: 'Square', aspectRatio: 1 },
                { name: '16:9', aspectRatio: 16 / 9 },
                { name: '4:3', aspectRatio: 4 / 3 },
                { name: '3:2', aspectRatio: 3 / 2 },
                { name: '5:4', aspectRatio: 5 / 4 },
                { name: '2:3', aspectRatio: 2 / 3 },
                { name: '9:16', aspectRatio: 9 / 16 }
            ],
            ...options
        };
    }
    init(sightEdit) {
        // Inject styles
        if (!this.stylesInjected) {
            this.injectStyles();
            this.stylesInjected = true;
        }
        // Override default image editor with crop functionality
        sightEdit.registerEditor('image', ImageCropEditor, this.options);
        // Register image filter component
        if (this.options.filters) {
            sightEdit.registerComponent('image-filter', ImageFilter);
        }
        // Register toolbar component
        if (this.options.toolbar) {
            sightEdit.registerComponent('image-crop-toolbar', ImageCropToolbar);
        }
        // Add crop action to existing images
        sightEdit.on('imageEditorReady', (editor) => {
            if (editor.element.dataset.sightCrop !== 'false') {
                editor.addAction('crop', {
                    label: 'Crop & Edit',
                    icon: '✂️',
                    handler: () => this.openCropEditor(editor)
                });
            }
        });
        // Register keyboard shortcuts
        this.registerKeyboardShortcuts(sightEdit);
    }
    openCropEditor(editor) {
        const cropEditor = new ImageCropEditor(editor.element, editor.config);
        cropEditor.render();
        cropEditor.onSave = editor.onSave;
    }
    registerKeyboardShortcuts(sightEdit) {
        const shortcuts = [
            {
                key: 'Ctrl+Shift+C',
                action: 'crop',
                description: 'Open crop editor for selected image'
            },
            {
                key: 'R',
                action: 'rotate',
                description: 'Rotate image 90 degrees',
                context: 'cropEditor'
            },
            {
                key: 'F',
                action: 'flip',
                description: 'Flip image horizontally',
                context: 'cropEditor'
            },
            {
                key: 'Escape',
                action: 'cancel',
                description: 'Cancel crop operation',
                context: 'cropEditor'
            },
            {
                key: 'Enter',
                action: 'apply',
                description: 'Apply crop',
                context: 'cropEditor'
            }
        ];
        shortcuts.forEach(shortcut => {
            sightEdit.registerKeyboardShortcut(shortcut);
        });
    }
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = this.getStyles();
        document.head.appendChild(style);
        // Also inject Cropper.js styles
        const cropperStyle = document.createElement('link');
        cropperStyle.rel = 'stylesheet';
        cropperStyle.href = 'https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css';
        document.head.appendChild(cropperStyle);
    }
    getStyles() {
        return `.sightedit-image-crop-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;flex-direction:column}.sightedit-image-crop-header{display:flex;justify-content:space-between;align-items:center;padding:16px;background:#222;color:#fff}.sightedit-image-crop-header h3{margin:0;font-size:18px}.sightedit-image-crop-actions{display:flex;gap:8px}.sightedit-image-crop-btn{padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:14px;transition:all 0.2s}.sightedit-image-crop-btn.primary{background:#007bff;color:#fff}.sightedit-image-crop-btn.primary:hover{background:#0056b3}.sightedit-image-crop-btn.secondary{background:#6c757d;color:#fff}.sightedit-image-crop-btn.secondary:hover{background:#545b62}.sightedit-image-crop-container{flex:1;display:flex;overflow:hidden}.sightedit-image-crop-main{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;position:relative}.sightedit-image-crop-sidebar{width:300px;background:#2d2d2d;color:#fff;padding:20px;overflow-y:auto}.sightedit-image-crop-section{margin-bottom:24px}.sightedit-image-crop-section h4{margin:0 0 12px 0;font-size:14px;text-transform:uppercase;opacity:0.7}.sightedit-image-crop-presets{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.sightedit-image-crop-preset{padding:8px;border:1px solid #444;border-radius:4px;text-align:center;cursor:pointer;transition:all 0.2s}.sightedit-image-crop-preset:hover,.sightedit-image-crop-preset.active{background:#444;border-color:#007bff}.sightedit-image-crop-tools{display:flex;flex-wrap:wrap;gap:8px}.sightedit-image-crop-tool{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1px solid #444;border-radius:4px;cursor:pointer;transition:all 0.2s}.sightedit-image-crop-tool:hover{background:#444}.sightedit-image-crop-slider{margin:12px 0}.sightedit-image-crop-slider label{display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px}.sightedit-image-crop-slider input[type="range"]{width:100%;height:4px;background:#444;border-radius:2px;outline:none;-webkit-appearance:none}.sightedit-image-crop-slider input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;background:#007bff;border-radius:50%;cursor:pointer}.sightedit-image-crop-filters{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sightedit-image-crop-filter{position:relative;padding-top:75%;border:2px solid transparent;border-radius:4px;overflow:hidden;cursor:pointer}.sightedit-image-crop-filter.active{border-color:#007bff}.sightedit-image-crop-filter img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}.sightedit-image-crop-filter span{position:absolute;bottom:0;left:0;right:0;padding:4px;background:rgba(0,0,0,0.7);font-size:12px;text-align:center}`;
    }
    destroy() {
        // Cleanup if needed
    }
}
// Export components
export { ImageCropEditor } from './editor';
export { ImageFilter } from './filters';
export { ImageCropToolbar } from './toolbar';
export * from './types';
// Default export
export default ImageCropPlugin;
