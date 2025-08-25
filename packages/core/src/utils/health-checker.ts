import { EventEmitter } from './event-emitter';
import { SafeJSONParser } from './safe-json';

export interface HealthCheck {
  name: string;
  category: 'critical' | 'important' | 'optional';
  description: string;
  check: () => Promise<HealthResult>;
  timeout: number; // milliseconds
  interval?: number; // milliseconds for periodic checks
}

export interface HealthResult {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  timestamp: number;
  duration: number; // milliseconds
}

export interface SystemHealth {
  overall: 'healthy' | 'warning' | 'error';
  score: number; // 0-100
  checks: Record<string, HealthResult>;
  lastUpdated: number;
  uptime: number;
}

export class HealthChecker extends EventEmitter {
  private checks = new Map<string, HealthCheck>();
  private results = new Map<string, HealthResult>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private startTime = Date.now();
  private isRunning = false;

  constructor() {
    super();
    this.registerDefaultChecks();
  }

  private registerDefaultChecks(): void {
    this.register(new APIHealthCheck());
    this.register(new StorageHealthCheck());
    this.register(new PerformanceHealthCheck());
    this.register(new SecurityHealthCheck());
    this.register(new ConnectivityHealthCheck());
    this.register(new BrowserHealthCheck());
    this.register(new MemoryHealthCheck());
    this.register(new EditorHealthCheck());
  }

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
    
    if (check.interval && this.isRunning) {
      this.schedulePeriodicCheck(check);
    }
    
    this.emit('checkRegistered', check.name);
  }

  unregister(name: string): boolean {
    const success = this.checks.delete(name);
    this.results.delete(name);
    
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
    
    if (success) {
      this.emit('checkUnregistered', name);
    }
    
    return success;
  }

  async runCheck(name: string): Promise<HealthResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = Date.now();
    this.emit('checkStarted', name);

    try {
      const result = await Promise.race([
        check.check(),
        this.createTimeoutPromise(check.timeout)
      ]);

      result.timestamp = Date.now();
      result.duration = Date.now() - startTime;
      
      this.results.set(name, result);
      this.emit('checkCompleted', { name, result });
      
      return result;
    } catch (error) {
      const result: HealthResult = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        duration: Date.now() - startTime
      };
      
      this.results.set(name, result);
      this.emit('checkFailed', { name, result, error });
      
      return result;
    }
  }

  async runAllChecks(): Promise<SystemHealth> {
    const checkPromises = Array.from(this.checks.keys()).map(name => 
      this.runCheck(name).catch(error => ({
        status: 'error' as const,
        message: `Check failed: ${error.message}`,
        timestamp: Date.now(),
        duration: 0
      }))
    );

    await Promise.allSettled(checkPromises);
    return this.getSystemHealth();
  }

  async runCriticalChecks(): Promise<SystemHealth> {
    const criticalChecks = Array.from(this.checks.entries())
      .filter(([_, check]) => check.category === 'critical')
      .map(([name]) => name);

    const checkPromises = criticalChecks.map(name => 
      this.runCheck(name).catch(error => ({
        status: 'error' as const,
        message: `Critical check failed: ${error.message}`,
        timestamp: Date.now(),
        duration: 0
      }))
    );

    await Promise.allSettled(checkPromises);
    return this.getSystemHealth();
  }

  getSystemHealth(): SystemHealth {
    const checks: Record<string, HealthResult> = {};
    let totalScore = 0;
    let maxScore = 0;
    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

    for (const [name, check] of this.checks) {
      const result = this.results.get(name);
      if (result) {
        checks[name] = result;
        
        // Calculate weighted score
        const weight = check.category === 'critical' ? 3 : 
                      check.category === 'important' ? 2 : 1;
        const score = result.status === 'healthy' ? 100 :
                     result.status === 'warning' ? 50 : 0;
        
        totalScore += score * weight;
        maxScore += 100 * weight;
        
        // Update overall status
        if (result.status === 'error' && check.category === 'critical') {
          overallStatus = 'error';
        } else if (result.status === 'error' || result.status === 'warning') {
          if (overallStatus !== 'error') {
            overallStatus = 'warning';
          }
        }
      }
    }

    const score = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      overall: overallStatus,
      score,
      checks,
      lastUpdated: Date.now(),
      uptime: Date.now() - this.startTime
    };
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.emit('started');
    
    // Schedule periodic checks
    for (const check of this.checks.values()) {
      if (check.interval) {
        this.schedulePeriodicCheck(check);
      }
    }
    
    // Run initial check
    this.runAllChecks();
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.emit('stopped');
    
    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  private schedulePeriodicCheck(check: HealthCheck): void {
    if (!check.interval) return;
    
    const interval = setInterval(() => {
      this.runCheck(check.name);
    }, check.interval);
    
    this.intervals.set(check.name, interval);
  }

  private async createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  getCheckHistory(name: string, limit = 10): HealthResult[] {
    // In a real implementation, you'd store historical results
    const current = this.results.get(name);
    return current ? [current] : [];
  }

  exportHealthData(): string {
    const data = {
      systemHealth: this.getSystemHealth(),
      checks: Array.from(this.checks.entries()).map(([name, check]) => ({
        name,
        category: check.category,
        description: check.description,
        result: this.results.get(name)
      })),
      metadata: {
        exportTime: Date.now(),
        version: '1.0.0'
      }
    };
    
    return JSON.stringify(data, null, 2);
  }
}

// API Health Check
class APIHealthCheck implements HealthCheck {
  name = 'API Connection';
  category: 'critical' = 'critical';
  description = 'Checks if the SightEdit API is accessible and responding';
  timeout = 5000;
  interval = 30000; // Check every 30 seconds

  async check(): Promise<HealthResult> {
    try {
      const startTime = Date.now();
      const response = await fetch('/api/sightedit/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'error',
          message: `API returned status ${response.status}`,
          details: { status: response.status, responseTime },
          timestamp: 0,
          duration: 0
        };
      }

      const data = await response.json();

      return {
        status: responseTime < 1000 ? 'healthy' : 'warning',
        message: responseTime < 1000 ? 
          `API responding normally (${responseTime}ms)` :
          `API responding slowly (${responseTime}ms)`,
        details: { 
          responseTime,
          serverHealth: data
        },
        timestamp: 0,
        duration: 0
      };
    } catch (error) {
      return {
        status: 'error',
        message: `API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: 0,
        duration: 0
      };
    }
  }
}

// Storage Health Check
class StorageHealthCheck implements HealthCheck {
  name = 'Local Storage';
  category: 'important' = 'important';
  description = 'Checks local storage availability and quota usage';
  timeout = 2000;

  async check(): Promise<HealthResult> {
    try {
      // Test localStorage availability
      const testKey = 'sightedit_health_test';
      const testValue = Date.now().toString();
      
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      if (retrieved !== testValue) {
        return {
          status: 'error',
          message: 'Local storage read/write test failed',
          timestamp: 0,
          duration: 0
        };
      }

      // Check storage quota
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const usagePercent = quota > 0 ? (used / quota) * 100 : 0;

        const status = usagePercent > 90 ? 'error' :
                      usagePercent > 75 ? 'warning' : 'healthy';

        return {
          status,
          message: `Storage usage: ${Math.round(usagePercent)}%`,
          details: {
            used: Math.round(used / 1024 / 1024), // MB
            quota: Math.round(quota / 1024 / 1024), // MB
            usagePercent: Math.round(usagePercent)
          },
          timestamp: 0,
          duration: 0
        };
      }

      return {
        status: 'healthy',
        message: 'Local storage is available',
        timestamp: 0,
        duration: 0
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: 0,
        duration: 0
      };
    }
  }
}

// Performance Health Check
class PerformanceHealthCheck implements HealthCheck {
  name = 'Performance';
  category: 'important' = 'important';
  description = 'Monitors page performance metrics';
  timeout = 1000;
  interval = 60000; // Check every minute

  async check(): Promise<HealthResult> {
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (!navigation) {
        return {
          status: 'warning',
          message: 'Performance metrics not available',
          timestamp: 0,
          duration: 0
        };
      }

      const loadTime = navigation.loadEventEnd - navigation.navigationStart;
      const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.navigationStart;
      
      // Check memory usage if available
      let memoryInfo: any = {};
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        memoryInfo = {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
          limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) // MB
        };
      }

      const status = loadTime > 3000 ? 'warning' :
                    loadTime > 5000 ? 'error' : 'healthy';

      return {
        status,
        message: `Page loaded in ${Math.round(loadTime)}ms`,
        details: {
          loadTime: Math.round(loadTime),
          domContentLoaded: Math.round(domContentLoaded),
          memory: memoryInfo
        },
        timestamp: 0,
        duration: 0
      };
    } catch (error) {
      return {
        status: 'warning',
        message: `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: 0,
        duration: 0
      };
    }
  }
}

// Security Health Check
class SecurityHealthCheck implements HealthCheck {
  name = 'Security';
  category: 'critical' = 'critical';
  description = 'Checks security-related features and configurations';
  timeout = 2000;

  async check(): Promise<HealthResult> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check HTTPS
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      issues.push('Not using HTTPS');
    }

    // Check Content Security Policy
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!cspMeta) {
      warnings.push('No CSP meta tag found');
    }

    // Check for mixed content
    if (location.protocol === 'https:') {
      const insecureResources = Array.from(document.querySelectorAll('script, link, img'))
        .filter(el => {
          const src = el.getAttribute('src') || el.getAttribute('href');
          return src && src.startsWith('http://');
        });

      if (insecureResources.length > 0) {
        warnings.push(`${insecureResources.length} insecure resources found`);
      }
    }

    // Check for sensitive data exposure
    const scripts = Array.from(document.scripts);
    const sensitivePatterns = [/password\s*[:=]/i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i];
    
    for (const script of scripts) {
      for (const pattern of sensitivePatterns) {
        if (script.textContent && pattern.test(script.textContent)) {
          issues.push('Potential sensitive data exposure in scripts');
          break;
        }
      }
    }

    const status = issues.length > 0 ? 'error' :
                  warnings.length > 0 ? 'warning' : 'healthy';

    const allIssues = [...issues, ...warnings];
    const message = allIssues.length > 0 ? 
      allIssues.join('; ') : 
      'Security checks passed';

    return {
      status,
      message,
      details: {
        issues,
        warnings,
        https: location.protocol === 'https:',
        csp: !!cspMeta
      },
      timestamp: 0,
      duration: 0
    };
  }
}

// Connectivity Health Check
class ConnectivityHealthCheck implements HealthCheck {
  name = 'Connectivity';
  category: 'important' = 'important';
  description = 'Checks network connectivity and online status';
  timeout = 5000;
  interval = 30000;

  async check(): Promise<HealthResult> {
    const isOnline = navigator.onLine;
    
    if (!isOnline) {
      return {
        status: 'error',
        message: 'No network connection',
        details: { online: false },
        timestamp: 0,
        duration: 0
      };
    }

    // Test actual connectivity with a lightweight request
    try {
      const startTime = Date.now();
      const response = await fetch('/favicon.ico', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      const responseTime = Date.now() - startTime;

      const status = responseTime > 2000 ? 'warning' : 'healthy';

      return {
        status,
        message: `Network latency: ${responseTime}ms`,
        details: {
          online: true,
          latency: responseTime,
          connectionType: (navigator as any).connection?.effectiveType
        },
        timestamp: 0,
        duration: 0
      };
    } catch (error) {
      return {
        status: 'warning',
        message: 'Network connection issues detected',
        details: { 
          online: true,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: 0,
        duration: 0
      };
    }
  }
}

// Browser Health Check
class BrowserHealthCheck implements HealthCheck {
  name = 'Browser Compatibility';
  category: 'optional' = 'optional';
  description = 'Checks browser feature support';
  timeout = 1000;

  async check(): Promise<HealthResult> {
    const features = {
      localStorage: typeof localStorage !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      promises: typeof Promise !== 'undefined',
      es6Classes: true, // If this code runs, ES6 classes are supported
      mutationObserver: typeof MutationObserver !== 'undefined',
      customElements: typeof customElements !== 'undefined',
      webComponents: typeof ShadowRoot !== 'undefined'
    };

    const unsupported = Object.entries(features)
      .filter(([_, supported]) => !supported)
      .map(([feature]) => feature);

    const status = unsupported.length === 0 ? 'healthy' :
                  unsupported.length <= 2 ? 'warning' : 'error';

    const message = unsupported.length === 0 ?
      'All required features supported' :
      `Unsupported features: ${unsupported.join(', ')}`;

    return {
      status,
      message,
      details: {
        userAgent: navigator.userAgent,
        features,
        unsupported
      },
      timestamp: 0,
      duration: 0
    };
  }
}

// Memory Health Check
class MemoryHealthCheck implements HealthCheck {
  name = 'Memory Usage';
  category: 'optional' = 'optional';
  description = 'Monitors JavaScript memory usage';
  timeout = 1000;
  interval = 120000; // Check every 2 minutes

  async check(): Promise<HealthResult> {
    if (!('memory' in performance)) {
      return {
        status: 'healthy',
        message: 'Memory monitoring not available',
        timestamp: 0,
        duration: 0
      };
    }

    const memory = (performance as any).memory;
    const used = memory.usedJSHeapSize / 1024 / 1024; // MB
    const total = memory.totalJSHeapSize / 1024 / 1024; // MB
    const limit = memory.jsHeapSizeLimit / 1024 / 1024; // MB

    const usagePercent = (used / limit) * 100;

    const status = usagePercent > 90 ? 'error' :
                  usagePercent > 75 ? 'warning' : 'healthy';

    return {
      status,
      message: `Memory usage: ${Math.round(usagePercent)}% (${Math.round(used)}MB)`,
      details: {
        used: Math.round(used),
        total: Math.round(total),
        limit: Math.round(limit),
        usagePercent: Math.round(usagePercent)
      },
      timestamp: 0,
      duration: 0
    };
  }
}

// Editor Health Check
class EditorHealthCheck implements HealthCheck {
  name = 'Editor System';
  category: 'important' = 'important';
  description = 'Checks SightEdit editor functionality';
  timeout = 3000;

  async check(): Promise<HealthResult> {
    const issues: string[] = [];
    
    // Check if SightEdit is loaded
    if (typeof window !== 'undefined' && !(window as any).SightEdit) {
      issues.push('SightEdit not loaded');
    }

    // Check for editable elements
    const editableElements = document.querySelectorAll('[data-sightedit], [data-sight]');
    const elementCount = editableElements.length;

    if (elementCount === 0) {
      issues.push('No editable elements found');
    }

    // Check DOM health
    const domIssues: string[] = [];
    editableElements.forEach((el, index) => {
      if (!el.getAttribute('data-sightedit') && !el.getAttribute('data-sight')) {
        domIssues.push(`Element ${index} missing sight attribute`);
      }
      if (!document.contains(el)) {
        domIssues.push(`Element ${index} not in document`);
      }
    });

    const allIssues = [...issues, ...domIssues];
    const status = allIssues.length === 0 ? 'healthy' :
                  allIssues.length <= 2 ? 'warning' : 'error';

    const message = allIssues.length === 0 ?
      `Editor system healthy (${elementCount} elements)` :
      allIssues.join('; ');

    return {
      status,
      message,
      details: {
        elementCount,
        issues: allIssues,
        sightEditLoaded: typeof (window as any).SightEdit !== 'undefined'
      },
      timestamp: 0,
      duration: 0
    };
  }
}

// Global health checker instance
export const healthChecker = new HealthChecker();