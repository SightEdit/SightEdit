/**
 * Hook Events
 *
 * Predefined hook event constants and helpers for common use cases
 */

import type { HookEvent } from './HookManager';

/**
 * All available hook events grouped by category
 */
export const HookEvents = {
  // Editor lifecycle
  Editor: {
    BEFORE_RENDER: 'editor:beforeRender' as HookEvent,
    AFTER_RENDER: 'editor:afterRender' as HookEvent,
    BEFORE_DESTROY: 'editor:beforeDestroy' as HookEvent,
    AFTER_DESTROY: 'editor:afterDestroy' as HookEvent,
    FOCUS: 'editor:focus' as HookEvent,
    BLUR: 'editor:blur' as HookEvent
  },

  // Value changes
  Value: {
    BEFORE_CHANGE: 'value:beforeChange' as HookEvent,
    AFTER_CHANGE: 'value:afterChange' as HookEvent,
    VALIDATED: 'value:validated' as HookEvent,
    INVALID: 'value:invalid' as HookEvent
  },

  // Save operations
  Save: {
    BEFORE: 'save:before' as HookEvent,
    AFTER: 'save:after' as HookEvent,
    ERROR: 'save:error' as HookEvent,
    SUCCESS: 'save:success' as HookEvent
  },

  // Batch operations
  Batch: {
    BEFORE_PROCESS: 'batch:beforeProcess' as HookEvent,
    AFTER_PROCESS: 'batch:afterProcess' as HookEvent,
    ITEM_COMPLETE: 'batch:itemComplete' as HookEvent,
    ITEM_ERROR: 'batch:itemError' as HookEvent
  },

  // Schema/Theme changes
  Schema: {
    BEFORE_UPDATE: 'schema:beforeUpdate' as HookEvent,
    AFTER_UPDATE: 'schema:afterUpdate' as HookEvent
  },

  Theme: {
    BEFORE_CHANGE: 'theme:beforeChange' as HookEvent,
    AFTER_CHANGE: 'theme:afterChange' as HookEvent
  },

  // Network
  Network: {
    BEFORE_REQUEST: 'network:beforeRequest' as HookEvent,
    AFTER_REQUEST: 'network:afterRequest' as HookEvent,
    ERROR: 'network:error' as HookEvent,
    TIMEOUT: 'network:timeout' as HookEvent
  },

  // UI
  UI: {
    TOOLBAR_RENDER: 'ui:toolbarRender' as HookEvent,
    MODAL_OPEN: 'ui:modalOpen' as HookEvent,
    MODAL_CLOSE: 'ui:modalClose' as HookEvent,
    NOTIFICATION: 'ui:notification' as HookEvent
  },

  // Mode changes
  Mode: {
    BEFORE_CHANGE: 'mode:beforeChange' as HookEvent,
    AFTER_CHANGE: 'mode:afterChange' as HookEvent
  },

  // Plugin events
  Plugin: {
    LOADED: 'plugin:loaded' as HookEvent,
    UNLOADED: 'plugin:unloaded' as HookEvent,
    ERROR: 'plugin:error' as HookEvent
  }
} as const;

/**
 * Helper to get all events in a category
 */
export function getEventsByCategory(category: keyof typeof HookEvents): HookEvent[] {
  return Object.values(HookEvents[category]);
}

/**
 * Helper to check if an event belongs to a category
 */
export function isEventInCategory(event: HookEvent, category: keyof typeof HookEvents): boolean {
  const categoryEvents = getEventsByCategory(category);
  return categoryEvents.includes(event);
}

/**
 * Get all available hook events
 */
export function getAllEvents(): HookEvent[] {
  const allEvents: HookEvent[] = [];

  Object.values(HookEvents).forEach(category => {
    Object.values(category).forEach(event => {
      allEvents.push(event);
    });
  });

  return allEvents;
}

/**
 * Event metadata for documentation and debugging
 */
export const EventMetadata: Record<HookEvent, { description: string; context: string }> = {
  // Editor lifecycle
  'editor:beforeRender': {
    description: 'Called before an editor is rendered',
    context: 'EditorHookContext'
  },
  'editor:afterRender': {
    description: 'Called after an editor is rendered',
    context: 'EditorHookContext'
  },
  'editor:beforeDestroy': {
    description: 'Called before an editor is destroyed',
    context: 'EditorHookContext'
  },
  'editor:afterDestroy': {
    description: 'Called after an editor is destroyed',
    context: 'EditorHookContext'
  },
  'editor:focus': {
    description: 'Called when an editor receives focus',
    context: 'EditorHookContext'
  },
  'editor:blur': {
    description: 'Called when an editor loses focus',
    context: 'EditorHookContext'
  },

  // Value changes
  'value:beforeChange': {
    description: 'Called before a value changes',
    context: 'ValueHookContext'
  },
  'value:afterChange': {
    description: 'Called after a value changes',
    context: 'ValueHookContext'
  },
  'value:validated': {
    description: 'Called when a value passes validation',
    context: 'ValueHookContext'
  },
  'value:invalid': {
    description: 'Called when a value fails validation',
    context: 'ValueHookContext'
  },

  // Save operations
  'save:before': {
    description: 'Called before a save operation',
    context: 'SaveHookContext'
  },
  'save:after': {
    description: 'Called after a save operation',
    context: 'SaveHookContext'
  },
  'save:error': {
    description: 'Called when a save operation fails',
    context: 'SaveHookContext'
  },
  'save:success': {
    description: 'Called when a save operation succeeds',
    context: 'SaveHookContext'
  },

  // Batch operations
  'batch:beforeProcess': {
    description: 'Called before processing a batch of operations',
    context: 'BatchHookContext'
  },
  'batch:afterProcess': {
    description: 'Called after processing a batch of operations',
    context: 'BatchHookContext'
  },
  'batch:itemComplete': {
    description: 'Called when a batch item completes',
    context: 'BatchHookContext'
  },
  'batch:itemError': {
    description: 'Called when a batch item fails',
    context: 'BatchHookContext'
  },

  // Schema/Theme
  'schema:beforeUpdate': {
    description: 'Called before a schema is updated',
    context: 'any'
  },
  'schema:afterUpdate': {
    description: 'Called after a schema is updated',
    context: 'any'
  },
  'theme:beforeChange': {
    description: 'Called before the theme changes',
    context: 'any'
  },
  'theme:afterChange': {
    description: 'Called after the theme changes',
    context: 'any'
  },

  // Network
  'network:beforeRequest': {
    description: 'Called before a network request',
    context: 'NetworkHookContext'
  },
  'network:afterRequest': {
    description: 'Called after a network request',
    context: 'NetworkHookContext'
  },
  'network:error': {
    description: 'Called when a network request fails',
    context: 'NetworkHookContext'
  },
  'network:timeout': {
    description: 'Called when a network request times out',
    context: 'NetworkHookContext'
  },

  // UI
  'ui:toolbarRender': {
    description: 'Called when the toolbar is rendered',
    context: 'UIHookContext'
  },
  'ui:modalOpen': {
    description: 'Called when a modal is opened',
    context: 'UIHookContext'
  },
  'ui:modalClose': {
    description: 'Called when a modal is closed',
    context: 'UIHookContext'
  },
  'ui:notification': {
    description: 'Called when a notification is shown',
    context: 'UIHookContext'
  },

  // Mode
  'mode:beforeChange': {
    description: 'Called before edit mode changes',
    context: 'ModeHookContext'
  },
  'mode:afterChange': {
    description: 'Called after edit mode changes',
    context: 'ModeHookContext'
  },

  // Plugin
  'plugin:loaded': {
    description: 'Called when a plugin is loaded',
    context: 'PluginHookContext'
  },
  'plugin:unloaded': {
    description: 'Called when a plugin is unloaded',
    context: 'PluginHookContext'
  },
  'plugin:error': {
    description: 'Called when a plugin encounters an error',
    context: 'PluginHookContext'
  }
};

/**
 * Get metadata for an event
 */
export function getEventMetadata(event: HookEvent): { description: string; context: string } | undefined {
  return EventMetadata[event];
}
