export const filterDefinitions = {
    none: {
        name: 'Original',
        css: 'none'
    },
    grayscale: {
        name: 'Grayscale',
        css: 'grayscale(100%)',
        matrix: [
            0.299, 0.587, 0.114, 0, 0,
            0.299, 0.587, 0.114, 0, 0,
            0.299, 0.587, 0.114, 0, 0,
            0, 0, 0, 1, 0
        ]
    },
    sepia: {
        name: 'Sepia',
        css: 'sepia(100%)',
        matrix: [
            0.393, 0.769, 0.189, 0, 0,
            0.349, 0.686, 0.168, 0, 0,
            0.272, 0.534, 0.131, 0, 0,
            0, 0, 0, 1, 0
        ]
    },
    vintage: {
        name: 'Vintage',
        css: 'sepia(50%) contrast(120%) brightness(90%)'
    },
    cold: {
        name: 'Cold',
        css: 'hue-rotate(180deg) saturate(80%)'
    },
    warm: {
        name: 'Warm',
        css: 'hue-rotate(-30deg) saturate(120%)'
    },
    dramatic: {
        name: 'Dramatic',
        css: 'contrast(150%) brightness(90%) saturate(130%)'
    },
    vivid: {
        name: 'Vivid',
        css: 'saturate(150%) contrast(110%)'
    },
    muted: {
        name: 'Muted',
        css: 'saturate(50%) contrast(90%)'
    }
};
export function applyFilter(canvas, filter, adjustments) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return canvas;
    // Create a new canvas for the filtered result
    const filteredCanvas = document.createElement('canvas');
    filteredCanvas.width = canvas.width;
    filteredCanvas.height = canvas.height;
    const filteredCtx = filteredCanvas.getContext('2d');
    if (!filteredCtx)
        return canvas;
    // Apply CSS filters
    let filterString = filterDefinitions[filter].css;
    if (adjustments) {
        if (adjustments.brightness !== undefined && adjustments.brightness !== 100) {
            filterString += ` brightness(${adjustments.brightness}%)`;
        }
        if (adjustments.contrast !== undefined && adjustments.contrast !== 100) {
            filterString += ` contrast(${adjustments.contrast}%)`;
        }
        if (adjustments.saturation !== undefined && adjustments.saturation !== 100) {
            filterString += ` saturate(${adjustments.saturation}%)`;
        }
        if (adjustments.blur !== undefined && adjustments.blur !== 0) {
            filterString += ` blur(${adjustments.blur}px)`;
        }
    }
    filteredCtx.filter = filterString;
    filteredCtx.drawImage(canvas, 0, 0);
    // For filters with custom matrix, apply pixel manipulation
    const filterDef = filterDefinitions[filter];
    if (filterDef.matrix && filter !== 'none') {
        applyColorMatrix(filteredCanvas, filterDef.matrix);
    }
    return filteredCanvas;
}
function applyColorMatrix(canvas, matrix) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        data[i] = Math.min(255, Math.max(0, r * matrix[0] + g * matrix[1] + b * matrix[2] + matrix[3] * 255 + matrix[4]));
        data[i + 1] = Math.min(255, Math.max(0, r * matrix[5] + g * matrix[6] + b * matrix[7] + matrix[8] * 255 + matrix[9]));
        data[i + 2] = Math.min(255, Math.max(0, r * matrix[10] + g * matrix[11] + b * matrix[12] + matrix[13] * 255 + matrix[14]));
    }
    ctx.putImageData(imageData, 0, 0);
}
export class ImageFilter {
    constructor(container, imageSrc) {
        this.currentFilter = 'none';
        this.adjustments = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            blur: 0
        };
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        // Load image
        this.image = new Image();
        this.image.crossOrigin = 'anonymous';
        this.image.onload = () => {
            this.canvas.width = this.image.width;
            this.canvas.height = this.image.height;
            this.render();
        };
        this.image.src = imageSrc;
        this.setupUI();
    }
    setupUI() {
        this.container.innerHTML = `
      <div class="sightedit-filter-controls">
        <select class="sightedit-filter-select">
          ${Object.entries(filterDefinitions).map(([key, def]) => `
            <option value="${key}">${def.name}</option>
          `).join('')}
        </select>
        
        <div class="sightedit-filter-adjustments">
          <label>
            Brightness: <span id="brightness-val">100%</span>
            <input type="range" data-adjust="brightness" min="0" max="200" value="100">
          </label>
          <label>
            Contrast: <span id="contrast-val">100%</span>
            <input type="range" data-adjust="contrast" min="0" max="200" value="100">
          </label>
          <label>
            Saturation: <span id="saturation-val">100%</span>
            <input type="range" data-adjust="saturation" min="0" max="200" value="100">
          </label>
          <label>
            Blur: <span id="blur-val">0px</span>
            <input type="range" data-adjust="blur" min="0" max="20" value="0">
          </label>
        </div>
        
        <div class="sightedit-filter-preview"></div>
      </div>
    `;
        const preview = this.container.querySelector('.sightedit-filter-preview');
        if (preview) {
            preview.appendChild(this.canvas);
        }
        // Event listeners
        const select = this.container.querySelector('.sightedit-filter-select');
        select?.addEventListener('change', () => {
            this.currentFilter = select.value;
            this.render();
        });
        this.container.querySelectorAll('input[type="range"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const target = e.target;
                const adjust = target.dataset.adjust;
                this.adjustments[adjust] = parseInt(target.value);
                // Update display
                const valSpan = document.getElementById(`${adjust}-val`);
                if (valSpan) {
                    valSpan.textContent = adjust === 'blur' ? `${target.value}px` : `${target.value}%`;
                }
                this.render();
            });
        });
    }
    render() {
        if (!this.image.complete)
            return;
        // Draw original image
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.image, 0, 0);
        // Apply filter
        const filtered = applyFilter(this.canvas, this.currentFilter, this.adjustments);
        if (filtered !== this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(filtered, 0, 0);
        }
    }
    getFilteredDataURL(format = 'image/jpeg', quality = 0.92) {
        return this.canvas.toDataURL(format, quality);
    }
    getFilter() {
        return this.currentFilter;
    }
    getAdjustments() {
        return { ...this.adjustments };
    }
}
