/**
 * Virtual Scrolling Implementation for Large Element Lists
 * Optimizes performance when dealing with thousands of editable elements
 */

interface VirtualScrollItem {
  id: string;
  element: HTMLElement;
  height: number;
  data: any;
}

interface VirtualScrollConfig {
  container: HTMLElement;
  itemHeight?: number;
  bufferSize?: number;
  threshold?: number;
  onRenderItem: (item: VirtualScrollItem, index: number) => HTMLElement;
  onItemVisible?: (item: VirtualScrollItem, index: number) => void;
  onItemHidden?: (item: VirtualScrollItem, index: number) => void;
}

export class VirtualScroller {
  private config: VirtualScrollConfig;
  private items: VirtualScrollItem[] = [];
  private visibleItems: Map<string, HTMLElement> = new Map();
  private itemHeights: Map<string, number> = new Map();
  private scrollContainer: HTMLElement;
  private viewport: HTMLElement;
  private spacerTop: HTMLElement;
  private spacerBottom: HTMLElement;
  
  private viewportHeight = 0;
  private scrollTop = 0;
  private totalHeight = 0;
  private startIndex = 0;
  private endIndex = 0;
  
  private resizeObserver?: ResizeObserver;
  private scrollListener?: () => void;
  private isDestroyed = false;
  
  constructor(config: VirtualScrollConfig) {
    this.config = {
      itemHeight: 50,
      bufferSize: 5,
      threshold: 0.1,
      ...config
    };
    
    this.init();
  }
  
  private init(): void {
    this.scrollContainer = this.config.container;
    this.viewportHeight = this.scrollContainer.clientHeight;
    
    // Create virtual scroll structure
    this.viewport = document.createElement('div');
    this.viewport.style.cssText = `
      position: relative;
      overflow: hidden;
      width: 100%;
      height: 100%;
    `;
    
    this.spacerTop = document.createElement('div');
    this.spacerBottom = document.createElement('div');
    
    this.viewport.appendChild(this.spacerTop);
    this.viewport.appendChild(this.spacerBottom);
    
    // Clear container and add viewport
    this.scrollContainer.innerHTML = '';
    this.scrollContainer.appendChild(this.viewport);
    
    // Setup scroll listener with throttling
    this.scrollListener = this.throttle(() => {
      if (!this.isDestroyed) {
        this.handleScroll();
      }
    }, 16); // ~60fps
    
    this.scrollContainer.addEventListener('scroll', this.scrollListener);
    
    // Setup resize observer
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.isDestroyed) {
          this.handleResize();
        }
      });
      this.resizeObserver.observe(this.scrollContainer);
    }
  }
  
  setItems(items: VirtualScrollItem[]): void {
    this.items = [...items];
    this.calculateTotalHeight();
    this.updateVisibleItems();
  }
  
  addItem(item: VirtualScrollItem): void {
    this.items.push(item);
    this.calculateTotalHeight();
    this.updateVisibleItems();
  }
  
  removeItem(id: string): void {
    const index = this.items.findIndex(item => item.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
      this.itemHeights.delete(id);
      
      // Remove from visible items if present
      if (this.visibleItems.has(id)) {
        const element = this.visibleItems.get(id)!;
        element.remove();
        this.visibleItems.delete(id);
      }
      
      this.calculateTotalHeight();
      this.updateVisibleItems();
    }
  }
  
  updateItem(id: string, data: any): void {
    const item = this.items.find(item => item.id === id);
    if (item) {
      item.data = data;
      
      // Re-render if visible
      if (this.visibleItems.has(id)) {
        const element = this.visibleItems.get(id)!;
        const newElement = this.config.onRenderItem(item, this.items.indexOf(item));
        element.replaceWith(newElement);
        this.visibleItems.set(id, newElement);
      }
    }
  }
  
  scrollToItem(id: string): void {
    const index = this.items.findIndex(item => item.id === id);
    if (index >= 0) {
      const offset = this.getItemOffset(index);
      this.scrollContainer.scrollTop = offset;
    }
  }
  
  private handleScroll(): void {
    this.scrollTop = this.scrollContainer.scrollTop;
    this.updateVisibleItems();
  }
  
  private handleResize(): void {
    const newHeight = this.scrollContainer.clientHeight;
    if (newHeight !== this.viewportHeight) {
      this.viewportHeight = newHeight;
      this.updateVisibleItems();
    }
  }
  
  private calculateTotalHeight(): void {
    let height = 0;
    for (let i = 0; i < this.items.length; i++) {
      const itemHeight = this.getItemHeight(i);
      height += itemHeight;
    }
    this.totalHeight = height;
  }
  
  private getItemHeight(index: number): number {
    const item = this.items[index];
    if (item && this.itemHeights.has(item.id)) {
      return this.itemHeights.get(item.id)!;
    }
    return this.config.itemHeight!;
  }
  
  private getItemOffset(index: number): number {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += this.getItemHeight(i);
    }
    return offset;
  }
  
  private updateVisibleItems(): void {
    if (this.items.length === 0) {
      this.clearVisibleItems();
      return;
    }
    
    // Calculate visible range
    const { start, end } = this.getVisibleRange();
    
    // Add buffer
    const bufferSize = this.config.bufferSize!;
    const newStart = Math.max(0, start - bufferSize);
    const newEnd = Math.min(this.items.length - 1, end + bufferSize);
    
    // Update spacers
    const topHeight = this.getItemOffset(newStart);
    const bottomHeight = this.totalHeight - this.getItemOffset(newEnd + 1);
    
    this.spacerTop.style.height = `${topHeight}px`;
    this.spacerBottom.style.height = `${bottomHeight}px`;
    
    // Remove items that are no longer visible
    const currentVisible = new Set(this.visibleItems.keys());
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const item = this.items[i];
      if (item && (i < newStart || i > newEnd)) {
        this.hideItem(item, i);
        currentVisible.delete(item.id);
      }
    }
    
    // Add newly visible items
    for (let i = newStart; i <= newEnd; i++) {
      const item = this.items[i];
      if (item && !this.visibleItems.has(item.id)) {
        this.showItem(item, i);
      }
    }
    
    this.startIndex = newStart;
    this.endIndex = newEnd;
  }
  
  private getVisibleRange(): { start: number; end: number } {
    let start = 0;
    let end = 0;
    let currentOffset = 0;
    
    // Find start index
    for (let i = 0; i < this.items.length; i++) {
      const itemHeight = this.getItemHeight(i);
      if (currentOffset + itemHeight > this.scrollTop) {
        start = i;
        break;
      }
      currentOffset += itemHeight;
    }
    
    // Find end index
    const viewportBottom = this.scrollTop + this.viewportHeight;
    currentOffset = this.getItemOffset(start);
    
    for (let i = start; i < this.items.length; i++) {
      const itemHeight = this.getItemHeight(i);
      end = i;
      if (currentOffset + itemHeight > viewportBottom) {
        break;
      }
      currentOffset += itemHeight;
    }
    
    return { start, end };
  }
  
  private showItem(item: VirtualScrollItem, index: number): void {
    const element = this.config.onRenderItem(item, index);
    
    // Position the element
    const offset = this.getItemOffset(index) - this.getItemOffset(this.startIndex);
    element.style.position = 'absolute';
    element.style.top = `${offset}px`;
    element.style.width = '100%';
    
    // Insert after spacer top
    this.spacerTop.after(element);
    this.visibleItems.set(item.id, element);
    
    // Measure actual height if not known
    if (!this.itemHeights.has(item.id)) {
      // Use ResizeObserver or fallback to getBoundingClientRect
      requestAnimationFrame(() => {
        if (!this.isDestroyed && element.parentNode) {
          const height = element.getBoundingClientRect().height;
          this.itemHeights.set(item.id, height);
          
          // Recalculate if height changed significantly
          if (Math.abs(height - this.config.itemHeight!) > 5) {
            this.calculateTotalHeight();
            this.updateVisibleItems();
          }
        }
      });
    }
    
    // Call visibility callback
    if (this.config.onItemVisible) {
      this.config.onItemVisible(item, index);
    }
  }
  
  private hideItem(item: VirtualScrollItem, index: number): void {
    const element = this.visibleItems.get(item.id);
    if (element) {
      element.remove();
      this.visibleItems.delete(item.id);
      
      // Call visibility callback
      if (this.config.onItemHidden) {
        this.config.onItemHidden(item, index);
      }
    }
  }
  
  private clearVisibleItems(): void {
    this.visibleItems.forEach(element => element.remove());
    this.visibleItems.clear();
    this.spacerTop.style.height = '0px';
    this.spacerBottom.style.height = '0px';
  }
  
  private throttle(func: Function, limit: number): () => void {
    let inThrottle = false;
    return function(this: any) {
      if (!inThrottle) {
        func.apply(this, arguments);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Public methods for performance monitoring
  getMetrics() {
    return {
      totalItems: this.items.length,
      visibleItems: this.visibleItems.size,
      totalHeight: this.totalHeight,
      viewportHeight: this.viewportHeight,
      scrollTop: this.scrollTop,
      startIndex: this.startIndex,
      endIndex: this.endIndex
    };
  }
  
  destroy(): void {
    this.isDestroyed = true;
    
    if (this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    this.clearVisibleItems();
    this.viewport.remove();
    
    // Clear references
    this.items = [];
    this.itemHeights.clear();
    this.visibleItems.clear();
  }
}