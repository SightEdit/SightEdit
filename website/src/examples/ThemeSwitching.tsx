import React, { useState } from 'react';

const themes = {
  default: {
    name: 'Default Purple',
    colors: {
      primary: '#8b5cf6',
      background: '#1e293b',
      surface: '#334155',
      text: '#f1f5f9',
    },
  },
  ocean: {
    name: 'Ocean Blue',
    colors: {
      primary: '#0ea5e9',
      background: '#0c4a6e',
      surface: '#075985',
      text: '#e0f2fe',
    },
  },
  sunset: {
    name: 'Sunset Orange',
    colors: {
      primary: '#f97316',
      background: '#7c2d12',
      surface: '#9a3412',
      text: '#ffedd5',
    },
  },
  forest: {
    name: 'Forest Green',
    colors: {
      primary: '#10b981',
      background: '#064e3b',
      surface: '#065f46',
      text: '#d1fae5',
    },
  },
};

type ThemeKey = keyof typeof themes;

export default function ThemeSwitching() {
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('default');
  const theme = themes[currentTheme];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold mb-4 text-primary-400">Theme Switching Demo</h3>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {(Object.keys(themes) as ThemeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setCurrentTheme(key)}
              className={`px-4 py-3 rounded font-medium transition ${
                currentTheme === key
                  ? 'ring-2 ring-primary-400 bg-slate-700'
                  : 'bg-slate-700/50 hover:bg-slate-700'
              }`}
            >
              {themes[key].name}
            </button>
          ))}
        </div>

        <div
          className="rounded-lg p-6 transition-colors duration-300"
          style={{
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
          }}
        >
          <div
            className="inline-block px-4 py-2 rounded-lg mb-4"
            style={{ backgroundColor: theme.colors.primary }}
          >
            <span className="font-semibold">Primary Color</span>
          </div>

          <h4 className="text-2xl font-bold mb-2">Themed Content</h4>
          <p className="mb-4">
            This content adapts to the selected theme. The background, text, and accent colors
            all update dynamically based on the theme configuration.
          </p>

          <div
            className="p-4 rounded"
            style={{ backgroundColor: theme.colors.surface }}
          >
            <p className="text-sm">Surface element with theme-aware styling</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h4 className="text-sm font-semibold mb-2 text-slate-300">Current Theme Config:</h4>
        <pre className="text-xs bg-slate-900 p-3 rounded overflow-x-auto">
          <code>{JSON.stringify(theme, null, 2)}</code>
        </pre>
      </div>

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <p className="text-sm text-blue-200">
          <strong>SightEdit v2.0 Theme System:</strong> Supports runtime theme switching,
          design tokens, component-level overrides, and dark mode. Themes can be defined
          using CSS-in-JS with Emotion for framework-agnostic styling.
        </p>
      </div>
    </div>
  );
}
