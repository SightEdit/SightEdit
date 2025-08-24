import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSightEdit } from '../index';

export interface HistoryEntry {
  id: string;
  sight: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  userId?: string;
  userName?: string;
}

export interface UseHistoryOptions {
  maxEntries?: number;
  autoSave?: boolean;
}

export function useHistory(options: UseHistoryOptions = {}) {
  const { state } = useSightEdit();
  const history = ref<HistoryEntry[]>([]);
  const currentIndex = ref(-1);
  const maxEntries = options.maxEntries || 50;

  const canUndo = computed(() => currentIndex.value >= 0);
  const canRedo = computed(() => currentIndex.value < history.value.length - 1);

  const undo = async () => {
    if (!state.instance || !canUndo.value) return;

    const entry = history.value[currentIndex.value];
    if (!entry) return;

    try {
      await state.instance.save({
        sight: entry.sight,
        value: entry.oldValue,
        skipHistory: true
      });

      currentIndex.value--;
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  };

  const redo = async () => {
    if (!state.instance || !canRedo.value) return;

    const entry = history.value[currentIndex.value + 1];
    if (!entry) return;

    try {
      await state.instance.save({
        sight: entry.sight,
        value: entry.newValue,
        skipHistory: true
      });

      currentIndex.value++;
    } catch (error) {
      console.error('Failed to redo:', error);
    }
  };

  const clearHistory = () => {
    history.value = [];
    currentIndex.value = -1;
  };

  const getHistoryForElement = (sight: string) => {
    return history.value.filter(entry => entry.sight === sight);
  };

  const revertToVersion = async (entryId: string) => {
    const entry = history.value.find(e => e.id === entryId);
    if (!entry || !state.instance) return;

    try {
      await state.instance.save({
        sight: entry.sight,
        value: entry.newValue
      });
    } catch (error) {
      console.error('Failed to revert to version:', error);
    }
  };

  onMounted(() => {
    if (!state.instance) return;

    const handleChange = (data: any) => {
      const entry: HistoryEntry = {
        id: generateId(),
        sight: data.sight,
        oldValue: data.oldValue,
        newValue: data.value,
        timestamp: new Date(),
        userId: data.userId,
        userName: data.userName
      };

      // Remove entries after current index
      history.value.splice(currentIndex.value + 1);
      
      // Add new entry
      history.value.push(entry);
      
      // Limit history size
      if (history.value.length > maxEntries) {
        history.value.shift();
      } else {
        currentIndex.value++;
      }
    };

    state.instance.on('save', handleChange);
    state.instance.on('beforeSave', (data: any) => {
      const element = document.querySelector(`[data-sight="${data.sight}"]`);
      if (element) {
        data.oldValue = element.textContent || element.getAttribute('src') || '';
      }
    });

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    onUnmounted(() => {
      if (state.instance) {
        state.instance.off('save', handleChange);
      }
      window.removeEventListener('keydown', handleKeyDown);
    });
  });

  return {
    history: computed(() => history.value),
    canUndo,
    canRedo,
    undo,
    redo,
    clearHistory,
    getHistoryForElement,
    revertToVersion,
    currentIndex: computed(() => currentIndex.value),
    totalEntries: computed(() => history.value.length)
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}