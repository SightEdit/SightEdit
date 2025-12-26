import { AdvancedThemeConfig } from '../types';
import { SightEditThemeProvider } from './ThemeProvider';
import { defaultLightTheme, defaultDarkTheme, themePresets } from './tokens';

/**
 * Theme Switcher - Manages theme switching and persistence
 */
export class ThemeSwitcher {
  private provider: SightEditThemeProvider;
  private storageKey = 'sightedit-theme';
  private prefersDarkScheme: MediaQueryList | null = null;

  constructor(provider?: SightEditThemeProvider) {
    this.provider = provider || SightEditThemeProvider.getInstance();
    this.setupMediaQuery();
    this.loadSavedTheme();
  }

  /**
   * Setup media query listener for system theme changes
   */
  private setupMediaQuery(): void {
    if (typeof window === 'undefined') return;

    this.prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    this.prefersDarkScheme.addEventListener('change', (e) => {
      const currentTheme = this.provider.getTheme();

      // Only auto-switch if user hasn't set a manual preference
      const savedTheme = this.getSavedThemeName();
      if (!savedTheme || savedTheme === 'auto') {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * Load saved theme from localStorage
   */
  private loadSavedTheme(): void {
    if (typeof window === 'undefined') return;

    const savedThemeName = this.getSavedThemeName();

    if (savedThemeName) {
      if (savedThemeName === 'auto') {
        this.setAutoTheme();
      } else {
        this.setTheme(savedThemeName);
      }
    }
  }

  /**
   * Get saved theme name from localStorage
   */
  private getSavedThemeName(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.storageKey);
  }

  /**
   * Set theme by name
   */
  setTheme(themeName: string): void {
    let theme: AdvancedThemeConfig;

    switch (themeName) {
      case 'light':
        theme = defaultLightTheme;
        break;
      case 'dark':
        theme = defaultDarkTheme;
        break;
      case 'ocean':
      case 'forest':
      case 'sunset':
        theme = themePresets[themeName as keyof typeof themePresets];
        break;
      default:
        console.warn(`[SightEdit Theme] Unknown theme: ${themeName}, falling back to light`);
        theme = defaultLightTheme;
    }

    this.provider.replaceTheme(theme);
    this.saveTheme(themeName);
  }

  /**
   * Set auto theme (follows system preference)
   */
  setAutoTheme(): void {
    if (typeof window === 'undefined') return;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = prefersDark ? defaultDarkTheme : defaultLightTheme;

    this.provider.replaceTheme(theme);
    this.saveTheme('auto');
  }

  /**
   * Toggle between light and dark mode
   */
  toggleDarkMode(): void {
    const currentTheme = this.provider.getTheme();
    const isDark = currentTheme.mode === 'dark';

    this.setTheme(isDark ? 'light' : 'dark');
  }

  /**
   * Set custom theme
   */
  setCustomTheme(theme: AdvancedThemeConfig, saveName?: string): void {
    this.provider.replaceTheme(theme);

    if (saveName) {
      this.saveTheme(saveName);
      this.saveCustomTheme(saveName, theme);
    }
  }

  /**
   * Update specific theme properties
   */
  updateTheme(updates: Partial<AdvancedThemeConfig>): void {
    this.provider.setTheme(updates);
  }

  /**
   * Get current theme name
   */
  getCurrentThemeName(): string {
    return this.getSavedThemeName() || 'light';
  }

  /**
   * Get current theme
   */
  getCurrentTheme(): AdvancedThemeConfig {
    return this.provider.getTheme();
  }

  /**
   * Check if current theme is dark
   */
  isDarkMode(): boolean {
    return this.provider.getTheme().mode === 'dark';
  }

  /**
   * Get available theme names
   */
  getAvailableThemes(): string[] {
    const builtIn = ['light', 'dark', 'ocean', 'forest', 'sunset'];
    const custom = this.getCustomThemeNames();
    return [...builtIn, ...custom];
  }

  /**
   * Save theme preference to localStorage
   */
  private saveTheme(themeName: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, themeName);
    } catch (error) {
      console.warn('[SightEdit Theme] Failed to save theme:', error);
    }
  }

  /**
   * Save custom theme to localStorage
   */
  private saveCustomTheme(name: string, theme: AdvancedThemeConfig): void {
    if (typeof window === 'undefined') return;

    try {
      const customThemes = this.getCustomThemes();
      customThemes[name] = theme;
      localStorage.setItem(`${this.storageKey}-custom`, JSON.stringify(customThemes));
    } catch (error) {
      console.warn('[SightEdit Theme] Failed to save custom theme:', error);
    }
  }

  /**
   * Get custom themes from localStorage
   */
  private getCustomThemes(): Record<string, AdvancedThemeConfig> {
    if (typeof window === 'undefined') return {};

    try {
      const saved = localStorage.getItem(`${this.storageKey}-custom`);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.warn('[SightEdit Theme] Failed to load custom themes:', error);
      return {};
    }
  }

  /**
   * Get custom theme names
   */
  private getCustomThemeNames(): string[] {
    return Object.keys(this.getCustomThemes());
  }

  /**
   * Load custom theme by name
   */
  loadCustomTheme(name: string): void {
    const customThemes = this.getCustomThemes();
    const theme = customThemes[name];

    if (theme) {
      this.provider.replaceTheme(theme);
      this.saveTheme(name);
    } else {
      console.warn(`[SightEdit Theme] Custom theme not found: ${name}`);
    }
  }

  /**
   * Delete custom theme
   */
  deleteCustomTheme(name: string): void {
    if (typeof window === 'undefined') return;

    try {
      const customThemes = this.getCustomThemes();
      delete customThemes[name];
      localStorage.setItem(`${this.storageKey}-custom`, JSON.stringify(customThemes));

      // If current theme was deleted, switch to light
      if (this.getCurrentThemeName() === name) {
        this.setTheme('light');
      }
    } catch (error) {
      console.warn('[SightEdit Theme] Failed to delete custom theme:', error);
    }
  }

  /**
   * Export current theme as JSON
   */
  exportTheme(): string {
    const theme = this.provider.getTheme();
    return JSON.stringify(theme, null, 2);
  }

  /**
   * Import theme from JSON
   */
  importTheme(jsonString: string, saveName?: string): void {
    try {
      const theme = JSON.parse(jsonString) as AdvancedThemeConfig;
      this.setCustomTheme(theme, saveName);
    } catch (error) {
      console.error('[SightEdit Theme] Failed to import theme:', error);
      throw new Error('Invalid theme JSON');
    }
  }

  /**
   * Reset to default theme
   */
  resetToDefault(): void {
    this.setTheme('light');

    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Clear all saved themes
   */
  clearAllThemes(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(`${this.storageKey}-custom`);
      this.resetToDefault();
    } catch (error) {
      console.warn('[SightEdit Theme] Failed to clear themes:', error);
    }
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(callback: (theme: AdvancedThemeConfig) => void): () => void {
    return this.provider.subscribe(callback);
  }

  /**
   * Destroy theme switcher
   */
  destroy(): void {
    if (this.prefersDarkScheme) {
      // Remove event listener (older browsers may not support)
      try {
        this.prefersDarkScheme.removeEventListener('change', () => {});
      } catch (error) {
        // Ignore error for older browsers
      }
    }
  }
}

/**
 * Create a global theme switcher instance
 */
let globalThemeSwitcher: ThemeSwitcher | null = null;

export function getThemeSwitcher(): ThemeSwitcher {
  if (!globalThemeSwitcher) {
    globalThemeSwitcher = new ThemeSwitcher();
  }
  return globalThemeSwitcher;
}
