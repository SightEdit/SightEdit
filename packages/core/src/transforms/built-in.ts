import { Transform, TransformContext } from './TransformPipeline';

/**
 * HTML Sanitizer Transform
 * Sanitizes HTML content to prevent XSS attacks
 */
export const sanitizerTransform: Transform = {
  name: 'sanitizer',
  priority: 1, // Run first
  transform: (value, context) => {
    if (context.type === 'richtext' && typeof value === 'string' && context.direction === 'output') {
      // Use DOMPurify if available, otherwise basic sanitization
      if (typeof window !== 'undefined' && (window as any).DOMPurify) {
        return (window as any).DOMPurify.sanitize(value);
      }

      // Basic sanitization (fallback)
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/g, '')
        .replace(/on\w+='[^']*'/g, '');
    }
    return value;
  }
};

/**
 * Markdown to HTML Transform
 * Converts markdown to HTML
 */
export const markdownTransform: Transform = {
  name: 'markdown',
  priority: 5,
  transform: (value, context) => {
    if (context.type === 'markdown' && typeof value === 'string' && context.direction === 'input') {
      // Use marked if available
      if (typeof window !== 'undefined' && (window as any).marked) {
        return (window as any).marked.parse(value);
      }

      // Basic markdown (fallback)
      return value
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    }
    return value;
  }
};

/**
 * Image Optimization Transform
 * Optimizes images before upload (placeholder - requires Sharp or similar)
 */
export const imageOptimizeTransform: Transform = {
  name: 'imageOptimize',
  priority: 5,
  transform: async (value, context) => {
    if (context.type === 'image' && context.direction === 'output' && typeof value === 'string') {
      // Check if it's a data URL
      if (value.startsWith('data:image')) {
        // Placeholder for image optimization
        // In production, use Sharp, Jimp, or similar library
        console.log('[SightEdit Transform] Image optimization placeholder');
        return value;
      }
    }
    return value;
  }
};

/**
 * Currency Formatter Transform
 * Formats numbers as currency
 */
export const currencyTransform: Transform = {
  name: 'currency',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'number' &&
      context.metadata?.currency &&
      context.direction === 'input'
    ) {
      const num = typeof value === 'string' ? parseFloat(value) : value;

      if (!isNaN(num)) {
        const currency = context.metadata.currency;
        const locale = context.metadata.locale || 'en-US';

        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: currency
        }).format(num);
      }
    }
    return value;
  }
};

/**
 * Slugify Transform
 * Converts text to URL-friendly slug
 */
export const slugifyTransform: Transform = {
  name: 'slugify',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'text' &&
      context.metadata?.slugify &&
      typeof value === 'string' &&
      context.direction === 'output'
    ) {
      return value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    }
    return value;
  }
};

/**
 * Uppercase Transform
 * Converts text to uppercase
 */
export const uppercaseTransform: Transform = {
  name: 'uppercase',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'text' &&
      context.metadata?.uppercase &&
      typeof value === 'string'
    ) {
      return value.toUpperCase();
    }
    return value;
  }
};

/**
 * Lowercase Transform
 * Converts text to lowercase
 */
export const lowercaseTransform: Transform = {
  name: 'lowercase',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'text' &&
      context.metadata?.lowercase &&
      typeof value === 'string'
    ) {
      return value.toLowerCase();
    }
    return value;
  }
};

/**
 * Trim Transform
 * Trims whitespace from strings
 */
export const trimTransform: Transform = {
  name: 'trim',
  priority: 2,
  transform: (value, context) => {
    if (
      typeof value === 'string' &&
      context.metadata?.trim !== false // Enabled by default
    ) {
      return value.trim();
    }
    return value;
  }
};

/**
 * Number Format Transform
 * Formats numbers with thousand separators
 */
export const numberFormatTransform: Transform = {
  name: 'numberFormat',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'number' &&
      context.metadata?.format &&
      context.direction === 'input'
    ) {
      const num = typeof value === 'string' ? parseFloat(value) : value;

      if (!isNaN(num)) {
        const locale = context.metadata.locale || 'en-US';
        const options: Intl.NumberFormatOptions = {};

        if (context.metadata.minimumFractionDigits !== undefined) {
          options.minimumFractionDigits = context.metadata.minimumFractionDigits;
        }
        if (context.metadata.maximumFractionDigits !== undefined) {
          options.maximumFractionDigits = context.metadata.maximumFractionDigits;
        }

        return new Intl.NumberFormat(locale, options).format(num);
      }
    }
    return value;
  }
};

/**
 * Date Format Transform
 * Formats dates
 */
export const dateFormatTransform: Transform = {
  name: 'dateFormat',
  priority: 10,
  transform: (value, context) => {
    if (context.type === 'date' && context.direction === 'input') {
      const date = typeof value === 'string' ? new Date(value) : value;

      if (date instanceof Date && !isNaN(date.getTime())) {
        const format = context.metadata?.format || 'medium';
        const locale = context.metadata?.locale || 'en-US';

        let options: Intl.DateTimeFormatOptions = {};

        switch (format) {
          case 'short':
            options = { dateStyle: 'short' };
            break;
          case 'medium':
            options = { dateStyle: 'medium' };
            break;
          case 'long':
            options = { dateStyle: 'long' };
            break;
          case 'full':
            options = { dateStyle: 'full' };
            break;
          default:
            // Custom format string
            options = { dateStyle: 'medium', timeStyle: 'short' };
        }

        return new Intl.DateTimeFormat(locale, options).format(date);
      }
    }
    return value;
  }
};

/**
 * JSON Parse Transform
 * Parses JSON strings
 */
export const jsonParseTransform: Transform = {
  name: 'jsonParse',
  priority: 1,
  transform: (value, context) => {
    if (
      context.type === 'json' &&
      typeof value === 'string' &&
      context.direction === 'input'
    ) {
      try {
        return JSON.parse(value);
      } catch (error) {
        console.error('[SightEdit Transform] JSON parse error:', error);
        return value;
      }
    }
    return value;
  }
};

/**
 * JSON Stringify Transform
 * Stringifies objects to JSON
 */
export const jsonStringifyTransform: Transform = {
  name: 'jsonStringify',
  priority: 10,
  transform: (value, context) => {
    if (
      context.type === 'json' &&
      typeof value === 'object' &&
      context.direction === 'output'
    ) {
      try {
        return JSON.stringify(value, null, 2);
      } catch (error) {
        console.error('[SightEdit Transform] JSON stringify error:', error);
        return value;
      }
    }
    return value;
  }
};

/**
 * All built-in transforms
 */
export const builtInTransforms: Transform[] = [
  sanitizerTransform,
  markdownTransform,
  imageOptimizeTransform,
  currencyTransform,
  slugifyTransform,
  uppercaseTransform,
  lowercaseTransform,
  trimTransform,
  numberFormatTransform,
  dateFormatTransform,
  jsonParseTransform,
  jsonStringifyTransform
];

/**
 * Register all built-in transforms to a pipeline
 */
export function registerBuiltInTransforms(pipeline: any): void {
  builtInTransforms.forEach(transform => {
    pipeline.addTransform(transform);
  });
}
