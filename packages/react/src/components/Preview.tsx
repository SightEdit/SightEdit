import React, { useEffect, useRef, useState } from 'react';
import { useSightEdit } from '../index';

export interface PreviewProps {
  sight: string;
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  renderAs?: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  transform?: (value: any) => React.ReactNode;
  live?: boolean; // Subscribe to live updates
}

export const Preview: React.FC<PreviewProps> = ({
  sight,
  fallback = null,
  className,
  style,
  renderAs: Component = 'div',
  transform,
  live = true
}) => {
  const { instance } = useSightEdit();
  const [value, setValue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!instance) return;

    const fetchValue = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get value from backend or local storage
        const element = document.querySelector(`[data-sight="${sight}"]`) as HTMLElement;
        if (element) {
          const elementValue = element.dataset.value || element.textContent || element.getAttribute('src');
          setValue(elementValue);
        } else {
          // Try to fetch from API
          const response = await fetch(`${(instance as any).config.endpoint}/get/${sight}`);
          if (response.ok) {
            const data = await response.json();
            setValue(data.value);
          }
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchValue();

    // Subscribe to live updates if enabled
    if (live) {
      const handleUpdate = (data: any) => {
        if (data.sight === sight) {
          setValue(data.value);
        }
      };

      instance.on('save', handleUpdate);
      instance.on('change', handleUpdate);

      return () => {
        instance.off('save', handleUpdate);
        instance.off('change', handleUpdate);
      };
    }
  }, [instance, sight, live]);

  if (loading) {
    return (
      <Component className={className} style={style}>
        <span style={{ color: '#999' }}>Loading...</span>
      </Component>
    );
  }

  if (error) {
    return (
      <Component className={className} style={style}>
        {fallback || <span style={{ color: '#f44336' }}>Error loading content</span>}
      </Component>
    );
  }

  const content = transform ? transform(value) : value;

  return (
    <Component className={className} style={style}>
      {content || fallback}
    </Component>
  );
};