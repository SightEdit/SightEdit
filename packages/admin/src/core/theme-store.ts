import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Advanced Theme Config (simplified for admin panel)
 */
export interface AdvancedThemeConfig {
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    onPrimary: string;
    secondary: string;
    secondaryLight: string;
    secondaryDark: string;
    onSecondary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    background: string;
    surface: string;
    onBackground: string;
    onSurface: string;
    neutral: Record<number, string>;
  };
  typography: {
    fontFamily: {
      sans: string;
      serif: string;
      mono: string;
    };
    fontSize: Record<string, string>;
    fontWeight: Record<string, number>;
    lineHeight: Record<string, number>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  zIndex: Record<string, number>;
  components?: Record<string, any>;
}

/**
 * Theme with metadata
 */
export interface ThemeEntry {
  name: string;
  theme: AdvancedThemeConfig;
  createdAt: number;
  updatedAt: number;
  description?: string;
  isDefault?: boolean;
}

/**
 * Theme Store State
 */
interface ThemeStoreState {
  themes: Map<string, ThemeEntry>;
  currentTheme: string;
  editingTheme: AdvancedThemeConfig | null;

  // Actions
  addTheme: (name: string, theme: AdvancedThemeConfig, metadata?: Partial<ThemeEntry>) => void;
  updateTheme: (name: string, theme: Partial<AdvancedThemeConfig>) => void;
  deleteTheme: (name: string) => void;
  getTheme: (name: string) => ThemeEntry | undefined;
  getAllThemes: () => ThemeEntry[];
  setCurrentTheme: (name: string) => void;
  getCurrentTheme: () => AdvancedThemeConfig | null;
  setEditingTheme: (theme: AdvancedThemeConfig | null) => void;
  exportTheme: (name: string) => string;
  importTheme: (json: string, name: string) => void;
  duplicateTheme: (sourceName: string, newName: string) => void;
}

/**
 * Theme Store
 * Manages themes for the visual builder
 */
export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set, get) => ({
      themes: new Map(),
      currentTheme: 'light',
      editingTheme: null,

      addTheme: (name, theme, metadata) => {
        set((state) => {
          const newThemes = new Map(state.themes);
          const now = Date.now();

          newThemes.set(name, {
            name,
            theme,
            createdAt: metadata?.createdAt || now,
            updatedAt: now,
            description: metadata?.description,
            isDefault: metadata?.isDefault || false
          });

          return { themes: newThemes };
        });
      },

      updateTheme: (name, themeUpdate) => {
        set((state) => {
          const existing = state.themes.get(name);
          if (!existing) return state;

          const newThemes = new Map(state.themes);
          newThemes.set(name, {
            ...existing,
            theme: { ...existing.theme, ...themeUpdate } as AdvancedThemeConfig,
            updatedAt: Date.now()
          });

          return { themes: newThemes };
        });
      },

      deleteTheme: (name) => {
        set((state) => {
          const entry = state.themes.get(name);
          if (entry?.isDefault) {
            console.warn('[Theme Store] Cannot delete default theme');
            return state;
          }

          const newThemes = new Map(state.themes);
          newThemes.delete(name);

          return {
            themes: newThemes,
            currentTheme: state.currentTheme === name ? 'light' : state.currentTheme
          };
        });
      },

      getTheme: (name) => {
        return get().themes.get(name);
      },

      getAllThemes: () => {
        const { themes } = get();
        return Array.from(themes.values()).sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return b.updatedAt - a.updatedAt;
        });
      },

      setCurrentTheme: (name) => {
        const theme = get().themes.get(name);
        if (theme) {
          set({ currentTheme: name });
        }
      },

      getCurrentTheme: () => {
        const { themes, currentTheme } = get();
        return themes.get(currentTheme)?.theme || null;
      },

      setEditingTheme: (theme) => {
        set({ editingTheme: theme });
      },

      exportTheme: (name) => {
        const theme = get().themes.get(name);
        if (!theme) {
          throw new Error(`Theme "${name}" not found`);
        }
        return JSON.stringify(theme.theme, null, 2);
      },

      importTheme: (json, name) => {
        try {
          const theme = JSON.parse(json) as AdvancedThemeConfig;
          get().addTheme(name, theme);
        } catch (error) {
          console.error('[Theme Store] Import error:', error);
          throw new Error('Invalid theme JSON');
        }
      },

      duplicateTheme: (sourceName, newName) => {
        const source = get().themes.get(sourceName);
        if (!source) {
          throw new Error(`Theme "${sourceName}" not found`);
        }

        get().addTheme(newName, { ...source.theme }, {
          description: `Copy of ${sourceName}`
        });
      }
    }),
    {
      name: 'sightedit-themes',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;

          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              themes: new Map(Object.entries(state.themes || {}))
            }
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          const serialized = {
            state: {
              ...state,
              themes: Object.fromEntries(state.themes)
            }
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
);

/**
 * Color validation helper
 */
export function isValidColor(color: string): boolean {
  // Hex color
  if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
    return true;
  }

  // RGB/RGBA
  if (/^rgba?\([\d\s,]+\)$/i.test(color)) {
    return true;
  }

  // HSL/HSLA
  if (/^hsla?\([\d\s,%]+\)$/i.test(color)) {
    return true;
  }

  // Named colors (basic check)
  const namedColors = ['transparent', 'white', 'black', 'red', 'green', 'blue'];
  if (namedColors.includes(color.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Generate color variants
 */
export function generateColorVariants(baseColor: string): {
  light: string;
  dark: string;
} {
  // Simple implementation - in production, use a color manipulation library
  return {
    light: baseColor, // Placeholder
    dark: baseColor   // Placeholder
  };
}
