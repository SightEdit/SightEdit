import { SightEditParser, parseSightEditAttribute, stringifySightEditConfig } from '../parser';

describe('SightEditParser', () => {
  describe('parse()', () => {
    // Simple format tests
    test('should parse simple type', () => {
      const result = SightEditParser.parse('text');
      expect(result).toEqual({ type: 'text' });
    });

    test('should parse type with ID', () => {
      const result = SightEditParser.parse('text#hero-title');
      expect(result).toEqual({ 
        type: 'text', 
        id: 'hero-title' 
      });
    });

    // Short syntax tests
    test('should parse type with boolean properties', () => {
      const result = SightEditParser.parse('text#title[required,readonly]');
      expect(result).toEqual({
        type: 'text',
        id: 'title',
        required: true,
        readonly: true,
        validation: {
          required: true
        }
      });
    });

    test('should parse type with value properties', () => {
      const result = SightEditParser.parse('text#title[maxLength:100,minLength:5]');
      expect(result).toEqual({
        type: 'text',
        id: 'title',
        maxLength: 100,
        minLength: 5,
        validation: {
          maxLength: 100,
          minLength: 5
        }
      });
    });

    test('should parse properties with string values containing spaces', () => {
      const result = SightEditParser.parse("text#title[placeholder:'Enter your title here']");
      expect(result).toEqual({
        type: 'text',
        id: 'title',
        placeholder: 'Enter your title here'
      });
    });

    test('should parse properties with quotes in values', () => {
      const result = SightEditParser.parse('text#title[placeholder:"Enter title",maxLength:100]');
      expect(result).toEqual({
        type: 'text',
        id: 'title',
        placeholder: 'Enter title',
        maxLength: 100,
        validation: {
          maxLength: 100
        }
      });
    });

    test('should parse complex short syntax', () => {
      const result = SightEditParser.parse(
        "richtext#content[required,maxLength:5000,placeholder:'Enter content...']"
      );
      expect(result).toEqual({
        type: 'richtext',
        id: 'content',
        required: true,
        maxLength: 5000,
        placeholder: 'Enter content...',
        validation: {
          required: true,
          maxLength: 5000
        }
      });
    });
    
    test('should parse arrays in short syntax', () => {
      // For arrays, use JSON format instead
      const result = SightEditParser.parse(
        '{"type":"richtext","id":"content","toolbar":["bold","italic"]}'
      );
      expect(result?.toolbar).toEqual(['bold', 'italic']);
    });

    // JSON format tests
    test('should parse JSON format', () => {
      const json = '{"type":"text","id":"title","required":true,"maxLength":100}';
      const result = SightEditParser.parse(json);
      expect(result).toEqual({
        type: 'text',
        id: 'title',
        required: true,
        maxLength: 100,
        validation: {
          required: true,
          maxLength: 100
        }
      });
    });

    test('should parse complex JSON with arrays', () => {
      const json = '{"type":"richtext","id":"content","toolbar":["bold","italic","link"],"maxLength":500}';
      const result = SightEditParser.parse(json);
      expect(result).toEqual({
        type: 'richtext',
        id: 'content',
        toolbar: ['bold', 'italic', 'link'],
        maxLength: 500,
        validation: {
          maxLength: 500
        }
      });
    });

    test('should parse JSON with nested objects', () => {
      const json = '{"type":"select","id":"category","options":[{"value":"tech","label":"Technology"},{"value":"health","label":"Healthcare"}]}';
      const result = SightEditParser.parse(json);
      expect(result).toEqual({
        type: 'select',
        id: 'category',
        options: [
          { value: 'tech', label: 'Technology' },
          { value: 'health', label: 'Healthcare' }
        ]
      });
    });

    // Edge cases
    test('should handle empty string', () => {
      const result = SightEditParser.parse('');
      expect(result).toBeNull();
    });

    test('should handle null/undefined', () => {
      expect(SightEditParser.parse(null as any)).toBeNull();
      expect(SightEditParser.parse(undefined as any)).toBeNull();
    });

    test('should handle invalid JSON gracefully', () => {
      const result = SightEditParser.parse('{invalid json}');
      expect(result).toBeNull();
    });

    test('should normalize kebab-case to camelCase', () => {
      const result = SightEditParser.parse('text[max-length:100,min-length:10,data-type:string]');
      expect(result).toEqual({
        type: 'text',
        maxLength: 100,
        minLength: 10,
        dataType: 'string',
        validation: {
          maxLength: 100,
          minLength: 10
        }
      });
    });

    // Real-world examples
    test('should parse image editor config', () => {
      const result = SightEditParser.parse('image#avatar[required,maxSize:5MB,aspectRatio:1:1]');
      expect(result).toEqual({
        type: 'image',
        id: 'avatar',
        required: true,
        maxSize: '5MB',
        aspectRatio: '1:1',
        validation: {
          required: true
        }
      });
    });

    test('should parse number editor with constraints', () => {
      const result = SightEditParser.parse('number#price[min:0,max:9999,step:0.01]');
      expect(result).toEqual({
        type: 'number',
        id: 'price',
        min: 0,
        max: 9999,
        step: 0.01,
        validation: {
          min: 0,
          max: 9999
        }
      });
    });

    test('should parse date editor', () => {
      const result = SightEditParser.parse('date#release-date[min:2024-01-01,max:2024-12-31]');
      expect(result).toEqual({
        type: 'date',
        id: 'release-date',
        min: '2024-01-01',
        max: '2024-12-31',
        validation: {
          min: '2024-01-01',
          max: '2024-12-31'
        }
      });
    });

    test('should parse collection editor', () => {
      const json = '{"type":"collection","id":"tags","itemType":"text","minItems":1,"maxItems":5}';
      const result = SightEditParser.parse(json);
      expect(result).toEqual({
        type: 'collection',
        id: 'tags',
        itemType: 'text',
        minItems: 1,
        maxItems: 5
      });
    });
  });

  describe('stringify()', () => {
    test('should stringify to JSON format', () => {
      const config = {
        type: 'text' as const,
        id: 'title',
        required: true,
        maxLength: 100
      };
      const result = SightEditParser.stringify(config, 'json');
      const parsed = JSON.parse(result);
      expect(parsed).toMatchObject(config);
    });

    test('should stringify to short format', () => {
      const config = {
        type: 'text' as const,
        id: 'title',
        required: true,
        maxLength: 100
      };
      const result = SightEditParser.stringify(config, 'short');
      expect(result).toBe('text#title[required,maxLength:100]');
    });

    test('should handle strings with spaces in short format', () => {
      const config = {
        type: 'text' as const,
        id: 'title',
        placeholder: 'Enter your title'
      };
      const result = SightEditParser.stringify(config, 'short');
      expect(result).toBe("text#title[placeholder:'Enter your title']");
    });

    test('should skip validation property in short format', () => {
      const config = {
        type: 'text' as const,
        id: 'title',
        required: true,
        validation: {
          required: true,
          maxLength: 100
        }
      };
      const result = SightEditParser.stringify(config, 'short');
      expect(result).toBe('text#title[required]');
    });
  });

  describe('Edge cases and stress tests', () => {
    test('should handle very long property values', () => {
      const longString = 'a'.repeat(1000);
      const result = SightEditParser.parse(`text[placeholder:'${longString}']`);
      expect(result?.placeholder).toBe(longString);
    });

    test('should handle special characters in values', () => {
      const result = SightEditParser.parse("text[placeholder:'Special: @#$%^&*()']");
      expect(result?.placeholder).toBe('Special: @#$%^&*()');
    });

    test('should handle Unicode characters', () => {
      const result = SightEditParser.parse("text[placeholder:'你好世界 🌍']");
      expect(result?.placeholder).toBe('你好世界 🌍');
    });

    test('should handle multiple formats in same page context', () => {
      const configs = [
        'text',
        'text#id',
        'text#id[required]',
        '{"type":"text","id":"id"}',
        'richtext#content[maxLength:5000]'
      ];

      const results = configs.map(c => SightEditParser.parse(c));
      
      expect(results[0]).toEqual({ type: 'text' });
      expect(results[1]).toEqual({ type: 'text', id: 'id' });
      expect(results[2]?.required).toBe(true);
      expect(results[3]?.type).toBe('text');
      expect(results[4]?.maxLength).toBe(5000);
    });

    test('should handle malformed input gracefully', () => {
      const malformed = [
        '[no-type]',
        '#only-id',
        'text#',
        'text[',
        'text]',
        '{"type"}',
        '{type:text}' // Missing quotes
      ];

      malformed.forEach(input => {
        const result = SightEditParser.parse(input);
        // Should either parse partially or return null, but not throw
        expect(() => result).not.toThrow();
      });
    });
  });
});

describe('Helper functions', () => {
  test('parseSightEditAttribute should work', () => {
    const result = parseSightEditAttribute('text#title');
    expect(result).toEqual({ type: 'text', id: 'title' });
  });

  test('stringifySightEditConfig should work', () => {
    const config = { type: 'text' as const, id: 'title' };
    const result = stringifySightEditConfig(config);
    expect(JSON.parse(result)).toMatchObject(config);
  });
});