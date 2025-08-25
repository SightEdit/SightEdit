import { ErrorHandler, ErrorType, UserErrorMessages } from '../utils/error-handler';

describe('ErrorHandler', () => {
  beforeEach(() => {
    ErrorHandler.clearErrors();
  });

  test('should handle and log errors', () => {
    const testError = new Error('Test error');
    const errorDetails = ErrorHandler.handle(testError, ErrorType.VALIDATION, { test: true });

    expect(errorDetails.type).toBe(ErrorType.VALIDATION);
    expect(errorDetails.message).toBe('Test error');
    expect(errorDetails.context).toEqual({ test: true });
    expect(errorDetails.timestamp).toBeGreaterThan(0);
  });

  test('should handle string errors', () => {
    const errorDetails = ErrorHandler.handle('String error', ErrorType.NETWORK);

    expect(errorDetails.type).toBe(ErrorType.NETWORK);
    expect(errorDetails.message).toBe('String error');
    expect(errorDetails.stack).toBeUndefined();
  });

  test('should maintain error history', () => {
    ErrorHandler.handle('Error 1', ErrorType.VALIDATION);
    ErrorHandler.handle('Error 2', ErrorType.NETWORK);
    ErrorHandler.handle('Error 3', ErrorType.RUNTIME);

    const recentErrors = ErrorHandler.getRecentErrors(3);
    expect(recentErrors).toHaveLength(3);
    expect(recentErrors[0].message).toBe('Error 1');
    expect(recentErrors[2].message).toBe('Error 3');
  });

  test('should filter errors by type', () => {
    ErrorHandler.handle('Validation error', ErrorType.VALIDATION);
    ErrorHandler.handle('Network error', ErrorType.NETWORK);
    ErrorHandler.handle('Another validation error', ErrorType.VALIDATION);

    const validationErrors = ErrorHandler.getErrorsByType(ErrorType.VALIDATION);
    expect(validationErrors).toHaveLength(2);
    expect(validationErrors.every(e => e.type === ErrorType.VALIDATION)).toBe(true);
  });

  test('should provide error statistics', () => {
    ErrorHandler.handle('Error 1', ErrorType.VALIDATION);
    ErrorHandler.handle('Error 2', ErrorType.NETWORK);
    ErrorHandler.handle('Error 3', ErrorType.VALIDATION);

    const stats = ErrorHandler.getStats();
    expect(stats[ErrorType.VALIDATION]).toBe(2);
    expect(stats[ErrorType.NETWORK]).toBe(1);
    expect(stats[ErrorType.RUNTIME]).toBe(0);
  });

  test('should notify error listeners', () => {
    const listener = jest.fn();
    const unsubscribe = ErrorHandler.onError(listener);

    ErrorHandler.handle('Test error', ErrorType.RUNTIME);
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Test error',
      type: ErrorType.RUNTIME
    }));

    unsubscribe();
    ErrorHandler.handle('Another error', ErrorType.RUNTIME);
    
    expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
  });

  test('should handle network errors with retry', async () => {
    let attemptCount = 0;
    const failingOperation = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Network failure');
      }
      return 'success';
    };

    const result = await ErrorHandler.handleNetworkError(failingOperation, 3, 10);
    expect(result).toBe('success');
    expect(attemptCount).toBe(3);
  });

  test('should throw after max retries', async () => {
    const alwaysFailingOperation = async () => {
      throw new Error('Always fails');
    };

    await expect(
      ErrorHandler.handleNetworkError(alwaysFailingOperation, 2, 10)
    ).rejects.toThrow('Always fails');
  });

  test('should validate conditions', () => {
    expect(() => {
      ErrorHandler.validate(true, 'Should not throw');
    }).not.toThrow();

    expect(() => {
      ErrorHandler.validate(false, 'Should throw');
    }).toThrow('Should throw');
  });

  test('should wrap async operations safely', async () => {
    const successOperation = async () => 'success';
    const failingOperation = async () => { throw new Error('Failure'); };

    const result1 = await ErrorHandler.withErrorHandling(successOperation);
    expect(result1).toBe('success');

    const result2 = await ErrorHandler.withErrorHandling(failingOperation);
    expect(result2).toBeNull();
  });
});

describe('UserErrorMessages', () => {
  test('should provide user-friendly messages', () => {
    expect(UserErrorMessages.getMessageFor('Network Error').message).toContain('Connection problem');
    expect(UserErrorMessages.getMessageFor('Invalid JSON').message).toContain('data format');
    expect(UserErrorMessages.getMessageFor('Permission denied').message).toContain('permission');
  });

  test('should handle unknown errors with fallback', () => {
    const message = UserErrorMessages.getMessageFor('Unknown weird error');
    expect(message.message).toContain('Something went wrong');
  });

  test('should allow adding custom messages', () => {
    UserErrorMessages.addMessage('Custom Error', 'This is a custom error message');
    const message = UserErrorMessages.getMessageFor('Custom Error occurred');
    expect(message).toBe('This is a custom error message');
  });
});