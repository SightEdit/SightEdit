/**
 * CSRF (Cross-Site Request Forgery) Protection Implementation
 * Provides secure token-based CSRF protection for all state-changing operations
 */

export interface CSRFConfig {
  tokenName?: string;
  headerName?: string;
  cookieName?: string;
  tokenLength?: number;
  expireMinutes?: number;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}

export interface CSRFToken {
  token: string;
  expires: number;
  created: number;
}

export class CSRFProtection {
  private config: Required<CSRFConfig>;
  private currentToken: CSRFToken | null = null;
  private readonly storage: Storage;

  constructor(config: CSRFConfig = {}) {
    this.config = {
      tokenName: config.tokenName || 'csrfToken',
      headerName: config.headerName || 'X-CSRF-Token',
      cookieName: config.cookieName || 'csrf-token',
      tokenLength: config.tokenLength || 32,
      expireMinutes: config.expireMinutes || 60,
      sameSite: config.sameSite || 'strict',
      secure: config.secure ?? (window.location.protocol === 'https:')
    };

    // Use sessionStorage for token storage (more secure than localStorage)
    this.storage = sessionStorage;
  }

  /**
   * Generate a cryptographically secure CSRF token
   */
  async generateToken(): Promise<string> {
    // Use crypto.getRandomValues for secure random generation
    const array = new Uint8Array(this.config.tokenLength);
    crypto.getRandomValues(array);
    
    // Convert to base64url (URL-safe base64)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Create and store a new CSRF token
   */
  async createToken(): Promise<CSRFToken> {
    const token = await this.generateToken();
    const now = Date.now();
    const expires = now + (this.config.expireMinutes * 60 * 1000);

    const csrfToken: CSRFToken = {
      token,
      expires,
      created: now
    };

    // Store token securely
    this.currentToken = csrfToken;
    this.storage.setItem(`sightedit_${this.config.tokenName}`, JSON.stringify(csrfToken));
    
    // Set cookie for server-side verification
    this.setCookie(this.config.cookieName, token, expires);
    
    return csrfToken;
  }

  /**
   * Get current valid CSRF token, create new one if needed
   */
  async getToken(): Promise<string> {
    const token = this.getCurrentToken();
    
    if (!token || this.isTokenExpired(token)) {
      const newToken = await this.createToken();
      return newToken.token;
    }
    
    return token.token;
  }

  /**
   * Get current token from storage without creating new one
   */
  getCurrentToken(): CSRFToken | null {
    if (this.currentToken && !this.isTokenExpired(this.currentToken)) {
      return this.currentToken;
    }

    try {
      const stored = this.storage.getItem(`sightedit_${this.config.tokenName}`);
      if (stored) {
        const token = JSON.parse(stored) as CSRFToken;
        if (!this.isTokenExpired(token)) {
          this.currentToken = token;
          return token;
        }
      }
    } catch (error) {
      console.warn('Failed to parse stored CSRF token:', error);
    }

    return null;
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: CSRFToken): boolean {
    return Date.now() >= token.expires;
  }

  /**
   * Validate a CSRF token using timing-safe comparison
   */
  async validateToken(providedToken: string): Promise<boolean> {
    const currentToken = this.getCurrentToken();
    
    if (!currentToken || this.isTokenExpired(currentToken)) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    return this.timingSafeEqual(providedToken, currentToken.token);
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Add CSRF token to request headers
   */
  async addTokenToRequest(headers: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await this.getToken();
    
    return {
      ...headers,
      [this.config.headerName]: token
    };
  }

  /**
   * Add CSRF token to FormData
   */
  async addTokenToFormData(formData: FormData): Promise<FormData> {
    const token = await this.getToken();
    formData.append(this.config.tokenName, token);
    return formData;
  }

  /**
   * Add CSRF token to URL parameters
   */
  async addTokenToUrl(url: string): Promise<string> {
    const token = await this.getToken();
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set(this.config.tokenName, token);
    return urlObj.toString();
  }

  /**
   * Set secure cookie
   */
  private setCookie(name: string, value: string, expires: number): void {
    const expiresDate = new Date(expires);
    
    let cookieString = `${name}=${value}; expires=${expiresDate.toUTCString()}; path=/`;
    
    if (this.config.secure) {
      cookieString += '; Secure';
    }
    
    cookieString += `; SameSite=${this.config.sameSite}`;
    cookieString += '; HttpOnly';
    
    document.cookie = cookieString;
  }

  /**
   * Clear CSRF token and cookie
   */
  clearToken(): void {
    this.currentToken = null;
    this.storage.removeItem(`sightedit_${this.config.tokenName}`);
    
    // Clear cookie by setting past expiration
    document.cookie = `${this.config.cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
  }

  /**
   * Refresh token (create new one)
   */
  async refreshToken(): Promise<string> {
    this.clearToken();
    const newToken = await this.createToken();
    return newToken.token;
  }

  /**
   * Validate request contains valid CSRF token
   */
  async validateRequest(request: Request | { headers: Record<string, string> }): Promise<boolean> {
    let token: string | null = null;

    // Check headers first
    if ('headers' in request && request.headers) {
      if (request.headers instanceof Headers) {
        token = request.headers.get(this.config.headerName);
      } else {
        token = request.headers[this.config.headerName];
      }
    }

    // If no token in headers, check form data or URL params
    if (!token && 'url' in request && request.url) {
      const url = new URL(request.url);
      token = url.searchParams.get(this.config.tokenName);
    }

    if (!token) {
      return false;
    }

    return this.validateToken(token);
  }

  /**
   * Create middleware function for request validation
   */
  createMiddleware() {
    return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
      // Skip validation for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return next();
      }

      const isValid = await this.validateRequest(request);
      
      if (!isValid) {
        return new Response('CSRF token validation failed', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }

      return next();
    };
  }

  /**
   * Get token info for debugging (in development only)
   */
  getTokenInfo(): { hasToken: boolean; isExpired: boolean; expiresIn?: number } | null {
    if (process.env.NODE_ENV !== 'development') {
      return null;
    }

    const token = this.getCurrentToken();
    
    if (!token) {
      return { hasToken: false, isExpired: false };
    }

    const isExpired = this.isTokenExpired(token);
    const expiresIn = Math.max(0, token.expires - Date.now());

    return {
      hasToken: true,
      isExpired,
      expiresIn
    };
  }
}

// Global instance for convenience
let globalCSRFProtection: CSRFProtection | null = null;

/**
 * Get global CSRF protection instance
 */
export function getCSRFProtection(config?: CSRFConfig): CSRFProtection {
  if (!globalCSRFProtection) {
    globalCSRFProtection = new CSRFProtection(config);
  }
  return globalCSRFProtection;
}

/**
 * Convenience function to add CSRF protection to fetch requests
 */
export async function secureRequestHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const csrf = getCSRFProtection();
  return csrf.addTokenToRequest(headers);
}

/**
 * Convenience function for protected fetch requests
 */
export async function protectedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const csrf = getCSRFProtection();
  
  // Add CSRF token to headers
  const headers = await csrf.addTokenToRequest(
    options.headers as Record<string, string> || {}
  );

  return fetch(url, {
    ...options,
    headers
  });
}