# Component Override System

Replace or customize any of the 11 built-in UI components with your own.

## Features

- 🎭 **11 Component Types** - toolbar, modal, buttons, spinners, messages
- 🎯 **Priority-based Rendering** - control component selection
- 🎨 **Default Renderers** - professional styled defaults
- ⚛️ **React Wrappers** - easy React integration
- 🔧 **Type-safe Props** - full TypeScript support

## Quick Start

```typescript
import { registerComponent } from '@sightedit/core';

// Register custom toolbar
registerComponent({
  type: 'toolbar',
  renderer: (props) => {
    const element = document.createElement('div');
    element.className = 'my-custom-toolbar';
    element.innerHTML = `
      <button onclick="props.onSave()">Save All (${props.changeCount})</button>
      <button onclick="props.onDiscard()">Discard</button>
    `;
    return element;
  },
  priority: 200
});
```

## Component Types

### Layout Components
1. **toolbar** - Main editing toolbar
2. **modal** - Modal container
3. **sidebar** - Side panel

### Editor Components
4. **editor** - Base editor component

### Button Components
5. **saveButton** - Save action button
6. **cancelButton** - Cancel action button
7. **deleteButton** - Delete action button
8. **closeButton** - Close/dismiss button

### Feedback Components
9. **loadingSpinner** - Loading indicator
10. **errorMessage** - Error display
11. **successMessage** - Success notification

## React Integration

```tsx
import { SightEditProvider } from '@sightedit/react';
import { CustomToolbar, CustomModal } from './components';

<SightEditProvider
  endpoint="/api/save"
  components={{
    Toolbar: CustomToolbar,
    Modal: CustomModal,
    SaveButton: ({ onClick, disabled }) => (
      <button onClick={onClick} disabled={disabled}>
        💾 Save
      </button>
    )
  }}
>
  <App />
</SightEditProvider>
```

## Files

- `ComponentRegistry.ts` - Component management system (700+ lines)

## Examples

See [examples/component-override.ts](../../examples/component-override.ts) for complete examples.

## Documentation

See [Core Package README](../../README.md#component-override) for full documentation.
