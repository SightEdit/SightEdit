<template>
  <div class="sightedit-provider">
    <!-- Error boundary -->
    <div 
      v-if="error && !hideErrors" 
      class="sightedit-error"
      :style="errorStyles"
    >
      <div class="sightedit-error-header">
        <h3>⚠️ SightEdit Error</h3>
        <button 
          @click="hideErrors = true"
          class="sightedit-error-close"
          aria-label="Hide error"
        >
          ×
        </button>
      </div>
      
      <p>{{ error.message }}</p>
      
      <div v-if="isDevelopment" class="sightedit-error-details">
        <details>
          <summary>Error Details (Development)</summary>
          <pre>{{ error.stack }}</pre>
        </details>
      </div>
      
      <div class="sightedit-error-actions">
        <button @click="retry" class="sightedit-btn-retry">
          Retry
        </button>
        <button @click="reset" class="sightedit-btn-reset">
          Reset
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div 
      v-else-if="isLoading && showLoadingIndicator" 
      class="sightedit-loading"
      :style="loadingStyles"
    >
      <div class="sightedit-spinner" />
      <span>{{ loadingText }}</span>
    </div>

    <!-- Main content -->
    <slot 
      v-else
      :sightedit="sightEdit"
      :is-initialized="isInitialized"
      :is-edit-mode="isEditMode"
      :active-editors="activeEditors"
      :error="error"
      :is-loading="isLoading"
      :toggle-edit-mode="toggleEditMode"
      :set-edit-mode="setEditMode"
      :initialize="initialize"
      :destroy="destroy"
    />

    <!-- Edit mode indicator -->
    <Teleport to="body" v-if="isInitialized && showEditModeIndicator">
      <div
        v-if="isEditMode"
        class="sightedit-edit-indicator"
        :style="editIndicatorStyles"
      >
        <div class="sightedit-edit-indicator-content">
          <span class="sightedit-edit-indicator-text">
            {{ editModeText }}
          </span>
          <button
            @click="toggleEditMode"
            class="sightedit-edit-indicator-toggle"
          >
            Exit Edit Mode
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onErrorCaptured, Teleport } from 'vue';
import { SightEditConfig } from '@sightedit/core';
import { useSightEdit } from '../composables/useSightEdit';

export interface Props {
  config?: Partial<SightEditConfig>;
  autoInit?: boolean;
  immediate?: boolean;
  loadingText?: string;
  editModeText?: string;
  showLoadingIndicator?: boolean;
  showEditModeIndicator?: boolean;
  onError?: (error: Error) => void;
  onInitialized?: () => void;
  onEditModeToggled?: (isEditMode: boolean) => void;
}

const props = withDefaults(defineProps<Props>(), {
  autoInit: true,
  immediate: true,
  loadingText: 'Loading SightEdit...',
  editModeText: '✏️ Edit Mode Active',
  showLoadingIndicator: true,
  showEditModeIndicator: true
});

// Error handling
const hideErrors = ref(false);
const isDevelopment = process.env.NODE_ENV === 'development';

// Use SightEdit composable
const {
  sightEdit,
  isInitialized,
  isEditMode,
  activeEditors,
  error,
  isLoading,
  initialize,
  destroy,
  toggleEditMode,
  setEditMode
} = useSightEdit({
  config: props.config,
  autoInit: props.autoInit,
  immediate: props.immediate
});

// Provide SightEdit context to child components
provide('sightEdit', {
  sightEdit,
  isInitialized,
  isEditMode,
  activeEditors,
  error,
  isLoading,
  initialize,
  destroy,
  toggleEditMode,
  setEditMode
});

// Error handling methods
const retry = async (): Promise<void> => {
  hideErrors.value = true;
  error.value = null;
  
  try {
    await initialize(props.config);
  } catch (err) {
    console.error('Retry failed:', err);
  }
};

const reset = async (): Promise<void> => {
  hideErrors.value = true;
  error.value = null;
  
  try {
    await destroy();
    await initialize(props.config);
  } catch (err) {
    console.error('Reset failed:', err);
  }
};

// Error boundary for child components
onErrorCaptured((err: Error) => {
  console.error('SightEdit child component error:', err);
  
  if (props.onError) {
    props.onError(err);
  }
  
  // Don't propagate error to parent
  return false;
});

// Watch for state changes and emit events
watch(isInitialized, (initialized) => {
  if (initialized && props.onInitialized) {
    props.onInitialized();
  }
});

watch(isEditMode, (editMode) => {
  if (props.onEditModeToggled) {
    props.onEditModeToggled(editMode);
  }
});

watch(error, (newError) => {
  if (newError) {
    hideErrors.value = false;
    if (props.onError) {
      props.onError(newError);
    }
  }
});

// Styles
const errorStyles = computed(() => ({
  padding: '16px',
  margin: '8px 0',
  backgroundColor: '#fff5f5',
  border: '1px solid #fed7d7',
  borderRadius: '6px',
  color: '#742a2a',
  fontFamily: 'system-ui, sans-serif'
}));

const loadingStyles = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  color: '#666',
  fontFamily: 'system-ui, sans-serif'
}));

const editIndicatorStyles = computed(() => ({
  position: 'fixed',
  top: '20px',
  right: '20px',
  zIndex: '10000',
  backgroundColor: '#007bff',
  color: 'white',
  padding: '12px 16px',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '14px'
}));
</script>

<script lang="ts">
import { watch } from 'vue';

export default {
  name: 'SightEditProvider'
};
</script>

<style scoped>
.sightedit-provider {
  position: relative;
}

.sightedit-error {
  border-radius: 6px;
}

.sightedit-error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sightedit-error-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.sightedit-error-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: inherit;
  padding: 0;
  margin-left: 8px;
}

.sightedit-error-details {
  margin: 12px 0;
}

.sightedit-error-details pre {
  background: #f7fafc;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}

.sightedit-error-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.sightedit-btn-retry,
.sightedit-btn-reset {
  padding: 6px 12px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.sightedit-btn-retry:hover,
.sightedit-btn-reset:hover {
  background: currentColor;
  color: white;
}

.sightedit-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.sightedit-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e2e8f0;
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sightedit-edit-indicator {
  pointer-events: all;
}

.sightedit-edit-indicator-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sightedit-edit-indicator-toggle {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.sightedit-edit-indicator-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>