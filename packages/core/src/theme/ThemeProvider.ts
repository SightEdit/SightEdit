import { AdvancedThemeConfig, ThemeConfig } from '../types';
import { defaultLightTheme, defaultDarkTheme } from './tokens';

/**
 * Theme Provider - Manages theme state and CSS variable injection
 * Framework-agnostic singleton for theme management
 */
export class SightEditThemeProvider {
  private static instance: SightEditThemeProvider | null = null;
  private currentTheme: AdvancedThemeConfig;
  private subscribers: Set<(theme: AdvancedThemeConfig) => void> = new Set();
  private styleElement: HTMLStyleElement | null = null;

  private constructor(theme?: Partial<AdvancedThemeConfig>) {
    this.currentTheme = this.mergeWithDefaults(theme);
    this.injectGlobalStyles();
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(theme?: Partial<AdvancedThemeConfig>): SightEditThemeProvider {
    if (!SightEditThemeProvider.instance) {
      SightEditThemeProvider.instance = new SightEditThemeProvider(theme);
    }
    return SightEditThemeProvider.instance;
  }

  /**
   * Reset singleton (useful for testing)
   */
  static reset(): void {
    if (SightEditThemeProvider.instance) {
      SightEditThemeProvider.instance.destroy();
      SightEditThemeProvider.instance = null;
    }
  }

  /**
   * Merge user theme with defaults
   */
  private mergeWithDefaults(theme?: Partial<AdvancedThemeConfig>): AdvancedThemeConfig {
    if (!theme) {
      return { ...defaultLightTheme };
    }

    const baseTheme = theme.mode === 'dark' ? defaultDarkTheme : defaultLightTheme;

    return {
      ...baseTheme,
      ...theme,
      colors: { ...baseTheme.colors, ...theme.colors },
      typography: {
        ...baseTheme.typography,
        ...theme.typography,
        fontFamily: { ...baseTheme.typography.fontFamily, ...theme.typography?.fontFamily },
        fontSize: { ...baseTheme.typography.fontSize, ...theme.typography?.fontSize },
        fontWeight: { ...baseTheme.typography.fontWeight, ...theme.typography?.fontWeight },
        lineHeight: { ...baseTheme.typography.lineHeight, ...theme.typography?.lineHeight }
      },
      spacing: { ...baseTheme.spacing, ...theme.spacing },
      borderRadius: { ...baseTheme.borderRadius, ...theme.borderRadius },
      shadows: { ...baseTheme.shadows, ...theme.shadows },
      zIndex: { ...baseTheme.zIndex, ...theme.zIndex },
      components: { ...baseTheme.components, ...theme.components }
    };
  }

  /**
   * Update theme (merge with current)
   */
  setTheme(theme: Partial<AdvancedThemeConfig>): void {
    this.currentTheme = this.mergeThemes(this.currentTheme, theme);
    this.injectGlobalStyles();
    this.notifySubscribers();
  }

  /**
   * Replace entire theme
   */
  replaceTheme(theme: AdvancedThemeConfig): void {
    this.currentTheme = { ...theme };
    this.injectGlobalStyles();
    this.notifySubscribers();
  }

  /**
   * Get current theme
   */
  getTheme(): AdvancedThemeConfig {
    return { ...this.currentTheme };
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(callback: (theme: AdvancedThemeConfig) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers of theme change
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => {
      try {
        callback(this.currentTheme);
      } catch (error) {
        console.error('[SightEdit Theme] Subscriber error:', error);
      }
    });
  }

  /**
   * Merge two themes
   */
  private mergeThemes(
    base: AdvancedThemeConfig,
    override: Partial<AdvancedThemeConfig>
  ): AdvancedThemeConfig {
    return {
      ...base,
      ...override,
      colors: { ...base.colors, ...override.colors },
      typography: {
        ...base.typography,
        ...override.typography,
        fontFamily: { ...base.typography.fontFamily, ...override.typography?.fontFamily },
        fontSize: { ...base.typography.fontSize, ...override.typography?.fontSize },
        fontWeight: { ...base.typography.fontWeight, ...override.typography?.fontWeight },
        lineHeight: { ...base.typography.lineHeight, ...override.typography?.lineHeight }
      },
      spacing: { ...base.spacing, ...override.spacing },
      borderRadius: { ...base.borderRadius, ...override.borderRadius },
      shadows: { ...base.shadows, ...override.shadows },
      zIndex: { ...base.zIndex, ...override.zIndex },
      components: { ...base.components, ...override.components }
    };
  }

  /**
   * Inject global CSS variables
   */
  private injectGlobalStyles(): void {
    const cssVars = this.themeToCSSVariables(this.currentTheme);
    const cssText = this.generateCSSText(cssVars);

    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'sightedit-theme-vars';
      document.head.appendChild(this.styleElement);
    }

    this.styleElement.textContent = cssText;
  }

  /**
   * Convert theme to CSS variables
   */
  private themeToCSSVariables(theme: AdvancedThemeConfig): Record<string, string> {
    const vars: Record<string, string> = {};

    // Colors
    vars['--sight-color-primary'] = theme.colors.primary;
    vars['--sight-color-primary-light'] = theme.colors.primaryLight;
    vars['--sight-color-primary-dark'] = theme.colors.primaryDark;
    vars['--sight-color-on-primary'] = theme.colors.onPrimary;
    vars['--sight-color-secondary'] = theme.colors.secondary;
    vars['--sight-color-secondary-light'] = theme.colors.secondaryLight;
    vars['--sight-color-secondary-dark'] = theme.colors.secondaryDark;
    vars['--sight-color-on-secondary'] = theme.colors.onSecondary;
    vars['--sight-color-success'] = theme.colors.success;
    vars['--sight-color-error'] = theme.colors.error;
    vars['--sight-color-warning'] = theme.colors.warning;
    vars['--sight-color-info'] = theme.colors.info;
    vars['--sight-color-background'] = theme.colors.background;
    vars['--sight-color-surface'] = theme.colors.surface;
    vars['--sight-color-on-background'] = theme.colors.onBackground;
    vars['--sight-color-on-surface'] = theme.colors.onSurface;

    // Neutral palette
    Object.entries(theme.colors.neutral).forEach(([key, value]) => {
      vars[`--sight-color-neutral-${key}`] = value;
    });

    // Typography
    vars['--sight-font-sans'] = theme.typography.fontFamily.sans;
    vars['--sight-font-serif'] = theme.typography.fontFamily.serif;
    vars['--sight-font-mono'] = theme.typography.fontFamily.mono;

    Object.entries(theme.typography.fontSize).forEach(([key, value]) => {
      vars[`--sight-font-size-${key}`] = value;
    });

    Object.entries(theme.typography.fontWeight).forEach(([key, value]) => {
      vars[`--sight-font-weight-${key}`] = value.toString();
    });

    Object.entries(theme.typography.lineHeight).forEach(([key, value]) => {
      vars[`--sight-line-height-${key}`] = value.toString();
    });

    // Spacing
    Object.entries(theme.spacing).forEach(([key, value]) => {
      vars[`--sight-spacing-${key}`] = value;
    });

    // Border radius
    Object.entries(theme.borderRadius).forEach(([key, value]) => {
      vars[`--sight-radius-${key}`] = value;
    });

    // Shadows
    Object.entries(theme.shadows).forEach(([key, value]) => {
      vars[`--sight-shadow-${key}`] = value;
    });

    // Z-index
    Object.entries(theme.zIndex).forEach(([key, value]) => {
      vars[`--sight-z-${key}`] = value.toString();
    });

    return vars;
  }

  /**
   * Generate CSS text from variables
   */
  private generateCSSText(vars: Record<string, string>): string {
    const varDeclarations = Object.entries(vars)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    return `:root {\n${varDeclarations}\n}`;
  }

  /**
   * Get CSS variable value
   */
  getCSSVar(varName: string): string {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  /**
   * Migrate old ThemeConfig to AdvancedThemeConfig
   */
  static migrateTheme(oldTheme: ThemeConfig): AdvancedThemeConfig {
    const base = { ...defaultLightTheme };

    return {
      ...base,
      colors: {
        ...base.colors,
        primary: oldTheme.primaryColor || base.colors.primary
      },
      typography: {
        ...base.typography,
        fontFamily: {
          ...base.typography.fontFamily,
          sans: oldTheme.fontFamily || base.typography.fontFamily.sans
        }
      },
      borderRadius: {
        ...base.borderRadius,
        base: oldTheme.borderRadius || base.borderRadius.base
      },
      zIndex: {
        ...base.zIndex,
        toolbar: oldTheme.zIndex || base.zIndex.toolbar
      }
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }
    this.subscribers.clear();
  }
}

/**
 * Hook-style function to get current theme (for use in components)
 */
export function useTheme(): AdvancedThemeConfig {
  const provider = SightEditThemeProvider.getInstance();
  return provider.getTheme();
}

/**
 * Helper to check if theme config is advanced
 */
export function isAdvancedTheme(theme: any): theme is AdvancedThemeConfig {
  return theme && typeof theme === 'object' && 'mode' in theme && 'colors' in theme;
}
