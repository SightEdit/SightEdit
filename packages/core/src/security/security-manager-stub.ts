/**
 * Stub implementations for security modules
 */

export interface SecurityConfig {
  enabled?: boolean;
  strict?: boolean;
  allowedOrigins?: string[];
  rateLimiting?: boolean;
  sanitizeInputs?: boolean;
}

export interface ThreatInfo {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  source?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class SecurityManager {
  private config: SecurityConfig;

  constructor(config: SecurityConfig = {}) {
    this.config = {
      enabled: false,
      strict: false,
      allowedOrigins: ['*'],
      rateLimiting: false,
      sanitizeInputs: true,
      ...config
    };
    console.warn('SecurityManager initialized in stub mode');
  }

  validateInput(input: any): ValidationResult {
    console.warn('SecurityManager.validateInput called (stubbed)');
    return { isValid: true, errors: [], warnings: [] };
  }

  sanitizeInput(input: any): any {
    console.warn('SecurityManager.sanitizeInput called (stubbed)');
    return input;
  }

  checkPermission(resource: string, action: string): boolean {
    console.warn('SecurityManager.checkPermission called (stubbed):', resource, action);
    return true;
  }

  detectThreat(data: any): ThreatInfo | null {
    console.warn('SecurityManager.detectThreat called (stubbed)');
    return null;
  }

  logSecurityEvent(event: any): void {
    console.warn('SecurityManager.logSecurityEvent called (stubbed):', event);
  }

  isEnabled(): boolean {
    return this.config.enabled || false;
  }
}

// CSP stubs
export interface CSPConfig {
  enabled?: boolean;
  directives?: Record<string, string[]>;
}

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
}

export interface CSPViolation {
  directive: string;
  blockedURI: string;
  violatedDirective: string;
  originalPolicy: string;
}

export class CSPManager {
  constructor(config: CSPConfig = {}) {
    console.warn('CSPManager initialized in stub mode');
  }

  enforce(): void {
    console.warn('CSPManager.enforce called (stubbed)');
  }

  report(violation: CSPViolation): void {
    console.warn('CSPManager.report called (stubbed):', violation);
  }
}

export class CSPReporter {
  report(violation: CSPViolation): void {
    console.warn('CSPReporter.report called (stubbed):', violation);
  }
}

export class ExpressCSPMiddleware {
  middleware() {
    return (req: any, res: any, next: any) => next();
  }
}

export class BrowserCSPHelper {
  static inject(): void {
    console.warn('BrowserCSPHelper.inject called (stubbed)');
  }
}

export class NodeCSPUtils {
  static generate(): string {
    return '';
  }
}

export class CSPTestingUtils {
  static validate(): boolean {
    return true;
  }
}

export class CSPComplianceUtils {
  static check(): boolean {
    return true;
  }
}

export class CSPInjectionPrevention {
  static sanitize(input: string): string {
    return input;
  }
}