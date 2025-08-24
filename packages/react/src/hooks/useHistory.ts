import { useEffect, useState, useCallback } from 'react';
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
  const { instance } = useSightEdit();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  useEffect(() => {
    if (!instance) return;

    const historyStack: HistoryEntry[] = [];
    let index = -1;
    const maxEntries = options.maxEntries || 50;

    // Track changes
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

      // Remove any entries after current index (for redo)
      historyStack.splice(index + 1);
      
      // Add new entry
      historyStack.push(entry);
      
      // Limit history size
      if (historyStack.length > maxEntries) {
        historyStack.shift();
      } else {
        index++;
      }

      setHistory([...historyStack]);
      setCurrentIndex(index);
      setCanUndo(index >= 0);
      setCanRedo(false);
    };

    instance.on('save', handleChange);
    instance.on('beforeSave', (data: any) => {
      // Store old value for history
      const element = document.querySelector(`[data-sight="${data.sight}"]`);
      if (element) {
        data.oldValue = element.textContent || element.getAttribute('src') || '';
      }
    });

    return () => {
      instance.off('save', handleChange);
    };
  }, [instance, options.maxEntries]);

  const undo = useCallback(async () => {
    if (!instance || !canUndo || currentIndex < 0) return;

    const entry = history[currentIndex];
    if (!entry) return;

    try {
      // Apply the old value
      await instance.save({
        sight: entry.sight,
        value: entry.oldValue,
        skipHistory: true // Prevent adding to history
      });

      setCurrentIndex(prev => prev - 1);
      setCanUndo(currentIndex > 0);
      setCanRedo(true);
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  }, [instance, canUndo, currentIndex, history]);

  const redo = useCallback(async () => {
    if (!instance || !canRedo || currentIndex >= history.length - 1) return;

    const entry = history[currentIndex + 1];
    if (!entry) return;

    try {
      // Apply the new value
      await instance.save({
        sight: entry.sight,
        value: entry.newValue,
        skipHistory: true
      });

      setCurrentIndex(prev => prev + 1);
      setCanRedo(currentIndex < history.length - 2);
      setCanUndo(true);
    } catch (error) {
      console.error('Failed to redo:', error);
    }
  }, [instance, canRedo, currentIndex, history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const getHistoryForElement = useCallback((sight: string) => {
    return history.filter(entry => entry.sight === sight);
  }, [history]);

  const revertToVersion = useCallback(async (entryId: string) => {
    const entry = history.find(e => e.id === entryId);
    if (!entry || !instance) return;

    try {
      await instance.save({
        sight: entry.sight,
        value: entry.newValue
      });
    } catch (error) {
      console.error('Failed to revert to version:', error);
    }
  }, [instance, history]);

  // Keyboard shortcuts
  useEffect(() => {
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    history,
    canUndo,
    canRedo,
    undo,
    redo,
    clearHistory,
    getHistoryForElement,
    revertToVersion,
    currentIndex,
    totalEntries: history.length
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}