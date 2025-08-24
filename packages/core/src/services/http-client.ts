export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class HTTPError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly response?: Response
  ) {
    super(`HTTP Error ${status}: ${statusText}`);
    this.name = 'HTTPError';
  }
}

export class HTTPClient {
  private readonly defaultHeaders: Record<string, string>;

  constructor(
    private readonly baseURL: string,
    defaultHeaders: Record<string, string> = {}
  ) {
    this.defaultHeaders = {
      'Accept': 'application/json',
      ...defaultHeaders
    };
  }

  async request<T>(url: string, options: RequestOptions): Promise<T> {
    const fullURL = new URL(url, this.baseURL);
    let lastError: Error;

    const maxRetries = options.retries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(fullURL, options);

        if (!response.ok) {
          const error = new HTTPError(response.status, response.statusText, response);
          
          // Don't retry client errors (4xx), only server errors (5xx) and rate limiting
          if (attempt < maxRetries && this.isRetryableError(error)) {
            await this.delay(retryDelay * Math.pow(2, attempt));
            continue;
          }
          
          throw error;
        }

        // Handle different content types
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          return await response.json();
        } else if (contentType.includes('text/')) {
          return await response.text() as unknown as T;
        } else {
          return await response.blob() as unknown as T;
        }
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries && this.isRetryableError(error)) {
          await this.delay(retryDelay * Math.pow(2, attempt));
          continue;
        }

        throw error;
      }
    }

    throw lastError!;
  }

  private async executeRequest(url: URL, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout ?? 30000);

    try {
      const headers = { ...this.defaultHeaders, ...options.headers };
      
      // Handle different body types
      let body: string | FormData | undefined;
      if (options.body) {
        if (options.body instanceof FormData) {
          body = options.body;
          // Don't set Content-Type for FormData, let the browser set it with boundary
          delete headers['Content-Type'];
        } else if (typeof options.body === 'string') {
          body = options.body;
        } else {
          body = JSON.stringify(options.body);
          headers['Content-Type'] = 'application/json';
        }
      }

      return await fetch(url.toString(), {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
        credentials: 'same-origin'
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof HTTPError) {
      // Retry on server errors (5xx) and rate limiting (429)
      return error.status >= 500 || error.status === 429;
    }

    // Retry on network errors and timeouts
    return (
      error.name === 'AbortError' ||
      error.name === 'TypeError' ||
      error.message.includes('fetch')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for common HTTP operations
  async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  async post<T>(url: string, data: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'POST', body: data, headers });
  }

  async put<T>(url: string, data: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'PUT', body: data, headers });
  }

  async delete<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'DELETE', headers });
  }
}