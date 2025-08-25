import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class ColorModalEditor extends BaseEditor {
  private modal: ModalManager;
  private currentColor: string = '#000000';

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'color';
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.addEventListener('click', () => {
      if (!this.isEditing) {
        this.startEditing();
      }
    });
  }

  protected startEditing(): void {
    super.startEditing();
    
    // Get current color
    this.currentColor = this.extractValue() || '#000000';

    // Create color picker content
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="display: flex; gap: 20px;">
        <!-- Color Canvas -->
        <div>
          <canvas id="color-canvas" width="300" height="300" 
            style="border: 1px solid #e5e7eb; border-radius: 8px; cursor: crosshair;"></canvas>
          <div style="margin-top: 10px;">
            <canvas id="hue-slider" width="300" height="30"
              style="border: 1px solid #e5e7eb; border-radius: 4px; cursor: pointer;"></canvas>
          </div>
        </div>
        
        <!-- Color Info -->
        <div style="flex: 1;">
          <!-- Preview -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Preview</label>
            <div id="color-preview" style="width: 100%; height: 80px; border-radius: 8px; border: 1px solid #e5e7eb;"></div>
          </div>
          
          <!-- Color Values -->
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">HEX</label>
            <input type="text" id="hex-input" value="${this.currentColor}"
              style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace;">
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #6b7280;">R</label>
              <input type="number" id="r-input" min="0" max="255"
                style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #6b7280;">G</label>
              <input type="number" id="g-input" min="0" max="255"
                style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #6b7280;">B</label>
              <input type="number" id="b-input" min="0" max="255"
                style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
            </div>
          </div>
          
          <!-- Preset Colors -->
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Presets</label>
            <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px;">
              ${this.getPresetColors().map(color => `
                <div class="preset-color" data-color="${color}"
                  style="width: 30px; height: 30px; background: ${color}; border-radius: 4px; cursor: pointer; border: 2px solid transparent;"
                  onmouseover="this.style.borderColor='#3b82f6'"
                  onmouseout="this.style.borderColor='transparent'">
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    // Open modal
    const footer = this.modal.open(container, {
      title: '🎨 Color Picker',
      width: '600px',
      footer: true
    });

    // Initialize color picker after modal opens
    setTimeout(() => {
      this.initColorPicker();
    }, 100);

    // Footer buttons
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply';
    saveBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    saveBtn.onclick = () => {
      const hexInput = document.getElementById('hex-input') as HTMLInputElement;
      if (hexInput) {
        this.currentColor = hexInput.value;
      }
      this.stopEditing(true);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: #6b7280;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.stopEditing(false);

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  private initColorPicker(): void {
    const canvas = document.getElementById('color-canvas') as HTMLCanvasElement;
    const hueSlider = document.getElementById('hue-slider') as HTMLCanvasElement;
    const preview = document.getElementById('color-preview') as HTMLElement;
    const hexInput = document.getElementById('hex-input') as HTMLInputElement;
    const rInput = document.getElementById('r-input') as HTMLInputElement;
    const gInput = document.getElementById('g-input') as HTMLInputElement;
    const bInput = document.getElementById('b-input') as HTMLInputElement;

    if (!canvas || !hueSlider) return;

    const ctx = canvas.getContext('2d')!;
    const hueCtx = hueSlider.getContext('2d')!;
    
    let currentHue = 0;

    // Draw hue slider
    const drawHueSlider = () => {
      const gradient = hueCtx.createLinearGradient(0, 0, 300, 0);
      for (let i = 0; i <= 360; i += 10) {
        gradient.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
      }
      hueCtx.fillStyle = gradient;
      hueCtx.fillRect(0, 0, 300, 30);
    };

    // Draw color canvas
    const drawColorCanvas = (hue: number) => {
      // Create gradient
      const colorGradient = ctx.createLinearGradient(0, 0, 300, 0);
      colorGradient.addColorStop(0, 'white');
      colorGradient.addColorStop(1, `hsl(${hue}, 100%, 50%)`);
      ctx.fillStyle = colorGradient;
      ctx.fillRect(0, 0, 300, 300);

      // Add black gradient
      const blackGradient = ctx.createLinearGradient(0, 0, 0, 300);
      blackGradient.addColorStop(0, 'transparent');
      blackGradient.addColorStop(1, 'black');
      ctx.fillStyle = blackGradient;
      ctx.fillRect(0, 0, 300, 300);
    };

    // Update color from position
    const updateColorFromPosition = (x: number, y: number) => {
      const saturation = x / 300 * 100;
      const lightness = 100 - (y / 300 * 100);
      const color = this.hslToHex(currentHue, saturation, lightness);
      
      hexInput.value = color;
      preview.style.background = color;
      
      const rgb = this.hexToRgb(color);
      rInput.value = rgb.r.toString();
      gInput.value = rgb.g.toString();
      bInput.value = rgb.b.toString();
    };

    // Canvas click handler
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      updateColorFromPosition(x, y);
    });

    // Hue slider click handler
    hueSlider.addEventListener('click', (e) => {
      const rect = hueSlider.getBoundingClientRect();
      const x = e.clientX - rect.left;
      currentHue = (x / 300) * 360;
      drawColorCanvas(currentHue);
    });

    // Preset colors click handler
    document.querySelectorAll('.preset-color').forEach(el => {
      el.addEventListener('click', () => {
        const color = el.getAttribute('data-color')!;
        hexInput.value = color;
        preview.style.background = color;
        
        const rgb = this.hexToRgb(color);
        rInput.value = rgb.r.toString();
        gInput.value = rgb.g.toString();
        bInput.value = rgb.b.toString();
      });
    });

    // Input handlers
    hexInput.addEventListener('input', () => {
      const color = hexInput.value;
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        preview.style.background = color;
        const rgb = this.hexToRgb(color);
        rInput.value = rgb.r.toString();
        gInput.value = rgb.g.toString();
        bInput.value = rgb.b.toString();
      }
    });

    const updateFromRgb = () => {
      const r = parseInt(rInput.value) || 0;
      const g = parseInt(gInput.value) || 0;
      const b = parseInt(bInput.value) || 0;
      const hex = this.rgbToHex(r, g, b);
      hexInput.value = hex;
      preview.style.background = hex;
    };

    rInput.addEventListener('input', updateFromRgb);
    gInput.addEventListener('input', updateFromRgb);
    bInput.addEventListener('input', updateFromRgb);

    // Initial draw
    drawHueSlider();
    drawColorCanvas(currentHue);
    
    // Set initial color
    preview.style.background = this.currentColor;
    const rgb = this.hexToRgb(this.currentColor);
    rInput.value = rgb.r.toString();
    gInput.value = rgb.g.toString();
    bInput.value = rgb.b.toString();
  }

  private getPresetColors(): string[] {
    return [
      '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
      '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff',
      '#9900ff', '#ff00ff', '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3',
      '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599',
      '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'
    ];
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      this.value = this.currentColor;
      this.applyValue(this.currentColor);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    // Return current color value
    if (this.currentColor) {
      return this.currentColor;
    }
    // Try to extract from element
    const bgColor = this.element.style.backgroundColor;
    if (bgColor && bgColor.startsWith('#')) {
      return bgColor;
    }
    return this.element.textContent || '#000000';
  }

  applyValue(value: string): void {
    // Validate and apply color
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      this.currentColor = value;
      this.element.textContent = value;
      
      // Apply background color and set contrasting text
      if (this.element.style) {
        this.element.style.backgroundColor = value;
        
        // Calculate luminance for text color
        const rgb = parseInt(value.slice(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        this.element.style.color = luminance > 0.5 ? '#000' : '#fff';
      }
    }
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}