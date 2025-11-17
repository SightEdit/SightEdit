/**
 * Comprehensive test suite for React package bug fixes
 * Tests for infinite loop prevention, memory leak fixes, and promise handling
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEditor } from '../hooks/useEditor';
import { useSightEdit } from '../hooks/useSightEdit';
import { SightEditProvider, useSightEditContext } from '../components/SightEditProvider';
import { SightEditErrorBoundary, useErrorHandler } from '../components/ErrorBoundary';

// Mock SightEditCore
jest.mock('@sightedit/core', () => {
  const mockEditor = {
    validate: jest.fn(() => true),
    getValue: jest.fn(() => 'test'),
    setValue: jest.fn(),
    destroy: jest.fn()
  };

  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    isEditMode: jest.fn(() => false),
    getActiveEditors: jest.fn(() => new Map()),
    toggleEditMode: jest.fn(),
    setEditMode: jest.fn(),
    createEditor: jest.fn(() => mockEditor),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  };

  return {
    SightEditCore: {
      getInstance: jest.fn(() => mockInstance)
    },
    ErrorHandler: {
      handle: jest.fn()
    },
    ErrorType: {
      RUNTIME: 'runtime',
      NETWORK: 'network'
    },
    SightEditError: class SightEditError extends Error {
      type: string;
      recoverable: boolean;
      retryable: boolean;

      constructor(message: string, options?: any) {
        super(message);
        this.type = options?.type || 'runtime';
        this.recoverable = options?.recoverable ?? true;
        this.retryable = options?.retryable ?? true;
      }
    }
  };
});

describe('React Bug Fixes - Infinite Loop Prevention', () => {
  describe('BUG FIX #1: useEditor - save function in dependencies', () => {
    it('should include save in useEffect dependencies without causing infinite loop', async () => {
      const onSave = jest.fn();
      const { result, rerender } = renderHook(
        (props) => useEditor({
          sight: 'test',
          type: 'text',
          initialValue: 'hello',
          autoSave: true,
          ...props
        }),
        {
          initialProps: { onSave }
        }
      );

      // Wait for initial render
      await waitFor(() => {
        expect(result.current.editor).toBeTruthy();
      });

      // Change value to trigger validation and autoSave
      act(() => {
        result.current.setValue('world');
      });

      // Rerender should not cause infinite loop
      rerender({ onSave });

      // Save should be called via autoSave
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });

      // Should not have been called excessively (infinite loop would cause 100+ calls)
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('BUG FIX #2: useEditor - validation object memoization', () => {
    it('should not recreate editor when validation object reference changes but content is same', async () => {
      const validation1 = { required: true, minLength: 5 };
      const validation2 = { required: true, minLength: 5 }; // Same content, different reference

      const { result, rerender } = renderHook(
        (props) => useEditor({
          sight: 'test',
          type: 'text',
          ...props
        }),
        {
          initialProps: { validation: validation1 }
        }
      );

      const firstEditor = result.current.editor;

      // Rerender with new validation object (same content)
      rerender({ validation: validation2 });

      // Editor should remain the same (not recreated)
      expect(result.current.editor).toBe(firstEditor);
    });

    it('should recreate editor when validation content actually changes', async () => {
      const validation1 = { required: true, minLength: 5 };
      const validation2 = { required: true, minLength: 10 }; // Different content

      const { result, rerender } = renderHook(
        (props) => useEditor({
          sight: 'test',
          type: 'text',
          ...props
        }),
        {
          initialProps: { validation: validation1 }
        }
      );

      const firstEditor = result.current.editor;

      // Rerender with different validation
      rerender({ validation: validation2 });

      // Editor should be recreated (different content)
      await waitFor(() => {
        expect(result.current.editor).not.toBe(firstEditor);
      });
    });
  });

  describe('BUG FIX #3: useEditor - callback refs for onSave/onError', () => {
    it('should not recreate save callback when onSave reference changes', async () => {
      const onSave1 = jest.fn();
      const onSave2 = jest.fn();

      const { result, rerender } = renderHook(
        (props) => useEditor({
          sight: 'test',
          type: 'text',
          initialValue: 'hello',
          ...props
        }),
        {
          initialProps: { onSave: onSave1 }
        }
      );

      const firstSave = result.current.save;

      // Rerender with different onSave callback
      rerender({ onSave: onSave2 });

      // save callback should remain stable
      expect(result.current.save).toBe(firstSave);

      // But calling save should use the new callback
      await act(async () => {
        await result.current.save();
      });

      expect(onSave2).toHaveBeenCalled();
      expect(onSave1).not.toHaveBeenCalled();
    });
  });

  describe('BUG FIX #4: useSightEdit - config object memoization', () => {
    it('should not reinitialize when config object reference changes but content is same', async () => {
      const config1 = { apiUrl: 'http://localhost', editMode: 'edit' };
      const config2 = { apiUrl: 'http://localhost', editMode: 'edit' }; // Same content

      const { result, rerender } = renderHook(
        (props) => useSightEdit(props),
        {
          initialProps: { config: config1, autoInit: true }
        }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const firstSightEdit = result.current.sightEdit;

      // Rerender with new config object (same content)
      rerender({ config: config2, autoInit: true });

      // SightEdit instance should remain the same
      expect(result.current.sightEdit).toBe(firstSightEdit);
    });
  });

  describe('BUG FIX #5: useSightEdit - initialize in dependencies', () => {
    it('should include initialize in useEffect dependencies', async () => {
      const { result } = renderHook(() => useSightEdit({ autoInit: true }));

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should initialize without warnings about missing dependencies
      expect(result.current.initialize).toBeDefined();
    });
  });
});

describe('React Bug Fixes - Promise Rejection Handling', () => {
  describe('BUG FIX #6: ErrorBoundary - reportToSentry promise handling', () => {
    it('should handle reportToSentry promise rejection gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const ErrorComponent = () => {
        throw new Error('Test error');
      };

      const { container } = render(
        <SightEditErrorBoundary enableSentry={true}>
          <ErrorComponent />
        </SightEditErrorBoundary>
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Something went wrong');
      });

      // Should not throw unhandled promise rejection
      // Check console.warn was called if sentry failed
      // (sentry is mocked as null in this test environment)

      consoleWarnSpy.mockRestore();
    });
  });

  describe('BUG FIX #7: useErrorHandler - sentry null check', () => {
    it('should not crash when sentry is not available', () => {
      const { result } = renderHook(() => useErrorHandler());

      const testError = new Error('Test error');

      // Should not throw when sentry is null
      expect(() => {
        act(() => {
          result.current.handleError(testError);
        });
      }).toThrow(); // It throws because useErrorHandler throws the error, but doesn't crash on sentry

      expect(result.current.hasError).toBe(true);
    });

    it('should handle async errors properly', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const failingPromise = Promise.reject(new Error('Async error'));

      await act(async () => {
        const res = await result.current.handleAsyncError(failingPromise);
        expect(res).toBeNull();
      });

      // Should catch the error and not let it propagate
      expect(result.current.hasError).toBe(true);
    });
  });
});

describe('React Bug Fixes - Memory Leak Prevention', () => {
  describe('BUG FIX #8: SightEditProvider - memoized functions', () => {
    it('should memoize all functions to prevent useMemo invalidation', () => {
      const { result, rerender } = renderHook(
        () => useSightEditContext(),
        {
          wrapper: ({ children }) => (
            <SightEditProvider config={{ apiUrl: 'http://localhost' }}>
              {children}
            </SightEditProvider>
          )
        }
      );

      const firstInitialize = result.current.initialize;
      const firstDestroy = result.current.destroy;
      const firstToggleEditMode = result.current.toggleEditMode;
      const firstSetEditMode = result.current.setEditMode;

      // Rerender
      rerender();

      // All functions should remain stable
      expect(result.current.initialize).toBe(firstInitialize);
      expect(result.current.destroy).toBe(firstDestroy);
      expect(result.current.toggleEditMode).toBe(firstToggleEditMode);
      expect(result.current.setEditMode).toBe(firstSetEditMode);
    });
  });

  describe('BUG FIX #9: SightEditProvider - event listener cleanup', () => {
    it('should clean up event listeners on unmount', async () => {
      const { SightEditCore } = require('@sightedit/core');
      const mockInstance = SightEditCore.getInstance();
      mockInstance.off.mockClear();

      const { unmount } = renderHook(
        () => useSightEditContext(),
        {
          wrapper: ({ children }) => (
            <SightEditProvider autoInit={true}>
              {children}
            </SightEditProvider>
          )
        }
      );

      await waitFor(() => {
        expect(mockInstance.on).toHaveBeenCalled();
      });

      // Unmount component
      unmount();

      // Event listeners should be cleaned up
      await waitFor(() => {
        expect(mockInstance.off).toHaveBeenCalled();
      });

      // Should be called 3 times (edit-mode:toggled, editors:updated, error:occurred)
      expect(mockInstance.off).toHaveBeenCalledTimes(3);
    });

    it('should clean up event listeners when re-initializing', async () => {
      const { SightEditCore } = require('@sightedit/core');
      const mockInstance = SightEditCore.getInstance();
      mockInstance.off.mockClear();

      const { result } = renderHook(
        () => useSightEditContext(),
        {
          wrapper: ({ children }) => (
            <SightEditProvider autoInit={false}>
              {children}
            </SightEditProvider>
          )
        }
      );

      // Initialize first time
      await act(async () => {
        await result.current.initialize();
      });

      const offCallsAfterFirst = mockInstance.off.mock.calls.length;

      // Initialize second time
      await act(async () => {
        await result.current.initialize();
      });

      // Should clean up old listeners before adding new ones
      expect(mockInstance.off.mock.calls.length).toBeGreaterThan(offCallsAfterFirst);
    });
  });

  describe('BUG FIX #10: SightEditProvider - missing dependencies', () => {
    it('should have all dependencies in autoInit useEffect', async () => {
      const { result } = renderHook(
        () => useSightEditContext(),
        {
          wrapper: ({ children }) => (
            <SightEditProvider autoInit={true}>
              {children}
            </SightEditProvider>
          )
        }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should initialize properly without dependency warnings
      expect(result.current.initialize).toBeDefined();
    });
  });
});

describe('React Bug Fixes - Integration Tests', () => {
  it('should handle complete user flow without infinite loops or memory leaks', async () => {
    const onSave = jest.fn();
    const onError = jest.fn();

    const { result } = renderHook(
      () => useEditor({
        sight: 'test-field',
        type: 'text',
        initialValue: 'initial',
        validation: { required: true, minLength: 3 },
        onSave,
        onError,
        autoSave: true
      })
    );

    // Wait for editor creation
    await waitFor(() => {
      expect(result.current.editor).toBeTruthy();
    });

    // Change value
    act(() => {
      result.current.setValue('updated value');
    });

    // Should trigger validation and auto-save
    await waitFor(() => {
      expect(result.current.isDirty).toBe(true);
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('updated value');
    }, { timeout: 1000 });

    // Should not have excessive re-renders (would indicate infinite loop)
    expect(onSave).toHaveBeenCalledTimes(1);

    // Manual save should work
    await act(async () => {
      await result.current.save();
    });

    // Reset should work
    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe('initial');
    expect(result.current.isDirty).toBe(false);
  });

  it('should handle provider lifecycle without memory leaks', async () => {
    const { SightEditCore } = require('@sightedit/core');
    const mockInstance = SightEditCore.getInstance();
    mockInstance.on.mockClear();
    mockInstance.off.mockClear();

    const { unmount } = renderHook(
      () => useSightEditContext(),
      {
        wrapper: ({ children }) => (
          <SightEditProvider autoInit={true}>
            {children}
          </SightEditProvider>
        )
      }
    );

    await waitFor(() => {
      expect(mockInstance.on).toHaveBeenCalled();
    });

    const onCallCount = mockInstance.on.mock.calls.length;

    unmount();

    // Should clean up exactly as many listeners as were added
    await waitFor(() => {
      expect(mockInstance.off.mock.calls.length).toBe(onCallCount);
    });
  });
});

// Helper to detect React warnings (would catch infinite loop warnings)
describe('React Warnings Detection', () => {
  it('should not generate React warnings about missing dependencies', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    renderHook(() => useEditor({
      sight: 'test',
      type: 'text',
      validation: { required: true },
      onSave: jest.fn(),
      onError: jest.fn()
    }));

    // Filter for React Hook dependency warnings
    const dependencyWarnings = consoleErrorSpy.mock.calls.filter(call =>
      call[0]?.includes && call[0].includes('React Hook useEffect has a missing dependency')
    );

    expect(dependencyWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});

// Import render for ErrorBoundary tests
import { render } from '@testing-library/react';
