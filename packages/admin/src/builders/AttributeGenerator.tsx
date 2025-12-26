import React, { useState, useMemo, useCallback } from 'react';
import { useSchemaStore, ElementSchema } from '../core/schema-store';
import toast from 'react-hot-toast';
import copy from 'copy-to-clipboard';

type AttributeFormat = 'json' | 'bracket' | 'simple' | 'legacy';
type CodeFormat = 'html' | 'react' | 'vue';

interface AttributeGeneratorProps {
  sight?: string;
  schema?: ElementSchema;
}

export const AttributeGenerator: React.FC<AttributeGeneratorProps> = ({
  sight: propSight,
  schema: propSchema
}) => {
  const { getSchema, getAllSchemas } = useSchemaStore();
  const allSchemas = getAllSchemas();

  const [selectedSight, setSelectedSight] = useState(propSight || '');
  const [attributeFormat, setAttributeFormat] = useState<AttributeFormat>('json');
  const [codeFormat, setCodeFormat] = useState<CodeFormat>('html');

  const currentSchema = useMemo(() => {
    if (propSchema) return propSchema;
    if (selectedSight) {
      return getSchema(selectedSight)?.schema;
    }
    return null;
  }, [propSchema, selectedSight, getSchema]);

  /**
   * Generate data attribute string
   */
  const generateDataAttribute = useCallback((
    sight: string,
    schema: ElementSchema,
    format: AttributeFormat
  ): string => {
    switch (format) {
      case 'json':
        return JSON.stringify({
          type: schema.type,
          id: sight,
          ...( schema.label && { label: schema.label }),
          ...(schema.placeholder && { placeholder: schema.placeholder }),
          ...(schema.required && { required: true }),
          ...(schema.minLength && { minLength: schema.minLength }),
          ...(schema.maxLength && { maxLength: schema.maxLength }),
          ...(schema.min !== undefined && { min: schema.min }),
          ...(schema.max !== undefined && { max: schema.max })
        });

      case 'bracket':
        const parts = [`${schema.type}#${sight}`];
        const params: string[] = [];

        if (schema.required) params.push('required');
        if (schema.minLength) params.push(`minLength:${schema.minLength}`);
        if (schema.maxLength) params.push(`maxLength:${schema.maxLength}`);
        if (schema.min !== undefined) params.push(`min:${schema.min}`);
        if (schema.max !== undefined) params.push(`max:${schema.max}`);
        if (schema.placeholder) params.push(`placeholder:"${schema.placeholder}"`);

        if (params.length > 0) {
          parts.push(`[${params.join(',')}]`);
        }

        return parts.join('');

      case 'simple':
        return `${schema.type}#${sight}`;

      case 'legacy':
        return sight;

      default:
        return '';
    }
  }, []);

  /**
   * Generate code snippet
   */
  const generateCodeSnippet = useCallback((
    sight: string,
    schema: ElementSchema,
    format: CodeFormat,
    attrFormat: AttributeFormat
  ): string => {
    const dataAttr = generateDataAttribute(sight, schema, attrFormat);

    switch (format) {
      case 'html':
        if (attrFormat === 'json') {
          return `<div data-sightedit='${dataAttr}'>
  Your content here
</div>`;
        } else if (attrFormat === 'legacy') {
          return `<div data-sight="${dataAttr}" data-sight-type="${schema.type}">
  Your content here
</div>`;
        } else {
          return `<div data-sightedit="${dataAttr}">
  Your content here
</div>`;
        }

      case 'react':
        const props: string[] = [
          `sight="${sight}"`,
          `type="${schema.type}"`
        ];

        if (schema.required) props.push('required');
        if (schema.minLength) props.push(`minLength={${schema.minLength}}`);
        if (schema.maxLength) props.push(`maxLength={${schema.maxLength}}`);
        if (schema.min !== undefined) props.push(`min={${schema.min}}`);
        if (schema.max !== undefined) props.push(`max={${schema.max}}`);
        if (schema.placeholder) props.push(`placeholder="${schema.placeholder}"`);

        return `import { Editable } from '@sightedit/react';

<Editable ${props.join(' ')}>
  Your content here
</Editable>`;

      case 'vue':
        const vueAttrs: string[] = [
          `v-sightedit="${sight}"`,
          `data-sight-type="${schema.type}"`
        ];

        if (schema.required) vueAttrs.push('data-sight-required="true"');
        if (schema.minLength) vueAttrs.push(`data-sight-min-length="${schema.minLength}"`);
        if (schema.maxLength) vueAttrs.push(`data-sight-max-length="${schema.maxLength}"`);

        return `<template>
  <div ${vueAttrs.join('\n       ')}>
    Your content here
  </div>
</template>`;

      default:
        return '';
    }
  }, [generateDataAttribute]);

  const generatedCode = useMemo(() => {
    if (!selectedSight || !currentSchema) return '';
    return generateCodeSnippet(selectedSight, currentSchema, codeFormat, attributeFormat);
  }, [selectedSight, currentSchema, codeFormat, attributeFormat, generateCodeSnippet]);

  const handleCopy = useCallback(() => {
    if (generatedCode) {
      copy(generatedCode);
      toast.success('Copied to clipboard!');
    }
  }, [generatedCode]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Data Attribute Generator</h2>
        <p style={styles.subtitle}>Generate ready-to-use code snippets for your schemas</p>
      </div>

      <div style={styles.content}>
        {/* Schema Selector */}
        <div style={styles.section}>
          <label style={styles.label}>Select Schema</label>
          <select
            value={selectedSight}
            onChange={(e) => setSelectedSight(e.target.value)}
            style={styles.select}
          >
            <option value="">Choose a schema...</option>
            {allSchemas.map(entry => (
              <option key={entry.sight} value={entry.sight}>
                {entry.sight} ({entry.schema.type})
              </option>
            ))}
          </select>
        </div>

        {currentSchema && (
          <>
            {/* Schema Preview */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Schema Preview</h3>
              <div style={styles.schemaPreview}>
                <div style={styles.schemaRow}>
                  <span style={styles.schemaLabel}>Type:</span>
                  <span style={styles.schemaValue}>{currentSchema.type}</span>
                </div>
                {currentSchema.label && (
                  <div style={styles.schemaRow}>
                    <span style={styles.schemaLabel}>Label:</span>
                    <span style={styles.schemaValue}>{currentSchema.label}</span>
                  </div>
                )}
                {currentSchema.required && (
                  <div style={styles.schemaRow}>
                    <span style={styles.schemaLabel}>Required:</span>
                    <span style={styles.schemaBadge}>Yes</span>
                  </div>
                )}
              </div>
            </div>

            {/* Format Selectors */}
            <div style={styles.formatSelectors}>
              <div style={styles.formatGroup}>
                <label style={styles.label}>Code Format</label>
                <div style={styles.buttonGroup}>
                  {(['html', 'react', 'vue'] as CodeFormat[]).map(format => (
                    <button
                      key={format}
                      onClick={() => setCodeFormat(format)}
                      style={{
                        ...styles.formatButton,
                        ...(codeFormat === format ? styles.formatButtonActive : {})
                      }}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.formatGroup}>
                <label style={styles.label}>Attribute Format</label>
                <div style={styles.buttonGroup}>
                  {(['json', 'bracket', 'simple', 'legacy'] as AttributeFormat[]).map(format => (
                    <button
                      key={format}
                      onClick={() => setAttributeFormat(format)}
                      style={{
                        ...styles.formatButton,
                        ...(attributeFormat === format ? styles.formatButtonActive : {})
                      }}
                    >
                      {format.charAt(0).toUpperCase() + format.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generated Code */}
            <div style={styles.section}>
              <div style={styles.codeHeader}>
                <h3 style={styles.sectionTitle}>Generated Code</h3>
                <button onClick={handleCopy} style={styles.copyButton}>
                  📋 Copy to Clipboard
                </button>
              </div>
              <pre style={styles.codeBlock}>
                <code>{generatedCode}</code>
              </pre>
            </div>

            {/* Format Examples */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Format Examples</h3>
              <div style={styles.examplesGrid}>
                <div style={styles.exampleCard}>
                  <h4 style={styles.exampleTitle}>JSON</h4>
                  <code style={styles.exampleCode}>
                    {`data-sightedit='{"type":"text","id":"title"}'`}
                  </code>
                  <p style={styles.exampleDesc}>Full configuration as JSON object</p>
                </div>

                <div style={styles.exampleCard}>
                  <h4 style={styles.exampleTitle}>Bracket</h4>
                  <code style={styles.exampleCode}>
                    {`data-sightedit="text#title[required,maxLength:100]"`}
                  </code>
                  <p style={styles.exampleDesc}>Compact notation with validation rules</p>
                </div>

                <div style={styles.exampleCard}>
                  <h4 style={styles.exampleTitle}>Simple</h4>
                  <code style={styles.exampleCode}>
                    {`data-sightedit="text#title"`}
                  </code>
                  <p style={styles.exampleDesc}>Minimal format (type + ID)</p>
                </div>

                <div style={styles.exampleCard}>
                  <h4 style={styles.exampleTitle}>Legacy</h4>
                  <code style={styles.exampleCode}>
                    {`data-sight="title" data-sight-type="text"`}
                  </code>
                  <p style={styles.exampleDesc}>Old format (separate attributes)</p>
                </div>
              </div>
            </div>
          </>
        )}

        {!currentSchema && (
          <div style={styles.emptyState}>
            <p>Select a schema to generate code</p>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9fafb'
  },
  header: {
    padding: '2rem',
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb'
  },
  title: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827'
  },
  subtitle: {
    margin: 0,
    color: '#6b7280',
    fontSize: '0.875rem'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '2rem',
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%'
  },
  section: {
    marginBottom: '2rem',
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    margin: '0 0 1rem 0',
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#111827'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151'
  },
  select: {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    backgroundColor: 'white'
  },
  schemaPreview: {
    backgroundColor: '#f9fafb',
    padding: '1rem',
    borderRadius: '0.375rem'
  },
  schemaRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #e5e7eb'
  },
  schemaLabel: {
    minWidth: '100px',
    fontWeight: 500,
    fontSize: '0.875rem',
    color: '#6b7280'
  },
  schemaValue: {
    fontSize: '0.875rem',
    color: '#111827'
  },
  schemaBadge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500
  },
  formatSelectors: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    marginBottom: '2rem'
  },
  formatGroup: {
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  buttonGroup: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap'
  },
  formatButton: {
    padding: '0.5rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    backgroundColor: 'white',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  formatButtonActive: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    borderColor: '#8b5cf6'
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  copyButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  codeBlock: {
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    padding: '1.5rem',
    borderRadius: '0.5rem',
    overflow: 'auto',
    fontSize: '0.875rem',
    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
    lineHeight: 1.6,
    margin: 0
  },
  examplesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem'
  },
  exampleCard: {
    padding: '1rem',
    backgroundColor: '#f9fafb',
    borderRadius: '0.375rem',
    border: '1px solid #e5e7eb'
  },
  exampleTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#111827'
  },
  exampleCode: {
    display: 'block',
    padding: '0.5rem',
    backgroundColor: '#1f2937',
    color: '#10b981',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
    marginBottom: '0.5rem',
    overflowX: 'auto'
  },
  exampleDesc: {
    margin: 0,
    fontSize: '0.75rem',
    color: '#6b7280'
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    color: '#9ca3af'
  }
};

export default AttributeGenerator;
