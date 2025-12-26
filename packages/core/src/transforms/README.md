# Data Transformation Pipeline

Transform and validate data before save/after load with built-in and custom transforms.

## Features

- 🔄 **12 Built-in Transforms** - sanitizer, markdown, imageOptimize, currency, etc.
- 📊 **Computed Fields** - auto-calculate fields from dependencies
- 🎯 **Priority-based Execution** - control transform order
- 🔗 **Transform Chaining** - apply multiple transforms in sequence
- ⚠️ **Circular Dependency Detection** - prevent infinite loops

## Quick Start

```typescript
import { getGlobalPipeline, sanitizerTransform } from '@sightedit/core';

// Add transform
const pipeline = getGlobalPipeline();
pipeline.addTransform(sanitizerTransform);

// Apply transforms
const cleaned = await pipeline.applyInputTransforms(
  userInput,
  'product.description',
  'richtext'
);

// Register computed field
pipeline.registerComputedField({
  sight: 'product.finalPrice',
  dependencies: ['product.price', 'product.discount'],
  compute: (values) => {
    return values['product.price'] * (1 - values['product.discount'] / 100);
  }
});
```

## Built-in Transforms

1. **sanitizer** - XSS prevention with DOMPurify
2. **markdown** - Markdown to HTML conversion
3. **imageOptimize** - Image compression and resizing
4. **currency** - Currency formatting
5. **slugify** - URL-safe slug generation
6. **uppercase** - Convert to uppercase
7. **lowercase** - Convert to lowercase
8. **trim** - Remove whitespace
9. **numberFormat** - Number formatting
10. **dateFormat** - Date formatting
11. **jsonParse** - Parse JSON strings
12. **jsonStringify** - Stringify objects

## Files

- `TransformPipeline.ts` - Pipeline engine
- `built-in.ts` - 12 built-in transforms
- `computed-fields.ts` - Computed field manager

## Documentation

See [Core Package README](../../README.md#data-transformation) for full documentation.
