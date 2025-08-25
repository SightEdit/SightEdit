// Handle unhandled promise rejections in tests to prevent Jest worker crashes
process.on('unhandledRejection', (reason, promise) => {
  // Only suppress API-related errors during tests
  if (reason instanceof Error && (
    reason.message.includes('[IP]') ||
    reason.message.includes('[REDACTED]') ||
    reason.message.includes('Plain text error') ||
    reason.message.includes('Database connection failed') ||
    reason.message.includes('Request failed:') ||
    reason.message.includes('Persistent fetch error') ||
    reason.message.includes('Network error') ||
    reason.message.includes('Batch error') ||
    reason.message.includes('Request timeout') ||
    reason.message.includes('Network request failed')
  )) {
    // Silently suppress these errors during tests
    return;
  }
  
  // Also suppress window.document.addEventListener errors from JSDOM
  if (reason instanceof TypeError && reason.message.includes('window.document.addEventListener is not a function')) {
    return;
  }
  
  // Re-throw other unhandled rejections
  throw reason;
});

// Mock DOM APIs that might not be available in jsdom
global.MutationObserver = class MutationObserver {
  constructor(callback: MutationCallback) {}
  observe(target: Node, options?: MutationObserverInit): void {}
  disconnect(): void {}
  takeRecords(): MutationRecord[] { return []; }
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Ensure document has event listener methods
if (typeof document !== 'undefined' && document) {
  if (!document.addEventListener) {
    document.addEventListener = jest.fn();
  }
  if (!document.removeEventListener) {
    document.removeEventListener = jest.fn();
  }
  if (!document.dispatchEvent) {
    document.dispatchEvent = jest.fn();
  }
}

// Mock window.document more thoroughly for JSDOM compatibility
if (typeof window !== 'undefined' && window && window.document) {
  if (!window.document.addEventListener) {
    window.document.addEventListener = jest.fn();
  }
  if (!window.document.removeEventListener) {
    window.document.removeEventListener = jest.fn();
  }
  if (!window.document.dispatchEvent) {
    window.document.dispatchEvent = jest.fn();
  }
}

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers(),
    status: 200,
    statusText: 'OK'
  } as Response)
);

// Add custom matchers if needed
expect.extend({
  toHaveDataAttribute(element: HTMLElement, attribute: string, value?: string) {
    const hasAttribute = element.hasAttribute(`data-${attribute}`);
    const attributeValue = element.getAttribute(`data-${attribute}`);
    
    if (value !== undefined) {
      const pass = hasAttribute && attributeValue === value;
      return {
        pass,
        message: () => pass
          ? `Expected element not to have data-${attribute}="${value}"`
          : `Expected element to have data-${attribute}="${value}", but got "${attributeValue}"`
      };
    }
    
    return {
      pass: hasAttribute,
      message: () => hasAttribute
        ? `Expected element not to have data-${attribute}`
        : `Expected element to have data-${attribute}`
    };
  }
});