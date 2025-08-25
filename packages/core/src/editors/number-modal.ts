import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class NumberModalEditor extends BaseEditor {
  private modal: ModalManager;
  private currentValue: number = 0;
  private min: number = -Infinity;
  private max: number = Infinity;
  private step: number = 1;
  private decimals: number = 0;

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'number';
    
    // Parse constraints from data attributes
    const dataset = element.dataset;
    this.min = dataset.min ? parseFloat(dataset.min) : -Infinity;
    this.max = dataset.max ? parseFloat(dataset.max) : Infinity;
    this.step = dataset.step ? parseFloat(dataset.step) : 1;
    this.decimals = dataset.decimals ? parseInt(dataset.decimals) : (this.step % 1 === 0 ? 0 : 2);
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
    
    // Get current value
    const extractedValue = this.extractValue();
    this.currentValue = parseFloat(extractedValue) || 0;
    
    // Create editor content
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 400px;';

    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.style.cssText = `
      font-size: 48px;
      font-weight: 700;
      text-align: center;
      color: #1f2937;
      margin-bottom: 30px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    `;
    valueDisplay.textContent = this.formatNumber(this.currentValue);

    // Slider control
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = 'margin-bottom: 30px;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = (isFinite(this.min) ? this.min : -1000000).toString();
    slider.max = (isFinite(this.max) ? this.max : 1000000).toString();
    slider.step = this.step.toString();
    slider.value = this.currentValue.toString();
    slider.style.cssText = `
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: #e5e7eb;
      outline: none;
      -webkit-appearance: none;
    `;

    // Style the slider thumb
    const sliderStyle = document.createElement('style');
    sliderStyle.textContent = `
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      input[type=range]::-moz-range-thumb {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
    `;
    document.head.appendChild(sliderStyle);

    // Min/Max labels
    const sliderLabels = document.createElement('div');
    sliderLabels.style.cssText = 'display: flex; justify-content: space-between; margin-top: 10px;';
    sliderLabels.innerHTML = `
      <span style="color: #6b7280; font-size: 12px;">${this.formatNumber(this.min)}</span>
      <span style="color: #6b7280; font-size: 12px;">${this.formatNumber(this.max)}</span>
    `;

    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(sliderLabels);

    // Direct input
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'margin-bottom: 30px;';
    
    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Enter value directly:';
    inputLabel.style.cssText = 'display: block; margin-bottom: 8px; font-weight: 600; color: #374151;';
    
    const directInput = document.createElement('input');
    directInput.type = 'number';
    directInput.min = this.min.toString();
    directInput.max = this.max.toString();
    directInput.step = this.step.toString();
    directInput.value = this.currentValue.toString();
    directInput.style.cssText = `
      width: 100%;
      padding: 12px;
      font-size: 18px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
    `;

    inputContainer.appendChild(inputLabel);
    inputContainer.appendChild(directInput);

    // Quick adjustment buttons
    const buttonGrid = document.createElement('div');
    buttonGrid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;';
    
    const adjustments = [-10, -1, '+1', '+10'];
    adjustments.forEach(adj => {
      const btn = document.createElement('button');
      btn.textContent = adj.toString().startsWith('+') ? adj.toString() : adj.toString();
      btn.style.cssText = `
        padding: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        font-weight: 600;
        font-size: 16px;
        transition: all 0.2s;
      `;
      
      btn.onmouseover = () => {
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
        btn.style.borderColor = '#3b82f6';
      };
      
      btn.onmouseout = () => {
        btn.style.background = 'white';
        btn.style.color = '#374151';
        btn.style.borderColor = '#e5e7eb';
      };
      
      btn.onclick = () => {
        const adjustment = parseFloat(adj.toString().replace('+', ''));
        let newValue = this.currentValue + adjustment;
        newValue = Math.max(this.min, Math.min(this.max, newValue));
        newValue = Math.round(newValue / this.step) * this.step;
        this.currentValue = newValue;
        
        valueDisplay.textContent = this.formatNumber(this.currentValue);
        slider.value = this.currentValue.toString();
        directInput.value = this.currentValue.toString();
      };
      
      buttonGrid.appendChild(btn);
    });

    // Preset values
    const presetContainer = document.createElement('div');
    presetContainer.innerHTML = `
      <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Common values:</label>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${this.getPresetValues().map(val => `
          <button onclick="setPresetValue(${val})" style="
            padding: 8px 16px;
            background: #f3f4f6;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          " onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#f3f4f6'">
            ${this.formatNumber(val)}
          </button>
        `).join('')}
      </div>
    `;

    // Event handlers
    slider.oninput = () => {
      this.currentValue = parseFloat(slider.value);
      valueDisplay.textContent = this.formatNumber(this.currentValue);
      directInput.value = this.currentValue.toString();
    };

    directInput.oninput = () => {
      let value = parseFloat(directInput.value) || 0;
      value = Math.max(this.min, Math.min(this.max, value));
      this.currentValue = value;
      valueDisplay.textContent = this.formatNumber(this.currentValue);
      slider.value = this.currentValue.toString();
    };

    // Global function for preset buttons
    (window as any).setPresetValue = (value: number) => {
      this.currentValue = value;
      valueDisplay.textContent = this.formatNumber(this.currentValue);
      slider.value = this.currentValue.toString();
      directInput.value = this.currentValue.toString();
    };

    // Assemble container
    container.appendChild(valueDisplay);
    if (isFinite(this.min) && isFinite(this.max)) {
      container.appendChild(sliderContainer);
    }
    container.appendChild(buttonGrid);
    container.appendChild(inputContainer);
    if (this.getPresetValues().length > 0) {
      container.appendChild(presetContainer);
    }

    // Open modal
    const footer = this.modal.open(container, {
      title: '🔢 Number Editor',
      width: '500px',
      footer: true
    });

    // Footer buttons
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-right: auto;
    `;
    resetBtn.onclick = () => {
      this.currentValue = 0;
      valueDisplay.textContent = this.formatNumber(this.currentValue);
      slider.value = this.currentValue.toString();
      directInput.value = this.currentValue.toString();
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
    saveBtn.onclick = () => this.stopEditing(true);

    footer.appendChild(resetBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  private formatNumber(value: number): string {
    if (!isFinite(value)) return value.toString();
    return value.toFixed(this.decimals);
  }

  private getPresetValues(): number[] {
    // Return common values based on range
    if (this.min >= 0 && this.max <= 100) {
      return [0, 25, 50, 75, 100].filter(v => v >= this.min && v <= this.max);
    } else if (this.min >= 0 && this.max <= 255) {
      return [0, 64, 128, 192, 255].filter(v => v >= this.min && v <= this.max);
    } else if (this.step >= 100) {
      return [100, 500, 1000, 5000, 10000].filter(v => v >= this.min && v <= this.max);
    }
    return [];
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      this.value = this.currentValue.toString();
      this.applyValue(this.value);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    return this.element.textContent || '0';
  }

  applyValue(value: string): void {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      this.element.textContent = this.formatNumber(num);
    }
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}