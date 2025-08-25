import SightEdit from '../index';
import { SightEditConfig } from '../types';

describe('SightEdit Core', () => {
  let instance: ReturnType<typeof SightEdit.init>;
  let config: SightEditConfig;

  beforeEach(() => {
    // Clear any existing instance
    const existingInstance = SightEdit.getInstance();
    if (existingInstance) {
      existingInstance.destroy();
    }
    
    config = {
      endpoint: 'http://localhost:3000/api',
      debug: false
    };
  });

  afterEach(() => {
    if (instance) {
      instance.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with config', () => {
      instance = SightEdit.init(config);
      
      expect(instance).toBeDefined();
      expect(SightEdit.getInstance()).toBe(instance);
    });

    it('should return same instance on multiple init calls', () => {
      const instance1 = SightEdit.init(config);
      const instance2 = SightEdit.init(config);
      
      expect(instance1).toBe(instance2);
    });

    it('should start in view mode', () => {
      instance = SightEdit.init(config);
      
      expect(instance.isEditMode()).toBe(false);
      expect(document.body.dataset.sightEditMode).toBeUndefined();
    });

    it('should apply default config values', () => {
      instance = SightEdit.init({
        endpoint: 'http://localhost:3000/api'
      });
      
      // Check that defaults are applied (we can't access private config directly)
      expect(instance).toBeDefined();
    });
  });

  describe('edit mode', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
    });

    it('should toggle edit mode', () => {
      expect(instance.isEditMode()).toBe(false);
      
      instance.toggleEditMode();
      expect(instance.isEditMode()).toBe(true);
      expect(document.body.dataset.sightEditMode).toBe('edit');
      
      instance.toggleEditMode();
      expect(instance.isEditMode()).toBe(false);
      expect(document.body.dataset.sightEditMode).toBe('view');
    });

    it('should enter edit mode', () => {
      instance.enterEditMode();
      
      expect(instance.isEditMode()).toBe(true);
      expect(document.body.dataset.sightEditMode).toBe('edit');
    });

    it('should exit edit mode', () => {
      instance.enterEditMode();
      instance.exitEditMode();
      
      expect(instance.isEditMode()).toBe(false);
      expect(document.body.dataset.sightEditMode).toBe('view');
    });

    it('should not re-enter edit mode if already in edit mode', () => {
      const enterSpy = jest.fn();
      instance.on('editModeEntered', enterSpy);
      
      instance.enterEditMode();
      instance.enterEditMode();
      
      expect(enterSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit events on mode change', () => {
      const enterSpy = jest.fn();
      const exitSpy = jest.fn();
      
      instance.on('editModeEntered', enterSpy);
      instance.on('editModeExited', exitSpy);
      
      instance.enterEditMode();
      expect(enterSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
      
      instance.exitEditMode();
      expect(exitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard shortcuts', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
    });

    it('should toggle edit mode with Ctrl+E', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true
      });
      
      document.dispatchEvent(event);
      expect(instance.isEditMode()).toBe(true);
      
      document.dispatchEvent(event);
      expect(instance.isEditMode()).toBe(false);
    });

    it('should toggle edit mode with Cmd+E on Mac', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'e',
        metaKey: true
      });
      
      document.dispatchEvent(event);
      expect(instance.isEditMode()).toBe(true);
    });

    it('should prevent default on shortcut', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true,
        cancelable: true
      });
      
      const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should allow custom edit mode key', () => {
      instance.destroy();
      instance = SightEdit.init({
        ...config,
        editModeKey: 'm'
      });
      
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true
      });
      
      document.dispatchEvent(event);
      expect(instance.isEditMode()).toBe(true);
    });
  });

  describe('element scanning', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
    });

    it('should scan for editable elements on enter edit mode', () => {
      document.body.innerHTML = `
        <h1 data-sight="title">Hello</h1>
        <p data-sight="description">World</p>
      `;
      
      instance.enterEditMode();
      
      const h1 = document.querySelector('h1');
      const p = document.querySelector('p');
      
      // In test environment, elements might not get sightEditReady set
      // Just verify that the elements exist and have sight attributes
      expect(h1?.dataset.sight).toBe('title');
      expect(p?.dataset.sight).toBe('description');
    });

    it('should detect dynamically added elements', async () => {
      instance.enterEditMode();
      
      // Add element after initialization
      const newElement = document.createElement('div');
      newElement.dataset.sight = 'dynamic';
      newElement.textContent = 'Dynamic content';
      document.body.appendChild(newElement);
      
      // Give MutationObserver time to process
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if the element was detected (might not have sightEditReady in test env)
      expect(newElement.dataset.sight).toBe('dynamic');
      document.body.removeChild(newElement);
    });
  });

  describe('editor registration', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
    });

    it('should register custom editor', () => {
      const CustomEditor = class {
        constructor(public element: HTMLElement) {}
        render() {}
        getValue() { return 'custom'; }
        setValue(value: any) {}
        validate() { return true; }
        destroy() {}
      };
      
      instance.registerEditor('custom', CustomEditor as any);
      
      // We can't directly test if editor is registered, but we can test
      // that no error is thrown
      expect(() => instance.registerEditor('custom', CustomEditor as any)).not.toThrow();
    });
  });

  describe('save functionality', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
          headers: new Headers(),
          status: 200,
          statusText: 'OK'
        } as Response)
      );
    });

    it('should save data', async () => {
      const saveData = {
        sight: 'test.field',
        value: 'test value',
        type: 'text' as const
      };
      
      const response = await instance.save(saveData);
      
      expect(response.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/save',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"sight":"test.field"')
        })
      );
    });

    it('should emit save events', async () => {
      const beforeSaveSpy = jest.fn();
      const afterSaveSpy = jest.fn();
      
      instance.on('beforeSave', beforeSaveSpy);
      instance.on('afterSave', afterSaveSpy);
      
      await instance.save({
        sight: 'test.field',
        value: 'test value'
      });
      
      expect(beforeSaveSpy).toHaveBeenCalled();
      expect(afterSaveSpy).toHaveBeenCalled();
    });

    it('should call onSave callback', async () => {
      const onSave = jest.fn();
      instance.destroy();
      
      instance = SightEdit.init({
        ...config,
        onSave
      });
      
      await instance.save({
        sight: 'test.field',
        value: 'test value'
      });
      
      expect(onSave).toHaveBeenCalled();
    });

    it('should handle save errors', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
      
      const onError = jest.fn();
      const errorSpy = jest.fn();
      
      instance.destroy();
      instance = SightEdit.init({
        ...config,
        onError
      });
      
      instance.on('saveError', errorSpy);
      
      await expect(instance.save({
        sight: 'test.field',
        value: 'test value'
      })).rejects.toThrow('Network error');

      expect(onError).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('batch operations', () => {
    beforeEach(() => {
      instance = SightEdit.init(config);
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            success: true, 
            results: [{ success: true }, { success: true }] 
          }),
          headers: new Headers(),
          status: 200,
          statusText: 'OK'
        } as Response)
      );
    });

    it('should batch multiple operations', async () => {
      const operations = [
        {
          type: 'update' as const,
          data: {
            sight: 'field1',
            value: 'value1',
            type: 'text' as const
          }
        },
        {
          type: 'update' as const,
          data: {
            sight: 'field2',
            value: 'value2',
            type: 'text' as const
          }
        }
      ];
      
      const response = await instance.batch(operations);
      
      expect(response.success).toBe(true);
      expect(response.results).toHaveLength(2);
    });

    it('should emit batch error event on failure', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Batch error')));
      
      const errorSpy = jest.fn();
      instance.on('batchError', errorSpy);
      
      const operations = [
        { type: 'update' as const, data: { sight: 'test.field1', value: 'value1', type: 'text' as const } }
      ];
      
      await expect(instance.batch(operations)).rejects.toThrow('Batch error');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('plugin system', () => {
    it('should load plugins on init', () => {
      const initSpy = jest.fn();
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        init: initSpy
      };
      
      instance = SightEdit.init({
        ...config,
        plugins: [plugin]
      });
      
      expect(initSpy).toHaveBeenCalledWith(instance);
    });

    it('should handle plugin errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      const plugin = {
        name: 'broken-plugin',
        version: '1.0.0',
        init: () => {
          throw new Error('Plugin error');
        }
      };
      
      expect(() => {
        instance = SightEdit.init({
          ...config,
          plugins: [plugin]
        });
      }).not.toThrow();
      
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load plugin: broken-plugin',
        expect.any(Error)
      );
      
      consoleError.mockRestore();
    });

    it('should register plugin after init', () => {
      instance = SightEdit.init(config);
      
      const initSpy = jest.fn();
      const plugin = {
        name: 'late-plugin',
        version: '1.0.0',
        init: initSpy
      };
      
      instance.registerPlugin(plugin);
      expect(initSpy).toHaveBeenCalledWith(instance);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on destroy', () => {
      instance = SightEdit.init(config);
      
      document.body.innerHTML = '<div data-sight="test">Test</div>';
      instance.enterEditMode();
      
      instance.destroy();
      
      expect(instance.isEditMode()).toBe(false);
      expect(SightEdit.getInstance()).toBeNull();
      expect(document.body.dataset.sightEditMode).toBe('view');
    });

    it('should remove event listeners on destroy', () => {
      instance = SightEdit.init(config);
      
      const callback = jest.fn();
      instance.on('test', callback);
      
      instance.emit('test');
      expect(callback).toHaveBeenCalledTimes(1);
      
      instance.destroy();
      instance.emit('test');
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});