import { BaseEditor } from '@sightedit/core';
import Cropper from 'cropperjs';
export class ImageCropEditor extends BaseEditor {
    getMode() {
        return 'modal';
    }
    constructor(element, config) {
        super(element, config);
        this.cropper = null;
        this.container = null;
        this.originalSrc = '';
        this.currentFilter = 'none';
        this.imageElement = null;
        this.sidebar = null;
        this.handleKeyboard = (e) => {
            if (!this.cropper)
                return;
            switch (e.key) {
                case 'Enter':
                    e.preventDefault();
                    this.applyCrop();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
                case 'r':
                case 'R':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this.cropper.rotate(e.shiftKey ? -90 : 90);
                    }
                    break;
                case 'f':
                case 'F':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this.cropper.scaleX(-this.cropper.getImageData().scaleX || -1);
                    }
                    break;
            }
        };
        this.pluginOptions = config?.pluginOptions || {};
    }
    render() {
        // Store original image source
        this.originalSrc = this.extractValue();
        // Create modal
        const modal = this.createModal();
        document.body.appendChild(modal);
        // Initialize cropper after image loads
        if (this.imageElement) {
            this.imageElement.onload = () => {
                this.initializeCropper();
            };
        }
    }
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'sightedit-image-crop-modal';
        modal.innerHTML = `
      <div class="sightedit-image-crop-header">
        <h3>Crop & Edit Image</h3>
        <div class="sightedit-image-crop-actions">
          <button class="sightedit-image-crop-btn secondary" data-action="reset">Reset</button>
          <button class="sightedit-image-crop-btn secondary" data-action="cancel">Cancel</button>
          <button class="sightedit-image-crop-btn primary" data-action="apply">Apply</button>
        </div>
      </div>
      <div class="sightedit-image-crop-container">
        <div class="sightedit-image-crop-main">
          <img src="${this.originalSrc}" alt="Crop preview">
        </div>
        ${this.pluginOptions.toolbar !== false ? this.createSidebar() : ''}
      </div>
    `;
        // Get references
        this.container = modal.querySelector('.sightedit-image-crop-main');
        this.imageElement = modal.querySelector('img');
        this.sidebar = modal.querySelector('.sightedit-image-crop-sidebar');
        // Event handlers
        modal.addEventListener('click', (e) => {
            const target = e.target;
            const action = target.dataset.action;
            if (action) {
                this.handleAction(action);
            }
            // Handle preset clicks
            if (target.classList.contains('sightedit-image-crop-preset')) {
                this.handlePresetClick(target);
            }
            // Handle tool clicks
            if (target.classList.contains('sightedit-image-crop-tool')) {
                this.handleToolClick(target);
            }
            // Handle filter clicks
            if (target.classList.contains('sightedit-image-crop-filter')) {
                this.handleFilterClick(target);
            }
        });
        // Handle slider changes
        modal.addEventListener('input', (e) => {
            const target = e.target;
            if (target.type === 'range') {
                this.handleSliderChange(target);
            }
        });
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard);
        return modal;
    }
    createSidebar() {
        return `
      <div class="sightedit-image-crop-sidebar">
        ${this.createPresetsSection()}
        ${this.createToolsSection()}
        ${this.createAdjustmentsSection()}
        ${this.pluginOptions.filters !== false ? this.createFiltersSection() : ''}
      </div>
    `;
    }
    createPresetsSection() {
        const presets = this.pluginOptions.presets || [];
        return `
      <div class="sightedit-image-crop-section">
        <h4>Aspect Ratio</h4>
        <div class="sightedit-image-crop-presets">
          ${presets.map(preset => `
            <div class="sightedit-image-crop-preset" data-ratio="${preset.aspectRatio}">
              ${preset.icon || preset.name}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    }
    createToolsSection() {
        return `
      <div class="sightedit-image-crop-section">
        <h4>Tools</h4>
        <div class="sightedit-image-crop-tools">
          <div class="sightedit-image-crop-tool" data-tool="rotate-left" title="Rotate Left">↺</div>
          <div class="sightedit-image-crop-tool" data-tool="rotate-right" title="Rotate Right">↻</div>
          <div class="sightedit-image-crop-tool" data-tool="flip-h" title="Flip Horizontal">↔</div>
          <div class="sightedit-image-crop-tool" data-tool="flip-v" title="Flip Vertical">↕</div>
          <div class="sightedit-image-crop-tool" data-tool="zoom-in" title="Zoom In">🔍+</div>
          <div class="sightedit-image-crop-tool" data-tool="zoom-out" title="Zoom Out">🔍-</div>
          <div class="sightedit-image-crop-tool" data-tool="move" title="Move">✋</div>
          <div class="sightedit-image-crop-tool" data-tool="crop" title="Crop">✂️</div>
        </div>
      </div>
    `;
    }
    createAdjustmentsSection() {
        return `
      <div class="sightedit-image-crop-section">
        <h4>Adjustments</h4>
        <div class="sightedit-image-crop-slider">
          <label>
            <span>Brightness</span>
            <span id="brightness-value">100%</span>
          </label>
          <input type="range" data-adjustment="brightness" min="0" max="200" value="100">
        </div>
        <div class="sightedit-image-crop-slider">
          <label>
            <span>Contrast</span>
            <span id="contrast-value">100%</span>
          </label>
          <input type="range" data-adjustment="contrast" min="0" max="200" value="100">
        </div>
        <div class="sightedit-image-crop-slider">
          <label>
            <span>Saturation</span>
            <span id="saturation-value">100%</span>
          </label>
          <input type="range" data-adjustment="saturate" min="0" max="200" value="100">
        </div>
        <div class="sightedit-image-crop-slider">
          <label>
            <span>Blur</span>
            <span id="blur-value">0px</span>
          </label>
          <input type="range" data-adjustment="blur" min="0" max="20" value="0">
        </div>
      </div>
    `;
    }
    createFiltersSection() {
        const filters = ['none', 'grayscale', 'sepia', 'vintage', 'cold', 'warm', 'dramatic', 'vivid', 'muted'];
        return `
      <div class="sightedit-image-crop-section">
        <h4>Filters</h4>
        <div class="sightedit-image-crop-filters">
          ${filters.map(filter => `
            <div class="sightedit-image-crop-filter ${filter === 'none' ? 'active' : ''}" data-filter="${filter}">
              <img src="${this.originalSrc}" style="filter: ${this.getFilterStyle(filter)}">
              <span>${filter.charAt(0).toUpperCase() + filter.slice(1)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    }
    getFilterStyle(filter) {
        const styles = {
            none: 'none',
            grayscale: 'grayscale(100%)',
            sepia: 'sepia(100%)',
            vintage: 'sepia(50%) contrast(120%) brightness(90%)',
            cold: 'hue-rotate(180deg) saturate(80%)',
            warm: 'hue-rotate(-30deg) saturate(120%)',
            dramatic: 'contrast(150%) brightness(90%) saturate(130%)',
            vivid: 'saturate(150%) contrast(110%)',
            muted: 'saturate(50%) contrast(90%)'
        };
        return styles[filter] || 'none';
    }
    initializeCropper() {
        if (!this.imageElement)
            return;
        const options = {
            aspectRatio: this.pluginOptions.aspectRatio || NaN,
            viewMode: this.pluginOptions.viewMode || 1,
            dragMode: this.pluginOptions.dragMode || 'crop',
            responsive: this.pluginOptions.responsive !== false,
            restore: this.pluginOptions.restore !== false,
            checkCrossOrigin: this.pluginOptions.checkCrossOrigin !== false,
            checkOrientation: this.pluginOptions.checkOrientation !== false,
            modal: this.pluginOptions.modal !== false,
            guides: this.pluginOptions.guides !== false,
            center: this.pluginOptions.center !== false,
            highlight: this.pluginOptions.highlight !== false,
            background: this.pluginOptions.background !== false,
            autoCrop: this.pluginOptions.autoCrop !== false,
            autoCropArea: this.pluginOptions.autoCropArea || 0.8,
            movable: this.pluginOptions.movable !== false,
            rotatable: this.pluginOptions.rotatable !== false,
            scalable: this.pluginOptions.scalable !== false,
            zoomable: this.pluginOptions.zoomable !== false,
            zoomOnTouch: this.pluginOptions.zoomOnTouch !== false,
            zoomOnWheel: this.pluginOptions.zoomOnWheel !== false,
            wheelZoomRatio: this.pluginOptions.wheelZoomRatio || 0.1,
            cropBoxMovable: this.pluginOptions.cropBoxMovable !== false,
            cropBoxResizable: this.pluginOptions.cropBoxResizable !== false,
            toggleDragModeOnDblclick: this.pluginOptions.toggleDragModeOnDblclick !== false,
            minContainerWidth: this.pluginOptions.minContainerWidth,
            minContainerHeight: this.pluginOptions.minContainerHeight,
            minCanvasWidth: this.pluginOptions.minCanvasWidth,
            minCanvasHeight: this.pluginOptions.minCanvasHeight,
            minCropBoxWidth: this.pluginOptions.minCropBoxWidth,
            minCropBoxHeight: this.pluginOptions.minCropBoxHeight
        };
        this.cropper = new Cropper(this.imageElement, options);
    }
    handleAction(action) {
        switch (action) {
            case 'apply':
                this.applyCrop();
                break;
            case 'cancel':
                this.close();
                break;
            case 'reset':
                this.reset();
                break;
        }
    }
    handlePresetClick(target) {
        const ratio = parseFloat(target.dataset.ratio || 'NaN');
        // Update active state
        this.sidebar?.querySelectorAll('.sightedit-image-crop-preset').forEach(el => {
            el.classList.remove('active');
        });
        target.classList.add('active');
        // Set aspect ratio
        if (this.cropper) {
            this.cropper.setAspectRatio(ratio);
        }
    }
    handleToolClick(target) {
        const tool = target.dataset.tool;
        if (!this.cropper || !tool)
            return;
        switch (tool) {
            case 'rotate-left':
                this.cropper.rotate(-90);
                break;
            case 'rotate-right':
                this.cropper.rotate(90);
                break;
            case 'flip-h':
                this.cropper.scaleX(-this.cropper.getImageData().scaleX || -1);
                break;
            case 'flip-v':
                this.cropper.scaleY(-this.cropper.getImageData().scaleY || -1);
                break;
            case 'zoom-in':
                this.cropper.zoom(0.1);
                break;
            case 'zoom-out':
                this.cropper.zoom(-0.1);
                break;
            case 'move':
                this.cropper.setDragMode('move');
                break;
            case 'crop':
                this.cropper.setDragMode('crop');
                break;
        }
    }
    handleFilterClick(target) {
        const filter = target.dataset.filter;
        if (!filter)
            return;
        // Update active state
        this.sidebar?.querySelectorAll('.sightedit-image-crop-filter').forEach(el => {
            el.classList.remove('active');
        });
        target.classList.add('active');
        this.currentFilter = filter;
        this.updateImageStyle();
    }
    handleSliderChange(input) {
        const adjustment = input.dataset.adjustment;
        const value = input.value;
        // Update value display
        const valueDisplay = document.getElementById(`${adjustment}-value`);
        if (valueDisplay) {
            valueDisplay.textContent = adjustment === 'blur' ? `${value}px` : `${value}%`;
        }
        this.updateImageStyle();
    }
    updateImageStyle() {
        if (!this.imageElement)
            return;
        const brightness = this.sidebar?.querySelector('[data-adjustment="brightness"]')?.value || '100';
        const contrast = this.sidebar?.querySelector('[data-adjustment="contrast"]')?.value || '100';
        const saturate = this.sidebar?.querySelector('[data-adjustment="saturate"]')?.value || '100';
        const blur = this.sidebar?.querySelector('[data-adjustment="blur"]')?.value || '0';
        let filterString = this.getFilterStyle(this.currentFilter);
        if (brightness !== '100')
            filterString += ` brightness(${brightness}%)`;
        if (contrast !== '100')
            filterString += ` contrast(${contrast}%)`;
        if (saturate !== '100')
            filterString += ` saturate(${saturate}%)`;
        if (blur !== '0')
            filterString += ` blur(${blur}px)`;
        this.imageElement.style.filter = filterString.trim() || 'none';
    }
    async applyCrop() {
        if (!this.cropper)
            return;
        try {
            // Get cropped canvas
            const canvas = this.cropper.getCroppedCanvas({
                maxWidth: 4096,
                maxHeight: 4096,
                fillColor: '#fff',
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });
            // Apply current filter to canvas if needed
            if (this.currentFilter !== 'none' || this.hasAdjustments()) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.filter = this.imageElement?.style.filter || 'none';
                    ctx.drawImage(canvas, 0, 0);
                }
            }
            // Convert to blob
            const blob = await new Promise((resolve) => {
                canvas.toBlob((blob) => resolve(blob), `image/${this.pluginOptions.format || 'jpeg'}`, this.pluginOptions.quality || 0.92);
            });
            // Convert to data URL
            const reader = new FileReader();
            reader.onload = async () => {
                const dataUrl = reader.result;
                this.value = dataUrl;
                this.applyValue(dataUrl);
                await this.save();
                this.close();
            };
            reader.readAsDataURL(blob);
        }
        catch (error) {
            console.error('Failed to apply crop:', error);
            this.showError('Failed to apply crop');
        }
    }
    hasAdjustments() {
        const brightness = this.sidebar?.querySelector('[data-adjustment="brightness"]')?.value;
        const contrast = this.sidebar?.querySelector('[data-adjustment="contrast"]')?.value;
        const saturate = this.sidebar?.querySelector('[data-adjustment="saturate"]')?.value;
        const blur = this.sidebar?.querySelector('[data-adjustment="blur"]')?.value;
        return brightness !== '100' || contrast !== '100' || saturate !== '100' || blur !== '0';
    }
    reset() {
        if (this.cropper) {
            this.cropper.reset();
        }
        // Reset adjustments
        this.sidebar?.querySelectorAll('input[type="range"]').forEach((input) => {
            const rangeInput = input;
            rangeInput.value = rangeInput.dataset.adjustment === 'blur' ? '0' : '100';
            const event = new Event('input', { bubbles: true });
            rangeInput.dispatchEvent(event);
        });
        // Reset filter
        const noneFilter = this.sidebar?.querySelector('[data-filter="none"]');
        if (noneFilter) {
            noneFilter.dispatchEvent(new Event('click', { bubbles: true }));
        }
    }
    close() {
        document.removeEventListener('keydown', this.handleKeyboard);
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        const modal = document.querySelector('.sightedit-image-crop-modal');
        modal?.remove();
    }
    extractValue() {
        const img = this.element;
        return img.src || '';
    }
    getValue() {
        return this.value || this.extractValue();
    }
    setValue(value) {
        this.value = value;
        this.applyValue(value);
    }
    applyValue(value) {
        const img = this.element;
        img.src = value;
    }
    destroy() {
        this.close();
    }
}
