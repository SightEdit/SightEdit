import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { SchemaBuilder } from './builders/SchemaBuilder';
import { AttributeGenerator } from './builders/AttributeGenerator';
import { ThemeBuilder } from './builders/ThemeBuilder';
import { LivePreview } from './components/LivePreview';

type Tab = 'schemas' | 'attributes' | 'themes' | 'preview';

interface AdminPanelProps {
  mode?: 'standalone' | 'embedded';
  onClose?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  mode = 'standalone',
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('schemas');

  return (
    <div style={styles.container}>
      <Toaster position="top-right" />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>⚡</span>
            <span style={styles.logoText}>SightEdit</span>
            <span style={styles.logoLabel}>Admin Panel</span>
          </div>
        </div>

        <div style={styles.headerRight}>
          {mode === 'embedded' && onClose && (
            <button onClick={onClose} style={styles.closeButton}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('schemas')}
          style={{
            ...styles.tab,
            ...(activeTab === 'schemas' ? styles.tabActive : {})
          }}
        >
          📝 Schemas
        </button>
        <button
          onClick={() => setActiveTab('attributes')}
          style={{
            ...styles.tab,
            ...(activeTab === 'attributes' ? styles.tabActive : {})
          }}
        >
          🔖 Code Generator
        </button>
        <button
          onClick={() => setActiveTab('themes')}
          style={{
            ...styles.tab,
            ...(activeTab === 'themes' ? styles.tabActive : {})
          }}
        >
          🎨 Themes
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          style={{
            ...styles.tab,
            ...(activeTab === 'preview' ? styles.tabActive : {})
          }}
        >
          👁️ Preview
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === 'schemas' && <SchemaBuilder />}
        {activeTab === 'attributes' && <AttributeGenerator />}
        {activeTab === 'themes' && <ThemeBuilder />}
        {activeTab === 'preview' && <LivePreview mode={mode} />}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          SightEdit v2.0.0-alpha.1 • Visual Builder
        </span>
        <a
          href="https://github.com/sightedit/sightedit"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.footerLink}
        >
          Documentation
        </a>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9fafb',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  header: {
    height: '64px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  logoIcon: {
    fontSize: '1.5rem'
  },
  logoText: {
    fontSize: '1.25rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  logoLabel: {
    fontSize: '0.875rem',
    color: '#6b7280',
    fontWeight: 500
  },
  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '0.375rem',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  tabs: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    padding: '0 2rem'
  },
  tab: {
    padding: '1rem 1.5rem',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#6b7280',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
    position: 'relative'
  },
  tabActive: {
    color: '#8b5cf6',
    borderBottomColor: '#8b5cf6'
  },
  content: {
    flex: 1,
    overflow: 'hidden'
  },
  footer: {
    height: '48px',
    backgroundColor: 'white',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem',
    fontSize: '0.75rem'
  },
  footerText: {
    color: '#9ca3af'
  },
  footerLink: {
    color: '#8b5cf6',
    textDecoration: 'none',
    fontWeight: 500
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af'
  }
};

export default AdminPanel;
