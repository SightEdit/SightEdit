/**
 * Monitoring dashboard configuration and components for comprehensive system monitoring
 */

import { ErrorHandler, ErrorDetails, ErrorMetrics } from './error-handler';
import { StructuredLogger, LogMetrics } from './logger';
import { TelemetrySystem, EventType } from './telemetry';
import { notifications } from './notification-system';

export interface DashboardConfig {
  enabled: boolean;
  title?: string;
  refreshInterval?: number; // ms
  autoRefresh?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  width?: number;
  height?: number;
  collapsible?: boolean;
  minimizable?: boolean;
  draggable?: boolean;
  showTabs?: boolean;
  defaultTab?: string;
  theme?: 'light' | 'dark' | 'auto';
  enableExport?: boolean;
  enableShare?: boolean;
  requireAuth?: boolean;
  allowedUsers?: string[];
}

export interface DashboardTab {
  id: string;
  name: string;
  icon?: string;
  component: DashboardComponent;
}

export interface DashboardComponent {
  type: 'chart' | 'table' | 'metric' | 'log' | 'status' | 'alert' | 'custom';
  title: string;
  description?: string;
  refreshInterval?: number;
  height?: number;
  config: any;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'gauge' | 'area';
  dataSource: string;
  xAxis?: string;
  yAxis?: string;
  legend?: boolean;
  colors?: string[];
  timeRange?: number; // ms
  maxDataPoints?: number;
}

export interface MetricConfig {
  label: string;
  value: string | (() => Promise<number | string>);
  unit?: string;
  format?: 'number' | 'percentage' | 'bytes' | 'duration';
  threshold?: {
    warning?: number;
    critical?: number;
  };
  trend?: boolean;
}

/**
 * Monitoring dashboard for real-time system monitoring
 */
export class MonitoringDashboard {
  private static instance: MonitoringDashboard;
  private config: DashboardConfig;
  private container: HTMLElement | null = null;
  private tabs: DashboardTab[] = [];
  private activeTab = '';
  private refreshTimer: NodeJS.Timeout | null = null;
  private isVisible = false;
  private isCollapsed = false;
  private dataCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5000; // 5 seconds

  static getInstance(): MonitoringDashboard {
    if (!this.instance) {
      this.instance = new MonitoringDashboard();
    }
    return this.instance;
  }

  /**
   * Initialize the dashboard
   */
  init(config: Partial<DashboardConfig> = {}): void {
    this.config = {
      enabled: true,
      title: 'SightEdit Monitor',
      refreshInterval: 5000,
      autoRefresh: true,
      position: 'bottom-right',
      width: 800,
      height: 600,
      collapsible: true,
      minimizable: true,
      draggable: true,
      showTabs: true,
      defaultTab: 'overview',
      theme: 'auto',
      enableExport: true,
      enableShare: false,
      requireAuth: false,
      ...config
    };

    if (!this.config.enabled) {
      return;
    }

    this.setupDefaultTabs();
    this.createDashboard();
    
    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }

    // Add keyboard shortcut to toggle dashboard
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        this.toggle();
      }
    });

    console.log('Monitoring dashboard initialized');
  }

  /**
   * Show the dashboard
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'block';
      this.isVisible = true;
      this.refreshAll();
    }
  }

  /**
   * Hide the dashboard
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Toggle dashboard visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Add a custom tab
   */
  addTab(tab: DashboardTab): void {
    this.tabs.push(tab);
    if (this.container) {
      this.renderTabs();
      if (!this.activeTab) {
        this.setActiveTab(tab.id);
      }
    }
  }

  /**
   * Remove a tab
   */
  removeTab(tabId: string): void {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index > -1) {
      this.tabs.splice(index, 1);
      if (this.activeTab === tabId && this.tabs.length > 0) {
        this.setActiveTab(this.tabs[0].id);
      }
      if (this.container) {
        this.renderTabs();
      }
    }
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
    if (this.container) {
      this.renderActiveTab();
    }
  }

  /**
   * Export dashboard data
   */
  exportData(): Record<string, any> {
    const data: Record<string, any> = {};

    for (const tab of this.tabs) {
      data[tab.id] = this.getTabData(tab);
    }

    return {
      timestamp: new Date().toISOString(),
      config: this.config,
      tabs: data
    };
  }

  private setupDefaultTabs(): void {
    // Overview Tab
    this.tabs.push({
      id: 'overview',
      name: 'Overview',
      icon: '📊',
      component: {
        type: 'custom',
        title: 'System Overview',
        config: {
          metrics: [
            {
              label: 'Uptime',
              value: () => this.formatUptime(Date.now() - performance.timeOrigin),
              format: 'duration'
            },
            {
              label: 'Total Errors',
              value: async () => ErrorHandler.getStats()[Object.keys(ErrorHandler.getStats())[0]] || 0,
              format: 'number',
              threshold: { warning: 10, critical: 50 }
            },
            {
              label: 'Memory Usage',
              value: () => this.getMemoryUsagePercent(),
              unit: '%',
              format: 'percentage',
              threshold: { warning: 80, critical: 90 }
            },
            {
              label: 'Active Users',
              value: async () => {
                const telemetry = TelemetrySystem.getInstance();
                return telemetry.getStats().eventsTracked;
              },
              format: 'number'
            }
          ]
        }
      }
    });

    // Errors Tab
    this.tabs.push({
      id: 'errors',
      name: 'Errors',
      icon: '❌',
      component: {
        type: 'table',
        title: 'Recent Errors',
        config: {
          columns: ['Time', 'Type', 'Message', 'Severity'],
          dataSource: 'errors',
          maxRows: 50
        }
      }
    });

    // Logs Tab
    this.tabs.push({
      id: 'logs',
      name: 'Logs',
      icon: '📝',
      component: {
        type: 'log',
        title: 'System Logs',
        config: {
          levels: ['ERROR', 'WARN', 'INFO', 'DEBUG'],
          maxEntries: 100,
          search: true,
          filter: true
        }
      }
    });

    // Performance Tab
    this.tabs.push({
      id: 'performance',
      name: 'Performance',
      icon: '⚡',
      component: {
        type: 'chart',
        title: 'Performance Metrics',
        config: {
          type: 'line',
          dataSource: 'performance',
          timeRange: 300000, // 5 minutes
          metrics: ['responseTime', 'throughput', 'errorRate']
        }
      }
    });

    // Health Tab
    this.tabs.push({
      id: 'health',
      name: 'Health',
      icon: '💚',
      component: {
        type: 'status',
        title: 'System Health',
        config: {
          checks: [
            'api',
            'storage',
            'memory',
            'cpu',
            'network'
          ]
        }
      }
    });
  }

  private createDashboard(): void {
    this.container = document.createElement('div');
    this.container.id = 'sightedit-monitoring-dashboard';
    this.container.className = 'sightedit-dashboard';
    
    this.applyStyles();
    this.renderDashboard();
    
    document.body.appendChild(this.container);
  }

  private applyStyles(): void {
    if (!this.container) return;

    const theme = this.config.theme === 'auto' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : this.config.theme;

    const styles = this.getThemeStyles(theme!);
    
    this.container.setAttribute('style', `
      position: fixed;
      ${this.getPositionStyles()}
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      display: none;
      ${styles.container}
    `);

    // Add global styles if not already added
    if (!document.getElementById('sightedit-dashboard-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'sightedit-dashboard-styles';
      styleSheet.textContent = this.getGlobalStyles(theme!);
      document.head.appendChild(styleSheet);
    }
  }

  private getPositionStyles(): string {
    switch (this.config.position) {
      case 'top-left':
        return 'top: 20px; left: 20px;';
      case 'top-right':
        return 'top: 20px; right: 20px;';
      case 'bottom-left':
        return 'bottom: 20px; left: 20px;';
      case 'bottom-right':
        return 'bottom: 20px; right: 20px;';
      case 'center':
        return 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
      default:
        return 'bottom: 20px; right: 20px;';
    }
  }

  private getThemeStyles(theme: 'light' | 'dark'): Record<string, string> {
    if (theme === 'dark') {
      return {
        container: `
          background: #1a1a1a;
          border: 1px solid #333;
          color: #e0e0e0;
        `,
        header: 'background: #2d2d2d; border-bottom: 1px solid #444;',
        tab: 'background: #2d2d2d; border-right: 1px solid #444; color: #ccc;',
        tabActive: 'background: #1a1a1a; color: #fff;',
        content: 'background: #1a1a1a;',
        button: 'background: #333; border: 1px solid #555; color: #ccc;',
        input: 'background: #333; border: 1px solid #555; color: #fff;'
      };
    } else {
      return {
        container: `
          background: #ffffff;
          border: 1px solid #e0e0e0;
          color: #333;
        `,
        header: 'background: #f8f9fa; border-bottom: 1px solid #e0e0e0;',
        tab: 'background: #f8f9fa; border-right: 1px solid #e0e0e0; color: #666;',
        tabActive: 'background: #ffffff; color: #333;',
        content: 'background: #ffffff;',
        button: 'background: #f8f9fa; border: 1px solid #e0e0e0; color: #333;',
        input: 'background: #ffffff; border: 1px solid #e0e0e0; color: #333;'
      };
    }
  }

  private getGlobalStyles(theme: 'light' | 'dark'): string {
    const colors = theme === 'dark' ? {
      bg: '#1a1a1a',
      border: '#333',
      text: '#e0e0e0',
      accent: '#007acc'
    } : {
      bg: '#ffffff',
      border: '#e0e0e0',
      text: '#333',
      accent: '#007acc'
    };

    return `
      .sightedit-dashboard * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      .sightedit-dashboard-header {
        padding: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
      }
      
      .sightedit-dashboard-title {
        font-weight: 600;
        font-size: 14px;
      }
      
      .sightedit-dashboard-controls {
        display: flex;
        gap: 8px;
      }
      
      .sightedit-dashboard-btn {
        padding: 4px 8px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        transition: opacity 0.2s;
      }
      
      .sightedit-dashboard-btn:hover {
        opacity: 0.8;
      }
      
      .sightedit-dashboard-tabs {
        display: flex;
        border-bottom: 1px solid ${colors.border};
      }
      
      .sightedit-dashboard-tab {
        padding: 8px 16px;
        cursor: pointer;
        border: none;
        background: none;
        font-size: 12px;
        transition: background-color 0.2s;
      }
      
      .sightedit-dashboard-tab:hover {
        opacity: 0.8;
      }
      
      .sightedit-dashboard-tab.active {
        font-weight: 600;
      }
      
      .sightedit-dashboard-content {
        flex: 1;
        overflow: auto;
        padding: 16px;
      }
      
      .sightedit-metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      
      .sightedit-metric-card {
        padding: 16px;
        border: 1px solid ${colors.border};
        border-radius: 6px;
        background: ${colors.bg};
      }
      
      .sightedit-metric-label {
        font-size: 12px;
        color: ${colors.text};
        opacity: 0.7;
        margin-bottom: 4px;
      }
      
      .sightedit-metric-value {
        font-size: 24px;
        font-weight: 600;
        color: ${colors.text};
      }
      
      .sightedit-metric-unit {
        font-size: 14px;
        margin-left: 4px;
        opacity: 0.7;
      }
      
      .sightedit-log-entry {
        padding: 8px;
        border-bottom: 1px solid ${colors.border};
        font-family: monospace;
        font-size: 11px;
      }
      
      .sightedit-log-error { color: #ff4757; }
      .sightedit-log-warn { color: #ffa502; }
      .sightedit-log-info { color: ${colors.accent}; }
      .sightedit-log-debug { color: ${colors.text}; opacity: 0.7; }
      
      .sightedit-status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }
      
      .sightedit-status-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border: 1px solid ${colors.border};
        border-radius: 6px;
      }
      
      .sightedit-status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      
      .sightedit-status-healthy { background-color: #2ed573; }
      .sightedit-status-warning { background-color: #ffa502; }
      .sightedit-status-error { background-color: #ff4757; }
      
      .sightedit-chart-container {
        height: 300px;
        margin: 16px 0;
      }
    `;
  }

  private renderDashboard(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="sightedit-dashboard-header">
        <div class="sightedit-dashboard-title">${this.config.title}</div>
        <div class="sightedit-dashboard-controls">
          ${this.config.enableExport ? '<button class="sightedit-dashboard-btn" onclick="window.sightEditDashboard.exportData()">Export</button>' : ''}
          ${this.config.collapsible ? '<button class="sightedit-dashboard-btn" onclick="window.sightEditDashboard.toggleCollapse()">−</button>' : ''}
          <button class="sightedit-dashboard-btn" onclick="window.sightEditDashboard.hide()">×</button>
        </div>
      </div>
      ${this.config.showTabs ? '<div class="sightedit-dashboard-tabs"></div>' : ''}
      <div class="sightedit-dashboard-content"></div>
    `;

    // Make dashboard draggable
    if (this.config.draggable) {
      this.makeDraggable();
    }

    // Expose methods to window for button callbacks
    (window as any).sightEditDashboard = this;

    this.renderTabs();
    this.setActiveTab(this.config.defaultTab || this.tabs[0]?.id);
  }

  private renderTabs(): void {
    if (!this.container || !this.config.showTabs) return;

    const tabsContainer = this.container.querySelector('.sightedit-dashboard-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = this.tabs.map(tab => `
      <button class="sightedit-dashboard-tab ${tab.id === this.activeTab ? 'active' : ''}" 
              onclick="window.sightEditDashboard.setActiveTab('${tab.id}')">
        ${tab.icon ? tab.icon + ' ' : ''}${tab.name}
      </button>
    `).join('');
  }

  private renderActiveTab(): void {
    if (!this.container) return;

    const contentContainer = this.container.querySelector('.sightedit-dashboard-content');
    if (!contentContainer) return;

    const activeTabData = this.tabs.find(t => t.id === this.activeTab);
    if (!activeTabData) return;

    const component = activeTabData.component;

    switch (component.type) {
      case 'custom':
        this.renderCustomComponent(contentContainer as HTMLElement, component);
        break;
      case 'table':
        this.renderTableComponent(contentContainer as HTMLElement, component);
        break;
      case 'log':
        this.renderLogComponent(contentContainer as HTMLElement, component);
        break;
      case 'chart':
        this.renderChartComponent(contentContainer as HTMLElement, component);
        break;
      case 'status':
        this.renderStatusComponent(contentContainer as HTMLElement, component);
        break;
      default:
        contentContainer.innerHTML = `<div>Unknown component type: ${component.type}</div>`;
    }
  }

  private renderCustomComponent(container: HTMLElement, component: DashboardComponent): void {
    if (component.config.metrics) {
      const html = `
        <h3>${component.title}</h3>
        <div class="sightedit-metric-grid">
          ${component.config.metrics.map((metric: MetricConfig) => `
            <div class="sightedit-metric-card" data-metric="${metric.label}">
              <div class="sightedit-metric-label">${metric.label}</div>
              <div class="sightedit-metric-value">
                <span class="value">Loading...</span>
                <span class="sightedit-metric-unit">${metric.unit || ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      container.innerHTML = html;

      // Load metric values
      component.config.metrics.forEach(async (metric: MetricConfig) => {
        try {
          const value = typeof metric.value === 'function' ? await metric.value() : metric.value;
          const card = container.querySelector(`[data-metric="${metric.label}"] .value`);
          if (card) {
            card.textContent = this.formatMetricValue(value, metric.format);
          }
        } catch (error) {
          console.error(`Error loading metric ${metric.label}:`, error);
        }
      });
    }
  }

  private renderTableComponent(container: HTMLElement, component: DashboardComponent): void {
    const data = this.getCachedData(component.config.dataSource);
    
    const html = `
      <h3>${component.title}</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              ${component.config.columns.map((col: string) => 
                `<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${col}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${data ? data.slice(0, component.config.maxRows || 50).map((row: any) => `
              <tr>
                ${component.config.columns.map((col: string) => 
                  `<td style="border: 1px solid #ddd; padding: 8px;">${row[col.toLowerCase()] || '-'}</td>`
                ).join('')}
              </tr>
            `).join('') : '<tr><td colspan="100%">Loading...</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
  }

  private renderLogComponent(container: HTMLElement, component: DashboardComponent): void {
    const logger = StructuredLogger.getInstance();
    const logs = logger.getBuffer().slice(-component.config.maxEntries || 100);
    
    const html = `
      <h3>${component.title}</h3>
      <div style="height: 400px; overflow-y: auto; border: 1px solid #ddd;">
        ${logs.map(log => `
          <div class="sightedit-log-entry sightedit-log-${log.level === 0 ? 'debug' : log.level === 1 ? 'info' : log.level === 2 ? 'warn' : 'error'}">
            <span style="color: #666;">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span style="font-weight: 600;">[${['DEBUG', 'INFO', 'WARN', 'ERROR'][log.level]}]</span>
            ${log.message}
          </div>
        `).join('')}
      </div>
    `;
    
    container.innerHTML = html;
  }

  private renderChartComponent(container: HTMLElement, component: DashboardComponent): void {
    // This would integrate with a charting library like Chart.js or D3
    const html = `
      <h3>${component.title}</h3>
      <div class="sightedit-chart-container">
        <div style="text-align: center; padding: 100px 0; color: #666;">
          Chart visualization would be rendered here<br>
          <small>Requires chart library integration</small>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  private renderStatusComponent(container: HTMLElement, component: DashboardComponent): void {
    const html = `
      <h3>${component.title}</h3>
      <div class="sightedit-status-grid">
        ${component.config.checks.map((check: string) => `
          <div class="sightedit-status-item" data-check="${check}">
            <div class="sightedit-status-indicator sightedit-status-healthy"></div>
            <div>${check.charAt(0).toUpperCase() + check.slice(1)}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    container.innerHTML = html;
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      if (this.isVisible && !this.isCollapsed) {
        this.refreshAll();
      }
    }, this.config.refreshInterval);
  }

  private refreshAll(): void {
    // Clear cache
    this.dataCache.clear();
    
    // Re-render active tab
    this.renderActiveTab();
  }

  private getCachedData(source: string): any {
    const cached = this.dataCache.get(source);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Load fresh data
    const data = this.loadDataSource(source);
    this.dataCache.set(source, { data, timestamp: Date.now() });
    return data;
  }

  private loadDataSource(source: string): any {
    switch (source) {
      case 'errors':
        return ErrorHandler.getRecentErrors(50).map(error => ({
          time: new Date(error.timestamp).toLocaleTimeString(),
          type: error.type,
          message: error.message.substring(0, 100),
          severity: error.severity || 'medium'
        }));
      case 'performance':
        // This would return performance data
        return [];
      default:
        return [];
    }
  }

  private getTabData(tab: DashboardTab): any {
    // Get data for tab export
    return {
      name: tab.name,
      type: tab.component.type,
      data: this.getCachedData(tab.id)
    };
  }

  private formatMetricValue(value: any, format?: string): string {
    if (typeof value === 'number') {
      switch (format) {
        case 'percentage':
          return `${Math.round(value)}%`;
        case 'bytes':
          return this.formatBytes(value);
        case 'duration':
          return this.formatUptime(value);
        default:
          return value.toLocaleString();
      }
    }
    return String(value);
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private getMemoryUsagePercent(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);
    }
    return 0;
  }

  private makeDraggable(): void {
    if (!this.container) return;

    const header = this.container.querySelector('.sightedit-dashboard-header') as HTMLElement;
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.container!.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = Math.max(0, Math.min(window.innerWidth - this.config.width!, startLeft + deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - this.config.height!, startTop + deltaY));
      
      this.container!.style.left = newLeft + 'px';
      this.container!.style.top = newTop + 'px';
      this.container!.style.right = 'auto';
      this.container!.style.bottom = 'auto';
    };

    const handleMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }

  toggleCollapse(): void {
    if (!this.container) return;

    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      this.container.style.height = '50px';
      const content = this.container.querySelector('.sightedit-dashboard-content') as HTMLElement;
      const tabs = this.container.querySelector('.sightedit-dashboard-tabs') as HTMLElement;
      if (content) content.style.display = 'none';
      if (tabs) tabs.style.display = 'none';
    } else {
      this.container.style.height = this.config.height + 'px';
      const content = this.container.querySelector('.sightedit-dashboard-content') as HTMLElement;
      const tabs = this.container.querySelector('.sightedit-dashboard-tabs') as HTMLElement;
      if (content) content.style.display = 'block';
      if (tabs) tabs.style.display = 'flex';
    }
  }
}

// Global instance
export const dashboard = MonitoringDashboard.getInstance();

// Convenience functions
export const monitoring = {
  init: (config?: Partial<DashboardConfig>) => dashboard.init(config),
  show: () => dashboard.show(),
  hide: () => dashboard.hide(),
  toggle: () => dashboard.toggle(),
  addTab: (tab: DashboardTab) => dashboard.addTab(tab),
  export: () => dashboard.exportData()
};