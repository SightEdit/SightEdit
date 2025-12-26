/**
 * Hook System Examples
 *
 * This file demonstrates how to use the SightEdit hook system for advanced customization
 */

import {
  registerHook,
  registerHooks,
  executeHook,
  HookEvents,
  type SaveHookContext,
  type ValueHookContext,
  type EditorHookContext,
  type NetworkHookContext,
  type BatchHookContext
} from '../src/hooks/HookManager';

// Example 1: Add metadata to all save operations
registerHook({
  event: HookEvents.Save.BEFORE,
  handler: async (context: SaveHookContext) => {
    // Add user ID and timestamp to all saves
    const enhancedData = {
      ...context.data,
      metadata: {
        ...context.data.context,
        userId: getCurrentUser().id,
        userAgent: navigator.userAgent,
        savedAt: new Date().toISOString()
      }
    };

    return { ...context, data: enhancedData };
  },
  priority: 200 // High priority to run before other hooks
});

// Example 2: Log all value changes for analytics
registerHook({
  event: HookEvents.Value.AFTER_CHANGE,
  handler: async (context: ValueHookContext) => {
    // Send analytics event
    analytics.track('content_edited', {
      sight: context.sight,
      type: context.type,
      oldLength: String(context.oldValue).length,
      newLength: String(context.newValue).length,
      changeType: getChangeType(context.oldValue, context.newValue)
    });
  }
});

// Example 3: Validate values before they're saved
registerHook({
  event: HookEvents.Value.BEFORE_CHANGE,
  handler: async (context: ValueHookContext) => {
    // Check for profanity
    if (containsProfanity(context.newValue)) {
      throw new Error('Content contains inappropriate language');
    }

    // Check for required fields
    if (context.type === 'text' && !context.newValue.trim()) {
      throw new Error('This field cannot be empty');
    }

    return context;
  },
  priority: 300 // Very high priority - validate before anything else
});

// Example 4: Auto-save drafts
let draftTimeout: NodeJS.Timeout | null = null;

registerHook({
  event: HookEvents.Value.AFTER_CHANGE,
  handler: async (context: ValueHookContext) => {
    // Debounce auto-save
    if (draftTimeout) {
      clearTimeout(draftTimeout);
    }

    draftTimeout = setTimeout(async () => {
      await saveDraft({
        sight: context.sight,
        value: context.newValue,
        savedAt: Date.now()
      });

      console.log(`Draft saved for ${context.sight}`);
    }, 2000); // Save after 2 seconds of inactivity
  }
});

// Example 5: Add custom headers to network requests
registerHook({
  event: HookEvents.Network.BEFORE_REQUEST,
  handler: async (context: NetworkHookContext) => {
    const headers = {
      ...context.headers,
      'X-User-Id': getCurrentUser().id,
      'X-Session-Id': getSessionId(),
      'X-Request-Time': Date.now().toString()
    };

    return { ...context, headers };
  }
});

// Example 6: Log network errors
registerHook({
  event: HookEvents.Network.ERROR,
  handler: async (context: NetworkHookContext) => {
    console.error('Network error:', {
      url: context.url,
      method: context.method,
      error: context.error,
      duration: context.duration
    });

    // Send to error tracking service
    errorTracker.captureException(context.error, {
      url: context.url,
      method: context.method
    });
  }
});

// Example 7: Show loading spinner during batch operations
registerHook({
  event: HookEvents.Batch.BEFORE_PROCESS,
  handler: async (context: BatchHookContext) => {
    showLoadingSpinner(`Processing ${context.operations.length} changes...`);
  }
});

registerHook({
  event: HookEvents.Batch.AFTER_PROCESS,
  handler: async (context: BatchHookContext) => {
    hideLoadingSpinner();

    const successful = context.results?.filter(r => r.success).length || 0;
    const failed = (context.results?.length || 0) - successful;

    if (failed > 0) {
      showNotification(`Saved ${successful} changes, ${failed} failed`, 'warning');
    } else {
      showNotification(`Successfully saved ${successful} changes`, 'success');
    }
  }
});

// Example 8: Track batch progress
registerHook({
  event: HookEvents.Batch.ITEM_COMPLETE,
  handler: async (context: BatchHookContext) => {
    const progress = ((context.currentIndex || 0) + 1) / context.operations.length;
    updateProgressBar(progress);

    console.log(`Batch progress: ${Math.round(progress * 100)}%`);
  }
});

// Example 9: Add custom editor behavior
registerHook({
  event: HookEvents.Editor.AFTER_RENDER,
  handler: async (context: EditorHookContext) => {
    // Add custom keyboard shortcut
    if (context.type === 'richtext') {
      context.element.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'b') {
          e.preventDefault();
          document.execCommand('bold');
        }
      });
    }

    // Add character counter for text fields
    if (context.type === 'text') {
      const counter = document.createElement('div');
      counter.className = 'char-counter';
      counter.textContent = `${String(context.value || '').length} characters`;
      context.element.appendChild(counter);
    }
  }
});

// Example 10: Cleanup on editor destroy
registerHook({
  event: HookEvents.Editor.BEFORE_DESTROY,
  handler: async (context: EditorHookContext) => {
    // Remove custom elements
    const counter = context.element.querySelector('.char-counter');
    if (counter) {
      counter.remove();
    }

    // Clean up event listeners (if stored in a map)
    cleanupEventListeners(context.element);
  }
});

// Example 11: Register multiple hooks at once
registerHooks([
  {
    event: HookEvents.Save.SUCCESS,
    handler: async (context: SaveHookContext) => {
      showNotification('Changes saved successfully!', 'success');
    }
  },
  {
    event: HookEvents.Save.ERROR,
    handler: async (context: SaveHookContext) => {
      showNotification(`Failed to save: ${context.error?.message}`, 'error');
    }
  },
  {
    event: HookEvents.Network.TIMEOUT,
    handler: async (context: NetworkHookContext) => {
      showNotification('Request timed out. Please try again.', 'warning');
    }
  }
]);

// Example 12: One-time hook (runs only once)
registerHook({
  event: HookEvents.Editor.AFTER_RENDER,
  handler: async (context: EditorHookContext) => {
    // Show welcome message only once
    showNotification('Welcome! Click any text to edit.', 'info');
  },
  once: true
});

// Example 13: Conditional hooks based on user role
function registerRoleBasedHooks(userRole: string) {
  if (userRole === 'admin') {
    registerHook({
      event: HookEvents.Save.BEFORE,
      handler: async (context: SaveHookContext) => {
        // Admins can save anything
        return context;
      }
    });
  } else if (userRole === 'editor') {
    registerHook({
      event: HookEvents.Save.BEFORE,
      handler: async (context: SaveHookContext) => {
        // Editors need approval for certain fields
        if (context.data.sight.includes('admin.')) {
          throw new Error('You need admin privileges to edit this field');
        }
        return context;
      }
    });
  } else {
    registerHook({
      event: HookEvents.Value.BEFORE_CHANGE,
      handler: async (context: ValueHookContext) => {
        // Viewers can't edit
        throw new Error('You do not have permission to edit');
      }
    });
  }
}

// Example 14: Transform data before saving
registerHook({
  event: HookEvents.Save.BEFORE,
  handler: async (context: SaveHookContext) => {
    if (context.data.type === 'text') {
      // Sanitize HTML
      const sanitized = sanitizeHTML(context.data.value);

      // Trim whitespace
      const trimmed = sanitized.trim();

      // Update context
      return {
        ...context,
        data: {
          ...context.data,
          value: trimmed
        }
      };
    }

    return context;
  }
});

// Example 15: Undo/Redo system using hooks
const undoStack: Array<{ sight: string; value: any }> = [];
const redoStack: Array<{ sight: string; value: any }> = [];

registerHook({
  event: HookEvents.Value.AFTER_CHANGE,
  handler: async (context: ValueHookContext) => {
    // Push old value to undo stack
    undoStack.push({
      sight: context.sight,
      value: context.oldValue
    });

    // Clear redo stack on new change
    redoStack.length = 0;

    // Limit undo stack size
    if (undoStack.length > 50) {
      undoStack.shift();
    }
  }
});

export function undo() {
  const item = undoStack.pop();
  if (item) {
    redoStack.push({ sight: item.sight, value: getCurrentValue(item.sight) });
    restoreValue(item.sight, item.value);
  }
}

export function redo() {
  const item = redoStack.pop();
  if (item) {
    undoStack.push({ sight: item.sight, value: getCurrentValue(item.sight) });
    restoreValue(item.sight, item.value);
  }
}

// Helper functions (would be implemented in actual code)
function getCurrentUser(): { id: string } {
  return { id: 'user-123' };
}

function getSessionId(): string {
  return 'session-' + Date.now();
}

function getChangeType(oldValue: any, newValue: any): string {
  if (!oldValue && newValue) return 'create';
  if (oldValue && !newValue) return 'delete';
  if (String(oldValue).length < String(newValue).length) return 'add';
  if (String(oldValue).length > String(newValue).length) return 'remove';
  return 'update';
}

function containsProfanity(text: string): boolean {
  const profanityList = ['bad', 'words', 'here'];
  return profanityList.some(word => text.toLowerCase().includes(word));
}

function saveDraft(draft: any): Promise<void> {
  return new Promise(resolve => {
    localStorage.setItem(`draft-${draft.sight}`, JSON.stringify(draft));
    resolve();
  });
}

function showLoadingSpinner(message: string): void {
  console.log('Loading:', message);
}

function hideLoadingSpinner(): void {
  console.log('Loading complete');
}

function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
  console.log(`[${type.toUpperCase()}] ${message}`);
}

function updateProgressBar(progress: number): void {
  console.log(`Progress: ${Math.round(progress * 100)}%`);
}

function cleanupEventListeners(element: HTMLElement): void {
  // Implementation would remove stored listeners
}

function sanitizeHTML(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

function getCurrentValue(sight: string): any {
  return document.querySelector(`[data-sight="${sight}"]`)?.textContent;
}

function restoreValue(sight: string, value: any): void {
  const element = document.querySelector(`[data-sight="${sight}"]`);
  if (element) {
    element.textContent = value;
  }
}

const analytics = {
  track: (event: string, data: any) => console.log('Analytics:', event, data)
};

const errorTracker = {
  captureException: (error: any, context: any) => console.error('Error tracked:', error, context)
};
