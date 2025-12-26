import React, { useState, useEffect, useRef } from 'react';
import { useSchemaStore } from '../core/schema-store';
import { useThemeStore } from '../core/theme-store';
import type { ElementSchema } from '../core/schema-store';
import type { AdvancedThemeConfig } from '../core/theme-store';

interface LivePreviewProps {
  mode?: 'standalone' | 'embedded';
}

type DevicePreset = 'mobile' | 'tablet' | 'desktop' | 'custom';

interface DeviceSize {
  width: number;
  height: number;
  label: string;
}

const DEVICE_PRESETS: Record<DevicePreset, DeviceSize> = {
  mobile: { width: 375, height: 667, label: 'Mobile (375x667)' },
  tablet: { width: 768, height: 1024, label: 'Tablet (768x1024)' },
  desktop: { width: 1440, height: 900, label: 'Desktop (1440x900)' },
  custom: { width: 1024, height: 768, label: 'Custom' }
};

export const LivePreview: React.FC<LivePreviewProps> = ({ mode = 'standalone' }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<DevicePreset>('desktop');
  const [customSize, setCustomSize] = useState({ width: 1024, height: 768 });
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ type: string; message: string; timestamp: number }>>([]);
  const [showConsole, setShowConsole] = useState(false);

  const { schemas } = useSchemaStore();
  const { themes, activeThemeId } = useThemeStore();

  const currentSize = device === 'custom' ? customSize : DEVICE_PRESETS[device];
  const activeTheme = activeThemeId ? themes.get(activeThemeId) : null;

  // Generate preview HTML
  const generatePreviewHTML = (): string => {
    const schemaEntries = Array.from(schemas.values());
    const themeStyles = activeTheme ? generateThemeCSS(activeTheme.config) : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SightEdit Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 2rem;
      background: #f9fafb;
    }

    ${themeStyles}

    .preview-section {
      background: white;
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .preview-section h2 {
      margin-bottom: 1rem;
      color: #1f2937;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .preview-element {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border: 2px solid transparent;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .preview-element:hover {
      background: #f9fafb;
      border-color: #e5e7eb;
    }

    .preview-element.selected {
      border-color: #8b5cf6;
      background: #f5f3ff;
    }

    .element-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .element-value {
      display: block;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 1rem;
      background: white;
    }

    .element-value.text {
      font-family: inherit;
    }

    .element-value.richtext {
      min-height: 100px;
    }

    .element-value.number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .element-value.image {
      max-width: 300px;
      height: auto;
      border: none;
    }

    .element-value.color {
      width: 100px;
      height: 50px;
      border: 2px solid #d1d5db;
    }

    .element-info {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #f9fafb;
      border-radius: 4px;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .inspect-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 10000;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #9ca3af;
    }

    .empty-state h3 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  ${schemaEntries.length === 0 ? `
    <div class="empty-state">
      <h3>No Schemas Yet</h3>
      <p>Create a schema in the Schemas tab to see it here</p>
    </div>
  ` : schemaEntries.map(entry => `
    <div class="preview-section">
      <h2>${entry.name}</h2>
      ${generateSchemaPreview(entry.schema)}
    </div>
  `).join('\n')}

  <script>
    // Send console logs to parent
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    ['log', 'error', 'warn', 'info'].forEach(type => {
      console[type] = (...args) => {
        originalConsole[type](...args);
        window.parent.postMessage({
          type: 'console',
          level: type,
          message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
        }, '*');
      };
    });

    // Handle element selection
    document.addEventListener('click', (e) => {
      const element = e.target.closest('.preview-element');
      if (element) {
        e.preventDefault();
        document.querySelectorAll('.preview-element').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        window.parent.postMessage({
          type: 'element-selected',
          sight: element.dataset.sight
        }, '*');
      }
    });

    console.log('SightEdit Preview loaded with ${schemaEntries.length} schema(s)');
  </script>
</body>
</html>
    `.trim();
  };

  const generateSchemaPreview = (schema: ElementSchema): string => {
    const sampleValue = getSampleValue(schema);
    const attributeExample = generateAttributeExample(schema);

    return `
      <div class="preview-element" data-sight="${schema.sight}">
        <span class="element-label">${schema.sight} (${schema.type})</span>
        ${renderValue(schema.type, sampleValue)}
        <div class="element-info">
          <strong>Data Attribute:</strong><br>
          <code>${attributeExample}</code>
        </div>
      </div>
    `;
  };

  const renderValue = (type: string, value: any): string => {
    switch (type) {
      case 'text':
        return `<input class="element-value text" type="text" value="${value}" readonly>`;
      case 'richtext':
        return `<div class="element-value richtext" contenteditable="false">${value}</div>`;
      case 'number':
        return `<input class="element-value number" type="number" value="${value}" readonly>`;
      case 'image':
        return `<img class="element-value image" src="${value}" alt="Sample image">`;
      case 'color':
        return `<div class="element-value color" style="background-color: ${value}"></div>`;
      case 'date':
        return `<input class="element-value" type="date" value="${value}" readonly>`;
      case 'select':
        return `<select class="element-value" disabled><option>${value}</option></select>`;
      case 'checkbox':
        return `<input class="element-value" type="checkbox" ${value ? 'checked' : ''} disabled>`;
      default:
        return `<div class="element-value">${value}</div>`;
    }
  };

  const getSampleValue = (schema: ElementSchema): any => {
    switch (schema.type) {
      case 'text':
        return schema.properties?.placeholder || 'Sample text';
      case 'richtext':
        return '<p>Sample <strong>rich text</strong> content</p>';
      case 'number':
        return schema.properties?.min || 42;
      case 'image':
        return 'https://via.placeholder.com/300x200';
      case 'color':
        return '#8b5cf6';
      case 'date':
        return new Date().toISOString().split('T')[0];
      case 'select':
        return schema.properties?.options?.[0]?.value || 'Option 1';
      case 'checkbox':
        return true;
      default:
        return 'Sample value';
    }
  };

  const generateAttributeExample = (schema: ElementSchema): string => {
    const props = Object.entries(schema.properties || {})
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(',');

    return `data-sightedit="${schema.type}#${schema.sight}${props ? `[${props}]` : ''}"`;
  };

  const generateThemeCSS = (theme: AdvancedThemeConfig): string => {
    return `
      :root {
        --se-primary: ${theme.colors.primary};
        --se-primary-light: ${theme.colors.primaryLight};
        --se-primary-dark: ${theme.colors.primaryDark};
        --se-font-sans: ${theme.typography.fontFamily.sans};
        --se-font-size-base: ${theme.typography.fontSize.base};
        --se-border-radius-base: ${theme.borderRadius.base};
      }

      body {
        font-family: var(--se-font-sans);
        font-size: var(--se-font-size-base);
      }

      .preview-section {
        border-radius: var(--se-border-radius-base);
      }

      .preview-element:hover {
        border-color: var(--se-primary-light);
      }

      .preview-element.selected {
        border-color: var(--se-primary);
        background: ${theme.colors.primaryLight}20;
      }
    `;
  };

  // Update iframe content
  useEffect(() => {
    if (iframeRef.current) {
      const html = generatePreviewHTML();
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [schemas, activeTheme]);

  // Listen to iframe messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'console') {
        setLogs(prev => [...prev, {
          type: event.data.level,
          message: event.data.message,
          timestamp: Date.now()
        }]);
      } else if (event.data.type === 'element-selected') {
        setSelectedElement(event.data.sight);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.toolbarLabel}>Device:</span>
          <div style={styles.deviceButtons}>
            {(['mobile', 'tablet', 'desktop', 'custom'] as DevicePreset[]).map(d => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                style={{
                  ...styles.deviceButton,
                  ...(device === d ? styles.deviceButtonActive : {})
                }}
              >
                {d === 'mobile' && '📱'}
                {d === 'tablet' && '📱'}
                {d === 'desktop' && '💻'}
                {d === 'custom' && '⚙️'}
              </button>
            ))}
          </div>

          {device === 'custom' && (
            <div style={styles.customSize}>
              <input
                type="number"
                value={customSize.width}
                onChange={(e) => setCustomSize(s => ({ ...s, width: parseInt(e.target.value) }))}
                style={styles.sizeInput}
                placeholder="Width"
              />
              <span>×</span>
              <input
                type="number"
                value={customSize.height}
                onChange={(e) => setCustomSize(s => ({ ...s, height: parseInt(e.target.value) }))}
                style={styles.sizeInput}
                placeholder="Height"
              />
            </div>
          )}
        </div>

        <div style={styles.toolbarRight}>
          <button
            onClick={() => setInspectMode(!inspectMode)}
            style={{
              ...styles.toolButton,
              ...(inspectMode ? styles.toolButtonActive : {})
            }}
            title="Inspect Mode"
          >
            🔍 Inspect
          </button>
          <button
            onClick={() => setShowConsole(!showConsole)}
            style={{
              ...styles.toolButton,
              ...(showConsole ? styles.toolButtonActive : {})
            }}
            title="Console"
          >
            📝 Console {logs.length > 0 && `(${logs.length})`}
          </button>
          <button
            onClick={() => {
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.location.reload();
              }
            }}
            style={styles.toolButton}
            title="Reload"
          >
            🔄 Reload
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div style={styles.previewArea}>
        <div style={styles.iframeContainer}>
          <div
            style={{
              ...styles.iframeWrapper,
              width: `${currentSize.width}px`,
              height: `${currentSize.height}px`
            }}
          >
            <iframe
              ref={iframeRef}
              style={styles.iframe}
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>

        {/* Console Panel */}
        {showConsole && (
          <div style={styles.consolePanel}>
            <div style={styles.consoleHeader}>
              <span style={styles.consoleTitle}>Console</span>
              <button
                onClick={() => setLogs([])}
                style={styles.consoleClear}
              >
                Clear
              </button>
            </div>
            <div style={styles.consoleLogs}>
              {logs.length === 0 ? (
                <div style={styles.consoleEmpty}>No logs yet</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={styles.consoleLog}>
                    <span style={getLogStyle(log.type)}>{log.type.toUpperCase()}</span>
                    <span style={styles.consoleMessage}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inspector Panel */}
      {inspectMode && selectedElement && (
        <div style={styles.inspectorPanel}>
          <div style={styles.inspectorHeader}>
            <span style={styles.inspectorTitle}>Inspector</span>
            <button
              onClick={() => setSelectedElement(null)}
              style={styles.inspectorClose}
            >
              ✕
            </button>
          </div>
          <div style={styles.inspectorContent}>
            <div style={styles.inspectorRow}>
              <span style={styles.inspectorLabel}>Sight ID:</span>
              <span style={styles.inspectorValue}>{selectedElement}</span>
            </div>
            {schemas.get(selectedElement) && (
              <>
                <div style={styles.inspectorRow}>
                  <span style={styles.inspectorLabel}>Type:</span>
                  <span style={styles.inspectorValue}>{schemas.get(selectedElement)!.type}</span>
                </div>
                <div style={styles.inspectorRow}>
                  <span style={styles.inspectorLabel}>Properties:</span>
                  <pre style={styles.inspectorPre}>
                    {JSON.stringify(schemas.get(selectedElement)!.properties, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const getLogStyle = (type: string): React.CSSProperties => {
  const baseStyle: React.CSSProperties = {
    fontWeight: 600,
    marginRight: '0.5rem',
    fontSize: '0.75rem'
  };

  switch (type) {
    case 'error':
      return { ...baseStyle, color: '#ef4444' };
    case 'warn':
      return { ...baseStyle, color: '#f59e0b' };
    case 'info':
      return { ...baseStyle, color: '#3b82f6' };
    default:
      return { ...baseStyle, color: '#6b7280' };
  }
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9fafb'
  },
  toolbar: {
    height: '56px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1rem',
    gap: '1rem'
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  toolbarLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#6b7280'
  },
  deviceButtons: {
    display: 'flex',
    gap: '0.25rem',
    backgroundColor: '#f3f4f6',
    padding: '0.25rem',
    borderRadius: '0.375rem'
  },
  deviceButton: {
    padding: '0.5rem 1rem',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '1.25rem',
    transition: 'all 0.2s'
  },
  deviceButtonActive: {
    backgroundColor: 'white',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },
  customSize: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  sizeInput: {
    width: '80px',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  toolButton: {
    padding: '0.5rem 1rem',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    transition: 'all 0.2s'
  },
  toolButtonActive: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    borderColor: '#8b5cf6'
  },
  previewArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  iframeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '2rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  iframeWrapper: {
    backgroundColor: 'white',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'all 0.3s ease'
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block'
  },
  consolePanel: {
    width: '400px',
    backgroundColor: '#1f2937',
    borderLeft: '1px solid #374151',
    display: 'flex',
    flexDirection: 'column'
  },
  consoleHeader: {
    height: '48px',
    padding: '0 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #374151'
  },
  consoleTitle: {
    color: 'white',
    fontSize: '0.875rem',
    fontWeight: 600
  },
  consoleClear: {
    padding: '0.25rem 0.75rem',
    border: '1px solid #4b5563',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    transition: 'all 0.2s'
  },
  consoleLogs: {
    flex: 1,
    overflow: 'auto',
    padding: '0.5rem',
    fontFamily: 'monospace',
    fontSize: '0.75rem'
  },
  consoleEmpty: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280'
  },
  consoleLog: {
    padding: '0.5rem',
    borderBottom: '1px solid #374151',
    display: 'flex'
  },
  consoleMessage: {
    color: '#d1d5db',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  inspectorPanel: {
    width: '300px',
    backgroundColor: 'white',
    borderLeft: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column'
  },
  inspectorHeader: {
    height: '48px',
    padding: '0 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #e5e7eb'
  },
  inspectorTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#1f2937'
  },
  inspectorClose: {
    width: '24px',
    height: '24px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '1.25rem',
    color: '#6b7280'
  },
  inspectorContent: {
    flex: 1,
    overflow: 'auto',
    padding: '1rem'
  },
  inspectorRow: {
    marginBottom: '1rem'
  },
  inspectorLabel: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  inspectorValue: {
    display: 'block',
    fontSize: '0.875rem',
    color: '#1f2937'
  },
  inspectorPre: {
    fontSize: '0.75rem',
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    padding: '0.75rem',
    borderRadius: '0.375rem',
    overflow: 'auto'
  }
};
