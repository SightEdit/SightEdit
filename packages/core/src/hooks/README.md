# Extended Hook System

40+ lifecycle events across 10 categories for complete customization.

## Features

- 🪝 **40+ Hook Events** - across editor, save, batch, schema, network, UI, etc.
- 🎯 **Priority-based Execution** - control hook order
- ⚡ **Execution Modes** - sequential, parallel, synchronous
- 🔁 **Once-only Hooks** - run only once
- 📦 **Context Passing** - pass data between hooks

## Quick Start

```typescript
import { registerHook, HookEvents } from '@sightedit/core';

// Register hook
registerHook({
  event: HookEvents.Save.BEFORE,
  handler: async (context) => {
    // Add timestamp
    context.data.savedAt = Date.now();

    // Add user ID
    context.data.userId = getCurrentUser().id;

    return context;
  },
  priority: 200
});

// Network hook
registerHook({
  event: HookEvents.Network.BEFORE_REQUEST,
  handler: async (context) => {
    context.request.headers['X-Custom-Header'] = 'value';
    return context;
  }
});
```

## Hook Categories

### 1. Editor Lifecycle (6 events)
- `EDITOR_BEFORE_RENDER`, `EDITOR_AFTER_RENDER`
- `EDITOR_BEFORE_DESTROY`, `EDITOR_AFTER_DESTROY`
- `EDITOR_ACTIVATED`, `EDITOR_DEACTIVATED`

### 2. Value Changes (4 events)
- `VALUE_BEFORE_CHANGE`, `VALUE_AFTER_CHANGE`
- `VALUE_VALIDATED`, `VALUE_REJECTED`

### 3. Save Operations (4 events)
- `SAVE_BEFORE`, `SAVE_AFTER`
- `SAVE_SUCCESS`, `SAVE_ERROR`

### 4. Batch Operations (4 events)
- `BATCH_BEFORE_PROCESS`, `BATCH_AFTER_PROCESS`
- `BATCH_ITEM_COMPLETE`, `BATCH_ERROR`

### 5. Schema/Theme (4 events)
- `SCHEMA_BEFORE_UPDATE`, `SCHEMA_AFTER_UPDATE`
- `THEME_BEFORE_CHANGE`, `THEME_AFTER_CHANGE`

### 6. Network (4 events)
- `NETWORK_BEFORE_REQUEST`, `NETWORK_AFTER_REQUEST`
- `NETWORK_ERROR`, `NETWORK_RETRY`

### 7. UI (4 events)
- `UI_TOOLBAR_RENDER`, `UI_MODAL_OPEN`
- `UI_MODAL_CLOSE`, `UI_NOTIFICATION`

### 8. Mode (2 events)
- `MODE_ENTER_EDIT`, `MODE_EXIT_EDIT`

### 9. Plugin (3 events)
- `PLUGIN_REGISTERED`, `PLUGIN_ACTIVATED`
- `PLUGIN_DEACTIVATED`

### 10. Custom
- Unlimited custom events via `registerHook()`

## Files

- `HookManager.ts` - Hook management system (400+ lines)
- `events.ts` - All hook event definitions

## Examples

See [examples/hooks.ts](../../examples/hooks.ts) for 15 practical examples.

## Documentation

See [Core Package README](../../README.md#hook-system) for full documentation.
