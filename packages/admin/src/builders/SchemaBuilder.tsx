import React, { useState, useCallback } from 'react';
import { useSchemaStore, ElementSchema, SchemaEntry, validateSchema } from '../core/schema-store';
import toast from 'react-hot-toast';

/**
 * Editor type options
 */
const EDITOR_TYPES = [
  { value: 'text', label: 'Text', icon: '📝' },
  { value: 'richtext', label: 'Rich Text', icon: '✍️' },
  { value: 'number', label: 'Number', icon: '🔢' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'color', label: 'Color', icon: '🎨' },
  { value: 'image', label: 'Image', icon: '🖼️' },
  { value: 'file', label: 'File', icon: '📁' },
  { value: 'link', label: 'Link', icon: '🔗' },
  { value: 'select', label: 'Select', icon: '📋' },
  { value: 'collection', label: 'Collection', icon: '📦' },
  { value: 'json', label: 'JSON', icon: '{ }' },
  { value: 'markdown', label: 'Markdown', icon: '📄' }
];

interface SchemaBuilderProps {
  onSchemaCreated?: (sight: string, schema: ElementSchema) => void;
  onSchemaUpdated?: (sight: string, schema: ElementSchema) => void;
}

export const SchemaBuilder: React.FC<SchemaBuilderProps> = ({
  onSchemaCreated,
  onSchemaUpdated
}) => {
  const {
    schemas,
    selectedSight,
    searchQuery,
    filterType,
    addSchema,
    updateSchema,
    deleteSchema,
    getSchema,
    getAllSchemas,
    setSelectedSight,
    setSearchQuery,
    setFilterType,
    exportSchemas,
    importSchemas
  } = useSchemaStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingSight, setEditingSight] = useState<string>('');
  const [editingSchema, setEditingSchema] = useState<Partial<ElementSchema>>({
    type: 'text'
  });

  const allSchemas = getAllSchemas();

  const handleCreateNew = useCallback(() => {
    setIsCreating(true);
    setEditingSight('');
    setEditingSchema({ type: 'text' });
    setSelectedSight(null);
  }, [setSelectedSight]);

  const handleEdit = useCallback((entry: SchemaEntry) => {
    setIsCreating(false);
    setEditingSight(entry.sight);
    setEditingSchema(entry.schema);
    setSelectedSight(entry.sight);
  }, [setSelectedSight]);

  const handleSave = useCallback(() => {
    if (!editingSight.trim()) {
      toast.error('Please enter a sight identifier');
      return;
    }

    if (!editingSchema.type) {
      toast.error('Please select an editor type');
      return;
    }

    const validation = validateSchema(editingSchema as ElementSchema);
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    if (isCreating) {
      addSchema(editingSight, editingSchema as ElementSchema);
      toast.success(`Schema "${editingSight}" created!`);
      onSchemaCreated?.(editingSight, editingSchema as ElementSchema);
    } else {
      updateSchema(editingSight, editingSchema);
      toast.success(`Schema "${editingSight}" updated!`);
      onSchemaUpdated?.(editingSight, editingSchema as ElementSchema);
    }

    setIsCreating(false);
    setEditingSight('');
    setEditingSchema({ type: 'text' });
  }, [editingSight, editingSchema, isCreating, addSchema, updateSchema, onSchemaCreated, onSchemaUpdated]);

  const handleDelete = useCallback((sight: string) => {
    if (window.confirm(`Delete schema "${sight}"?`)) {
      deleteSchema(sight);
      toast.success(`Schema "${sight}" deleted`);
      if (selectedSight === sight) {
        setSelectedSight(null);
      }
    }
  }, [deleteSchema, selectedSight, setSelectedSight]);

  const handleExport = useCallback(() => {
    const json = exportSchemas();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sightedit-schemas-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Schemas exported!');
  }, [exportSchemas]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        importSchemas(json);
        toast.success('Schemas imported!');
      } catch (error) {
        toast.error('Failed to import schemas');
      }
    };
    reader.readAsText(file);
  }, [importSchemas]);

  const updateField = useCallback((field: keyof ElementSchema, value: any) => {
    setEditingSchema(prev => ({ ...prev, [field]: value }));
  }, []);

  return (
    <div className="schema-builder" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Schema Configuration Builder</h2>
        <div style={styles.headerActions}>
          <button onClick={handleCreateNew} style={styles.primaryButton}>
            + New Schema
          </button>
          <button onClick={handleExport} style={styles.secondaryButton}>
            📤 Export
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
        {/* Sidebar - Schema List */}
        <div style={styles.sidebar}>
          <div style={styles.searchBox}>
            <input
              type="text"
              placeholder="Search schemas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.filterBox}>
            <select
              value={filterType || ''}
              onChange={(e) => setFilterType(e.target.value || null)}
              style={styles.filterSelect}
            >
              <option value="">All Types</option>
              {EDITOR_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.schemaList}>
            {allSchemas.length === 0 && (
              <div style={styles.emptyState}>
                <p>No schemas yet</p>
                <button onClick={handleCreateNew} style={styles.linkButton}>
                  Create your first schema
                </button>
              </div>
            )}

            {allSchemas.map(entry => (
              <div
                key={entry.sight}
                style={{
                  ...styles.schemaItem,
                  ...(selectedSight === entry.sight ? styles.schemaItemActive : {})
                }}
                onClick={() => handleEdit(entry)}
              >
                <div style={styles.schemaItemHeader}>
                  <span style={styles.schemaIcon}>
                    {EDITOR_TYPES.find(t => t.value === entry.schema.type)?.icon || '📝'}
                  </span>
                  <span style={styles.schemaSight}>{entry.sight}</span>
                </div>
                <div style={styles.schemaItemMeta}>
                  <span style={styles.schemaType}>{entry.schema.type}</span>
                  {entry.schema.required && <span style={styles.requiredBadge}>Required</span>}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.sight);
                  }}
                  style={styles.deleteButton}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor */}
        <div style={styles.mainEditor}>
          {(isCreating || selectedSight) ? (
            <div style={styles.editorForm}>
              <h3 style={styles.editorTitle}>
                {isCreating ? 'Create New Schema' : `Edit: ${editingSight}`}
              </h3>

              {/* Sight Identifier */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Sight Identifier *</label>
                <input
                  type="text"
                  value={editingSight}
                  onChange={(e) => setEditingSight(e.target.value)}
                  placeholder="e.g., product.title, hero.heading"
                  disabled={!isCreating}
                  style={styles.input}
                />
                <small style={styles.helpText}>
                  Unique identifier for this field (cannot be changed after creation)
                </small>
              </div>

              {/* Editor Type */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Editor Type *</label>
                <div style={styles.editorTypeGrid}>
                  {EDITOR_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => updateField('type', type.value)}
                      style={{
                        ...styles.editorTypeButton,
                        ...(editingSchema.type === type.value ? styles.editorTypeButtonActive : {})
                      }}
                    >
                      <span style={styles.editorTypeIcon}>{type.icon}</span>
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Common Fields */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Label</label>
                <input
                  type="text"
                  value={editingSchema.label || ''}
                  onChange={(e) => updateField('label', e.target.value)}
                  placeholder="Field label"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Placeholder</label>
                <input
                  type="text"
                  value={editingSchema.placeholder || ''}
                  onChange={(e) => updateField('placeholder', e.target.value)}
                  placeholder="Placeholder text"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editingSchema.required || false}
                    onChange={(e) => updateField('required', e.target.checked)}
                  />
                  <span>Required field</span>
                </label>
              </div>

              {/* Type-specific Fields */}
              <TypeSpecificFields
                type={editingSchema.type}
                schema={editingSchema}
                updateField={updateField}
              />

              {/* Actions */}
              <div style={styles.formActions}>
                <button onClick={handleSave} style={styles.saveButton}>
                  💾 Save Schema
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedSight(null);
                  }}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyEditor}>
              <h3>Select a schema to edit</h3>
              <p>or create a new one</p>
              <button onClick={handleCreateNew} style={styles.primaryButton}>
                + New Schema
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Type-specific configuration fields
 */
const TypeSpecificFields: React.FC<{
  type?: string;
  schema: Partial<ElementSchema>;
  updateField: (field: keyof ElementSchema, value: any) => void;
}> = ({ type, schema, updateField }) => {
  if (!type) return null;

  switch (type) {
    case 'text':
    case 'richtext':
      return (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Min Length</label>
            <input
              type="number"
              value={schema.minLength || ''}
              onChange={(e) => updateField('minLength', parseInt(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Max Length</label>
            <input
              type="number"
              value={schema.maxLength || ''}
              onChange={(e) => updateField('maxLength', parseInt(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
        </>
      );

    case 'number':
      return (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Min Value</label>
            <input
              type="number"
              value={schema.min || ''}
              onChange={(e) => updateField('min', parseFloat(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Max Value</label>
            <input
              type="number"
              value={schema.max || ''}
              onChange={(e) => updateField('max', parseFloat(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Step</label>
            <input
              type="number"
              value={schema.step || ''}
              onChange={(e) => updateField('step', parseFloat(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Currency (optional)</label>
            <input
              type="text"
              value={schema.currency || ''}
              onChange={(e) => updateField('currency', e.target.value || undefined)}
              placeholder="USD, EUR, etc."
              style={styles.input}
            />
          </div>
        </>
      );

    case 'image':
      return (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Max Size</label>
            <input
              type="text"
              value={schema.maxSize || ''}
              onChange={(e) => updateField('maxSize', e.target.value || undefined)}
              placeholder="e.g., 5MB"
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Aspect Ratio</label>
            <input
              type="text"
              value={schema.aspectRatio || ''}
              onChange={(e) => updateField('aspectRatio', e.target.value || undefined)}
              placeholder="e.g., 16:9, 1:1"
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={schema.crop || false}
                onChange={(e) => updateField('crop', e.target.checked)}
              />
              <span>Enable cropping</span>
            </label>
          </div>
        </>
      );

    case 'date':
      return (
        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={schema.includeTime || false}
              onChange={(e) => updateField('includeTime', e.target.checked)}
            />
            <span>Include time</span>
          </label>
        </div>
      );

    case 'collection':
      return (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Item Type *</label>
            <input
              type="text"
              value={schema.itemType || ''}
              onChange={(e) => updateField('itemType', e.target.value)}
              placeholder="e.g., text, image"
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Min Items</label>
            <input
              type="number"
              value={schema.minItems || ''}
              onChange={(e) => updateField('minItems', parseInt(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Max Items</label>
            <input
              type="number"
              value={schema.maxItems || ''}
              onChange={(e) => updateField('maxItems', parseInt(e.target.value) || undefined)}
              style={styles.input}
            />
          </div>
        </>
      );

    default:
      return null;
  }
};

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
    fontWeight: 600,
    color: '#111827'
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
    width: '320px',
    backgroundColor: 'white',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column'
  },
  searchBox: {
    padding: '1rem',
    borderBottom: '1px solid #e5e7eb'
  },
  searchInput: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  filterBox: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #e5e7eb'
  },
  filterSelect: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  schemaList: {
    flex: 1,
    overflow: 'auto',
    padding: '0.5rem'
  },
  schemaItem: {
    padding: '0.75rem',
    marginBottom: '0.5rem',
    backgroundColor: '#f9fafb',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s'
  },
  schemaItemActive: {
    backgroundColor: '#ede9fe',
    borderLeft: '3px solid #8b5cf6'
  },
  schemaItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem'
  },
  schemaIcon: {
    fontSize: '1.25rem'
  },
  schemaSight: {
    fontWeight: 500,
    fontSize: '0.875rem',
    color: '#111827'
  },
  schemaItemMeta: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.75rem'
  },
  schemaType: {
    color: '#6b7280',
    textTransform: 'capitalize'
  },
  requiredBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    fontSize: '0.625rem',
    fontWeight: 500
  },
  deleteButton: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    opacity: 0.5,
    transition: 'opacity 0.2s'
  },
  mainEditor: {
    flex: 1,
    overflow: 'auto',
    padding: '2rem'
  },
  emptyEditor: {
    textAlign: 'center',
    paddingTop: '4rem',
    color: '#6b7280'
  },
  editorForm: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  editorTitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.25rem',
    fontWeight: 600
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151'
  },
  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  helpText: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#6b7280'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer'
  },
  editorTypeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem'
  },
  editorTypeButton: {
    padding: '0.75rem',
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    backgroundColor: 'white',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    transition: 'all 0.2s',
    fontSize: '0.75rem'
  },
  editorTypeButtonActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff'
  },
  editorTypeIcon: {
    fontSize: '1.5rem'
  },
  formActions: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #e5e7eb'
  },
  primaryButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  secondaryButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem 1.5rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'white',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#8b5cf6',
    textDecoration: 'underline',
    cursor: 'pointer',
    marginTop: '0.5rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '2rem 1rem',
    color: '#9ca3af'
  }
};

export default SchemaBuilder;
