/**
 * Edit Mode Toolbar - Shows Save All / Discard buttons in edit mode
 */
export class EditToolbar {
  private container: HTMLElement | null = null;
  private changeCount: HTMLElement | null = null;
  private isVisible: boolean = false;
  private onSaveAll?: () => void;
  private onDiscardAll?: () => void;
  
  show(changeCount: number = 0): void {
    if (this.isVisible) {
      this.updateCount(changeCount);
      return;
    }
    
    this.create();
    this.updateCount(changeCount);
    this.isVisible = true;
  }
  
  hide(): void {
    if (this.container) {
      this.container.style.transform = 'translateY(-100%)';
      setTimeout(() => {
        if (this.container && this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.changeCount = null;
      }, 300);
    }
    this.isVisible = false;
  }
  
  updateCount(count: number): void {
    if (this.changeCount) {
      if (count > 0) {
        this.changeCount.textContent = `${count} change${count !== 1 ? 's' : ''}`;
        this.changeCount.style.display = 'inline-block';
      } else {
        this.changeCount.textContent = 'No changes';
        this.changeCount.style.display = 'inline-block';
      }
    }
  }
  
  onSave(callback: () => void): void {
    this.onSaveAll = callback;
  }
  
  onDiscard(callback: () => void): void {
    this.onDiscardAll = callback;
  }
  
  private create(): void {
    // Remove existing if any
    const existing = document.getElementById('sight-edit-toolbar');
    if (existing) {
      existing.remove();
    }
    
    // Create toolbar
    this.container = document.createElement('div');
    this.container.id = 'sight-edit-toolbar';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 0 20px;
      transform: translateY(-100%);
      transition: transform 0.3s ease;
    `;
    
    // Create content wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 20px;
      max-width: 1200px;
      width: 100%;
    `;
    
    // Mode indicator
    const modeIndicator = document.createElement('div');
    modeIndicator.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      color: white;
      font-weight: 600;
      font-size: 16px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border-radius: 8px;
    `;
    modeIndicator.innerHTML = `
      <span style="font-size: 20px;">✏️</span>
      <span>Edit Mode</span>
    `;
    
    // Change counter
    this.changeCount = document.createElement('span');
    this.changeCount.style.cssText = `
      padding: 6px 12px;
      background: rgba(255,255,255,0.25);
      color: white;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      margin-left: auto;
    `;
    
    // Buttons container
    const buttons = document.createElement('div');
    buttons.style.cssText = `
      display: flex;
      gap: 10px;
    `;
    
    // Discard button
    const discardBtn = document.createElement('button');
    discardBtn.textContent = '🗑️ Discard All';
    discardBtn.style.cssText = `
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 10px rgba(239,68,68,0.3);
    `;
    discardBtn.onmouseover = () => {
      discardBtn.style.transform = 'translateY(-2px)';
      discardBtn.style.boxShadow = '0 4px 15px rgba(239,68,68,0.4)';
    };
    discardBtn.onmouseout = () => {
      discardBtn.style.transform = 'translateY(0)';
      discardBtn.style.boxShadow = '0 2px 10px rgba(239,68,68,0.3)';
    };
    discardBtn.onclick = () => {
      if (this.onDiscardAll) {
        this.onDiscardAll();
      }
    };
    
    // Save All button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save All';
    saveBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 10px rgba(16,185,129,0.3);
    `;
    saveBtn.onmouseover = () => {
      saveBtn.style.transform = 'translateY(-2px)';
      saveBtn.style.boxShadow = '0 4px 15px rgba(16,185,129,0.4)';
    };
    saveBtn.onmouseout = () => {
      saveBtn.style.transform = 'translateY(0)';
      saveBtn.style.boxShadow = '0 2px 10px rgba(16,185,129,0.3)';
    };
    saveBtn.onclick = () => {
      if (this.onSaveAll) {
        this.onSaveAll();
      }
    };
    
    // Exit button
    const exitBtn = document.createElement('button');
    exitBtn.textContent = '✕ Exit';
    exitBtn.style.cssText = `
      padding: 10px 20px;
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    exitBtn.onmouseover = () => {
      exitBtn.style.background = 'rgba(255,255,255,0.3)';
    };
    exitBtn.onmouseout = () => {
      exitBtn.style.background = 'rgba(255,255,255,0.2)';
    };
    exitBtn.onclick = () => {
      // Trigger exit edit mode
      const event = new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true,
        bubbles: true
      });
      document.dispatchEvent(event);
    };
    
    // Assemble
    buttons.appendChild(discardBtn);
    buttons.appendChild(saveBtn);
    buttons.appendChild(exitBtn);
    
    wrapper.appendChild(modeIndicator);
    wrapper.appendChild(this.changeCount);
    wrapper.appendChild(buttons);
    
    this.container.appendChild(wrapper);
    document.body.appendChild(this.container);
    
    // Add margin to body to make room for toolbar
    document.body.style.marginTop = '60px';
    document.body.style.transition = 'margin-top 0.3s ease';
    
    // Animate in
    setTimeout(() => {
      if (this.container) {
        this.container.style.transform = 'translateY(0)';
      }
    }, 10);
  }
  
  destroy(): void {
    this.hide();
    document.body.style.marginTop = '0';
  }
}

// Export singleton
export const editToolbar = new EditToolbar();