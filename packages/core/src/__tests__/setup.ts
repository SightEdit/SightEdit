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