/**
 * CSP Compliance Utilities
 * Tools to help migrate inline scripts and styles to CSP-compliant alternatives
 */

import { CSPManager } from './csp-manager';
import { logger } from '../utils/logger';

export interface ComplianceReport {
  totalElements: number;
  migratedElements: number;
  failedElements: number;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export interface InlineElement {
  element: HTMLElement;
  type: 'script' | 'style' | 'event-handler';
  content: string;
  attributes: Record<string, string>;
  location: {
    tagName: string;
    className: string;
    id: string;
  };
}

export class CSPComplianceUtils {
  private cspManager: CSPManager;
  private report: ComplianceReport = {
    totalElements: 0,
    migratedElements: 0,
    failedElements: 0,
    warnings: [],
    errors: [],
    recommendations: []
  };

  constructor(cspManager: CSPManager) {
    this.cspManager = cspManager;
  }

  /**
   * Scan document for CSP compliance issues
   */
  scanForComplianceIssues(): InlineElement[] {
    const issues: InlineElement[] = [];

    // Find inline scripts
    const inlineScripts = document.querySelectorAll('script:not([src]):not([nonce]):not([data-csp-migrated])');
    inlineScripts.forEach(script => {
      if (script.textContent?.trim()) {
        issues.push({
          element: script as HTMLElement,
          type: 'script',
          content: script.textContent,
          attributes: this.getElementAttributes(script),
          location: this.getElementLocation(script)
        });
      }
    });

    // Find inline styles
    const inlineStyles = document.querySelectorAll('style:not([nonce]):not([data-csp-migrated])');
    inlineStyles.forEach(style => {
      if (style.textContent?.trim()) {
        issues.push({
          element: style as HTMLElement,
          type: 'style',
          content: style.textContent,
          attributes: this.getElementAttributes(style),
          location: this.getElementLocation(style)
        });
      }
    });

    // Find elements with inline event handlers
    const elementsWithEvents = document.querySelectorAll('*');
    elementsWithEvents.forEach(element => {
      const eventAttributes = Array.from(element.attributes)
        .filter(attr => attr.name.startsWith('on'));
      
      eventAttributes.forEach(attr => {
        issues.push({
          element: element as HTMLElement,
          type: 'event-handler',
          content: attr.value,
          attributes: { [attr.name]: attr.value },
          location: this.getElementLocation(element)
        });
      });
    });

    // Find style attributes
    const elementsWithStyleAttr = document.querySelectorAll('[style]');
    elementsWithStyleAttr.forEach(element => {
      const styleValue = element.getAttribute('style');
      if (styleValue) {
        issues.push({
          element: element as HTMLElement,
          type: 'style',
          content: styleValue,
          attributes: { style: styleValue },
          location: this.getElementLocation(element)
        });
      }
    });

    this.report.totalElements = issues.length;
    return issues;
  }

  /**
   * Migrate inline content to CSP-compliant alternatives
   */
  async migrateToCompliance(issues: InlineElement[]): Promise<ComplianceReport> {
    this.report = {
      totalElements: issues.length,
      migratedElements: 0,
      failedElements: 0,
      warnings: [],
      errors: [],
      recommendations: []
    };

    for (const issue of issues) {
      try {
        await this.migrateElement(issue);
        this.report.migratedElements++;
      } catch (error) {
        this.report.failedElements++;
        this.report.errors.push(
          `Failed to migrate ${issue.type} in ${issue.location.tagName}: ${error}`
        );
        logger.error('Failed to migrate element', { error, issue });
      }
    }

    this.generateRecommendations();
    return this.report;
  }

  /**
   * Migrate individual element
   */
  private async migrateElement(issue: InlineElement): Promise<void> {
    switch (issue.type) {
      case 'script':
        await this.migrateInlineScript(issue);
        break;
      case 'style':
        await this.migrateInlineStyle(issue);
        break;
      case 'event-handler':
        await this.migrateEventHandler(issue);
        break;
    }
  }

  /**
   * Migrate inline script to use nonce
   */
  private async migrateInlineScript(issue: InlineElement): Promise<void> {
    const script = issue.element as HTMLScriptElement;
    const nonce = this.cspManager.getCurrentNonce();

    if (!nonce) {
      throw new Error('No nonce available for script migration');
    }

    // Add nonce to existing script
    script.setAttribute('nonce', nonce.scriptNonce);
    script.setAttribute('data-csp-migrated', 'true');

    // Log migration
    logger.info('Migrated inline script with nonce', {
      location: issue.location,
      contentLength: issue.content.length
    });

    // Add to hash store for future CSP updates
    await this.cspManager.addContentHash('inline-scripts', issue.content);
  }

  /**
   * Migrate inline style to use nonce or external stylesheet
   */
  private async migrateInlineStyle(issue: InlineElement): Promise<void> {
    if (issue.element.hasAttribute('style')) {
      // Inline style attribute - convert to stylesheet
      await this.migrateStyleAttribute(issue);
    } else {
      // Style element - add nonce
      await this.migrateStyleElement(issue);
    }
  }

  /**
   * Migrate style attribute to external stylesheet
   */
  private async migrateStyleAttribute(issue: InlineElement): Promise<void> {
    const element = issue.element;
    const styleValue = issue.content;

    // Create unique class name
    const className = `csp-migrated-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Add class to element
    element.classList.add(className);
    
    // Remove style attribute
    element.removeAttribute('style');
    
    // Create stylesheet with nonce
    const css = `.${className} { ${styleValue} }`;
    const styleElement = this.cspManager.addStyle(css);
    
    if (styleElement) {
      styleElement.setAttribute('data-csp-migrated', 'true');
      styleElement.setAttribute('data-original-element', element.tagName + (element.id ? '#' + element.id : ''));
      document.head.appendChild(styleElement);
    } else {
      throw new Error('Failed to create migrated style element');
    }

    logger.info('Migrated inline style attribute to external stylesheet', {
      location: issue.location,
      className
    });
  }

  /**
   * Migrate style element to use nonce
   */
  private async migrateStyleElement(issue: InlineElement): Promise<void> {
    const style = issue.element as HTMLStyleElement;
    const nonce = this.cspManager.getCurrentNonce();

    if (!nonce) {
      throw new Error('No nonce available for style migration');
    }

    // Add nonce to existing style
    style.setAttribute('nonce', nonce.styleNonce);
    style.setAttribute('data-csp-migrated', 'true');

    // Add to hash store
    await this.cspManager.addContentHash('inline-styles', issue.content);

    logger.info('Migrated inline style element with nonce', {
      location: issue.location,
      contentLength: issue.content.length
    });
  }

  /**
   * Migrate inline event handler to external event listener
   */
  private async migrateEventHandler(issue: InlineElement): Promise<void> {
    const element = issue.element;
    const eventName = Object.keys(issue.attributes)[0]; // e.g., 'onclick'
    const handlerCode = issue.attributes[eventName];
    const eventType = eventName.slice(2); // Remove 'on' prefix

    // Remove inline handler
    element.removeAttribute(eventName);

    // Create external handler
    const handlerFunction = new Function('event', `
      try {
        ${handlerCode}
      } catch (error) {
        console.error('Migrated event handler error:', error);
      }
    `);

    // Add event listener
    element.addEventListener(eventType, handlerFunction);

    // Mark as migrated
    element.setAttribute('data-csp-migrated-events', 
      (element.getAttribute('data-csp-migrated-events') || '') + eventType + ',');

    this.report.warnings.push(
      `Migrated ${eventType} handler from ${issue.location.tagName}. ` +
      'Consider refactoring to use proper event delegation.'
    );

    logger.info('Migrated inline event handler', {
      eventType,
      location: issue.location,
      handlerLength: handlerCode.length
    });
  }

  /**
   * Generate specific recommendations based on findings
   */
  private generateRecommendations(): void {
    const recommendations = this.report.recommendations;

    if (this.report.failedElements > 0) {
      recommendations.push(
        `${this.report.failedElements} elements failed migration. ` +
        'Review errors and consider manual refactoring.'
      );
    }

    if (this.report.migratedElements > 10) {
      recommendations.push(
        'Large number of inline elements migrated. ' +
        'Consider restructuring to use external files from the start.'
      );
    }

    // Check for common patterns
    const hasEventHandlers = this.report.errors.some(e => e.includes('event-handler'));
    if (hasEventHandlers) {
      recommendations.push(
        'Implement event delegation pattern to avoid inline event handlers.'
      );
    }

    const hasStyleAttributes = this.report.errors.some(e => e.includes('style'));
    if (hasStyleAttributes) {
      recommendations.push(
        'Use CSS classes and external stylesheets instead of inline styles.'
      );
      recommendations.push(
        'Consider using CSS-in-JS libraries that support CSP nonces.'
      );
    }

    recommendations.push(
      'Implement build-time CSP compliance checking to prevent future issues.'
    );

    recommendations.push(
      'Use Trusted Types policy for dynamic script/HTML generation.'
    );
  }

  /**
   * Create CSP-compliant script element
   */
  createCompliantScript(code: string, attributes: Record<string, string> = {}): HTMLScriptElement | null {
    try {
      const script = this.cspManager.addScript(code, attributes);
      if (script) {
        script.setAttribute('data-csp-compliant', 'true');
        return script;
      }
      return null;
    } catch (error) {
      logger.error('Failed to create compliant script', { error, code: code.substring(0, 100) });
      return null;
    }
  }

  /**
   * Create CSP-compliant style element
   */
  createCompliantStyle(css: string, attributes: Record<string, string> = {}): HTMLStyleElement | null {
    try {
      const style = this.cspManager.addStyle(css, attributes);
      if (style) {
        style.setAttribute('data-csp-compliant', 'true');
        return style;
      }
      return null;
    } catch (error) {
      logger.error('Failed to create compliant style', { error, css: css.substring(0, 100) });
      return null;
    }
  }

  /**
   * Validate CSP compliance of current document
   */
  validateCompliance(): {
    isCompliant: boolean;
    violations: InlineElement[];
    score: number; // 0-100
    suggestions: string[];
  } {
    const violations = this.scanForComplianceIssues();
    const totalElements = document.querySelectorAll('script, style, *[style], *[onclick], *[onload], *[onerror]').length;
    const compliantElements = totalElements - violations.length;
    
    const score = totalElements > 0 ? Math.round((compliantElements / totalElements) * 100) : 100;
    const isCompliant = violations.length === 0;

    const suggestions: string[] = [];
    
    if (!isCompliant) {
      suggestions.push(`Found ${violations.length} CSP compliance violations`);
      
      const scriptViolations = violations.filter(v => v.type === 'script').length;
      const styleViolations = violations.filter(v => v.type === 'style').length;
      const eventViolations = violations.filter(v => v.type === 'event-handler').length;
      
      if (scriptViolations > 0) {
        suggestions.push(`${scriptViolations} inline scripts need nonces or external files`);
      }
      
      if (styleViolations > 0) {
        suggestions.push(`${styleViolations} inline styles need nonces or external stylesheets`);
      }
      
      if (eventViolations > 0) {
        suggestions.push(`${eventViolations} inline event handlers need external listeners`);
      }
    }

    return {
      isCompliant,
      violations,
      score,
      suggestions
    };
  }

  /**
   * Auto-fix common CSP violations
   */
  async autoFixViolations(): Promise<ComplianceReport> {
    const violations = this.scanForComplianceIssues();
    return await this.migrateToCompliance(violations);
  }

  /**
   * Get element attributes as object
   */
  private getElementAttributes(element: Element): Record<string, string> {
    const attributes: Record<string, string> = {};
    Array.from(element.attributes).forEach(attr => {
      attributes[attr.name] = attr.value;
    });
    return attributes;
  }

  /**
   * Get element location information
   */
  private getElementLocation(element: Element): InlineElement['location'] {
    return {
      tagName: element.tagName.toLowerCase(),
      className: element.className || '',
      id: element.id || ''
    };
  }

  /**
   * Generate migration plan without executing
   */
  generateMigrationPlan(issues: InlineElement[]): {
    plan: Array<{
      element: InlineElement;
      strategy: string;
      difficulty: 'easy' | 'medium' | 'hard';
      estimatedEffort: string;
    }>;
    summary: {
      totalIssues: number;
      easyFixes: number;
      mediumFixes: number;
      hardFixes: number;
    };
  } {
    const plan = issues.map(issue => {
      let strategy = '';
      let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
      let estimatedEffort = '';

      switch (issue.type) {
        case 'script':
          if (issue.content.length < 100 && !issue.content.includes('eval')) {
            strategy = 'Add nonce attribute to existing script';
            difficulty = 'easy';
            estimatedEffort = '1 minute';
          } else {
            strategy = 'Move to external file with proper nonce';
            difficulty = 'medium';
            estimatedEffort = '5-10 minutes';
          }
          break;

        case 'style':
          if (issue.element.hasAttribute('style')) {
            if (issue.content.length < 50) {
              strategy = 'Convert to CSS class';
              difficulty = 'easy';
              estimatedEffort = '2-3 minutes';
            } else {
              strategy = 'Move to external stylesheet';
              difficulty = 'medium';
              estimatedEffort = '5-10 minutes';
            }
          } else {
            strategy = 'Add nonce to style element';
            difficulty = 'easy';
            estimatedEffort = '1 minute';
          }
          break;

        case 'event-handler':
          if (issue.content.includes('this') || issue.content.includes('event')) {
            strategy = 'Refactor to external event listener with context handling';
            difficulty = 'hard';
            estimatedEffort = '15-30 minutes';
          } else {
            strategy = 'Convert to external event listener';
            difficulty = 'medium';
            estimatedEffort = '5-10 minutes';
          }
          break;
      }

      return { element: issue, strategy, difficulty, estimatedEffort };
    });

    const summary = {
      totalIssues: issues.length,
      easyFixes: plan.filter(p => p.difficulty === 'easy').length,
      mediumFixes: plan.filter(p => p.difficulty === 'medium').length,
      hardFixes: plan.filter(p => p.difficulty === 'hard').length
    };

    return { plan, summary };
  }
}