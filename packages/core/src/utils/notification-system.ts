/**
 * User-friendly notification system for displaying errors and status updates
 */

import { ErrorType, ErrorDetails, UserErrorMessages } from './error-handler';
import { log } from './logger';

export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  LOADING = 'loading'
}

export interface NotificationConfig {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // Auto-dismiss after ms (0 = no auto-dismiss)
  persistent?: boolean;
  actions?: NotificationAction[];
  icon?: string;
  showProgress?: boolean;
  dismissible?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  className?: string;
  onShow?: () => void;
  onDismiss?: () => void;
  onAction?: (actionId: string) => void;
}

export interface NotificationAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export interface ActiveNotification extends NotificationConfig {
  id: string;
  timestamp: number;
  progress?: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Notification system for user-friendly error and status reporting
 */
export class NotificationSystem {
  private static instance: NotificationSystem;
  private notifications: Map<string, ActiveNotification> = new Map();
  private container: HTMLElement | null = null;
  private maxNotifications = 5;
  private defaultDuration = 5000; // 5 seconds
  private listeners: Array<(notifications: ActiveNotification[]) => void> = [];
  private notificationCounter = 0;

  static getInstance(): NotificationSystem {
    if (!this.instance) {
      this.instance = new NotificationSystem();
    }
    return this.instance;
  }

  /**
   * Initialize the notification system
   */
  init(options?: {
    maxNotifications?: number;
    defaultDuration?: number;
    container?: HTMLElement;
  }): void {
    if (options?.maxNotifications) {
      this.maxNotifications = options.maxNotifications;
    }
    
    if (options?.defaultDuration) {
      this.defaultDuration = options.defaultDuration;
    }
    
    if (options?.container) {
      this.container = options.container;
    } else {
      this.createDefaultContainer();
    }

    log.info('Notification system initialized', {
      component: 'NotificationSystem',
      maxNotifications: this.maxNotifications,
      defaultDuration: this.defaultDuration
    });
  }

  /**
   * Show a notification
   */
  show(config: Omit<NotificationConfig, 'id'> & { id?: string }): string {
    const id = config.id || this.generateId();
    const duration = config.duration !== undefined ? config.duration : this.defaultDuration;
    
    // Remove existing notification with same ID if it exists
    if (this.notifications.has(id)) {
      this.dismiss(id);
    }

    // Create notification
    const notification: ActiveNotification = {
      ...config,
      id,
      timestamp: Date.now(),
      dismissible: config.dismissible !== false,
      position: config.position || 'top-right'
    };

    // Auto-dismiss if duration is set
    if (duration > 0 && !config.persistent) {
      notification.timeoutId = setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    // Add to notifications
    this.notifications.set(id, notification);

    // Enforce max notifications limit
    this.enforceMaxNotifications();

    // Render notification
    this.renderNotification(notification);

    // Call onShow callback
    if (config.onShow) {
      try {
        config.onShow();
      } catch (error) {
        log.error('Error in notification onShow callback', {
          component: 'NotificationSystem',
          error: (error as Error).message
        });
      }
    }

    // Notify listeners
    this.notifyListeners();

    log.debug('Notification shown', {
      component: 'NotificationSystem',
      notificationId: id,
      type: config.type
    });

    return id;
  }

  /**
   * Show success notification
   */
  success(message: string, options?: Partial<NotificationConfig>): string {
    return this.show({
      type: NotificationType.SUCCESS,
      title: 'Success',
      message,
      icon: '✅',
      ...options
    });
  }

  /**
   * Show error notification
   */
  error(error: Error | string, options?: Partial<NotificationConfig>): string {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const userMessage = typeof error === 'string' 
      ? { message: error, action: 'dismiss' } 
      : UserErrorMessages.getMessageFor(error);

    return this.show({
      type: NotificationType.ERROR,
      title: 'Error',
      message: userMessage.message,
      icon: '❌',
      persistent: true,
      actions: this.getErrorActions(userMessage.action),
      ...options
    });
  }

  /**
   * Show warning notification
   */
  warning(message: string, options?: Partial<NotificationConfig>): string {
    return this.show({
      type: NotificationType.WARNING,
      title: 'Warning',
      message,
      icon: '⚠️',
      duration: 7000, // Slightly longer for warnings
      ...options
    });
  }

  /**
   * Show info notification
   */
  info(message: string, options?: Partial<NotificationConfig>): string {
    return this.show({
      type: NotificationType.INFO,
      title: 'Information',
      message,
      icon: 'ℹ️',
      ...options
    });
  }

  /**
   * Show loading notification
   */
  loading(message: string, options?: Partial<NotificationConfig>): string {
    return this.show({
      type: NotificationType.LOADING,
      title: 'Loading',
      message,
      icon: '⏳',
      persistent: true,
      dismissible: false,
      showProgress: true,
      ...options
    });
  }

  /**
   * Update notification progress
   */
  updateProgress(id: string, progress: number): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.progress = Math.max(0, Math.min(100, progress));
      this.renderNotification(notification);
    }
  }

  /**
   * Dismiss a notification
   */
  dismiss(id: string): void {
    const notification = this.notifications.get(id);
    if (!notification) return;

    // Clear timeout if exists
    if (notification.timeoutId) {
      clearTimeout(notification.timeoutId);
    }

    // Remove from DOM
    this.removeNotificationFromDOM(id);

    // Remove from map
    this.notifications.delete(id);

    // Call onDismiss callback
    if (notification.onDismiss) {
      try {
        notification.onDismiss();
      } catch (error) {
        log.error('Error in notification onDismiss callback', {
          component: 'NotificationSystem',
          error: (error as Error).message
        });
      }
    }

    // Notify listeners
    this.notifyListeners();

    log.debug('Notification dismissed', {
      component: 'NotificationSystem',
      notificationId: id
    });
  }

  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    const ids = Array.from(this.notifications.keys());
    ids.forEach(id => this.dismiss(id));
  }

  /**
   * Get all active notifications
   */
  getNotifications(): ActiveNotification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Add listener for notification changes
   */
  addListener(listener: (notifications: ActiveNotification[]) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Handle notification action
   */
  handleAction(notificationId: string, actionId: string): void {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    // Call onAction callback
    if (notification.onAction) {
      try {
        notification.onAction(actionId);
      } catch (error) {
        log.error('Error in notification onAction callback', {
          component: 'NotificationSystem',
          error: (error as Error).message
        });
      }
    }

    // Handle common actions
    switch (actionId) {
      case 'dismiss':
        this.dismiss(notificationId);
        break;
      case 'retry':
        // This would typically be handled by the calling code
        this.dismiss(notificationId);
        break;
      case 'refresh':
        window.location.reload();
        break;
    }

    log.debug('Notification action handled', {
      component: 'NotificationSystem',
      notificationId,
      actionId
    });
  }

  /**
   * Show notification for error details
   */
  showForError(errorDetails: ErrorDetails): string {
    const userMessage = UserErrorMessages.getMessageFor(errorDetails.message);
    
    let title = 'Error';
    let icon = '❌';
    let duration = this.defaultDuration;

    // Customize based on error type and severity
    switch (errorDetails.type) {
      case ErrorType.NETWORK:
        title = 'Connection Error';
        icon = '🌐';
        duration = 8000;
        break;
      case ErrorType.AUTHENTICATION:
        title = 'Authentication Required';
        icon = '🔐';
        duration = 0; // Persistent
        break;
      case ErrorType.VALIDATION:
        title = 'Validation Error';
        icon = '⚠️';
        duration = 6000;
        break;
      case ErrorType.SECURITY:
        title = 'Security Alert';
        icon = '🛡️';
        duration = 0; // Persistent
        break;
    }

    const actions = this.getErrorActions(userMessage.action, errorDetails.retryable);

    return this.show({
      type: NotificationType.ERROR,
      title,
      message: userMessage.message,
      icon,
      duration,
      persistent: errorDetails.severity === 'critical' || !errorDetails.recoverable,
      actions,
      onAction: (actionId) => {
        // Handle error-specific actions
        if (actionId === 'details' && process.env.NODE_ENV === 'development') {
          console.group('Error Details');
          console.error('Error:', errorDetails);
          console.groupEnd();
        }
      }
    });
  }

  private createDefaultContainer(): void {
    if (typeof document === 'undefined') return;

    this.container = document.createElement('div');
    this.container.id = 'sightedit-notifications';
    this.container.setAttribute('style', `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      pointer-events: none;
    `);
    
    document.body.appendChild(this.container);
  }

  private renderNotification(notification: ActiveNotification): void {
    if (!this.container || typeof document === 'undefined') return;

    // Remove existing notification element if it exists
    this.removeNotificationFromDOM(notification.id);

    const element = this.createNotificationElement(notification);
    this.container.appendChild(element);

    // Animate in
    requestAnimationFrame(() => {
      element.style.transform = 'translateX(0)';
      element.style.opacity = '1';
    });
  }

  private createNotificationElement(notification: ActiveNotification): HTMLElement {
    const element = document.createElement('div');
    element.id = `notification-${notification.id}`;
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-live', 'polite');
    
    const baseStyles = `
      max-width: 400px;
      margin-bottom: 12px;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;

    const typeStyles = this.getTypeStyles(notification.type);
    element.setAttribute('style', baseStyles + typeStyles + (notification.className || ''));

    // Create content
    const content = this.createNotificationContent(notification);
    element.innerHTML = content;

    // Add event listeners
    this.addNotificationEventListeners(element, notification);

    return element;
  }

  private createNotificationContent(notification: ActiveNotification): string {
    const { icon, title, message, actions, showProgress, progress, dismissible } = notification;

    let html = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        ${icon ? `<div style="font-size: 20px; line-height: 1;">${icon}</div>` : ''}
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
          <div style="color: rgba(0, 0, 0, 0.8);">${message}</div>
          ${showProgress && progress !== undefined ? `
            <div style="margin-top: 8px; background: rgba(0, 0, 0, 0.1); border-radius: 4px; height: 4px; overflow: hidden;">
              <div style="background: currentColor; height: 100%; width: ${progress}%; transition: width 0.3s ease;"></div>
            </div>
          ` : ''}
          ${actions && actions.length > 0 ? `
            <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
              ${actions.map(action => `
                <button 
                  data-action="${action.id}"
                  style="
                    padding: 6px 12px;
                    border: 1px solid currentColor;
                    border-radius: 4px;
                    background: ${action.variant === 'primary' ? 'currentColor' : 'transparent'};
                    color: ${action.variant === 'primary' ? 'white' : 'currentColor'};
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    opacity: ${action.disabled ? '0.5' : '1'};
                  "
                  ${action.disabled ? 'disabled' : ''}
                >
                  ${action.label}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${dismissible ? `
          <button 
            data-action="dismiss"
            style="
              padding: 4px;
              border: none;
              background: transparent;
              color: rgba(0, 0, 0, 0.5);
              font-size: 16px;
              line-height: 1;
              cursor: pointer;
            "
            aria-label="Dismiss notification"
          >
            ×
          </button>
        ` : ''}
      </div>
    `;

    return html;
  }

  private addNotificationEventListeners(element: HTMLElement, notification: ActiveNotification): void {
    element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        this.handleAction(notification.id, action);
      }
    });

    // Auto-hide on hover pause (for non-persistent notifications)
    if (notification.timeoutId && !notification.persistent) {
      element.addEventListener('mouseenter', () => {
        if (notification.timeoutId) {
          clearTimeout(notification.timeoutId);
          notification.timeoutId = undefined;
        }
      });

      element.addEventListener('mouseleave', () => {
        const remainingTime = notification.duration || this.defaultDuration;
        notification.timeoutId = setTimeout(() => {
          this.dismiss(notification.id);
        }, remainingTime / 4); // Quarter of original time
      });
    }
  }

  private getTypeStyles(type: NotificationType): string {
    switch (type) {
      case NotificationType.SUCCESS:
        return 'background: #f0f9ff; border: 1px solid #06b6d4; color: #0e7490;';
      case NotificationType.ERROR:
        return 'background: #fef2f2; border: 1px solid #ef4444; color: #dc2626;';
      case NotificationType.WARNING:
        return 'background: #fffbeb; border: 1px solid #f59e0b; color: #d97706;';
      case NotificationType.INFO:
        return 'background: #f0f9ff; border: 1px solid #3b82f6; color: #1d4ed8;';
      case NotificationType.LOADING:
        return 'background: #f9fafb; border: 1px solid #6b7280; color: #374151;';
      default:
        return 'background: white; border: 1px solid #e5e7eb; color: #374151;';
    }
  }

  private getErrorActions(suggestedAction?: string, retryable?: boolean): NotificationAction[] {
    const actions: NotificationAction[] = [
      { id: 'dismiss', label: 'Dismiss', variant: 'secondary' }
    ];

    if (retryable || suggestedAction === 'retry' || suggestedAction === 'auto_retry') {
      actions.unshift({ id: 'retry', label: 'Retry', variant: 'primary' });
    }

    if (suggestedAction === 'refresh') {
      actions.unshift({ id: 'refresh', label: 'Refresh Page', variant: 'primary' });
    }

    if (process.env.NODE_ENV === 'development') {
      actions.push({ id: 'details', label: 'Details', variant: 'secondary' });
    }

    return actions;
  }

  private removeNotificationFromDOM(id: string): void {
    if (typeof document === 'undefined') return;

    const element = document.getElementById(`notification-${id}`);
    if (element) {
      element.style.transform = 'translateX(100%)';
      element.style.opacity = '0';
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 300);
    }
  }

  private enforceMaxNotifications(): void {
    const notifications = Array.from(this.notifications.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    if (notifications.length > this.maxNotifications) {
      const toRemove = notifications.slice(0, notifications.length - this.maxNotifications);
      toRemove.forEach(notification => {
        if (!notification.persistent) {
          this.dismiss(notification.id);
        }
      });
    }
  }

  private notifyListeners(): void {
    const notifications = this.getNotifications();
    this.listeners.forEach(listener => {
      try {
        listener(notifications);
      } catch (error) {
        log.error('Error in notification listener', {
          component: 'NotificationSystem',
          error: (error as Error).message
        });
      }
    });
  }

  private generateId(): string {
    return `notification_${Date.now()}_${++this.notificationCounter}`;
  }
}

// Global instance
export const notifications = NotificationSystem.getInstance();

// Convenience functions
export const notify = {
  success: (message: string, options?: Partial<NotificationConfig>) => 
    notifications.success(message, options),
  
  error: (error: Error | string, options?: Partial<NotificationConfig>) => 
    notifications.error(error, options),
  
  warning: (message: string, options?: Partial<NotificationConfig>) => 
    notifications.warning(message, options),
  
  info: (message: string, options?: Partial<NotificationConfig>) => 
    notifications.info(message, options),
  
  loading: (message: string, options?: Partial<NotificationConfig>) => 
    notifications.loading(message, options),
  
  dismiss: (id: string) => notifications.dismiss(id),
  
  dismissAll: () => notifications.dismissAll(),
  
  updateProgress: (id: string, progress: number) => 
    notifications.updateProgress(id, progress),
  
  showForError: (errorDetails: ErrorDetails) => 
    notifications.showForError(errorDetails)
};