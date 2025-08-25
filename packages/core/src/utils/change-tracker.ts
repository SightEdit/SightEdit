/**
 * Change Tracker - Tracks all edits locally until saved
 */
export interface TrackedChange {
  sight: string;
  value: any;
  originalValue: any;
  type: string;
  timestamp: number;
  element: HTMLElement;
}

export class ChangeTracker {
  private changes: Map<string, TrackedChange> = new Map();
  private history: Map<string, TrackedChange[]> = new Map();
  
  /**
   * Track a change
   */
  track(sight: string, value: any, originalValue: any, type: string, element: HTMLElement): void {
    const existing = this.changes.get(sight);
    
    // Store history of changes for this sight
    if (existing) {
      const historyList = this.history.get(sight) || [];
      historyList.push({ ...existing });
      this.history.set(sight, historyList);
    }
    
    // Store latest change
    this.changes.set(sight, {
      sight,
      value,
      originalValue: existing ? existing.originalValue : originalValue, // Keep first original
      type,
      timestamp: Date.now(),
      element
    });
    
    // Store in localStorage for persistence
    this.persist();
  }
  
  /**
   * Get all pending changes
   */
  getChanges(): TrackedChange[] {
    return Array.from(this.changes.values());
  }
  
  /**
   * Get change for specific sight
   */
  getChange(sight: string): TrackedChange | undefined {
    return this.changes.get(sight);
  }
  
  /**
   * Check if there are pending changes
   */
  hasChanges(): boolean {
    return this.changes.size > 0;
  }
  
  /**
   * Get count of pending changes
   */
  getChangeCount(): number {
    return this.changes.size;
  }
  
  /**
   * Clear a specific change
   */
  clearChange(sight: string): void {
    this.changes.delete(sight);
    this.history.delete(sight);
    this.persist();
  }
  
  /**
   * Clear all changes
   */
  clearAll(): void {
    this.changes.clear();
    this.history.clear();
    this.persist();
  }
  
  /**
   * Discard all changes and restore original values
   */
  discardAll(): void {
    // Restore original values to elements
    this.changes.forEach((change) => {
      if (change.element && change.originalValue !== undefined) {
        this.restoreElementValue(change);
      }
    });
    
    this.clearAll();
  }
  
  /**
   * Discard specific change and restore original value
   */
  discardChange(sight: string): void {
    const change = this.changes.get(sight);
    if (change && change.element) {
      this.restoreElementValue(change);
      this.clearChange(sight);
    }
  }
  
  private restoreElementValue(change: TrackedChange): void {
    try {
      // Clear any existing styling first
      change.element.style.cssText = change.element.style.cssText.replace(/background[^;]*;?/g, '');
      change.element.style.cssText = change.element.style.cssText.replace(/border-left[^;]*;?/g, '');
      
      // Restore content based on type
      if (change.type === 'image') {
        const img = change.element.querySelector('img');
        if (img && typeof change.originalValue === 'string') {
          img.src = change.originalValue;
        }
      } else if (change.type === 'link') {
        const link = change.element.querySelector('a');
        if (link && typeof change.originalValue === 'object') {
          link.href = change.originalValue.url || '#';
          link.textContent = change.originalValue.text || '';
        }
      } else if (change.type === 'color') {
        change.element.style.backgroundColor = change.originalValue;
        change.element.textContent = change.originalValue;
      } else if (change.type === 'json') {
        // For JSON, restore original content and remove special styling
        change.element.textContent = change.originalValue;
        change.element.style.cssText = '';
        // Remove any indicator elements
        const indicator = change.element.querySelector('span');
        if (indicator && indicator.textContent?.includes('Large JSON')) {
          indicator.remove();
        }
      } else {
        // Default text content
        change.element.textContent = change.originalValue;
      }
      
      // Remove any change indicators
      change.element.classList.remove('sight-changed');
      
    } catch (error) {
      console.warn('Error restoring element value:', error);
      // Fallback to simple text restore
      change.element.textContent = change.originalValue;
    }
  }
  
  /**
   * Get history of changes for a sight
   */
  getHistory(sight: string): TrackedChange[] {
    return this.history.get(sight) || [];
  }
  
  /**
   * Persist changes to localStorage
   */
  private persist(): void {
    try {
      const data = {
        changes: Array.from(this.changes.entries()).map(([key, value]) => ({
          key,
          value: {
            ...value,
            element: undefined // Don't persist DOM element
          }
        })),
        timestamp: Date.now()
      };
      
      localStorage.setItem('sightedit_changes', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist changes:', error);
    }
  }
  
  /**
   * Load changes from localStorage
   */
  load(): void {
    try {
      const stored = localStorage.getItem('sightedit_changes');
      if (!stored) return;
      
      const data = JSON.parse(stored);
      
      // Only load if changes are less than 1 hour old
      if (Date.now() - data.timestamp > 3600000) {
        localStorage.removeItem('sightedit_changes');
        return;
      }
      
      // Restore changes (without elements, those need to be re-linked)
      data.changes.forEach((item: any) => {
        this.changes.set(item.key, item.value);
      });
    } catch (error) {
      console.warn('Failed to load persisted changes:', error);
    }
  }
  
  /**
   * Get summary of changes
   */
  getSummary(): string {
    const count = this.changes.size;
    if (count === 0) return 'No pending changes';
    if (count === 1) return '1 pending change';
    return `${count} pending changes`;
  }
}

// Export singleton instance
export const changeTracker = new ChangeTracker();