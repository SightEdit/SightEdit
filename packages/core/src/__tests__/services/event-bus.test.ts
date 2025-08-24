import { EventBus, EventMap, Subscription } from '../../services/event-bus';

describe('EventBus', () => {
  let eventBus: EventBus;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    eventBus = new EventBus();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create EventBus with default options', () => {
      const bus = new EventBus();
      expect(bus).toBeInstanceOf(EventBus);
    });

    it('should create EventBus with custom options', () => {
      const bus = new EventBus({ maxListeners: 50, debug: true });
      expect(bus).toBeInstanceOf(EventBus);
    });
  });

  describe('on method', () => {
    it('should register event listener', () => {
      const listener = jest.fn();
      const subscription = eventBus.on('core:initialized', listener);

      expect(subscription).toHaveProperty('unsubscribe');
      expect(typeof subscription.unsubscribe).toBe('function');
      expect(eventBus.listenerCount('core:initialized')).toBe(1);
    });

    it('should register multiple listeners for the same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('core:initialized', listener1);
      eventBus.on('core:initialized', listener2);

      expect(eventBus.listenerCount('core:initialized')).toBe(2);
    });

    it('should warn when max listeners exceeded', () => {
      const smallEventBus = new EventBus({ maxListeners: 2 });
      const listener = jest.fn();

      smallEventBus.on('core:initialized', listener);
      smallEventBus.on('core:initialized', listener);
      smallEventBus.on('core:initialized', listener); // Should trigger warning

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Maximum listeners (2) exceeded')
      );
    });

    it('should log debug information when debug mode is enabled', () => {
      const debugEventBus = new EventBus({ debug: true });
      const listener = jest.fn();

      debugEventBus.on('core:initialized', listener);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Listener added for "core:initialized"')
      );
    });

    it('should return subscription that can unsubscribe', () => {
      const listener = jest.fn();
      const subscription = eventBus.on('core:initialized', listener);

      expect(eventBus.listenerCount('core:initialized')).toBe(1);

      subscription.unsubscribe();

      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });

    it('should remove event from listeners map when no listeners remain', () => {
      const listener = jest.fn();
      const subscription = eventBus.on('core:initialized', listener);

      subscription.unsubscribe();

      expect(eventBus.eventNames()).not.toContain('core:initialized');
    });

    it('should log debug information when unsubscribing', () => {
      const debugEventBus = new EventBus({ debug: true });
      const listener = jest.fn();
      const subscription = debugEventBus.on('core:initialized', listener);

      subscription.unsubscribe();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Listener removed for "core:initialized"')
      );
    });
  });

  describe('once method', () => {
    it('should register listener that fires only once', () => {
      const listener = jest.fn();
      eventBus.once('core:initialized', listener);

      eventBus.emit('core:initialized', { config: {} });
      eventBus.emit('core:initialized', { config: {} });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });

    it('should return subscription for once listener', () => {
      const listener = jest.fn();
      const subscription = eventBus.once('core:initialized', listener);

      expect(subscription).toHaveProperty('unsubscribe');
      expect(eventBus.listenerCount('core:initialized')).toBe(1);
    });

    it('should allow manual unsubscription before event fires', () => {
      const listener = jest.fn();
      const subscription = eventBus.once('core:initialized', listener);

      subscription.unsubscribe();

      eventBus.emit('core:initialized', { config: {} });

      expect(listener).not.toHaveBeenCalled();
      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });
  });

  describe('emit method', () => {
    it('should call all registered listeners with payload', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const payload = { config: { debug: true } };

      eventBus.on('core:initialized', listener1);
      eventBus.on('core:initialized', listener2);

      eventBus.emit('core:initialized', payload);

      expect(listener1).toHaveBeenCalledWith(payload);
      expect(listener2).toHaveBeenCalledWith(payload);
    });

    it('should handle emission to events with no listeners', () => {
      expect(() => {
        eventBus.emit('core:initialized', { config: {} });
      }).not.toThrow();
    });

    it('should log debug information when emitting', () => {
      const debugEventBus = new EventBus({ debug: true });
      const payload = { config: {} };

      debugEventBus.emit('core:initialized', payload);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Emitting "core:initialized"'),
        payload
      );
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      eventBus.on('core:initialized', errorListener);
      eventBus.on('core:initialized', normalListener);

      eventBus.emit('core:initialized', { config: {} });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in listener for "core:initialized"'),
        expect.any(Error)
      );
      expect(normalListener).toHaveBeenCalled(); // Should still be called
    });

    it('should emit error:occurred when listener throws', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const errorEventListener = jest.fn();

      eventBus.on('core:initialized', errorListener);
      eventBus.on('error:occurred', errorEventListener);

      eventBus.emit('core:initialized', { config: {} });

      expect(errorEventListener).toHaveBeenCalledWith({
        error: expect.any(Error),
        context: 'Event listener for "core:initialized"'
      });
    });

    it('should not create infinite loops when error:occurred listener throws', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Error listener error');
      });

      eventBus.on('error:occurred', errorListener);
      eventBus.emit('error:occurred', { error: new Error('Original error'), context: 'test' });

      // Should not call error listener recursively
      expect(errorListener).toHaveBeenCalledTimes(1);
    });

    it('should create copy of listeners array to avoid modification during emission', () => {
      const listeners: jest.Mock[] = [];
      let subscription: Subscription;

      // Create a listener that removes itself during execution
      const selfRemovingListener = jest.fn().mockImplementation(() => {
        subscription.unsubscribe();
      });

      const normalListener = jest.fn();

      subscription = eventBus.on('core:initialized', selfRemovingListener);
      eventBus.on('core:initialized', normalListener);

      eventBus.emit('core:initialized', { config: {} });

      expect(selfRemovingListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('removeAllListeners method', () => {
    beforeEach(() => {
      eventBus.on('core:initialized', jest.fn());
      eventBus.on('core:destroyed', jest.fn());
      eventBus.on('edit-mode:entered', jest.fn());
    });

    it('should remove all listeners for specific event', () => {
      expect(eventBus.listenerCount('core:initialized')).toBe(1);

      eventBus.removeAllListeners('core:initialized');

      expect(eventBus.listenerCount('core:initialized')).toBe(0);
      expect(eventBus.listenerCount('core:destroyed')).toBe(1);
    });

    it('should remove all listeners for all events when no event specified', () => {
      expect(eventBus.eventNames()).toHaveLength(3);

      eventBus.removeAllListeners();

      expect(eventBus.eventNames()).toHaveLength(0);
    });

    it('should log debug information when removing listeners', () => {
      const debugEventBus = new EventBus({ debug: true });
      debugEventBus.on('core:initialized', jest.fn());

      debugEventBus.removeAllListeners('core:initialized');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('All listeners removed for "core:initialized"')
      );
    });

    it('should log debug information when removing all listeners', () => {
      const debugEventBus = new EventBus({ debug: true });
      debugEventBus.on('core:initialized', jest.fn());

      debugEventBus.removeAllListeners();

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('All listeners removed for all events')
      );
    });
  });

  describe('listenerCount method', () => {
    it('should return 0 for events with no listeners', () => {
      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });

    it('should return correct count for events with listeners', () => {
      eventBus.on('core:initialized', jest.fn());
      eventBus.on('core:initialized', jest.fn());

      expect(eventBus.listenerCount('core:initialized')).toBe(2);
    });

    it('should update count when listeners are removed', () => {
      const subscription1 = eventBus.on('core:initialized', jest.fn());
      const subscription2 = eventBus.on('core:initialized', jest.fn());

      expect(eventBus.listenerCount('core:initialized')).toBe(2);

      subscription1.unsubscribe();

      expect(eventBus.listenerCount('core:initialized')).toBe(1);

      subscription2.unsubscribe();

      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });
  });

  describe('eventNames method', () => {
    it('should return empty array when no events are registered', () => {
      expect(eventBus.eventNames()).toEqual([]);
    });

    it('should return array of event names', () => {
      eventBus.on('core:initialized', jest.fn());
      eventBus.on('edit-mode:entered', jest.fn());

      const eventNames = eventBus.eventNames();

      expect(eventNames).toContain('core:initialized');
      expect(eventNames).toContain('edit-mode:entered');
      expect(eventNames).toHaveLength(2);
    });

    it('should not include events with no listeners', () => {
      const subscription = eventBus.on('core:initialized', jest.fn());
      eventBus.on('edit-mode:entered', jest.fn());

      subscription.unsubscribe();

      const eventNames = eventBus.eventNames();

      expect(eventNames).not.toContain('core:initialized');
      expect(eventNames).toContain('edit-mode:entered');
      expect(eventNames).toHaveLength(1);
    });
  });

  describe('setMaxListeners method', () => {
    it('should update max listeners limit', () => {
      eventBus.setMaxListeners(5);

      // Add 6 listeners to test the new limit
      for (let i = 0; i < 6; i++) {
        eventBus.on('core:initialized', jest.fn());
      }

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Maximum listeners (5) exceeded')
      );
    });
  });

  describe('setDebug method', () => {
    it('should enable debug mode', () => {
      eventBus.setDebug(true);
      
      eventBus.on('core:initialized', jest.fn());

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Listener added for "core:initialized"')
      );
    });

    it('should disable debug mode', () => {
      eventBus.setDebug(true);
      eventBus.setDebug(false);

      eventBus.on('core:initialized', jest.fn());

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('destroy method', () => {
    it('should remove all listeners', () => {
      eventBus.on('core:initialized', jest.fn());
      eventBus.on('edit-mode:entered', jest.fn());

      expect(eventBus.eventNames()).toHaveLength(2);

      eventBus.destroy();

      expect(eventBus.eventNames()).toHaveLength(0);
    });
  });

  describe('type safety', () => {
    it('should enforce event map types', () => {
      // These should compile without issues
      eventBus.on('core:initialized', (payload) => {
        expect(payload.config).toBeDefined();
      });

      eventBus.on('content:changed', (payload) => {
        expect(payload.sight).toBeDefined();
        expect(payload.value).toBeDefined();
      });

      // Emit with correct payload types
      eventBus.emit('core:initialized', { config: {} });
      eventBus.emit('content:changed', { sight: 'test', value: 'new value' });
    });
  });

  describe('complex scenarios', () => {
    it('should handle many listeners without performance degradation', () => {
      const listeners: jest.Mock[] = [];
      
      // Add 1000 listeners
      for (let i = 0; i < 1000; i++) {
        const listener = jest.fn();
        listeners.push(listener);
        eventBus.on('core:initialized', listener);
      }

      const startTime = performance.now();
      eventBus.emit('core:initialized', { config: {} });
      const endTime = performance.now();

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(100);

      // All listeners should have been called
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle rapid subscribe/unsubscribe operations', () => {
      const subscriptions: Subscription[] = [];

      // Rapidly subscribe and unsubscribe
      for (let i = 0; i < 100; i++) {
        const subscription = eventBus.on('core:initialized', jest.fn());
        subscriptions.push(subscription);
        
        if (i % 2 === 0) {
          subscription.unsubscribe();
        }
      }

      expect(eventBus.listenerCount('core:initialized')).toBe(50);

      // Unsubscribe remaining
      subscriptions.forEach(sub => sub.unsubscribe());

      expect(eventBus.listenerCount('core:initialized')).toBe(0);
    });

    it('should handle nested event emissions', () => {
      const nestedListener = jest.fn().mockImplementation(() => {
        eventBus.emit('edit-mode:entered', {});
      });

      const editModeListener = jest.fn();

      eventBus.on('core:initialized', nestedListener);
      eventBus.on('edit-mode:entered', editModeListener);

      eventBus.emit('core:initialized', { config: {} });

      expect(nestedListener).toHaveBeenCalledTimes(1);
      expect(editModeListener).toHaveBeenCalledTimes(1);
    });
  });
});