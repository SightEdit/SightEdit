export interface ToolbarAction {
  id: string;
  label: string;
  icon: string;
  handler: () => void;
  active?: boolean;
  disabled?: boolean;
}

export class ImageCropToolbar {
  private container: HTMLElement;
  private actions: ToolbarAction[] = [];
  private cropper: any;
  
  constructor(container: HTMLElement, cropper: any) {
    this.container = container;
    this.cropper = cropper;
    this.setupActions();
    this.render();
  }
  
  private setupActions(): void {
    this.actions = [
      {
        id: 'select',
        label: 'Select',
        icon: '⬚',
        handler: () => this.setDragMode('crop')
      },
      {
        id: 'move',
        label: 'Move',
        icon: '✋',
        handler: () => this.setDragMode('move')
      },
      {
        id: 'zoom-in',
        label: 'Zoom In',
        icon: '🔍+',
        handler: () => this.cropper.zoom(0.1)
      },
      {
        id: 'zoom-out',
        label: 'Zoom Out',
        icon: '🔍-',
        handler: () => this.cropper.zoom(-0.1)
      },
      {
        id: 'zoom-fit',
        label: 'Fit',
        icon: '⊞',
        handler: () => this.cropper.reset()
      },
      {
        id: 'rotate-left',
        label: 'Rotate Left',
        icon: '↺',
        handler: () => this.cropper.rotate(-90)
      },
      {
        id: 'rotate-right',
        label: 'Rotate Right',
        icon: '↻',
        handler: () => this.cropper.rotate(90)
      },
      {
        id: 'flip-horizontal',
        label: 'Flip Horizontal',
        icon: '↔',
        handler: () => this.flipHorizontal()
      },
      {
        id: 'flip-vertical',
        label: 'Flip Vertical',
        icon: '↕',
        handler: () => this.flipVertical()
      },
      {
        id: 'lock-ratio',
        label: 'Lock Ratio',
        icon: '🔒',
        handler: () => this.toggleAspectRatio(),
        active: false
      },
      {
        id: 'grid',
        label: 'Toggle Grid',
        icon: '⊞',
        handler: () => this.toggleGrid(),
        active: true
      },
      {
        id: 'clear',
        label: 'Clear Selection',
        icon: '✕',
        handler: () => this.cropper.clear()
      }
    ];
  }
  
  private render(): void {
    this.container.innerHTML = `
      <div class="sightedit-crop-toolbar">
        ${this.actions.map(action => `
          <button 
            class="sightedit-crop-toolbar-btn ${action.active ? 'active' : ''} ${action.disabled ? 'disabled' : ''}"
            data-action="${action.id}"
            title="${action.label}"
            ${action.disabled ? 'disabled' : ''}
          >
            ${action.icon}
          </button>
        `).join('')}
      </div>
    `;
    
    // Add event listeners
    this.container.querySelectorAll('.sightedit-crop-toolbar-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const actionId = (e.currentTarget as HTMLElement).dataset.action;
        const action = this.actions.find(a => a.id === actionId);
        if (action && !action.disabled) {
          action.handler();
          this.updateActiveStates();
        }
      });
    });
    
    this.addStyles();
  }
  
  private setDragMode(mode: 'crop' | 'move'): void {
    this.cropper.setDragMode(mode);
    
    // Update active states
    this.actions.forEach(action => {
      if (action.id === 'select') {
        action.active = mode === 'crop';
      } else if (action.id === 'move') {
        action.active = mode === 'move';
      }
    });
    
    this.updateActiveStates();
  }
  
  private flipHorizontal(): void {
    const imageData = this.cropper.getImageData();
    this.cropper.scaleX(-imageData.scaleX || -1);
  }
  
  private flipVertical(): void {
    const imageData = this.cropper.getImageData();
    this.cropper.scaleY(-imageData.scaleY || -1);
  }
  
  private toggleAspectRatio(): void {
    const action = this.actions.find(a => a.id === 'lock-ratio');
    if (!action) return;
    
    action.active = !action.active;
    
    if (action.active) {
      // Lock to current aspect ratio
      const data = this.cropper.getCropBoxData();
      const ratio = data.width / data.height;
      this.cropper.setAspectRatio(ratio);
    } else {
      // Free aspect ratio
      this.cropper.setAspectRatio(NaN);
    }
    
    this.updateActiveStates();
  }
  
  private toggleGrid(): void {
    const action = this.actions.find(a => a.id === 'grid');
    if (!action) return;
    
    action.active = !action.active;
    
    // Toggle guides
    const options = this.cropper.options;
    options.guides = action.active;
    this.cropper.destroy();
    this.cropper = new (window as any).Cropper(this.cropper.element, options);
    
    this.updateActiveStates();
  }
  
  private updateActiveStates(): void {
    this.actions.forEach(action => {
      const btn = this.container.querySelector(`[data-action="${action.id}"]`);
      if (btn) {
        if (action.active) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }
  
  private addStyles(): void {
    if (document.getElementById('sightedit-crop-toolbar-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sightedit-crop-toolbar-styles';
    style.textContent = `
      .sightedit-crop-toolbar {
        display: flex;
        gap: 4px;
        padding: 8px;
        background: #2d2d2d;
        border-radius: 4px;
        flex-wrap: wrap;
      }
      
      .sightedit-crop-toolbar-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #444;
        background: transparent;
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
      }
      
      .sightedit-crop-toolbar-btn:hover:not(.disabled) {
        background: #444;
        transform: translateY(-1px);
      }
      
      .sightedit-crop-toolbar-btn.active {
        background: #007bff;
        border-color: #007bff;
      }
      
      .sightedit-crop-toolbar-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .sightedit-crop-toolbar-btn:active:not(.disabled) {
        transform: translateY(0);
      }
    `;
    
    document.head.appendChild(style);
  }
  
  updateCropper(cropper: any): void {
    this.cropper = cropper;
  }
  
  setAction(actionId: string, updates: Partial<ToolbarAction>): void {
    const action = this.actions.find(a => a.id === actionId);
    if (action) {
      Object.assign(action, updates);
      this.render();
    }
  }
  
  addAction(action: ToolbarAction): void {
    this.actions.push(action);
    this.render();
  }
  
  removeAction(actionId: string): void {
    this.actions = this.actions.filter(a => a.id !== actionId);
    this.render();
  }
}