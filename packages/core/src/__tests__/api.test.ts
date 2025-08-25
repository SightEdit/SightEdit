import { SightEditAPI } from '../api';
import { SightEditConfig } from '../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('SightEditAPI - Essential Tests', () => {
  let api: SightEditAPI;
  let config: SightEditConfig;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockReset();
    
    config = {
      endpoint: 'http://localhost:3000/api',
      debug: false
    };
    
    api = new SightEditAPI(config);
  });

  describe('Basic Operations', () => {
    it('should save data successfully', async () => {
      const saveData = {
        sight: 'test.field',
        value: 'test value',
        type: 'text' as const,
        timestamp: Date.now()
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: saveData.value }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      const response = await api.save(saveData);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/save',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(saveData)
        })
      );

      expect(response).toEqual({
        success: true,
        data: saveData.value
      });
    });

    it('should handle batch operations', async () => {
      const operations = [
        {
          type: 'update' as const,
          data: { sight: 'field1', value: 'value1', type: 'text' as const }
        }
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: [{ success: true }] }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      const response = await api.batch(operations);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/batch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ operations })
        })
      );

      expect(response.success).toBe(true);
    });

    it('should fetch schema', async () => {
      const mockSchema = {
        type: 'text',
        label: 'Test Field'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSchema,
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      const response = await api.fetchSchema('test.field');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/schema/test.field',
        expect.objectContaining({ method: 'GET' })
      );

      expect(response).toEqual(mockSchema);
    });

    it('should handle file upload', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'http://example.com/test.jpg' }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      const response = await api.upload(file, 'test.image');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );

      expect(response.url).toBe('http://example.com/test.jpg');
    });
  });

  describe('Authentication', () => {
    it('should add API key header', async () => {
      const configWithKey = { ...config, apiKey: 'test-api-key' };
      const apiWithKey = new SightEditAPI(configWithKey);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      await apiWithKey.save({
        sight: 'test.field',
        value: 'test',
        type: 'text' as const
      });

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('test-api-key');
    });

    it('should add bearer token', async () => {
      const configWithAuth = {
        ...config,
        auth: {
          type: 'bearer' as const,
          token: 'test-token'
        }
      };
      const apiWithAuth = new SightEditAPI(configWithAuth);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      await apiWithAuth.save({
        sight: 'test.field',
        value: 'test',
        type: 'text' as const
      });

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer test-token');
    });
  });

  describe('Error Handling', () => {
    it('should retry on network failure', async () => {
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new TypeError('fetch failed'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        } as Response);
      });

      const result = await api.save({
        sight: 'test.field',
        value: 'test',
        type: 'text' as const
      });

      expect(callCount).toBe(3);
      expect(result.success).toBe(true);
    }, 15000);

    it('should throw after max retries', async () => {
      // Use mockImplementation to avoid creating Error objects during setup
      fetchMock.mockImplementation(() => Promise.reject(new Error('Network request failed repeatedly')));

      await expect(api.save({
        sight: 'test.field',
        value: 'test',
        type: 'text' as const
      })).rejects.toThrow('Network request failed repeatedly');

      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
      
      // Reset mock after this test to prevent interference with subsequent tests
      fetchMock.mockReset();
    }, 15000);
  });

  describe('Offline Handling', () => {
    let originalOnLine: boolean;

    beforeEach(() => {
      // Store original onLine value
      originalOnLine = navigator.onLine;
    });

    afterEach(() => {
      // Restore original onLine value
      Object.defineProperty(navigator, 'onLine', { 
        value: originalOnLine, 
        configurable: true, 
        writable: true 
      });
    });
    it('should queue saves when offline', async () => {
      // Create API instance and immediately set offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        configurable: true,
        value: false
      });
      
      const offlineApi = new SightEditAPI(config);

      const saveData = {
        sight: 'test.field',
        value: 'offline value',
        type: 'text' as const
      };

      const response = await offlineApi.save(saveData);

      // Should return success without network call
      expect(response).toEqual({
        success: true,
        data: saveData.value,
        version: expect.any(Number),
        queued: true
      });
    });

    it.skip('should process queue when online', async () => {
      // Reset mock to ensure clean state
      fetchMock.mockReset();
      
      // Start offline
      Object.defineProperty(navigator, 'onLine', { 
        value: false, 
        configurable: true, 
        writable: true 
      });
      const offlineApi = new SightEditAPI(config);

      // Queue operation
      await offlineApi.save({
        sight: 'test.field',
        value: 'queued value',
        type: 'text' as const
      });

      // Mock batch response for when online
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, results: [] }),
        headers: new Headers(),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Come back online
      Object.defineProperty(navigator, 'onLine', { 
        value: true, 
        configurable: true, 
        writable: true 
      });
      window.dispatchEvent(new Event('online'));

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/batch',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});