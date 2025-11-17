export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, any>,
  children?: (HTMLElement | SVGElement | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  
  if (attrs) {
    // Allowlist of safe properties to prevent prototype pollution
    const safeProperties = [
      'id', 'className', 'title', 'textContent', 'innerHTML', 'value',
      'placeholder', 'type', 'name', 'disabled', 'checked', 'selected',
      'href', 'src', 'alt', 'width', 'height', 'tabIndex'
    ];

    Object.entries(attrs).forEach(([key, value]) => {
      // Block dangerous keys that could cause prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`Blocked dangerous property: ${key}`);
        return;
      }

      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('data')) {
        element.setAttribute(key, value);
      } else if (key.startsWith('aria-') || key.startsWith('on')) {
        // Allow aria attributes and event handlers via setAttribute
        element.setAttribute(key, value);
      } else if (safeProperties.includes(key)) {
        // Only set properties from the allowlist
        (element as any)[key] = value;
      } else {
        // For any other properties, use setAttribute as safer alternative
        element.setAttribute(key, value);
      }
    });
  }
  
  if (children) {
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
  }
  
  return element;
}

export function addClass(element: HTMLElement, ...classes: string[]): void {
  element.classList.add(...classes);
}

export function removeClass(element: HTMLElement, ...classes: string[]): void {
  element.classList.remove(...classes);
}

export function toggleClass(element: HTMLElement, className: string, force?: boolean): boolean {
  return element.classList.toggle(className, force);
}

export function hasClass(element: HTMLElement, className: string): boolean {
  return element.classList.contains(className);
}

export function getOffset(element: HTMLElement): { top: number; left: number } {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX
  };
}

export function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

export function removeElement(element: HTMLElement): void {
  element.parentNode?.removeChild(element);
}

export function insertAfter(newElement: HTMLElement, referenceElement: HTMLElement): void {
  referenceElement.parentNode?.insertBefore(newElement, referenceElement.nextSibling);
}

export function wrapElement(element: HTMLElement, wrapper: HTMLElement): void {
  element.parentNode?.insertBefore(wrapper, element);
  wrapper.appendChild(element);
}

export function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode;
  if (!parent) return;
  
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, m => map[m]);
}

export function unescapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'"
  };
  
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
}