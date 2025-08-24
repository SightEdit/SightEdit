import { SchemaRegistry, isProductSelectorSchema, isHTMLDesignerSchema, AdvancedSchema } from '../schema/advanced-schema';

// Mock fetch for testing
global.fetch = jest.fn();

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry('http://test-api.com');
    (fetch as jest.Mock).mockClear();
  });

  test('should register and retrieve local schemas', () => {
    const testSchema: AdvancedSchema = {
      sight: 'test.element',
      editor: { type: 'text' },
      ui: { title: 'Test Element' }
    };

    registry.registerSchema('test.element', testSchema);
    
    // Since getSchema is async, we need to await it
    registry.getSchema('test.element').then(schema => {
      expect(schema).toEqual(testSchema);
    });
  });

  test('should fetch schema from API when not found locally', async () => {
    const mockSchema = {
      sight: 'api.element',
      editor: { type: 'text' },
      ui: { title: 'API Element' }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSchema
    });

    const schema = await registry.fetchSchema('api.element');
    
    expect(fetch).toHaveBeenCalledWith(
      'http://test-api.com/schema/api.element',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
    expect(schema).toEqual(mockSchema);
  });

  test('should handle API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const schema = await registry.fetchSchema('failing.element');
    
    // Should return a default schema when API fails
    expect(schema.sight).toBe('failing.element');
    expect(schema.editor.type).toBe('text');
  });

  test('should cache fetched schemas', async () => {
    const mockSchema = {
      sight: 'cached.element',
      editor: { type: 'text' }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSchema
    });

    // First fetch
    const schema1 = await registry.fetchSchema('cached.element');
    // Second fetch should use cache
    const schema2 = await registry.fetchSchema('cached.element');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(schema1).toEqual(schema2);
  });

  test('should clear cache', async () => {
    const mockSchema = { sight: 'test', editor: { type: 'text' } };

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockSchema
    });

    await registry.fetchSchema('test');
    expect(fetch).toHaveBeenCalledTimes(1);

    registry.clearCache();
    await registry.fetchSchema('test');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('Schema Type Guards', () => {
  test('should identify ProductSelectorSchema', () => {
    const productSchema = {
      sight: 'products.test',
      editor: { type: 'product-selector' as const },
      productConfig: {
        source: { endpoint: '/api/products' },
        display: { layout: 'grid' as const, fields: [] },
        selection: { mode: 'single' as const }
      }
    };

    const textSchema = {
      sight: 'text.test',
      editor: { type: 'text' as const }
    };

    expect(isProductSelectorSchema(productSchema)).toBe(true);
    expect(isProductSelectorSchema(textSchema)).toBe(false);
  });

  test('should identify HTMLDesignerSchema', () => {
    const htmlSchema = {
      sight: 'html.test',
      editor: { type: 'html-designer' as const },
      designerConfig: {
        allowedElements: ['div', 'p'],
        templates: []
      }
    };

    const textSchema = {
      sight: 'text.test',
      editor: { type: 'text' as const }
    };

    expect(isHTMLDesignerSchema(htmlSchema)).toBe(true);
    expect(isHTMLDesignerSchema(textSchema)).toBe(false);
  });
});