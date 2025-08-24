import { ThemeConfig } from '../types';
import { createElement, setStyles } from '../utils/dom';

export class EditModeUI {
  private container: HTMLElement;
  private button: HTMLElement;
  private indicator: HTMLElement;
  private theme: ThemeConfig;
  private isVisible = false;
  private toggleCallback?: () => void;

  constructor(theme?: ThemeConfig) {
    this.theme = {
      primaryColor: '#007bff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: '4px',
      zIndex: 9999,
      ...theme
    };
    
    this.container = this.createContainer();
    this.button = this.createButton();
    this.indicator = this.createIndicator();
    
    this.container.appendChild(this.button);
    this.container.appendChild(this.indicator);
    
    this.attachEventListeners();
  }

  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: 'sight-edit-ui',
      style: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: this.theme.zIndex,
        fontFamily: this.theme.fontFamily,
        fontSize: '14px',
        userSelect: 'none'
      }
    });
    
    return container;
  }

  private createButton(): HTMLElement {
    const button = createElement('button', {
      className: 'sight-edit-toggle',
      title: 'Toggle Edit Mode (Ctrl/Cmd + E)',
      style: {
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: this.theme.primaryColor,
        color: 'white',
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        outline: 'none'
      }
    }, [this.createIcon()]);

    button.addEventListener('mouseenter', () => {
      setStyles(button, {
        transform: 'scale(1.1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      });
    });

    button.addEventListener('mouseleave', () => {
      setStyles(button, {
        transform: 'scale(1)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      });
    });

    return button;
  }

  private createIcon(): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 20h9m-11 0a2 2 0 01-2-2V6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M12 20l-2-2m2 2l2-2m-2-5v5');
    
    svg.appendChild(path);
    return svg;
  }

  private createIndicator(): HTMLElement {
    const indicator = createElement('div', {
      className: 'sight-edit-indicator',
      style: {
        position: 'absolute',
        top: '-8px',
        right: '-8px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: '#28a745',
        border: '3px solid white',
        display: 'none',
        transition: 'all 0.3s ease'
      }
    });

    return indicator;
  }

  private attachEventListeners(): void {
    this.button.addEventListener('click', () => {
      if (this.toggleCallback) {
        this.toggleCallback();
      }
    });

    this.button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.button.click();
      }
    });
  }

  show(): void {
    if (this.isVisible) return;
    
    document.body.appendChild(this.container);
    this.isVisible = true;
    
    requestAnimationFrame(() => {
      setStyles(this.container, {
        opacity: '0',
        transform: 'translateY(20px)'
      });
      
      requestAnimationFrame(() => {
        setStyles(this.container, {
          transition: 'all 0.3s ease',
          opacity: '1',
          transform: 'translateY(0)'
        });
      });
    });
  }

  hide(): void {
    if (!this.isVisible) return;
    
    setStyles(this.container, {
      opacity: '0',
      transform: 'translateY(20px)'
    });
    
    setTimeout(() => {
      if (this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.isVisible = false;
    }, 300);
  }

  setEditMode(isActive: boolean): void {
    if (isActive) {
      setStyles(this.indicator, { display: 'block' });
      setStyles(this.button, { backgroundColor: '#28a745' });
      this.button.setAttribute('title', 'Exit Edit Mode (Ctrl/Cmd + E)');
    } else {
      setStyles(this.indicator, { display: 'none' });
      setStyles(this.button, { backgroundColor: this.theme.primaryColor });
      this.button.setAttribute('title', 'Enter Edit Mode (Ctrl/Cmd + E)');
    }
  }

  onToggle(callback: () => void): void {
    this.toggleCallback = callback;
  }

  destroy(): void {
    this.hide();
    this.toggleCallback = undefined;
  }

  updateTheme(theme: Partial<ThemeConfig>): void {
    this.theme = { ...this.theme, ...theme };
    
    if (theme.primaryColor) {
      setStyles(this.button, { backgroundColor: theme.primaryColor });
    }
    
    if (theme.fontFamily) {
      setStyles(this.container, { fontFamily: theme.fontFamily });
    }
    
    if (theme.zIndex) {
      setStyles(this.container, { zIndex: theme.zIndex.toString() });
    }
  }
}