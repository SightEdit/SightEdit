/**
 * Parser for SightEdit data attributes
 * Supports multiple syntax formats for flexibility
 */

import { ElementType, ValidationSchema } from './types';

export interface ParsedConfig {
  type: ElementType;
  id?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  accept?: string;
  multiple?: boolean;
  rows?: number;
  cols?: number;
  options?: Array<{ value: string; label: string }>;
  toolbar?: string[];
  validation?: ValidationSchema;
  [key: string]: any;
}

export class SightEditParser {
  /**
   * Parse data-sightedit attribute value
   * Supports multiple formats:
   * 1. Simple: "text"
   * 2. With ID: "text#hero-title"
   * 3. JSON: '{"type":"text","id":"hero-title","required":true}'
   * 4. Short syntax: "text#id[required,maxLength:100]"
   */
  static parse(value: string): ParsedConfig | null {
    if (!value || typeof value !== 'string') {
      return null;
    }

    value = value.trim();

    // Try JSON format first
    if (value.startsWith('{')) {
      return this.parseJSON(value);
    }

    // Try short syntax
    if (value.includes('[') || value.includes('#')) {
      return this.parseShortSyntax(value);
    }

    // Simple format - just type
    return this.parseSimple(value);
  }

  /**
   * Parse JSON format
   * Example: '{"type":"text","id":"hero","required":true}'
   */
  private static parseJSON(value: string): ParsedConfig | null {
    try {
      const parsed = JSON.parse(value);
      
      if (!parsed.type) {
        console.warn('SightEdit: Missing type in JSON config:', value);
        return null;
      }

      return this.normalizeConfig(parsed);
    } catch (error) {
      console.error('SightEdit: Invalid JSON in data-sightedit:', error);
      return null;
    }
  }

  /**
   * Parse short syntax format
   * Example: "text#hero-title[required,maxLength:100,placeholder:'Enter title']"
   */
  private static parseShortSyntax(value: string): ParsedConfig | null {
    const config: ParsedConfig = { type: 'text' as ElementType };

    // Extract type and ID
    const typeMatch = value.match(/^([^#\[]+)/);
    if (typeMatch) {
      config.type = typeMatch[1].trim() as ElementType;
    }

    // Extract ID
    const idMatch = value.match(/#([^#\[]+)/);
    if (idMatch) {
      config.id = idMatch[1].trim();
    }

    // Extract properties
    const propsMatch = value.match(/\[([^\]]+)\]/);
    if (propsMatch) {
      const props = propsMatch[1];
      this.parseProperties(props, config);
    }

    return this.normalizeConfig(config);
  }

  /**
   * Parse simple format
   * Example: "text" or "richtext"
   */
  private static parseSimple(value: string): ParsedConfig {
    return {
      type: value as ElementType
    };
  }

  /**
   * Parse property string
   * Example: "required,maxLength:100,placeholder:'Enter title'"
   */
  private static parseProperties(props: string, config: ParsedConfig): void {
    // More sophisticated regex to handle nested brackets and quotes
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < props.length; i++) {
      const char = props[i];
      
      if ((char === '"' || char === "'") && props[i - 1] !== '\\') {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
      }
      
      if (char === '[' && !inQuotes) depth++;
      if (char === ']' && !inQuotes) depth--;
      
      if (char === ',' && depth === 0 && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }

    for (const part of parts) {
      const trimmed = part.trim();

      // Boolean flag (e.g., "required")
      if (!trimmed.includes(':')) {
        config[trimmed] = true;
        continue;
      }

      // Key-value pair (e.g., "maxLength:100")
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      // Parse value
      const parsedValue = this.parseValue(value);
      config[this.normalizeKey(key.trim())] = parsedValue;
    }
  }

  /**
   * Parse a value string
   */
  private static parseValue(value: string): any {
    // Remove quotes if present
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

    // Array (simple format)
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(v => v.trim());
    }

    // Default to string
    return value;
  }

  /**
   * Normalize key names (kebab-case to camelCase)
   */
  private static normalizeKey(key: string): string {
    // Convert kebab-case to camelCase
    return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  /**
   * Normalize and validate config
   */
  private static normalizeConfig(config: any): ParsedConfig {
    const normalized: ParsedConfig = {
      type: config.type || 'text'
    };

    // Map common variations
    const keyMap: Record<string, string> = {
      'max-length': 'maxLength',
      'min-length': 'minLength',
      'max-size': 'maxSize',
      'aspect-ratio': 'aspectRatio',
      'data-type': 'dataType'
    };

    for (const [key, value] of Object.entries(config)) {
      if (key === 'type') continue;
      
      const normalizedKey = keyMap[key] || key;
      normalized[normalizedKey] = value;
    }

    // Build validation schema if needed
    if (normalized.required || normalized.maxLength || normalized.minLength || 
        normalized.pattern || normalized.min || normalized.max) {
      normalized.validation = {
        required: normalized.required,
        maxLength: normalized.maxLength,
        minLength: normalized.minLength,
        pattern: normalized.pattern,
        min: normalized.min,
        max: normalized.max
      };
    }

    return normalized;
  }

  /**
   * Convert config back to string format (for saving)
   */
  static stringify(config: ParsedConfig, format: 'json' | 'short' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(config);
    }

    // Short format
    let result = config.type;
    
    if (config.id) {
      result += `#${config.id}`;
    }

    const props: string[] = [];
    
    for (const [key, value] of Object.entries(config)) {
      if (key === 'type' || key === 'id' || key === 'validation') continue;
      
      if (typeof value === 'boolean' && value) {
        props.push(key);
      } else if (value !== undefined && value !== null) {
        const stringValue = typeof value === 'string' && value.includes(' ') 
          ? `'${value}'` 
          : String(value);
        props.push(`${key}:${stringValue}`);
      }
    }

    if (props.length > 0) {
      result += `[${props.join(',')}]`;
    }

    return result;
  }
}

// Export convenience function
export function parseSightEditAttribute(value: string): ParsedConfig | null {
  return SightEditParser.parse(value);
}

export function stringifySightEditConfig(config: ParsedConfig, format?: 'json' | 'short'): string {
  return SightEditParser.stringify(config, format);
}