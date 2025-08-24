import { APIServiceImpl } from '../../services/api-service';
import { HTTPClient, HTTPError } from '../../services/http-client';
import { EventBus } from '../../services/event-bus';
import { SaveData, BatchOperation } from '../../types';

// Mock HTTPClient
jest.mock('../../services/http-client');
const MockedHTTPClient = HTTPClient as jest.MockedClass<typeof HTTPClient>;

describe('APIService', () => {
  let apiService: APIServiceImpl;
  let mockHTTPClient: jest.Mocked<HTTPClient>;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockGetAuthHeaders: jest.MockedFunction<() => Promise<Record<string, string>>>;

  const baseURL = 'https://api.example.com';

  beforeEach(() => {
    mockHTTPClient = {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as any;

    MockedHTTPClient.mockImplementation(() => mockHTTPClient);

    mockEventBus = {
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      listenerCount: jest.fn(),
      eventNames: jest.fn(),
      setMaxListeners: jest.fn(),
      setDebug: jest.fn(),
      destroy: jest.fn(),
    } as any;

    mockGetAuthHeaders = jest.fn().mockResolvedValue({ 'Authorization': 'Bearer test-token' });

    apiService = new APIServiceImpl(baseURL, mockEventBus, mockGetAuthHeaders);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('save', () => {
    const mockSaveData: SaveData = {
      sight: 'test-element',
      value: 'new value',
      type: 'text',
      context: {
        url: 'http://example.com',
        path: '/home',
        selector: '[data-sight="test-element"]'
      }
    };

    it('should save data successfully', async () => {
      const mockResponse = { success: true, id: '123' };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      const result = await apiService.save(mockSaveData);

      expect(result).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledWith('/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: mockSaveData,
        retries: 3,
        retryDelay: 1000
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith('api:save:success', {
        data: mockSaveData,
        response: mockResponse
      });
    });

    it('should handle save errors', async () => {
      const mockError = new Error('Network error');
      mockHTTPClient.request.mockRejectedValue(mockError);

      await expect(apiService.save(mockSaveData)).rejects.toThrow('Network error');

      expect(mockEventBus.emit).toHaveBeenCalledWith('api:save:error', {
        data: mockSaveData,
        error: mockError
      });
    });

    it('should prevent duplicate save requests', async () => {
      const mockResponse = { success: true, id: '123' };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      // Start two concurrent requests with the same sight
      const promise1 = apiService.save(mockSaveData);
      const promise2 = apiService.save(mockSaveData);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledTimes(1); // Should only make one request
    });

    it('should use auth headers from callback', async () => {
      const customHeaders = { 'Authorization': 'Bearer custom-token', 'X-Custom': 'value' };
      mockGetAuthHeaders.mockResolvedValue(customHeaders);

      const mockResponse = { success: true };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      await apiService.save(mockSaveData);

      expect(mockHTTPClient.request).toHaveBeenCalledWith('/save', expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer custom-token',
          'X-Custom': 'value'
        }
      }));
    });
  });

  describe('batch', () => {
    const mockOperations: BatchOperation[] = [
      {
        type: 'save',
        sight: 'element-1',
        value: 'value 1',
        elementType: 'text'
      },
      {
        type: 'save',
        sight: 'element-2',
        value: 'value 2',
        elementType: 'text'
      }
    ];

    it('should perform batch operations successfully', async () => {
      const mockResponse = { success: true, results: [{ id: '1' }, { id: '2' }] };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      const result = await apiService.batch(mockOperations);

      expect(result).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledWith('/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: { operations: mockOperations },
        retries: 3,
        retryDelay: 1000
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith('api:batch:success', {
        operations: mockOperations,
        response: mockResponse
      });
    });

    it('should handle empty operations array', async () => {
      const result = await apiService.batch([]);

      expect(result).toEqual({ success: true, results: [] });
      expect(mockHTTPClient.request).not.toHaveBeenCalled();
    });

    it('should handle batch errors', async () => {
      const mockError = new Error('Batch failed');
      mockHTTPClient.request.mockRejectedValue(mockError);

      await expect(apiService.batch(mockOperations)).rejects.toThrow('Batch failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith('api:batch:error', {
        operations: mockOperations,
        error: mockError
      });
    });

    it('should prevent duplicate batch requests', async () => {
      const mockResponse = { success: true, results: [] };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      // Start two concurrent requests with the same operations
      const promise1 = apiService.batch(mockOperations);
      const promise2 = apiService.batch(mockOperations);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('upload', () => {
    let mockFiles: FileList;

    beforeEach(() => {
      const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
      const file2 = new File(['content2'], 'file2.jpg', { type: 'image/jpeg' });
      
      mockFiles = {
        length: 2,
        item: (index: number) => index === 0 ? file1 : (index === 1 ? file2 : null),
        [0]: file1,
        [1]: file2
      } as FileList;
    });

    it('should upload files successfully', async () => {
      const mockResponse = { success: true, files: [{ id: '1', url: 'url1' }, { id: '2', url: 'url2' }] };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      const result = await apiService.upload(mockFiles);

      expect(result).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledWith('/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
        body: expect.any(FormData),
        timeout: 60000,
        retries: 2
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith('api:upload:success', {
        files: mockFiles,
        response: mockResponse
      });
    });

    it('should handle upload errors', async () => {
      const mockError = new Error('Upload failed');
      mockHTTPClient.request.mockRejectedValue(mockError);

      await expect(apiService.upload(mockFiles)).rejects.toThrow('Upload failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith('api:upload:error', {
        files: mockFiles,
        error: mockError
      });
    });

    it('should create proper FormData with files', async () => {
      const mockResponse = { success: true, files: [] };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      await apiService.upload(mockFiles);

      const callArgs = mockHTTPClient.request.mock.calls[0];
      const formData = callArgs[1].body as FormData;
      
      expect(formData).toBeInstanceOf(FormData);
      // Note: FormData entries are difficult to test directly in jsdom
      // In a real browser environment, you could check formData.getAll('files')
    });
  });

  describe('get', () => {
    const sight = 'test-element';

    it('should get data successfully', async () => {
      const mockResponse = { sight, value: 'current value', type: 'text' };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      const result = await apiService.get(sight);

      expect(result).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledWith(`/content/${encodeURIComponent(sight)}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
        retries: 2
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith('api:get:success', {
        sight,
        response: mockResponse
      });
    });

    it('should handle get errors', async () => {
      const mockError = new Error('Not found');
      mockHTTPClient.request.mockRejectedValue(mockError);

      await expect(apiService.get(sight)).rejects.toThrow('Not found');

      expect(mockEventBus.emit).toHaveBeenCalledWith('api:get:error', {
        sight,
        error: mockError
      });
    });

    it('should prevent duplicate get requests', async () => {
      const mockResponse = { sight, value: 'value' };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      const promise1 = apiService.get(sight);
      const promise2 = apiService.get(sight);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      expect(mockHTTPClient.request).toHaveBeenCalledTimes(1);
    });

    it('should handle special characters in sight parameter', async () => {
      const specialSight = 'test/element with spaces & symbols';
      const mockResponse = { sight: specialSight, value: 'value' };
      mockHTTPClient.request.mockResolvedValue(mockResponse);

      await apiService.get(specialSight);

      expect(mockHTTPClient.request).toHaveBeenCalledWith(
        `/content/${encodeURIComponent(specialSight)}`,
        expect.any(Object)
      );
    });
  });

  describe('clearPendingRequests', () => {
    it('should clear all pending requests', () => {
      // This is a simple test since the implementation just clears a Map
      expect(() => apiService.clearPendingRequests()).not.toThrow();
      
      // We can't easily test the actual clearing without exposing internal state,
      // but we can verify it doesn't cause errors
    });
  });

  describe('error handling', () => {
    it('should handle auth header errors gracefully', async () => {
      mockGetAuthHeaders.mockRejectedValue(new Error('Auth failed'));

      const mockSaveData: SaveData = {
        sight: 'test-element',
        value: 'new value',
        type: 'text',
        context: {
          url: 'http://example.com',
          path: '/home',
          selector: '[data-sight="test-element"]'
        }
      };

      await expect(apiService.save(mockSaveData)).rejects.toThrow('Auth failed');
    });

    it('should handle HTTP errors properly', async () => {
      const httpError = new HTTPError(404, 'Not Found');
      mockHTTPClient.request.mockRejectedValue(httpError);

      const mockSaveData: SaveData = {
        sight: 'test-element',
        value: 'new value',
        type: 'text',
        context: {
          url: 'http://example.com',
          path: '/home',
          selector: '[data-sight="test-element"]'
        }
      };

      // The error should be thrown
      await expect(apiService.save(mockSaveData)).rejects.toThrow('HTTP Error 404: Not Found');
      expect(mockEventBus.emit).toHaveBeenCalledWith('api:save:error', {
        data: mockSaveData,
        error: httpError
      });
    });
  });

  describe('concurrent request management', () => {
    it('should handle multiple different requests concurrently', async () => {
      const saveData1: SaveData = { sight: 'element-1', value: 'value1', type: 'text', context: { url: 'http://example.com', path: '/', selector: '[data-sight="element-1"]' } };
      const saveData2: SaveData = { sight: 'element-2', value: 'value2', type: 'text', context: { url: 'http://example.com', path: '/', selector: '[data-sight="element-2"]' } };

      mockHTTPClient.request
        .mockResolvedValueOnce({ success: true, id: '1' })
        .mockResolvedValueOnce({ success: true, id: '2' });

      const [result1, result2] = await Promise.all([
        apiService.save(saveData1),
        apiService.save(saveData2)
      ]);

      expect(result1).toEqual({ success: true, id: '1' });
      expect(result2).toEqual({ success: true, id: '2' });
      expect(mockHTTPClient.request).toHaveBeenCalledTimes(2);
    });

    it('should clean up request queue after completion', async () => {
      const saveData: SaveData = { sight: 'element-1', value: 'value1', type: 'text', context: { url: 'http://example.com', path: '/', selector: '[data-sight="element-1"]' } };

      mockHTTPClient.request.mockResolvedValue({ success: true });

      await apiService.save(saveData);

      // Make another request with the same sight - should not be deduplicated
      mockHTTPClient.request.mockResolvedValue({ success: true, id: '2' });
      await apiService.save(saveData);

      expect(mockHTTPClient.request).toHaveBeenCalledTimes(2);
    });
  });
});