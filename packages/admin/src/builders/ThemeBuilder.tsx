import React, { useState, useCallback, useMemo } from 'react';
import { useThemeStore, AdvancedThemeConfig, isValidColor } from '../core/theme-store';
import toast from 'react-hot-toast';

type ColorSection = 'primary' | 'secondary' | 'semantic' | 'background' | 'neutral';
type ThemeTab = 'colors' | 'typography' | 'spacing' | 'effects' | 'preview';

interface ThemeBuilderProps {
  onThemeCreated?: (name: string, theme: AdvancedThemeConfig) => void;
  onThemeUpdated?: (name: string, theme: AdvancedThemeConfig) => void;
}

export const ThemeBuilder: React.FC<ThemeBuilderProps> = ({
  onThemeCreated,
  onThemeUpdated
}) => {
  const {
    themes,
    currentTheme,
    addTheme,
    updateTheme,
    deleteTheme,
    getTheme,
    getAllThemes,
    setCurrentTheme,
    getCurrentTheme,
    setEditingTheme,
    exportTheme,
    importTheme,
    duplicateTheme
  } = useThemeStore();

  const [activeTab, setActiveTab] = useState<ThemeTab>('colors');
  const [isCreating, setIsCreating] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingConfig, setEditingConfig] = useState<AdvancedThemeConfig | null>(null);
  const [colorSection, setColorSection] = useState<ColorSection>('primary');

  const allThemes = getAllThemes();
  const currentThemeConfig = getCurrentTheme();

  const handleCreateNew = useCallback(() => {
    setIsCreating(true);
    setEditingName('');
    setEditingConfig({
      mode: 'light',
      colors: {
        primary: '#667eea',
        primaryLight: '#818cf8',
        primaryDark: '#4f46e5',
        onPrimary: '#ffffff',
        secondary: '#06b6d4',
        secondaryLight: '#22d3ee',
        secondaryDark: '#0891b2',
        onSecondary: '#ffffff',
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        background: '#ffffff',
        surface: '#f9fafb',
        onBackground: '#111827',
        onSurface: '#374151',
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
          sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          serif: 'Georgia, serif',
          mono: 'Monaco, monospace'
        },
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '1.875rem',
          '4xl': '2.25rem'
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
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem'
      },
      borderRadius: {
        none: '0',
        sm: '0.125rem',
        base: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px'
      },
      shadows: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
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
      }
    });
  }, []);

  const handleEdit = useCallback((themeName: string) => {
    const theme = getTheme(themeName);
    if (theme) {
      setIsCreating(false);
      setEditingName(themeName);
      setEditingConfig(theme.theme);
      setCurrentTheme(themeName);
    }
  }, [getTheme, setCurrentTheme]);

  const handleSave = useCallback(() => {
    if (!editingName.trim()) {
      toast.error('Please enter a theme name');
      return;
    }

    if (!editingConfig) {
      toast.error('Invalid theme configuration');
      return;
    }

    if (isCreating) {
      addTheme(editingName, editingConfig);
      toast.success(`Theme "${editingName}" created!`);
      onThemeCreated?.(editingName, editingConfig);
    } else {
      updateTheme(editingName, editingConfig);
      toast.success(`Theme "${editingName}" updated!`);
      onThemeUpdated?.(editingName, editingConfig);
    }

    setIsCreating(false);
  }, [editingName, editingConfig, isCreating, addTheme, updateTheme, onThemeCreated, onThemeUpdated]);

  const handleDelete = useCallback((name: string) => {
    if (window.confirm(`Delete theme "${name}"?`)) {
      deleteTheme(name);
      toast.success(`Theme "${name}" deleted`);
      if (currentTheme === name) {
        setCurrentTheme('light');
      }
    }
  }, [deleteTheme, currentTheme, setCurrentTheme]);

  const handleExport = useCallback((name: string) => {
    try {
      const json = exportTheme(name);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-theme.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Theme exported!');
    } catch (error) {
      toast.error('Failed to export theme');
    }
  }, [exportTheme]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const name = file.name.replace('.json', '').replace('-theme', '');
        importTheme(json, name);
        toast.success('Theme imported!');
      } catch (error) {
        toast.error('Failed to import theme');
      }
    };
    reader.readAsText(file);
  }, [importTheme]);

  const handleDuplicate = useCallback((sourceName: string) => {
    const newName = `${sourceName} (Copy)`;
    duplicateTheme(sourceName, newName);
    toast.success(`Theme duplicated as "${newName}"`);
  }, [duplicateTheme]);

  const updateColor = useCallback((path: string, value: string) => {
    if (!editingConfig) return;

    setEditingConfig(prev => {
      if (!prev) return prev;

      const pathParts = path.split('.');
      const newConfig = { ...prev };
      let current: any = newConfig.colors;

      for (let i = 0; i < pathParts.length - 1; i++) {
        current = current[pathParts[i]];
      }

      current[pathParts[pathParts.length - 1]] = value;

      return newConfig;
    });
  }, [editingConfig]);

  const updateTypography = useCallback((section: string, key: string, value: any) => {
    if (!editingConfig) return;

    setEditingConfig(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        typography: {
          ...prev.typography,
          [section]: {
            ...prev.typography[section as keyof typeof prev.typography],
            [key]: value
          }
        }
      };
    });
  }, [editingConfig]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Theme Builder</h2>
        <div style={styles.headerActions}>
          <button onClick={handleCreateNew} style={styles.primaryButton}>
            + New Theme
          </button>
          <label style={styles.secondaryButton}>
            📥 Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      <div style={styles.content}>
        {/* Sidebar - Theme List */}
        <div style={styles.sidebar}>
          <div style={styles.themeList}>
            {allThemes.length === 0 && (
              <div style={styles.emptyState}>
                <p>No themes yet</p>
                <button onClick={handleCreateNew} style={styles.linkButton}>
                  Create your first theme
                </button>
              </div>
            )}

            {allThemes.map(entry => (
              <div
                key={entry.name}
                style={{
                  ...styles.themeItem,
                  ...(currentTheme === entry.name ? styles.themeItemActive : {})
                }}
                onClick={() => handleEdit(entry.name)}
              >
                <div style={styles.themeItemHeader}>
                  <div
                    style={{
                      ...styles.themePreview,
                      background: entry.theme.colors.primary
                    }}
                  />
                  <span style={styles.themeName}>{entry.name}</span>
                </div>
                <div style={styles.themeItemMeta}>
                  <span style={styles.themeMode}>
                    {entry.theme.mode === 'dark' ? '🌙' : '☀️'} {entry.theme.mode}
                  </span>
                  {entry.isDefault && (
                    <span style={styles.defaultBadge}>Default</span>
                  )}
                </div>
                <div style={styles.themeActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(entry.name);
                    }}
                    style={styles.iconButton}
                    title="Export"
                  >
                    📤
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(entry.name);
                    }}
                    style={styles.iconButton}
                    title="Duplicate"
                  >
                    📋
                  </button>
                  {!entry.isDefault && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.name);
                      }}
                      style={styles.iconButton}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor */}
        <div style={styles.mainEditor}>
          {editingConfig ? (
            <div style={styles.editorContainer}>
              {/* Theme Name */}
              <div style={styles.nameSection}>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="Theme name..."
                  disabled={!isCreating}
                  style={styles.nameInput}
                />
                <select
                  value={editingConfig.mode}
                  onChange={(e) => setEditingConfig({
                    ...editingConfig,
                    mode: e.target.value as 'light' | 'dark'
                  })}
                  style={styles.modeSelect}
                >
                  <option value="light">☀️ Light Mode</option>
                  <option value="dark">🌙 Dark Mode</option>
                </select>
              </div>

              {/* Tabs */}
              <div style={styles.tabs}>
                {(['colors', 'typography', 'spacing', 'effects', 'preview'] as ThemeTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      ...styles.tab,
                      ...(activeTab === tab ? styles.tabActive : {})
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={styles.tabContent}>
                {activeTab === 'colors' && (
                  <ColorEditor
                    config={editingConfig}
                    section={colorSection}
                    onSectionChange={setColorSection}
                    onColorChange={updateColor}
                  />
                )}

                {activeTab === 'typography' && (
                  <TypographyEditor
                    config={editingConfig}
                    onChange={updateTypography}
                  />
                )}

                {activeTab === 'spacing' && (
                  <SpacingEditor
                    config={editingConfig}
                    onChange={(key, value) => {
                      setEditingConfig({
                        ...editingConfig,
                        spacing: { ...editingConfig.spacing, [key]: value }
                      });
                    }}
                  />
                )}

                {activeTab === 'effects' && (
                  <EffectsEditor
                    config={editingConfig}
                    onChange={(type, key, value) => {
                      setEditingConfig({
                        ...editingConfig,
                        [type]: { ...editingConfig[type as keyof AdvancedThemeConfig], [key]: value }
                      });
                    }}
                  />
                )}

                {activeTab === 'preview' && (
                  <ThemePreview config={editingConfig} />
                )}
              </div>

              {/* Save Actions */}
              <div style={styles.saveActions}>
                <button onClick={handleSave} style={styles.saveButton}>
                  💾 Save Theme
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setEditingConfig(null);
                  }}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyEditor}>
              <h3>Select a theme to edit</h3>
              <p>or create a new one</p>
              <button onClick={handleCreateNew} style={styles.primaryButton}>
                + New Theme
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Color Editor Component
 */
const ColorEditor: React.FC<{
  config: AdvancedThemeConfig;
  section: ColorSection;
  onSectionChange: (section: ColorSection) => void;
  onColorChange: (path: string, value: string) => void;
}> = ({ config, section, onSectionChange, onColorChange }) => {
  const colorSections: { id: ColorSection; label: string; icon: string }[] = [
    { id: 'primary', label: 'Primary', icon: '🎨' },
    { id: 'secondary', label: 'Secondary', icon: '🎭' },
    { id: 'semantic', label: 'Semantic', icon: '🚦' },
    { id: 'background', label: 'Background', icon: '📄' },
    { id: 'neutral', label: 'Neutral', icon: '⚪' }
  ];

  const renderColorInputs = () => {
    switch (section) {
      case 'primary':
        return (
          <>
            <ColorInput label="Primary" value={config.colors.primary} onChange={(v) => onColorChange('primary', v)} />
            <ColorInput label="Primary Light" value={config.colors.primaryLight} onChange={(v) => onColorChange('primaryLight', v)} />
            <ColorInput label="Primary Dark" value={config.colors.primaryDark} onChange={(v) => onColorChange('primaryDark', v)} />
            <ColorInput label="On Primary" value={config.colors.onPrimary} onChange={(v) => onColorChange('onPrimary', v)} />
          </>
        );

      case 'secondary':
        return (
          <>
            <ColorInput label="Secondary" value={config.colors.secondary} onChange={(v) => onColorChange('secondary', v)} />
            <ColorInput label="Secondary Light" value={config.colors.secondaryLight} onChange={(v) => onColorChange('secondaryLight', v)} />
            <ColorInput label="Secondary Dark" value={config.colors.secondaryDark} onChange={(v) => onColorChange('secondaryDark', v)} />
            <ColorInput label="On Secondary" value={config.colors.onSecondary} onChange={(v) => onColorChange('onSecondary', v)} />
          </>
        );

      case 'semantic':
        return (
          <>
            <ColorInput label="Success" value={config.colors.success} onChange={(v) => onColorChange('success', v)} />
            <ColorInput label="Error" value={config.colors.error} onChange={(v) => onColorChange('error', v)} />
            <ColorInput label="Warning" value={config.colors.warning} onChange={(v) => onColorChange('warning', v)} />
            <ColorInput label="Info" value={config.colors.info} onChange={(v) => onColorChange('info', v)} />
          </>
        );

      case 'background':
        return (
          <>
            <ColorInput label="Background" value={config.colors.background} onChange={(v) => onColorChange('background', v)} />
            <ColorInput label="Surface" value={config.colors.surface} onChange={(v) => onColorChange('surface', v)} />
            <ColorInput label="On Background" value={config.colors.onBackground} onChange={(v) => onColorChange('onBackground', v)} />
            <ColorInput label="On Surface" value={config.colors.onSurface} onChange={(v) => onColorChange('onSurface', v)} />
          </>
        );

      case 'neutral':
        return (
          <>
            {Object.entries(config.colors.neutral).map(([key, value]) => (
              <ColorInput
                key={key}
                label={`Neutral ${key}`}
                value={value}
                onChange={(v) => onColorChange(`neutral.${key}`, v)}
              />
            ))}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.colorEditor}>
      <div style={styles.colorSections}>
        {colorSections.map(s => (
          <button
            key={s.id}
            onClick={() => onSectionChange(s.id)}
            style={{
              ...styles.colorSectionBtn,
              ...(section === s.id ? styles.colorSectionBtnActive : {})
            }}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.colorInputs}>
        {renderColorInputs()}
      </div>
    </div>
  );
};

/**
 * Color Input Component
 */
const ColorInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <div style={styles.colorInputWrapper}>
    <label style={styles.colorLabel}>{label}</label>
    <div style={styles.colorInputGroup}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.colorPicker}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.colorTextInput}
        placeholder="#000000"
      />
    </div>
  </div>
);

/**
 * Typography Editor Component
 */
const TypographyEditor: React.FC<{
  config: AdvancedThemeConfig;
  onChange: (section: string, key: string, value: any) => void;
}> = ({ config, onChange }) => (
  <div style={styles.typographyEditor}>
    <div style={styles.formGroup}>
      <h4 style={styles.groupTitle}>Font Families</h4>
      <div style={styles.inputGroup}>
        <label style={styles.label}>Sans Serif</label>
        <input
          type="text"
          value={config.typography.fontFamily.sans}
          onChange={(e) => onChange('fontFamily', 'sans', e.target.value)}
          style={styles.input}
        />
      </div>
      <div style={styles.inputGroup}>
        <label style={styles.label}>Serif</label>
        <input
          type="text"
          value={config.typography.fontFamily.serif}
          onChange={(e) => onChange('fontFamily', 'serif', e.target.value)}
          style={styles.input}
        />
      </div>
      <div style={styles.inputGroup}>
        <label style={styles.label}>Monospace</label>
        <input
          type="text"
          value={config.typography.fontFamily.mono}
          onChange={(e) => onChange('fontFamily', 'mono', e.target.value)}
          style={styles.input}
        />
      </div>
    </div>

    <div style={styles.formGroup}>
      <h4 style={styles.groupTitle}>Font Sizes</h4>
      {Object.entries(config.typography.fontSize).map(([key, value]) => (
        <div key={key} style={styles.inputGroup}>
          <label style={styles.label}>{key}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange('fontSize', key, e.target.value)}
            style={styles.input}
            placeholder="1rem"
          />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Spacing Editor Component
 */
const SpacingEditor: React.FC<{
  config: AdvancedThemeConfig;
  onChange: (key: string, value: string) => void;
}> = ({ config, onChange }) => (
  <div style={styles.spacingEditor}>
    <h4 style={styles.groupTitle}>Spacing Scale</h4>
    <div style={styles.spacingGrid}>
      {Object.entries(config.spacing).map(([key, value]) => (
        <div key={key} style={styles.spacingItem}>
          <label style={styles.label}>{key}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
            style={styles.input}
            placeholder="0.25rem"
          />
          <div style={{ ...styles.spacingPreview, width: value, height: value }} />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Effects Editor Component
 */
const EffectsEditor: React.FC<{
  config: AdvancedThemeConfig;
  onChange: (type: string, key: string, value: any) => void;
}> = ({ config, onChange }) => (
  <div style={styles.effectsEditor}>
    <div style={styles.formGroup}>
      <h4 style={styles.groupTitle}>Border Radius</h4>
      {Object.entries(config.borderRadius).map(([key, value]) => (
        <div key={key} style={styles.inputGroup}>
          <label style={styles.label}>{key}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange('borderRadius', key, e.target.value)}
            style={styles.input}
          />
        </div>
      ))}
    </div>

    <div style={styles.formGroup}>
      <h4 style={styles.groupTitle}>Shadows</h4>
      {Object.entries(config.shadows).map(([key, value]) => (
        <div key={key} style={styles.inputGroup}>
          <label style={styles.label}>{key}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange('shadows', key, e.target.value)}
            style={styles.input}
          />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Theme Preview Component
 */
const ThemePreview: React.FC<{ config: AdvancedThemeConfig }> = ({ config }) => (
  <div style={{ ...styles.preview, backgroundColor: config.colors.background, color: config.colors.onBackground }}>
    <div style={styles.previewContent}>
      <h1 style={{ fontFamily: config.typography.fontFamily.sans, fontSize: config.typography.fontSize['3xl'] }}>
        Theme Preview
      </h1>
      <p style={{ fontSize: config.typography.fontSize.base, lineHeight: config.typography.lineHeight.normal }}>
        This is how your theme looks in action.
      </p>

      <div style={styles.previewButtons}>
        <button style={{ ...styles.previewButton, backgroundColor: config.colors.primary, color: config.colors.onPrimary }}>
          Primary Button
        </button>
        <button style={{ ...styles.previewButton, backgroundColor: config.colors.secondary, color: config.colors.onSecondary }}>
          Secondary Button
        </button>
        <button style={{ ...styles.previewButton, backgroundColor: config.colors.success, color: '#fff' }}>
          Success
        </button>
        <button style={{ ...styles.previewButton, backgroundColor: config.colors.error, color: '#fff' }}>
          Error
        </button>
      </div>

      <div style={{ ...styles.previewCard, backgroundColor: config.colors.surface, borderRadius: config.borderRadius.lg, boxShadow: config.shadows.lg }}>
        <h3 style={{ fontSize: config.typography.fontSize.xl, marginBottom: config.spacing[4] }}>Card Component</h3>
        <p style={{ fontSize: config.typography.fontSize.sm, color: config.colors.onSurface }}>
          This card uses your theme's surface color, border radius, and shadow.
        </p>
      </div>
    </div>
  </div>
);

/**
 * Styles
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9fafb'
  },
  header: {
    padding: '1.5rem 2rem',
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600
  },
  headerActions: {
    display: 'flex',
    gap: '0.75rem'
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  sidebar: {
    width: '280px',
    backgroundColor: 'white',
    borderRight: '1px solid #e5e7eb',
    overflow: 'auto'
  },
  themeList: {
    padding: '1rem'
  },
  themeItem: {
    padding: '1rem',
    marginBottom: '0.5rem',
    backgroundColor: '#f9fafb',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s'
  },
  themeItemActive: {
    backgroundColor: '#ede9fe',
    borderLeft: '3px solid #8b5cf6'
  },
  themeItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem'
  },
  themePreview: {
    width: '32px',
    height: '32px',
    borderRadius: '0.375rem',
    border: '2px solid white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  themeName: {
    fontWeight: 600,
    fontSize: '0.875rem'
  },
  themeItemMeta: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.75rem',
    marginBottom: '0.5rem'
  },
  themeMode: {
    color: '#6b7280',
    textTransform: 'capitalize'
  },
  defaultBadge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.625rem',
    fontWeight: 500
  },
  themeActions: {
    display: 'flex',
    gap: '0.25rem'
  },
  iconButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.25rem',
    opacity: 0.6,
    transition: 'opacity 0.2s'
  },
  mainEditor: {
    flex: 1,
    overflow: 'auto',
    padding: '2rem'
  },
  editorContainer: {
    maxWidth: '900px',
    margin: '0 auto'
  },
  nameSection: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem'
  },
  nameInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    fontSize: '1.25rem',
    fontWeight: 600,
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    outline: 'none'
  },
  modeSelect: {
    padding: '0.75rem 1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '2px solid #e5e7eb',
    marginBottom: '2rem'
  },
  tab: {
    padding: '0.75rem 1.5rem',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#6b7280',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.2s'
  },
  tabActive: {
    color: '#8b5cf6',
    borderBottomColor: '#8b5cf6'
  },
  tabContent: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '0.75rem',
    marginBottom: '2rem',
    minHeight: '400px'
  },
  colorEditor: {
    display: 'flex',
    gap: '2rem'
  },
  colorSections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minWidth: '150px'
  },
  colorSectionBtn: {
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    backgroundColor: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    transition: 'all 0.2s'
  },
  colorSectionBtnActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#8b5cf6',
    color: '#8b5cf6'
  },
  colorInputs: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem'
  },
  colorInputWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  colorLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151'
  },
  colorInputGroup: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  colorPicker: {
    width: '48px',
    height: '48px',
    border: '2px solid #e5e7eb',
    borderRadius: '0.375rem',
    cursor: 'pointer'
  },
  colorTextInput: {
    flex: 1,
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontFamily: 'monospace'
  },
  typographyEditor: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '2rem'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  groupTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#111827',
    paddingBottom: '0.5rem',
    borderBottom: '2px solid #e5e7eb'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  spacingEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  spacingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem'
  },
  spacingItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  spacingPreview: {
    backgroundColor: '#8b5cf6',
    borderRadius: '0.25rem'
  },
  effectsEditor: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '2rem'
  },
  preview: {
    padding: '2rem',
    minHeight: '500px'
  },
  previewContent: {
    maxWidth: '600px',
    margin: '0 auto'
  },
  previewButtons: {
    display: 'flex',
    gap: '1rem',
    margin: '2rem 0'
  },
  previewButton: {
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
  previewCard: {
    padding: '2rem',
    marginTop: '2rem'
  },
  saveActions: {
    display: 'flex',
    gap: '1rem',
    paddingTop: '1rem',
    borderTop: '2px solid #e5e7eb'
  },
  saveButton: {
    flex: 1,
    padding: '1rem 2rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: 600,
    fontSize: '1rem',
    cursor: 'pointer'
  },
  cancelButton: {
    padding: '1rem 2rem',
    backgroundColor: 'white',
    color: '#6b7280',
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    fontWeight: 500,
    cursor: 'pointer'
  },
  emptyEditor: {
    textAlign: 'center',
    paddingTop: '4rem',
    color: '#9ca3af'
  },
  emptyState: {
    textAlign: 'center',
    padding: '2rem 1rem',
    color: '#9ca3af'
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#8b5cf6',
    textDecoration: 'underline',
    cursor: 'pointer',
    marginTop: '0.5rem'
  },
  primaryButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer'
  },
  secondaryButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer'
  }
};

export default ThemeBuilder;
