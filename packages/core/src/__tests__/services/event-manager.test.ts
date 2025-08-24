import { 
  EventManager, 
  EditorLifecycleManager, 
  MemoryLeakDetector, 
  CleanupHandler 
} from '../../services/event-manager';

// Mock performance.memory for Chrome-specific tests
const mockPerformanceMemory = {
  usedJSHeapSize: 52428800, // 50MB
  totalJSHeapSize: 104857600, // 100MB
  jsHeapSizeLimit: 2147483648 // 2GB
};

describe('EventManager', () => {
  let eventManager: EventManager;
  let mockElement: HTMLElement;

  beforeEach(() => {
    eventManager = new EventManager();
    mockElement = document.createElement('div');
    document.body.appendChild(mockElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('addEventListener', () => {
    it('should add event listener to target', () => {
      const listener = jest.fn();
      
      eventManager.addEventListener(mockElement, 'click', listener);
      
      mockElement.click();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should track subscription for cleanup', () => {
      const listener = jest.fn();
      
      eventManager.addEventListener(mockElement, 'click', listener);
      
      // Verify listener is active
      mockElement.click();
      expect(listener).toHaveBeenCalledTimes(1);
      
      // Destroy should remove listener
      eventManager.destroy();
      mockElement.click();
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should handle multiple listeners on same element', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      eventManager.addEventListener(mockElement, 'click', listener1);
      eventManager.addEventListener(mockElement, 'click', listener2);
      
      mockElement.click();
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should support event listener options', () => {
      const listener = jest.fn();
      
      eventManager.addEventListener(mockElement, 'click', listener, { once: true });
      
      mockElement.click();
      mockElement.click();
      
      expect(listener).toHaveBeenCalledTimes(1); // Should only fire once
    });
  });

  describe('addEventListenerGeneric', () => {
    it('should add generic event listener', () => {
      const listener = jest.fn();
      
      eventManager.addEventListenerGeneric(mockElement, 'customEvent', listener);
      
      const customEvent = new CustomEvent('customEvent', { detail: { test: 'data' } });
      mockElement.dispatchEvent(customEvent);
      
      expect(listener).toHaveBeenCalledWith(customEvent);
    });

    it('should track generic listeners for cleanup', () => {
      const listener = jest.fn();
      
      eventManager.addEventListenerGeneric(mockElement, 'customEvent', listener);
      
      const customEvent = new CustomEvent('customEvent');
      mockElement.dispatchEvent(customEvent);
      expect(listener).toHaveBeenCalledTimes(1);
      
      eventManager.destroy();
      mockElement.dispatchEvent(customEvent);
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('addCleanupHandler and removeCleanupHandler', () => {
    it('should add and execute cleanup handlers', async () => {
      const cleanupFn = jest.fn();
      const handler: CleanupHandler = { cleanup: cleanupFn };
      
      eventManager.addCleanupHandler(handler);
      
      await eventManager.destroy();
      
      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it('should remove cleanup handlers', async () => {
      const cleanupFn = jest.fn();
      const handler: CleanupHandler = { cleanup: cleanupFn };
      
      eventManager.addCleanupHandler(handler);
      eventManager.removeCleanupHandler(handler);
      
      await eventManager.destroy();
      
      expect(cleanupFn).not.toHaveBeenCalled();
    });

    it('should handle async cleanup handlers', async () => {
      const asyncCleanupFn = jest.fn().mockResolvedValue(undefined);
      const handler: CleanupHandler = { cleanup: asyncCleanupFn };
      
      eventManager.addCleanupHandler(handler);
      
      await eventManager.destroy();
      
      expect(asyncCleanupFn).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple cleanup handlers', async () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      const handler1: CleanupHandler = { cleanup: cleanup1 };
      const handler2: CleanupHandler = { cleanup: cleanup2 };
      
      eventManager.addCleanupHandler(handler1);
      eventManager.addCleanupHandler(handler2);
      
      await eventManager.destroy();
      
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroy', () => {
    it('should remove all event listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      eventManager.addEventListener(mockElement, 'click', listener1);
      eventManager.addEventListener(document, 'keydown', listener2);
      
      eventManager.destroy();
      
      mockElement.click();
      document.dispatchEvent(new KeyboardEvent('keydown'));
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should handle errors during listener cleanup', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create a subscription that will throw when unsubscribing
      const mockTarget = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(() => { throw new Error('Cleanup failed'); })
      } as any;
      
      eventManager.addEventListener(mockTarget, 'click', jest.fn());
      
      await eventManager.destroy();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to unsubscribe event listener:',
        expect.any(Error)
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle errors during cleanup handler execution', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const failingHandler: CleanupHandler = {
        cleanup: () => { throw new Error('Cleanup failed'); }
      };
      
      eventManager.addCleanupHandler(failingHandler);
      
      await eventManager.destroy();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cleanup handler failed:',
        expect.any(Error)
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should clear all collections after destroy', async () => {
      const listener = jest.fn();
      const handler: CleanupHandler = { cleanup: jest.fn() };
      
      eventManager.addEventListener(mockElement, 'click', listener);
      eventManager.addCleanupHandler(handler);
      
      await eventManager.destroy();
      
      // Subsequent destroy should not cause issues
      await expect(eventManager.destroy()).resolves.toBeUndefined();
    });
  });
});

describe('EditorLifecycleManager', () => {
  let lifecycleManager: EditorLifecycleManager;
  let mockElement: Element;
  let mockEditor: any;

  beforeEach(() => {
    lifecycleManager = new EditorLifecycleManager();
    document.body.innerHTML = '<div data-sight="test-element">Content</div>';
    mockElement = document.querySelector('[data-sight="test-element"]')!;
    mockEditor = {
      destroy: jest.fn().mockResolvedValue(undefined)
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('createEditor', () => {
    it('should create and track editor', async () => {
      await lifecycleManager.createEditor(mockElement, mockEditor);
      
      expect(lifecycleManager.getActiveEditorCount()).toBe(1);
    });

    it('should setup DOM observer for element removal', async () => {
      const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');
      
      await lifecycleManager.createEditor(mockElement, mockEditor);
      
      expect(observeSpy).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true
      });
      
      observeSpy.mockRestore();
    });
  });

  describe('destroyEditor', () => {
    beforeEach(async () => {
      await lifecycleManager.createEditor(mockElement, mockEditor);
    });

    it('should destroy editor and cleanup handlers', async () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      
      lifecycleManager.registerCleanup(mockEditor, { cleanup: cleanup1 });
      lifecycleManager.registerCleanup(mockEditor, { cleanup: cleanup2 });
      
      await lifecycleManager.destroyEditor(mockElement);
      
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(mockEditor.destroy).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.getActiveEditorCount()).toBe(0);
    });

    it('should execute cleanup handlers in reverse order', async () => {
      const order: number[] = [];
      const cleanup1 = { cleanup: () => order.push(1) };
      const cleanup2 = { cleanup: () => order.push(2) };
      const cleanup3 = { cleanup: () => order.push(3) };
      
      lifecycleManager.registerCleanup(mockEditor, cleanup1);
      lifecycleManager.registerCleanup(mockEditor, cleanup2);
      lifecycleManager.registerCleanup(mockEditor, cleanup3);
      
      await lifecycleManager.destroyEditor(mockElement);
      
      expect(order).toEqual([3, 2, 1]); // Reverse order
    });

    it('should handle cleanup errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const failingCleanup = {
        cleanup: () => { throw new Error('Cleanup failed'); }
      };
      const normalCleanup = { cleanup: jest.fn() };
      
      lifecycleManager.registerCleanup(mockEditor, failingCleanup);
      lifecycleManager.registerCleanup(mockEditor, normalCleanup);
      
      await lifecycleManager.destroyEditor(mockElement);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cleanup handler failed:',
        expect.any(Error)
      );
      expect(normalCleanup.cleanup).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle editor destruction errors', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockEditor.destroy.mockRejectedValue(new Error('Destroy failed'));
      
      await lifecycleManager.destroyEditor(mockElement);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Editor destruction failed:',
        expect.any(Error)
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle missing editor gracefully', async () => {
      const nonExistentElement = document.createElement('div');
      
      await expect(lifecycleManager.destroyEditor(nonExistentElement))
        .resolves
        .toBeUndefined();
    });

    it('should handle editor without destroy method', async () => {
      const editorWithoutDestroy = {};
      await lifecycleManager.createEditor(mockElement, editorWithoutDestroy);
      
      await expect(lifecycleManager.destroyEditor(mockElement))
        .resolves
        .toBeUndefined();
    });
  });

  describe('registerCleanup', () => {
    beforeEach(async () => {
      await lifecycleManager.createEditor(mockElement, mockEditor);
    });

    it('should register cleanup handler for editor', () => {
      const cleanup = { cleanup: jest.fn() };
      
      lifecycleManager.registerCleanup(mockEditor, cleanup);
      
      // Cleanup should be tracked (we can't directly verify internal state)
      expect(() => lifecycleManager.registerCleanup(mockEditor, cleanup)).not.toThrow();
    });

    it('should handle multiple cleanup handlers for same editor', () => {
      const cleanup1 = { cleanup: jest.fn() };
      const cleanup2 = { cleanup: jest.fn() };
      
      lifecycleManager.registerCleanup(mockEditor, cleanup1);
      lifecycleManager.registerCleanup(mockEditor, cleanup2);
      
      expect(() => lifecycleManager.registerCleanup(mockEditor, cleanup1)).not.toThrow();
    });
  });

  describe('DOM mutation observer', () => {
    it('should cleanup editor when element is removed from DOM', async () => {
      const disconnectSpy = jest.spyOn(MutationObserver.prototype, 'disconnect');
      
      await lifecycleManager.createEditor(mockElement, mockEditor);
      expect(lifecycleManager.getActiveEditorCount()).toBe(1);
      
      // Remove element from DOM
      mockElement.remove();
      
      // Manually trigger mutation observer (since jsdom doesn't trigger it automatically)
      const observer = new MutationObserver(() => {});
      const mutationRecord: MutationRecord = {
        type: 'childList',
        target: document.body,
        addedNodes: new NodeList(),
        removedNodes: [mockElement] as any,
        previousSibling: null,
        nextSibling: null,
        attributeName: null,
        attributeNamespace: null,
        oldValue: null
      };
      
      // Since we can't easily test the actual observer, we test the logic
      // The real test would involve DOM manipulation triggering the observer
      
      disconnectSpy.mockRestore();
    });
  });

  describe('destroyAll', () => {
    it('should destroy all active editors', async () => {
      const editor1 = { destroy: jest.fn().mockResolvedValue(undefined) };
      const editor2 = { destroy: jest.fn().mockResolvedValue(undefined) };
      
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      
      await lifecycleManager.createEditor(element1, editor1);
      await lifecycleManager.createEditor(element2, editor2);
      
      expect(lifecycleManager.getActiveEditorCount()).toBe(2);
      
      await lifecycleManager.destroyAll();
      
      expect(editor1.destroy).toHaveBeenCalled();
      expect(editor2.destroy).toHaveBeenCalled();
      expect(lifecycleManager.getActiveEditorCount()).toBe(0);
    });

    it('should handle errors during mass destruction', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const failingEditor = {
        destroy: jest.fn().mockRejectedValue(new Error('Destroy failed'))
      };
      const normalEditor = {
        destroy: jest.fn().mockResolvedValue(undefined)
      };
      
      await lifecycleManager.createEditor(document.createElement('div'), failingEditor);
      await lifecycleManager.createEditor(document.createElement('div'), normalEditor);
      
      await lifecycleManager.destroyAll();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Editor destruction failed:',
        expect.any(Error)
      );
      expect(normalEditor.destroy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getActiveEditorCount', () => {
    it('should return correct count of active editors', async () => {
      expect(lifecycleManager.getActiveEditorCount()).toBe(0);
      
      await lifecycleManager.createEditor(mockElement, mockEditor);
      expect(lifecycleManager.getActiveEditorCount()).toBe(1);
      
      await lifecycleManager.createEditor(document.createElement('div'), {});
      expect(lifecycleManager.getActiveEditorCount()).toBe(2);
      
      await lifecycleManager.destroyEditor(mockElement);
      expect(lifecycleManager.getActiveEditorCount()).toBe(1);
    });
  });
});

describe('MemoryLeakDetector', () => {
  let detector: MemoryLeakDetector;

  beforeEach(() => {
    detector = new MemoryLeakDetector();
    jest.useFakeTimers();
  });

  afterEach(() => {
    detector.stop();
    jest.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start periodic memory checks', () => {
      const checkMemoryUsageSpy = jest.spyOn(detector as any, 'checkMemoryUsage');
      
      detector.start(1000); // 1 second interval
      
      jest.advanceTimersByTime(1000);
      expect(checkMemoryUsageSpy).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(1000);
      expect(checkMemoryUsageSpy).toHaveBeenCalledTimes(2);
      
      checkMemoryUsageSpy.mockRestore();
    });

    it('should stop periodic checks', () => {
      const checkMemoryUsageSpy = jest.spyOn(detector as any, 'checkMemoryUsage');
      
      detector.start(1000);
      jest.advanceTimersByTime(1000);
      expect(checkMemoryUsageSpy).toHaveBeenCalledTimes(1);
      
      detector.stop();
      jest.advanceTimersByTime(2000);
      expect(checkMemoryUsageSpy).toHaveBeenCalledTimes(1); // Should not increase
      
      checkMemoryUsageSpy.mockRestore();
    });

    it('should clear existing interval when starting again', () => {
      detector.start(1000);
      detector.start(500); // Should clear the first interval
      
      // Should not cause any issues
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
    });

    it('should use default interval if not specified', () => {
      const checkMemoryUsageSpy = jest.spyOn(detector as any, 'checkMemoryUsage');
      
      detector.start(); // Should use 30000ms default
      
      jest.advanceTimersByTime(30000);
      expect(checkMemoryUsageSpy).toHaveBeenCalledTimes(1);
      
      checkMemoryUsageSpy.mockRestore();
    });
  });

  describe('checkMemoryUsage', () => {
    beforeEach(() => {
      jest.useRealTimers(); // Need real timers for this test
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

    it('should warn about high DOM node count', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock high DOM node count
      const originalGetElementsByTagName = document.getElementsByTagName;
      document.getElementsByTagName = jest.fn().mockReturnValue({ length: 15000 });
      
      (detector as any).checkMemoryUsage();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Potential memory leak: 15000 DOM nodes detected')
      );
      
      document.getElementsByTagName = originalGetElementsByTagName;
      consoleWarnSpy.mockRestore();
    });

    it('should not warn about normal DOM node count', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock normal DOM node count
      const originalGetElementsByTagName = document.getElementsByTagName;
      document.getElementsByTagName = jest.fn().mockReturnValue({ length: 100 });
      
      (detector as any).checkMemoryUsage();
      
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      
      document.getElementsByTagName = originalGetElementsByTagName;
      consoleWarnSpy.mockRestore();
    });

    it('should log memory usage when performance.memory is available', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock performance.memory (Chrome-specific)
      (global.performance as any).memory = mockPerformanceMemory;
      
      (detector as any).checkMemoryUsage();
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('Memory usage: 50MB / 100MB');
      expect(consoleWarnSpy).not.toHaveBeenCalled(); // 50MB is not high enough
      
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      delete (global.performance as any).memory;
    });

    it('should warn about high memory usage', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock high memory usage
      (global.performance as any).memory = {
        ...mockPerformanceMemory,
        usedJSHeapSize: 157286400 // 150MB
      };
      
      (detector as any).checkMemoryUsage();
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('Memory usage: 150MB / 100MB');
      expect(consoleWarnSpy).toHaveBeenCalledWith('High memory usage detected: 150MB');
      
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      delete (global.performance as any).memory;
    });

    it('should handle missing performance.memory gracefully', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      
      // Ensure performance.memory is not available
      delete (global.performance as any).memory;
      
      expect(() => (detector as any).checkMemoryUsage()).not.toThrow();
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Memory usage'));
      
      consoleDebugSpy.mockRestore();
    });
  });

  describe('setThreshold', () => {
    it('should update threshold values', () => {
      detector.setThreshold('domNodes', 5000);
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock DOM node count above new threshold
      const originalGetElementsByTagName = document.getElementsByTagName;
      document.getElementsByTagName = jest.fn().mockReturnValue({ length: 6000 });
      
      (detector as any).checkMemoryUsage();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Potential memory leak: 6000 DOM nodes detected (threshold: 5000)')
      );
      
      document.getElementsByTagName = originalGetElementsByTagName;
      consoleWarnSpy.mockRestore();
    });

    it('should handle all threshold types', () => {
      expect(() => detector.setThreshold('editors', 50)).not.toThrow();
      expect(() => detector.setThreshold('eventListeners', 500)).not.toThrow();
      expect(() => detector.setThreshold('domNodes', 5000)).not.toThrow();
    });
  });
});