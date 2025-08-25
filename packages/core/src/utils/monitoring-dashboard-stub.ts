/**
 * Stub implementation of monitoring dashboard
 */

export interface MonitoringDashboardConfig {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  theme?: 'light' | 'dark';
  showMetrics?: string[];
  refreshInterval?: number;
}

export class MonitoringDashboard {
  private config: MonitoringDashboardConfig;
  private visible = false;

  constructor(config: MonitoringDashboardConfig = {}) {
    this.config = {
      enabled: false,
      position: 'bottom-right',
      theme: 'dark',
      showMetrics: ['performance', 'errors', 'memory'],
      refreshInterval: 5000,
      ...config
    };

    console.warn('MonitoringDashboard initialized in stub mode');
  }

  show(): void {
    this.visible = true;
    console.warn('MonitoringDashboard.show called (stubbed)');
  }

  hide(): void {
    this.visible = false;
    console.warn('MonitoringDashboard.hide called (stubbed)');
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateMetrics(metrics: Record<string, any>): void {
    console.warn('MonitoringDashboard.updateMetrics called (stubbed):', metrics);
  }

  addAlert(alert: { level: 'info' | 'warning' | 'error', message: string, timestamp?: number }): void {
    console.warn('MonitoringDashboard.addAlert called (stubbed):', alert);
  }

  clearAlerts(): void {
    console.warn('MonitoringDashboard.clearAlerts called (stubbed)');
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.config.theme = theme;
    console.warn('MonitoringDashboard.setTheme called (stubbed):', theme);
  }

  destroy(): void {
    this.visible = false;
    console.warn('MonitoringDashboard.destroy called (stubbed)');
  }
}