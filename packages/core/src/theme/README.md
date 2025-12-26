# Theme System

Advanced CSS-in-JS theming with design tokens, presets, and runtime switching.

## Features

- 🎨 **5 Preset Themes** - light, dark, ocean, forest, sunset
- 🎭 **Design Tokens** - colors, typography, spacing, effects
- 🔄 **Runtime Switching** - change themes on the fly
- 🌓 **Dark Mode** - built-in dark mode support
- ⚙️ **Component Overrides** - theme individual components
- 🔧 **Auto-Migration** - from v1.x theme configs

## Quick Start

```typescript
import { ThemeSwitcher, themePresets } from '@sightedit/core';

// Use preset theme
const switcher = new ThemeSwitcher();
switcher.setTheme('dark');

// Toggle dark mode
switcher.toggleDarkMode();

// Custom theme
switcher.setTheme({
  mode: 'light',
  colors: {
    primary: '#8b5cf6',
    // ... more colors
  }
});
```

## Files

- `tokens.ts` - 5 preset themes with complete design tokens
- `ThemeProvider.ts` - Singleton theme provider
- `ThemeSwitcher.ts` - Runtime theme switching
- `utils.ts` - 15+ utility functions
- `component-themes.ts` - Component-level theme types

## Documentation

See [Core Package README](../../README.md#theme-system) for full documentation.
