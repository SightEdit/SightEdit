import React from 'react';
import { useEditMode, useSightEdit } from '../index';
import { useHistory } from '../hooks/useHistory';
import { useAutoSave } from '../hooks/useAutoSave';

export interface ToolbarProps {
  className?: string;
  style?: React.CSSProperties;
  showHistory?: boolean;
  showAutoSave?: boolean;
  showEditToggle?: boolean;
  position?: 'top' | 'bottom' | 'fixed';
  children?: React.ReactNode;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  className = '',
  style,
  showHistory = true,
  showAutoSave = true,
  showEditToggle = true,
  position = 'fixed',
  children
}) => {
  const { isEditMode, toggleEditMode } = useEditMode();
  const { canUndo, canRedo, undo, redo } = useHistory();
  const { isSaving, lastSaved, hasPendingChanges, saveNow } = useAutoSave({
    interval: 30000,
    debounce: 1000
  });

  const baseStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    zIndex: 9999,
    ...style
  };

  const positionStyles: React.CSSProperties = position === 'fixed' ? {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)'
  } : position === 'top' ? {
    position: 'sticky',
    top: '20px'
  } : {
    position: 'sticky',
    bottom: '20px'
  };

  const finalStyles = { ...baseStyles, ...positionStyles };

  const formatLastSaved = () => {
    if (!lastSaved) return 'Not saved';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);
    
    if (diff < 60) return 'Just saved';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (!isEditMode && showEditToggle) {
    return (
      <div className={`sightedit-toolbar ${className}`} style={finalStyles}>
        <button
          onClick={toggleEditMode}
          style={{
            padding: '6px 12px',
            background: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          ✏️ Edit Page
        </button>
      </div>
    );
  }

  if (!isEditMode) return null;

  return (
    <div className={`sightedit-toolbar ${className}`} style={finalStyles}>
      {showEditToggle && (
        <button
          onClick={toggleEditMode}
          style={buttonStyles}
          title="Exit edit mode (Ctrl+E)"
        >
          ✓ Done
        </button>
      )}

      {showHistory && (
        <>
          <div style={{ width: '1px', height: '20px', background: '#e0e0e0' }} />
          <button
            onClick={undo}
            disabled={!canUndo}
            style={{
              ...buttonStyles,
              opacity: canUndo ? 1 : 0.5,
              cursor: canUndo ? 'pointer' : 'not-allowed'
            }}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            style={{
              ...buttonStyles,
              opacity: canRedo ? 1 : 0.5,
              cursor: canRedo ? 'pointer' : 'not-allowed'
            }}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>
        </>
      )}

      {showAutoSave && (
        <>
          <div style={{ width: '1px', height: '20px', background: '#e0e0e0' }} />
          {isSaving ? (
            <span style={{ fontSize: '12px', color: '#666' }}>
              Saving...
            </span>
          ) : hasPendingChanges ? (
            <button
              onClick={saveNow}
              style={{
                ...buttonStyles,
                background: '#4caf50',
                color: 'white'
              }}
            >
              Save Now
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {formatLastSaved()}
            </span>
          )}
        </>
      )}

      {children && (
        <>
          <div style={{ width: '1px', height: '20px', background: '#e0e0e0' }} />
          {children}
        </>
      )}
    </div>
  );
};

const buttonStyles: React.CSSProperties = {
  padding: '4px 10px',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.2s'
};