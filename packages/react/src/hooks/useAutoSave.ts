import { useEffect, useState, useCallback, useRef } from 'react';
import { useSightEdit } from '../index';

export interface UseAutoSaveOptions {
  interval?: number; // milliseconds
  debounce?: number; // milliseconds
  onSave?: (data: any) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function useAutoSave(options: UseAutoSaveOptions = {}) {
  const { instance } = useSightEdit();
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, any>>(new Map());
  const [saveError, setSaveError] = useState<Error | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout>();
  const debounceRef = useRef<NodeJS.Timeout>();
  const enabledRef = useRef(options.enabled !== false);

  // Track changes
  useEffect(() => {
    if (!instance) return;

    const handleChange = (data: any) => {
      if (!enabledRef.current) return;

      setPendingChanges(prev => {
        const next = new Map(prev);
        next.set(data.sight, data);
        return next;
      });

      // Debounce save
      if (options.debounce) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          performSave();
        }, options.debounce);
      }
    };

    instance.on('change', handleChange);

    return () => {
      instance.off('change', handleChange);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [instance, options.debounce]);

  // Interval-based auto-save
  useEffect(() => {
    if (!options.interval || !enabledRef.current) return;

    intervalRef.current = setInterval(() => {
      if (pendingChanges.size > 0) {
        performSave();
      }
    }, options.interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [options.interval, pendingChanges.size]);

  const performSave = useCallback(async () => {
    if (!instance || pendingChanges.size === 0 || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      // Convert pending changes to array
      const changes = Array.from(pendingChanges.values());

      // Save all pending changes
      if (changes.length === 1) {
        await instance.save(changes[0]);
      } else {
        await instance.batch(changes);
      }

      setLastSaved(new Date());
      setPendingChanges(new Map());
      
      if (options.onSave) {
        options.onSave(changes);
      }
    } catch (error) {
      const err = error as Error;
      setSaveError(err);
      
      if (options.onError) {
        options.onError(err);
      } else {
        console.error('Auto-save failed:', err);
      }
    } finally {
      setIsSaving(false);
    }
  }, [instance, pendingChanges, isSaving, options]);

  const saveNow = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    return performSave();
  }, [performSave]);

  const pause = useCallback(() => {
    enabledRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    enabledRef.current = true;
    
    // Restart interval if configured
    if (options.interval) {
      intervalRef.current = setInterval(() => {
        if (pendingChanges.size > 0) {
          performSave();
        }
      }, options.interval);
    }
  }, [options.interval, pendingChanges.size, performSave]);

  const clearPending = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (pendingChanges.size > 0 && enabledRef.current) {
        performSave();
      }
    };
  }, []);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges.size > 0 && enabledRef.current) {
        performSave();
        e.preventDefault();
        e.returnValue = 'You have unsaved changes';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingChanges.size, performSave]);

  return {
    isSaving,
    lastSaved,
    pendingChanges: pendingChanges.size,
    hasPendingChanges: pendingChanges.size > 0,
    saveError,
    saveNow,
    pause,
    resume,
    clearPending,
    isEnabled: enabledRef.current
  };
}