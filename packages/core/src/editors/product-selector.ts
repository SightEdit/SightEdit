/**
 * Product Selector Editor
 * Allows selecting/replacing products from a database
 */

import { BaseEditor } from './base';
import { EditorOptions } from '../types';
import { ProductSelectorSchema } from '../schema/advanced-schema';

export interface Product {
  id: string | number;
  name: string;
  price: number;
  image?: string;
  description?: string;
  category?: string;
  stock?: number;
  [key: string]: any;
}

export class ProductSelectorEditor extends BaseEditor {
  private products: Product[] = [];
  private selectedProducts: Product[] = [];
  private schema?: ProductSelectorSchema;
  private modal?: HTMLElement;
  private searchInput?: HTMLInputElement;
  private filterElements: Map<string, HTMLElement> = new Map();
  private currentFilters: Record<string, any> = {};
  private currentSort: string = '';
  private loading = false;
  
  constructor(element: HTMLElement, options?: EditorOptions) {
    super(element, options);
    if (options?.schema && 'productConfig' in options.schema) {
      this.schema = options.schema as ProductSelectorSchema;
    }
    this.initializeSelection();
  }
  
  private initializeSelection(): void {
    // Get current products from element
    const currentData = this.element.dataset.products;
    if (currentData) {
      try {
        this.selectedProducts = JSON.parse(currentData);
      } catch (e) {
        console.error('Failed to parse current products:', e);
      }
    }
  }
  
  render(): void {
    // Add edit button/overlay
    const editButton = document.createElement('button');
    editButton.className = 'sight-edit-product-selector-trigger';
    editButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 4v16m8-8H4" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span>Change Products</span>
    `;
    editButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000;
      transition: background 0.2s;
    `;
    
    editButton.addEventListener('click', () => this.openSelector());
    editButton.addEventListener('mouseenter', () => {
      editButton.style.background = '#2563eb';
    });
    editButton.addEventListener('mouseleave', () => {
      editButton.style.background = '#3b82f6';
    });
    
    // Make element relative if not already
    const position = window.getComputedStyle(this.element).position;
    if (position === 'static') {
      this.element.style.position = 'relative';
    }
    
    this.element.appendChild(editButton);
  }
  
  private async openSelector(): Promise<void> {
    // Create modal
    this.modal = this.createModal();
    document.body.appendChild(this.modal);
    
    // Load products
    await this.loadProducts();
    
    // Render product grid
    this.renderProducts();
  }
  
  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'sight-edit-product-selector-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s;
    `;
    
    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 1200px;
      height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      animation: slideUp 0.3s;
    `;
    
    // Header
    const header = this.createHeader();
    container.appendChild(header);
    
    // Filters bar
    const filters = this.createFiltersBar();
    container.appendChild(filters);
    
    // Content area
    const content = document.createElement('div');
    content.className = 'sight-edit-product-selector-content';
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    `;
    
    // Products grid
    const grid = document.createElement('div');
    grid.className = 'sight-edit-products-grid';
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
    `;
    content.appendChild(grid);
    
    container.appendChild(content);
    
    // Footer with actions
    const footer = this.createFooter();
    container.appendChild(footer);
    
    modal.appendChild(container);
    
    // Add animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeSelector();
      }
    });
    
    return modal;
  }
  
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const title = document.createElement('h2');
    title.textContent = this.schema?.ui?.title || 'Select Products';
    title.style.cssText = `
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.addEventListener('click', () => this.closeSelector());
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    return header;
  }
  
  private createFiltersBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      padding: 16px 20px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    `;
    
    // Search input
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search products...';
    this.searchInput.style.cssText = `
      flex: 1;
      min-width: 200px;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    `;
    this.searchInput.addEventListener('input', () => this.handleSearch());
    bar.appendChild(this.searchInput);
    
    // Category filter
    if (this.schema?.productConfig?.filters) {
      this.schema.productConfig.filters.forEach(filter => {
        const filterEl = this.createFilter(filter);
        bar.appendChild(filterEl);
        this.filterElements.set(filter.field, filterEl);
      });
    }
    
    // Sort dropdown
    if (this.schema?.productConfig?.sorting) {
      const sortEl = this.createSortDropdown();
      bar.appendChild(sortEl);
    }
    
    return bar;
  }
  
  private createFilter(filter: any): HTMLElement {
    const container = document.createElement('div');
    
    if (filter.type === 'select') {
      const select = document.createElement('select');
      select.style.cssText = `
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        background: white;
      `;
      
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = filter.label;
      select.appendChild(defaultOption);
      
      filter.options?.forEach((opt: any) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      
      select.addEventListener('change', () => {
        this.currentFilters[filter.field] = select.value;
        this.applyFilters();
      });
      
      container.appendChild(select);
    }
    
    return container;
  }
  
  private createSortDropdown(): HTMLElement {
    const select = document.createElement('select');
    select.style.cssText = `
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      background: white;
    `;
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Sort by';
    select.appendChild(defaultOption);
    
    this.schema?.productConfig?.sorting?.forEach(sort => {
      const option = document.createElement('option');
      option.value = sort.field;
      option.textContent = sort.label;
      if (sort.default) {
        option.selected = true;
        this.currentSort = sort.field;
      }
      select.appendChild(option);
    });
    
    select.addEventListener('change', () => {
      this.currentSort = select.value;
      this.sortProducts();
    });
    
    return select;
  }
  
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    // Selection info
    const info = document.createElement('div');
    info.className = 'sight-edit-selection-info';
    info.style.cssText = `
      font-size: 14px;
      color: #6b7280;
    `;
    this.updateSelectionInfo(info);
    
    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: 12px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 20px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => this.closeSelector());
    
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply Selection';
    applyBtn.style.cssText = `
      padding: 8px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    applyBtn.addEventListener('click', () => this.applySelection());
    
    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);
    
    footer.appendChild(info);
    footer.appendChild(actions);
    
    return footer;
  }
  
  private async loadProducts(): Promise<void> {
    if (!this.schema?.productConfig?.source?.endpoint) {
      console.error('No product endpoint configured');
      return;
    }
    
    this.loading = true;
    this.showLoading();
    
    try {
      const response = await fetch(this.schema.productConfig.source.endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      
      this.products = await response.json();
      this.loading = false;
      this.hideLoading();
    } catch (error) {
      console.error('Failed to load products:', error);
      this.loading = false;
      this.showModalError('Failed to load products');
    }
  }
  
  private renderProducts(): void {
    const grid = this.modal?.querySelector('.sight-edit-products-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const filteredProducts = this.getFilteredProducts();
    
    filteredProducts.forEach(product => {
      const card = this.createProductCard(product);
      grid.appendChild(card);
    });
  }
  
  private createProductCard(product: Product): HTMLElement {
    const card = document.createElement('div');
    card.className = 'sight-edit-product-card';
    card.style.cssText = `
      border: 2px solid ${this.isSelected(product) ? '#3b82f6' : '#e5e7eb'};
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      background: ${this.isSelected(product) ? '#eff6ff' : 'white'};
    `;
    
    // Product image
    if (product.image) {
      const img = document.createElement('img');
      img.src = product.image;
      img.alt = product.name;
      img.style.cssText = `
        width: 100%;
        height: 150px;
        object-fit: cover;
        border-radius: 4px;
        margin-bottom: 12px;
      `;
      card.appendChild(img);
    }
    
    // Product name
    const name = document.createElement('h3');
    name.textContent = product.name;
    name.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 8px 0;
    `;
    card.appendChild(name);
    
    // Product price
    const price = document.createElement('div');
    price.textContent = this.formatPrice(product.price);
    price.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      color: #3b82f6;
      margin-bottom: 8px;
    `;
    card.appendChild(price);
    
    // Stock info
    if (product.stock !== undefined) {
      const stock = document.createElement('div');
      stock.textContent = `Stock: ${product.stock}`;
      stock.style.cssText = `
        font-size: 12px;
        color: ${product.stock > 0 ? '#10b981' : '#ef4444'};
      `;
      card.appendChild(stock);
    }
    
    // Selection checkbox
    const checkbox = document.createElement('div');
    checkbox.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      border: 2px solid ${this.isSelected(product) ? '#3b82f6' : '#d1d5db'};
      border-radius: 4px;
      background: ${this.isSelected(product) ? '#3b82f6' : 'white'};
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    if (this.isSelected(product)) {
      checkbox.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M20 6L9 17l-5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
    
    card.style.position = 'relative';
    card.appendChild(checkbox);
    
    // Click handler
    card.addEventListener('click', () => this.toggleProduct(product));
    
    // Hover effect
    card.addEventListener('mouseenter', () => {
      if (!this.isSelected(product)) {
        card.style.borderColor = '#9ca3af';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      }
    });
    
    card.addEventListener('mouseleave', () => {
      if (!this.isSelected(product)) {
        card.style.borderColor = '#e5e7eb';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'none';
      }
    });
    
    return card;
  }
  
  private isSelected(product: Product): boolean {
    return this.selectedProducts.some(p => p.id === product.id);
  }
  
  private toggleProduct(product: Product): void {
    const index = this.selectedProducts.findIndex(p => p.id === product.id);
    const config = this.schema?.productConfig?.selection;
    
    if (index > -1) {
      // Deselect
      this.selectedProducts.splice(index, 1);
    } else {
      // Select
      if (config?.mode === 'single') {
        this.selectedProducts = [product];
      } else if (config?.mode === 'replacement') {
        // For replacement mode, maintain the same count
        const currentCount = config.currentItems?.length || 0;
        if (this.selectedProducts.length < currentCount) {
          this.selectedProducts.push(product);
        } else {
          // Replace oldest selection
          this.selectedProducts.shift();
          this.selectedProducts.push(product);
        }
      } else {
        // Multiple selection
        const max = config?.max || Infinity;
        if (this.selectedProducts.length < max) {
          this.selectedProducts.push(product);
        }
      }
    }
    
    this.renderProducts();
    this.updateSelectionInfo();
  }
  
  private updateSelectionInfo(container?: HTMLElement): void {
    const info = container || this.modal?.querySelector('.sight-edit-selection-info');
    if (!info) return;
    
    const config = this.schema?.productConfig?.selection;
    const current = this.selectedProducts.length;
    const min = config?.min || 0;
    const max = config?.max || Infinity;
    
    let text = `Selected: ${current}`;
    if (min > 0) text += ` (min: ${min})`;
    if (max < Infinity) text += ` (max: ${max})`;
    
    info.textContent = text;
  }
  
  private getFilteredProducts(): Product[] {
    let filtered = [...this.products];
    
    // Apply search
    if (this.searchInput?.value) {
      const search = this.searchInput.value.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.description?.toLowerCase().includes(search)
      );
    }
    
    // Apply filters
    Object.entries(this.currentFilters).forEach(([field, value]) => {
      if (value) {
        filtered = filtered.filter(p => p[field] === value);
      }
    });
    
    // Apply sort
    if (this.currentSort) {
      filtered.sort((a, b) => {
        const aVal = a[this.currentSort];
        const bVal = b[this.currentSort];
        if (typeof aVal === 'number') {
          return aVal - bVal;
        }
        return String(aVal).localeCompare(String(bVal));
      });
    }
    
    return filtered;
  }
  
  private handleSearch(): void {
    this.renderProducts();
  }
  
  private applyFilters(): void {
    this.renderProducts();
  }
  
  private sortProducts(): void {
    this.renderProducts();
  }
  
  private async applySelection(): Promise<void> {
    // Validate selection
    const config = this.schema?.productConfig?.selection;
    const min = config?.min || 0;
    
    if (this.selectedProducts.length < min) {
      alert(`Please select at least ${min} products`);
      return;
    }
    
    // Update the display
    this.updateDisplay();
    
    // Save the selection
    await this.save();
    
    // Close modal
    this.closeSelector();
  }
  
  private updateDisplay(): void {
    // Update the original element with new products
    // This depends on how products are displayed
    // For now, we'll just update the data attribute
    this.element.dataset.products = JSON.stringify(this.selectedProducts);
    
    // Trigger a custom event
    const event = new CustomEvent('productsChanged', {
      detail: { products: this.selectedProducts }
    });
    this.element.dispatchEvent(event);
  }
  
  private closeSelector(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = undefined;
    }
  }
  
  private showLoading(): void {
    const grid = this.modal?.querySelector('.sight-edit-products-grid');
    if (!grid) return;
    
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
        <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 16px; color: #6b7280;">Loading products...</div>
      </div>
    `;
  }
  
  private hideLoading(): void {
    // Loading will be replaced by renderProducts
  }
  
  private showModalError(message: string): void {
    const grid = this.modal?.querySelector('.sight-edit-products-grid');
    if (!grid) return;
    
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444;">
        <div style="font-size: 48px;">⚠️</div>
        <div style="margin-top: 16px;">${message}</div>
      </div>
    `;
  }
  
  private formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }
  
  extractValue(): any {
    return this.selectedProducts;
  }
  
  applyValue(value: any): void {
    if (Array.isArray(value)) {
      this.selectedProducts = value;
      this.updateDisplay();
    }
  }
  
  async save(): Promise<void> {
    if (this.onSave) {
      await this.onSave(this.selectedProducts);
    }
  }
  
  destroy(): void {
    this.closeSelector();
    super.destroy();
  }
}