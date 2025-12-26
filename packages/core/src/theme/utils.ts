import { AdvancedThemeConfig, ComponentTheme } from '../types';
import { useTheme } from './ThemeProvider';

/**
 * Get themed styles for a component
 * @param componentName - Name of the component (toolbar, modal, editor, etc.)
 * @param theme - Theme configuration
 * @returns CSS string for the component
 */
export function getThemedStyles(
  componentName: string,
  theme: AdvancedThemeConfig
): string {
  const componentTheme = theme.components?.[componentName];

  if (!componentTheme) {
    return getDefaultStyles(componentName, theme);
  }

  return componentThemeToCss(componentTheme);
}

/**
 * Convert ComponentTheme to CSS string
 */
function componentThemeToCss(theme: ComponentTheme): string {
  const styles: string[] = [];

  if (theme.background) styles.push(`background: ${theme.background}`);
  if (theme.color) styles.push(`color: ${theme.color}`);
  if (theme.padding) styles.push(`padding: ${theme.padding}`);
  if (theme.borderRadius) styles.push(`border-radius: ${theme.borderRadius}`);
  if (theme.border) styles.push(`border: ${theme.border}`);
  if (theme.boxShadow) styles.push(`box-shadow: ${theme.boxShadow}`);

  return styles.join('; ') + ';';
}

/**
 * Get default styles for common components
 */
function getDefaultStyles(componentName: string, theme: AdvancedThemeConfig): string {
  switch (componentName) {
    case 'toolbar':
      return `
        background: linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryDark} 100%);
        color: ${theme.colors.onPrimary};
        box-shadow: ${theme.shadows.lg};
        border-radius: ${theme.borderRadius.lg};
        padding: ${theme.spacing[4]} ${theme.spacing[6]};
      `;

    case 'modal':
      return `
        background: ${theme.colors.surface};
        color: ${theme.colors.onSurface};
        border-radius: ${theme.borderRadius.xl};
        padding: ${theme.spacing[6]};
        box-shadow: ${theme.shadows['2xl']};
      `;

    case 'editor':
      return `
        background: ${theme.colors.background};
        color: ${theme.colors.onBackground};
        padding: ${theme.spacing[2]};
        border-radius: ${theme.borderRadius.md};
        border: 2px solid ${theme.colors.primary};
        box-shadow: ${theme.shadows.md};
      `;

    case 'button':
      return `
        background: ${theme.colors.primary};
        color: ${theme.colors.onPrimary};
        padding: ${theme.spacing[2]} ${theme.spacing[4]};
        border-radius: ${theme.borderRadius.md};
        font-weight: ${theme.typography.fontWeight.semibold};
        box-shadow: ${theme.shadows.sm};
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      `;

    case 'input':
      return `
        background: ${theme.colors.surface};
        color: ${theme.colors.onSurface};
        padding: ${theme.spacing[2]} ${theme.spacing[3]};
        border-radius: ${theme.borderRadius.md};
        border: 1px solid ${theme.colors.neutral[300]};
        font-size: ${theme.typography.fontSize.base};
      `;

    default:
      return '';
  }
}

/**
 * Generate hover styles for a component
 */
export function getHoverStyles(
  componentName: string,
  theme: AdvancedThemeConfig
): string {
  const componentTheme = theme.components?.[componentName];

  if (componentTheme?.hover) {
    return componentThemeToCss(componentTheme.hover);
  }

  // Default hover styles
  switch (componentName) {
    case 'button':
      return `
        background: ${theme.colors.primaryDark};
        box-shadow: ${theme.shadows.md};
      `;
    case 'toolbar':
      return `opacity: 0.95;`;
    default:
      return '';
  }
}

/**
 * Generate active/pressed styles for a component
 */
export function getActiveStyles(
  componentName: string,
  theme: AdvancedThemeConfig
): string {
  const componentTheme = theme.components?.[componentName];

  if (componentTheme?.active) {
    return componentThemeToCss(componentTheme.active);
  }

  // Default active styles
  switch (componentName) {
    case 'button':
      return `
        background: ${theme.colors.primaryDark};
        box-shadow: ${theme.shadows.sm};
        transform: translateY(1px);
      `;
    default:
      return '';
  }
}

/**
 * Apply theme to an HTML element
 */
export function applyThemeToElement(
  element: HTMLElement,
  componentName: string,
  theme?: AdvancedThemeConfig
): void {
  const currentTheme = theme || useTheme();
  const styles = getThemedStyles(componentName, currentTheme);
  element.style.cssText = styles;
}

/**
 * Create a themed CSS class
 */
export function createThemedClass(
  componentName: string,
  theme: AdvancedThemeConfig
): string {
  const baseStyles = getThemedStyles(componentName, theme);
  const hoverStyles = getHoverStyles(componentName, theme);
  const activeStyles = getActiveStyles(componentName, theme);

  const className = `sight-${componentName}-themed-${Date.now()}`;

  const styleTag = document.createElement('style');
  styleTag.textContent = `
    .${className} {
      ${baseStyles}
    }
    .${className}:hover {
      ${hoverStyles}
    }
    .${className}:active {
      ${activeStyles}
    }
  `;

  document.head.appendChild(styleTag);

  return className;
}

/**
 * Convert theme to CSS variables object (for inline styles)
 */
export function themeToCSSVars(theme: AdvancedThemeConfig): Record<string, string> {
  return {
    '--primary': theme.colors.primary,
    '--primary-light': theme.colors.primaryLight,
    '--primary-dark': theme.colors.primaryDark,
    '--secondary': theme.colors.secondary,
    '--success': theme.colors.success,
    '--error': theme.colors.error,
    '--warning': theme.colors.warning,
    '--info': theme.colors.info,
    '--background': theme.colors.background,
    '--surface': theme.colors.surface,
    '--on-background': theme.colors.onBackground,
    '--on-surface': theme.colors.onSurface
  };
}

/**
 * Get color with opacity
 */
export function colorWithOpacity(color: string, opacity: number): string {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Handle rgb/rgba
  if (color.startsWith('rgb')) {
    return color.replace(/rgba?\(([^)]+)\)/, (_, values) => {
      const [r, g, b] = values.split(',').map((v: string) => v.trim());
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    });
  }

  return color;
}

/**
 * Lighten a color
 */
export function lightenColor(color: string, percent: number): string {
  // Simple implementation - for production, use a color manipulation library
  return colorWithOpacity(color, 1 - percent / 100);
}

/**
 * Darken a color
 */
export function darkenColor(color: string, percent: number): string {
  return colorWithOpacity(color, 1 + percent / 100);
}

/**
 * Get responsive spacing value
 */
export function getSpacing(size: keyof AdvancedThemeConfig['spacing'], theme?: AdvancedThemeConfig): string {
  const currentTheme = theme || useTheme();
  return currentTheme.spacing[size];
}

/**
 * Get responsive font size
 */
export function getFontSize(size: keyof AdvancedThemeConfig['typography']['fontSize'], theme?: AdvancedThemeConfig): string {
  const currentTheme = theme || useTheme();
  return currentTheme.typography.fontSize[size];
}

/**
 * Helper to build inline style object from theme
 */
export function buildInlineStyles(
  componentName: string,
  theme?: AdvancedThemeConfig
): Partial<CSSStyleDeclaration> {
  const currentTheme = theme || useTheme();
  const componentTheme = currentTheme.components?.[componentName];

  if (!componentTheme) {
    return {};
  }

  const styles: any = {};

  if (componentTheme.background) styles.background = componentTheme.background;
  if (componentTheme.color) styles.color = componentTheme.color;
  if (componentTheme.padding) styles.padding = componentTheme.padding;
  if (componentTheme.borderRadius) styles.borderRadius = componentTheme.borderRadius;
  if (componentTheme.border) styles.border = componentTheme.border;
  if (componentTheme.boxShadow) styles.boxShadow = componentTheme.boxShadow;

  return styles;
}
