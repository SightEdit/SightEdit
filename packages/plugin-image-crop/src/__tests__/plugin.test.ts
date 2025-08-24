import { ImageCropPlugin } from '../index';
import { ImageCropEditor } from '../editor';

// Mock Cropper.js
jest.mock('cropperjs', () => {
  return jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    getCroppedCanvas: jest.fn().mockReturnValue({
      toBlob: jest.fn((callback) => callback(new Blob(['test'], { type: 'image/jpeg' }))),
      getContext: jest.fn().mockReturnValue({
        filter: '',
        drawImage: jest.fn()
      })
    }),
    setAspectRatio: jest.fn(),
    rotate: jest.fn(),
    zoom: jest.fn(),
    scaleX: jest.fn(),
    scaleY: jest.fn(),
    setDragMode: jest.fn(),
    reset: jest.fn(),
    clear: jest.fn(),
    getImageData: jest.fn().mockReturnValue({ scaleX: 1, scaleY: 1 }),
    getCropBoxData: jest.fn().mockReturnValue({ width: 100, height: 100 }),
    options: {}
  }));
});

describe('ImageCropPlugin', () => {
  let plugin: ImageCropPlugin;
  let mockSightEdit: any;

  beforeEach(() => {
    plugin = new ImageCropPlugin({
      aspectRatio: null,
      filters: true,
      toolbar: true
    });

    mockSightEdit = {
      registerEditor: jest.fn(),
      registerComponent: jest.fn(),
      registerKeyboardShortcut: jest.fn(),
      on: jest.fn()
    };
  });

  describe('initialization', () => {
    it('should have correct name and version', () => {
      expect(plugin.name).toBe('image-crop');
      expect(plugin.version).toBe('1.0.0');
    });

    it('should register image editor with crop functionality', () => {
      plugin.init(mockSightEdit);
      
      expect(mockSightEdit.registerEditor).toHaveBeenCalledWith(
        'image',
        ImageCropEditor,
        expect.objectContaining({
          aspectRatio: null,
          filters: true,
          toolbar: true
        })
      );
    });

    it('should register components when enabled', () => {
      plugin.init(mockSightEdit);
      
      expect(mockSightEdit.registerComponent).toHaveBeenCalledWith(
        'image-filter',
        expect.any(Function)
      );
      
      expect(mockSightEdit.registerComponent).toHaveBeenCalledWith(
        'image-crop-toolbar',
        expect.any(Function)
      );
    });

    it('should not register components when disabled', () => {
      plugin = new ImageCropPlugin({
        filters: false,
        toolbar: false
      });
      
      plugin.init(mockSightEdit);
      
      expect(mockSightEdit.registerComponent).not.toHaveBeenCalled();
    });

    it('should register keyboard shortcuts', () => {
      plugin.init(mockSightEdit);
      
      expect(mockSightEdit.registerKeyboardShortcut).toHaveBeenCalled();
      
      const calls = mockSightEdit.registerKeyboardShortcut.mock.calls;
      const shortcuts = calls.map((call: any[]) => call[0]);
      
      expect(shortcuts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'Ctrl+Shift+C', action: 'crop' }),
          expect.objectContaining({ key: 'R', action: 'rotate' }),
          expect.objectContaining({ key: 'F', action: 'flip' }),
          expect.objectContaining({ key: 'Escape', action: 'cancel' }),
          expect.objectContaining({ key: 'Enter', action: 'apply' })
        ])
      );
    });

    it('should register image editor ready handler', () => {
      plugin.init(mockSightEdit);
      
      expect(mockSightEdit.on).toHaveBeenCalledWith(
        'imageEditorReady',
        expect.any(Function)
      );
    });
  });

  describe('default options', () => {
    it('should have sensible defaults', () => {
      plugin = new ImageCropPlugin();
      
      expect(plugin['options']).toMatchObject({
        aspectRatio: null,
        viewMode: 1,
        dragMode: 'crop',
        responsive: true,
        restore: true,
        autoCrop: true,
        autoCropArea: 0.8,
        movable: true,
        rotatable: true,
        scalable: true,
        zoomable: true,
        filters: true,
        toolbar: true,
        quality: 0.92,
        format: 'jpeg'
      });
    });

    it('should include default presets', () => {
      plugin = new ImageCropPlugin();
      
      const presets = plugin['options'].presets;
      expect(presets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Free', aspectRatio: NaN }),
          expect.objectContaining({ name: 'Square', aspectRatio: 1 }),
          expect.objectContaining({ name: '16:9', aspectRatio: 16 / 9 }),
          expect.objectContaining({ name: '4:3', aspectRatio: 4 / 3 })
        ])
      );
    });
  });

  describe('custom options', () => {
    it('should override default options', () => {
      plugin = new ImageCropPlugin({
        aspectRatio: 1,
        viewMode: 2,
        dragMode: 'move',
        quality: 0.8,
        format: 'png'
      });
      
      expect(plugin['options']).toMatchObject({
        aspectRatio: 1,
        viewMode: 2,
        dragMode: 'move',
        quality: 0.8,
        format: 'png'
      });
    });

    it('should accept custom presets', () => {
      const customPresets = [
        { name: 'Banner', aspectRatio: 3 },
        { name: 'Portrait', aspectRatio: 2 / 3 }
      ];
      
      plugin = new ImageCropPlugin({
        presets: customPresets
      });
      
      expect(plugin['options'].presets).toEqual(customPresets);
    });
  });

  describe('styles injection', () => {
    it('should inject styles only once', () => {
      const originalHead = document.head.innerHTML;
      
      plugin.init(mockSightEdit);
      const firstCallHeadContent = document.head.innerHTML;
      
      plugin.init(mockSightEdit);
      const secondCallHeadContent = document.head.innerHTML;
      
      expect(firstCallHeadContent).not.toBe(originalHead);
      expect(secondCallHeadContent).toBe(firstCallHeadContent);
    });
  });

  describe('destroy', () => {
    it('should clean up without errors', () => {
      plugin.init(mockSightEdit);
      
      expect(() => plugin.destroy()).not.toThrow();
    });
  });
});