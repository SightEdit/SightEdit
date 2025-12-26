import { AdvancedThemeConfig } from '../types';

/**
 * Default Light Theme Tokens
 * Based on modern design systems (Tailwind, Material Design)
 */
export const defaultLightTheme: AdvancedThemeConfig = {
  mode: 'light',

  colors: {
    // Primary colors (Purple gradient from original design)
    primary: '#667eea',
    primaryLight: '#818cf8',
    primaryDark: '#4f46e5',
    onPrimary: '#ffffff',

    // Secondary colors (Cyan)
    secondary: '#06b6d4',
    secondaryLight: '#22d3ee',
    secondaryDark: '#0891b2',
    onSecondary: '#ffffff',

    // Semantic colors
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',

    // Background colors
    background: '#ffffff',
    surface: '#f9fafb',
    onBackground: '#111827',
    onSurface: '#374151',

    // Neutral palette (Gray scale)
    neutral: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827'
    }
  },

  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
      mono: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },
    fontSize: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem'    // 36px
    },
    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75
    }
  },

  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem'      // 96px
  },

  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    base: '0.25rem',  // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    full: '9999px'
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    none: 'none'
  },

  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    toolbar: 9999
  },

  components: {
    toolbar: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#ffffff',
      padding: '1rem 1.5rem',
      borderRadius: '0.75rem',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    modal: {
      background: '#ffffff',
      color: '#111827',
      padding: '1.5rem',
      borderRadius: '0.75rem',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    },
    editor: {
      background: '#ffffff',
      color: '#111827',
      padding: '0.5rem',
      borderRadius: '0.375rem',
      border: '2px solid #667eea',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }
  }
};

/**
 * Default Dark Theme Tokens
 */
export const defaultDarkTheme: AdvancedThemeConfig = {
  ...defaultLightTheme,
  mode: 'dark',

  colors: {
    ...defaultLightTheme.colors,

    // Background colors (inverted)
    background: '#111827',
    surface: '#1f2937',
    onBackground: '#f9fafb',
    onSurface: '#e5e7eb',

    // Neutral palette (inverted for dark mode)
    neutral: {
      50: '#111827',
      100: '#1f2937',
      200: '#374151',
      300: '#4b5563',
      400: '#6b7280',
      500: '#9ca3af',
      600: '#d1d5db',
      700: '#e5e7eb',
      800: '#f3f4f6',
      900: '#f9fafb'
    }
  },

  components: {
    toolbar: {
      background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
      color: '#ffffff',
      padding: '1rem 1.5rem',
      borderRadius: '0.75rem',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)'
    },
    modal: {
      background: '#1f2937',
      color: '#f9fafb',
      padding: '1.5rem',
      borderRadius: '0.75rem',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
    },
    editor: {
      background: '#1f2937',
      color: '#f9fafb',
      padding: '0.5rem',
      borderRadius: '0.375rem',
      border: '2px solid #818cf8',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
    }
  }
};

/**
 * Predefined Theme Presets
 */
export const themePresets = {
  light: defaultLightTheme,
  dark: defaultDarkTheme,

  // Additional presets can be added here
  ocean: {
    ...defaultLightTheme,
    colors: {
      ...defaultLightTheme.colors,
      primary: '#0891b2',
      primaryLight: '#06b6d4',
      primaryDark: '#0e7490',
      secondary: '#0ea5e9',
      secondaryLight: '#38bdf8',
      secondaryDark: '#0284c7'
    }
  } as AdvancedThemeConfig,

  forest: {
    ...defaultLightTheme,
    colors: {
      ...defaultLightTheme.colors,
      primary: '#059669',
      primaryLight: '#10b981',
      primaryDark: '#047857',
      secondary: '#0d9488',
      secondaryLight: '#14b8a6',
      secondaryDark: '#0f766e'
    }
  } as AdvancedThemeConfig,

  sunset: {
    ...defaultLightTheme,
    colors: {
      ...defaultLightTheme.colors,
      primary: '#f59e0b',
      primaryLight: '#fbbf24',
      primaryDark: '#d97706',
      secondary: '#ef4444',
      secondaryLight: '#f87171',
      secondaryDark: '#dc2626'
    }
  } as AdvancedThemeConfig
};
