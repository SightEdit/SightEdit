import { HTTPClient, HTTPError, RequestOptions } from '../../services/http-client';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock timers for testing delays
jest.useFakeTimers();

describe('HTTPClient', () => {
  let client: HTTPClient;
  const baseURL = 'https://api.example.com';

  beforeEach(() => {
    client = new HTTPClient(baseURL);
    mockFetch.mockClear();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with base URL and default headers', () => {
      const customHeaders = { 'X-API-Key': 'test-key' };
      const customClient = new HTTPClient(baseURL, customHeaders);
      
      // We can't directly test private properties, but we can verify behavior
      expect(customClient).toBeInstanceOf(HTTPClient);
    });

    it('should set default Accept header', () => {
      const client = new HTTPClient(baseURL);
      expect(client).toBeInstanceOf(HTTPClient);
      // Default headers are private, but we'll test their usage in requests
    });
  });

  describe('request method', () => {
    const successfulResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ success: true }),
      text: jest.fn().mockResolvedValue('success'),
      blob: jest.fn().mockResolvedValue(new Blob()),
    } as any;

    beforeEach(() => {
      mockFetch.mockResolvedValue(successfulResponse);
    });

    it('should make a basic GET request', async () => {
      const options: RequestOptions = { method: 'GET' };
      const result = await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json'
          }),
          credentials: 'same-origin'
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle JSON responses', async () => {
      const options: RequestOptions = { method: 'GET' };
      const result = await client.request('/users', options);

      expect(successfulResponse.json).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle text responses', async () => {
      const textResponse = {
        ...successfulResponse,
        headers: new Headers({ 'content-type': 'text/plain' }),
      };
      mockFetch.mockResolvedValue(textResponse);

      const result = await client.request('/users', { method: 'GET' });

      expect(textResponse.text).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should handle blob responses', async () => {
      const blobResponse = {
        ...successfulResponse,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      };
      mockFetch.mockResolvedValue(blobResponse);

      const result = await client.request('/image', { method: 'GET' });

      expect(blobResponse.blob).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Blob);
    });

    it('should include custom headers', async () => {
      const options: RequestOptions = {
        method: 'GET',
        headers: { 'Authorization': 'Bearer token' }
      };

      await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'Authorization': 'Bearer token'
          })
        })
      );
    });

    it('should handle JSON body', async () => {
      const data = { name: 'John', email: 'john@example.com' };
      const options: RequestOptions = {
        method: 'POST',
        body: data
      };

      await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle string body', async () => {
      const data = 'raw string data';
      const options: RequestOptions = {
        method: 'POST',
        body: data
      };

      await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          body: data
        })
      );
    });

    it('should handle FormData body', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['content']), 'test.txt');

      const options: RequestOptions = {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' }
      };

      await client.request('/upload', options);

      const call = mockFetch.mock.calls[0];
      expect(call[1].body).toBe(formData);
      // Content-Type should be removed for FormData to let browser set boundary
      expect(call[1].headers).not.toHaveProperty('Content-Type');
    });

    it('should set up abort controller with timeout', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
      
      const options: RequestOptions = {
        method: 'GET',
        timeout: 5000
      };

      // Mock a slow response
      mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000)));

      const requestPromise = client.request('/slow', options);

      // Fast forward time to trigger timeout
      jest.advanceTimersByTime(5000);

      await expect(requestPromise).rejects.toThrow();
      expect(abortSpy).toHaveBeenCalled();

      abortSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should throw HTTPError for non-ok responses', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };
      mockFetch.mockResolvedValue(errorResponse);

      await expect(client.request('/nonexistent', { method: 'GET' }))
        .rejects
        .toThrow(HTTPError);

      try {
        await client.request('/nonexistent', { method: 'GET' });
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(404);
        expect((error as HTTPError).statusText).toBe('Not Found');
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.request('/users', { method: 'GET' }))
        .rejects
        .toThrow('Failed to fetch');
    });
  });

  describe('retry mechanism', () => {
    it('should retry on retryable errors', async () => {
      const errorResponse = { ok: false, status: 500, statusText: 'Internal Server Error' };
      const successResponse = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ success: true }) };

      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const options: RequestOptions = {
        method: 'GET',
        retries: 2,
        retryDelay: 100
      };

      const result = await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true });
    });

    it('should not retry on client errors (4xx)', async () => {
      const errorResponse = { ok: false, status: 400, statusText: 'Bad Request' };
      mockFetch.mockResolvedValue(errorResponse);

      const options: RequestOptions = {
        method: 'GET',
        retries: 2
      };

      await expect(client.request('/users', options))
        .rejects
        .toThrow(HTTPError);

      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
    });

    it('should retry on 429 rate limiting', async () => {
      const rateLimitResponse = { ok: false, status: 429, statusText: 'Too Many Requests' };
      const successResponse = { ok: true, status: 200, json: jest.fn().mockResolvedValue({ success: true }) };

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const options: RequestOptions = {
        method: 'GET',
        retries: 1,
        retryDelay: 100
      };

      const result = await client.request('/users', options);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it('should use exponential backoff for retries', async () => {
      const errorResponse = { ok: false, status: 500, statusText: 'Internal Server Error' };
      mockFetch.mockResolvedValue(errorResponse);

      const options: RequestOptions = {
        method: 'GET',
        retries: 3,
        retryDelay: 100
      };

      const startTime = Date.now();
      
      try {
        await client.request('/users', options);
      } catch (error) {
        // Expected to fail after retries
      }

      // Should have made delays: 100ms, 200ms, 400ms
      jest.advanceTimersByTime(700);

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should handle timeout errors during retries', async () => {
      mockFetch.mockImplementation(() => {
        throw new DOMException('The operation was aborted', 'AbortError');
      });

      const options: RequestOptions = {
        method: 'GET',
        retries: 2,
        retryDelay: 100
      };

      await expect(client.request('/users', options))
        .rejects
        .toThrow('AbortError');

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('utility methods', () => {
    const mockResponse = { success: true };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });
    });

    it('should perform GET request via get method', async () => {
      const result = await client.get('/users');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should perform POST request via post method', async () => {
      const data = { name: 'John' };
      const result = await client.post('/users', data);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({ 
          method: 'POST',
          body: JSON.stringify(data)
        })
      );
    });

    it('should perform PUT request via put method', async () => {
      const data = { name: 'John Updated' };
      const result = await client.put('/users/1', data);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({ 
          method: 'PUT',
          body: JSON.stringify(data)
        })
      );
    });

    it('should perform DELETE request via delete method', async () => {
      const result = await client.delete('/users/1');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should include custom headers in utility methods', async () => {
      const headers = { 'Authorization': 'Bearer token' };
      await client.get('/users', headers);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining(headers)
        })
      );
    });
  });

  describe('isRetryableError', () => {
    it('should identify server errors as retryable', async () => {
      const serverError = { ok: false, status: 500, statusText: 'Internal Server Error' };
      mockFetch.mockResolvedValueOnce(serverError);

      await expect(client.request('/test', { method: 'GET', retries: 1 }))
        .rejects
        .toThrow(HTTPError);

      expect(mockFetch).toHaveBeenCalledTimes(2); // Should retry
    });

    it('should identify rate limiting as retryable', async () => {
      const rateLimitError = { ok: false, status: 429, statusText: 'Too Many Requests' };
      mockFetch.mockResolvedValueOnce(rateLimitError);

      await expect(client.request('/test', { method: 'GET', retries: 1 }))
        .rejects
        .toThrow(HTTPError);

      expect(mockFetch).toHaveBeenCalledTimes(2); // Should retry
    });

    it('should not retry client errors', async () => {
      const clientError = { ok: false, status: 400, statusText: 'Bad Request' };
      mockFetch.mockResolvedValue(clientError);

      await expect(client.request('/test', { method: 'GET', retries: 1 }))
        .rejects
        .toThrow(HTTPError);

      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
    });

    it('should identify network errors as retryable', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ success: true })
        });

      const result = await client.request('/test', { method: 'GET', retries: 1 });

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2); // Should retry
    });
  });

  describe('edge cases', () => {
    it('should handle responses with no content-type header', async () => {
      const response = {
        ok: true,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      mockFetch.mockResolvedValue(response);

      const result = await client.request('/test', { method: 'GET' });

      expect(response.json).toHaveBeenCalled();
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle empty response body', async () => {
      const response = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue(null)
      };
      mockFetch.mockResolvedValue(response);

      const result = await client.request('/test', { method: 'GET' });

      expect(result).toBeNull();
    });

    it('should handle malformed JSON response', async () => {
      const response = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      };
      mockFetch.mockResolvedValue(response);

      await expect(client.request('/test', { method: 'GET' }))
        .rejects
        .toThrow(SyntaxError);
    });
  });
});