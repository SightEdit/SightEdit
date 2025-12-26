/**
 * Debug Panel
 *
 * Visual debug panel for SightEdit development
 */

export interface DebugPanelConfig {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  hotkey?: string; // Default: 'Ctrl+Shift+D'
  defaultOpen?: boolean;
  enableEventLog?: boolean;
  enablePerformance?: boolean;
  enableStateInspector?: boolean;
}

export interface DebugEvent {
  id: string;
  type: string;
  timestamp: number;
  data: any;
  duration?: number;
}

export class DebugPanel {
  private static instance: DebugPanel | null = null;
  private config: DebugPanelConfig;
  private container: HTMLElement | null = null;
  private isOpen: boolean = false;
  private events: DebugEvent[] = [];
  private maxEvents: number = 1000;

  private constructor(config: DebugPanelConfig = {}) {
    this.config = {
      position: 'bottom-right',
      hotkey: 'Ctrl+Shift+D',
      defaultOpen: false,
      enableEventLog: true,
      enablePerformance: true,
      enableStateInspector: true,
      ...config
    };

    this.setupHotkey();

    if (this.config.defaultOpen) {
      this.open();
    }
  }

  static getInstance(config?: DebugPanelConfig): DebugPanel {
    if (!DebugPanel.instance) {
      DebugPanel.instance = new DebugPanel(config);
    }
    return DebugPanel.instance;
  }

  private setupHotkey(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  open(): void {
    if (this.isOpen) return;

    this.container = this.createPanel();
    document.body.appendChild(this.container);
    this.isOpen = true;
  }

  close(): void {
    if (!this.isOpen || !this.container) return;

    this.container.remove();
    this.container = null;
    this.isOpen = false;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  logEvent(type: string, data: any, duration?: number): void {
    if (!this.config.enableEventLog) return;

    const event: DebugEvent = {
      id: `event-${Date.now()}-${Math.random()}`,
      type,
      timestamp: Date.now(),
      data,
      duration
    };

    this.events.unshift(event);

    // Limit events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    // Update UI if open
    if (this.isOpen && this.container) {
      this.updateEventLog();
    }
  }

  clearEvents(): void {
    this.events = [];
    if (this.isOpen && this.container) {
      this.updateEventLog();
    }
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'sightedit-debug-panel';
    panel.style.cssText = this.getPanelStyles();

    panel.innerHTML = `
      <div class="se-debug-header" style="${this.getHeaderStyles()}">
        <span style="font-weight: 600;">🛠️ SightEdit Debug</span>
        <div style="display: flex; gap: 8px;">
          <button class="se-debug-minimize" style="${this.getButtonStyles()}">−</button>
          <button class="se-debug-close" style="${this.getButtonStyles()}">✕</button>
        </div>
      </div>

      <div class="se-debug-tabs" style="${this.getTabsStyles()}">
        <button class="se-debug-tab active" data-tab="events" style="${this.getTabStyles()}">Events</button>
        <button class="se-debug-tab" data-tab="performance" style="${this.getTabStyles()}">Performance</button>
        <button class="se-debug-tab" data-tab="state" style="${this.getTabStyles()}">State</button>
        <button class="se-debug-tab" data-tab="network" style="${this.getTabStyles()}">Network</button>
      </div>

      <div class="se-debug-content" style="${this.getContentStyles()}">
        <div class="se-debug-pane" data-pane="events" style="display: block;">
          <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #374151;">
            <span style="font-size: 14px; font-weight: 500; color: #d1d5db;">Event Log</span>
            <button class="se-debug-clear" style="${this.getSmallButtonStyles()}">Clear</button>
          </div>
          <div class="se-debug-events" style="${this.getEventsListStyles()}">
            <div style="padding: 20px; text-align: center; color: #6b7280;">
              No events yet
            </div>
          </div>
        </div>

        <div class="se-debug-pane" data-pane="performance" style="display: none;">
          <div style="padding: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #d1d5db; font-size: 16px;">Performance Metrics</h3>
            <div class="se-debug-metrics"></div>
          </div>
        </div>

        <div class="se-debug-pane" data-pane="state" style="display: none;">
          <div style="padding: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #d1d5db; font-size: 16px;">State Inspector</h3>
            <div class="se-debug-state"></div>
          </div>
        </div>

        <div class="se-debug-pane" data-pane="network" style="display: none;">
          <div style="padding: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #d1d5db; font-size: 16px;">Network Requests</h3>
            <div class="se-debug-network"></div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners(panel);
    this.updateEventLog();
    this.updatePerformanceMetrics();

    return panel;
  }

  private setupEventListeners(panel: HTMLElement): void {
    // Close button
    const closeBtn = panel.querySelector('.se-debug-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Minimize button
    const minimizeBtn = panel.querySelector('.se-debug-minimize');
    minimizeBtn?.addEventListener('click', () => {
      const content = panel.querySelector('.se-debug-content') as HTMLElement;
      const tabs = panel.querySelector('.se-debug-tabs') as HTMLElement;

      if (content.style.display === 'none') {
        content.style.display = 'flex';
        tabs.style.display = 'flex';
        (minimizeBtn as HTMLElement).textContent = '−';
      } else {
        content.style.display = 'none';
        tabs.style.display = 'none';
        (minimizeBtn as HTMLElement).textContent = '+';
      }
    });

    // Clear button
    const clearBtn = panel.querySelector('.se-debug-clear');
    clearBtn?.addEventListener('click', () => this.clearEvents());

    // Tab switching
    const tabs = panel.querySelectorAll('.se-debug-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding pane
        const panes = panel.querySelectorAll('.se-debug-pane');
        panes.forEach(pane => {
          (pane as HTMLElement).style.display =
            pane.getAttribute('data-pane') === tabName ? 'block' : 'none';
        });

        // Update content for active tab
        if (tabName === 'performance') {
          this.updatePerformanceMetrics();
        } else if (tabName === 'state') {
          this.updateStateInspector();
        } else if (tabName === 'network') {
          this.updateNetworkLog();
        }
      });
    });
  }

  private updateEventLog(): void {
    if (!this.container) return;

    const eventsList = this.container.querySelector('.se-debug-events');
    if (!eventsList) return;

    if (this.events.length === 0) {
      eventsList.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #6b7280;">
          No events yet
        </div>
      `;
      return;
    }

    eventsList.innerHTML = this.events.map(event => `
      <div style="padding: 12px; border-bottom: 1px solid #374151; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="color: #8b5cf6; font-weight: 600;">${this.escapeHtml(event.type)}</span>
          <span style="color: #6b7280; font-size: 11px;">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="color: #9ca3af; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;">
          ${this.formatEventData(event.data)}
        </div>
        ${event.duration ? `<div style="color: #10b981; font-size: 11px; margin-top: 4px;">⏱️ ${event.duration.toFixed(2)}ms</div>` : ''}
      </div>
    `).join('');
  }

  private updatePerformanceMetrics(): void {
    if (!this.container) return;

    const metricsDiv = this.container.querySelector('.se-debug-metrics');
    if (!metricsDiv) return;

    const performance = (window as any).performance;
    const memory = (performance as any).memory;

    const metrics = [
      {
        label: 'Page Load Time',
        value: performance.timing ? `${(performance.timing.loadEventEnd - performance.timing.navigationStart).toFixed(0)}ms` : 'N/A'
      },
      {
        label: 'DOM Content Loaded',
        value: performance.timing ? `${(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart).toFixed(0)}ms` : 'N/A'
      },
      {
        label: 'Memory Used',
        value: memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB` : 'N/A'
      },
      {
        label: 'Memory Limit',
        value: memory ? `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB` : 'N/A'
      },
      {
        label: 'Total Events',
        value: this.events.length.toString()
      }
    ];

    metricsDiv.innerHTML = metrics.map(metric => `
      <div style="padding: 12px; background: #374151; border-radius: 6px; margin-bottom: 12px;">
        <div style="color: #9ca3af; font-size: 12px; margin-bottom: 4px;">${metric.label}</div>
        <div style="color: #d1d5db; font-size: 20px; font-weight: 600;">${metric.value}</div>
      </div>
    `).join('');
  }

  private updateStateInspector(): void {
    if (!this.container) return;

    const stateDiv = this.container.querySelector('.se-debug-state');
    if (!stateDiv) return;

    // Get SightEdit instance state
    const state = {
      mode: document.body.dataset.sightEditMode || 'view',
      activeEditors: document.querySelectorAll('[data-sight-edit-ready]').length,
      changedElements: this.events.filter(e => e.type.includes('change')).length
    };

    stateDiv.innerHTML = `
      <pre style="background: #374151; padding: 16px; border-radius: 6px; color: #d1d5db; font-size: 12px; overflow: auto; max-height: 400px;">
${JSON.stringify(state, null, 2)}
      </pre>
    `;
  }

  private updateNetworkLog(): void {
    if (!this.container) return;

    const networkDiv = this.container.querySelector('.se-debug-network');
    if (!networkDiv) return;

    const networkEvents = this.events.filter(e =>
      e.type.includes('network') || e.type.includes('save') || e.type.includes('fetch')
    );

    if (networkEvents.length === 0) {
      networkDiv.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #6b7280;">
          No network activity
        </div>
      `;
      return;
    }

    networkDiv.innerHTML = networkEvents.map(event => `
      <div style="padding: 12px; background: #374151; border-radius: 6px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #8b5cf6; font-weight: 600;">${this.escapeHtml(event.type)}</span>
          <span style="color: #6b7280; font-size: 11px;">${new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
        <pre style="color: #9ca3af; font-size: 12px; margin: 0; white-space: pre-wrap; word-break: break-word;">
${this.formatEventData(event.data)}
        </pre>
      </div>
    `).join('');
  }

  private formatEventData(data: any): string {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getPanelStyles(): string {
    const positions = {
      'top-left': 'top: 20px; left: 20px;',
      'top-right': 'top: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;'
    };

    return `
      position: fixed;
      ${positions[this.config.position!]}
      width: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 40px);
      background: #1f2937;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f3f4f6;
    `;
  }

  private getHeaderStyles(): string {
    return `
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: white;
      font-size: 14px;
    `;
  }

  private getButtonStyles(): string {
    return `
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: rgba(255,255,255,0.2);
      color: white;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;
  }

  private getSmallButtonStyles(): string {
    return `
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid #4b5563;
      background: #374151;
      color: #d1d5db;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    `;
  }

  private getTabsStyles(): string {
    return `
      display: flex;
      background: #111827;
      border-bottom: 1px solid #374151;
      padding: 0 12px;
    `;
  }

  private getTabStyles(): string {
    return `
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    `;
  }

  private getContentStyles(): string {
    return `
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;
  }

  private getEventsListStyles(): string {
    return `
      flex: 1;
      overflow-y: auto;
    `;
  }
}

// Export singleton
export const debugPanel = DebugPanel.getInstance();

// Convenience function
export function enableDebugMode(config?: DebugPanelConfig): DebugPanel {
  const panel = DebugPanel.getInstance(config);
  panel.open();
  return panel;
}
