import { 
  Command, 
  CommandMetadata, 
  EditCommand, 
  BatchCommand, 
  CommandHistory, 
  CommandContext 
} from '../../commands/command';

// Mock implementations for testing
class TestCommand extends Command {
  private executed = false;
  private undone = false;
  public shouldFailExecute = false;
  public shouldFailUndo = false;
  public executeCallback?: () => void;
  public undoCallback?: () => void;

  constructor(description: string, sight: string = 'test') {
    super({ description, sight });
  }

  async execute(): Promise<void> {
    if (this.shouldFailExecute) {
      throw new Error('Execute failed');
    }
    
    this.executed = true;
    this.undone = false;
    
    if (this.executeCallback) {
      this.executeCallback();
    }
  }

  async undo(): Promise<void> {
    if (this.shouldFailUndo) {
      throw new Error('Undo failed');
    }
    
    this.undone = true;
    this.executed = false;
    
    if (this.undoCallback) {
      this.undoCallback();
    }
  }

  canUndo(): boolean {
    return this.executed && !this.undone;
  }

  canRedo(): boolean {
    return this.undone || !this.executed;
  }

  isExecuted(): boolean {
    return this.executed && !this.undone;
  }

  isUndone(): boolean {
    return this.undone;
  }
}

describe('Command', () => {
  describe('base Command class', () => {
    let command: TestCommand;

    beforeEach(() => {
      command = new TestCommand('Test command', 'test-element');
    });

    it('should initialize with metadata', () => {
      const metadata = command.getMetadata();
      
      expect(metadata.description).toBe('Test command');
      expect(metadata.sight).toBe('test-element');
      expect(metadata.timestamp).toBeCloseTo(Date.now(), -3); // Within 1 second
    });

    it('should allow custom metadata', () => {
      const customCommand = new TestCommand('Custom', 'custom-sight');
      const metadata = customCommand.getMetadata();
      
      expect(metadata.description).toBe('Custom');
      expect(metadata.sight).toBe('custom-sight');
    });

    it('should return immutable metadata copy', () => {
      const metadata1 = command.getMetadata();
      const metadata2 = command.getMetadata();
      
      expect(metadata1).not.toBe(metadata2); // Different objects
      expect(metadata1).toEqual(metadata2); // Same content
    });

    it('should provide getter methods', () => {
      expect(command.getDescription()).toBe('Test command');
      expect(command.getSight()).toBe('test-element');
    });

    it('should return null batch ID by default', () => {
      expect(command.getBatchId()).toBeNull();
    });

    it('should serialize basic information', () => {
      const serialized = command.serialize();
      
      expect(serialized.type).toBe('TestCommand');
      expect(serialized.metadata).toEqual(command.getMetadata());
    });

    it('should execute and undo correctly', async () => {
      expect(command.isExecuted()).toBe(false);
      expect(command.canUndo()).toBe(false);
      expect(command.canRedo()).toBe(true);

      await command.execute();

      expect(command.isExecuted()).toBe(true);
      expect(command.canUndo()).toBe(true);
      expect(command.canRedo()).toBe(false);

      await command.undo();

      expect(command.isExecuted()).toBe(false);
      expect(command.canUndo()).toBe(false);
      expect(command.canRedo()).toBe(true);
    });

    it('should handle execution failures', async () => {
      command.shouldFailExecute = true;

      await expect(command.execute()).rejects.toThrow('Execute failed');
      
      expect(command.isExecuted()).toBe(false);
      expect(command.canUndo()).toBe(false);
    });

    it('should handle undo failures', async () => {
      await command.execute();
      command.shouldFailUndo = true;

      await expect(command.undo()).rejects.toThrow('Undo failed');
      
      // State should remain executed after failed undo
      expect(command.isExecuted()).toBe(true);
    });
  });
});

describe('EditCommand', () => {
  let editCommand: EditCommand;
  let mockContext: CommandContext;
  let mockApiService: jest.Mocked<any>;
  let mockEventBus: jest.Mocked<any>;

  beforeEach(() => {
    mockApiService = {
      save: jest.fn().mockResolvedValue({ success: true })
    };

    mockEventBus = {
      emit: jest.fn()
    };

    mockContext = {
      apiService: mockApiService,
      eventBus: mockEventBus
    };

    editCommand = new EditCommand(
      'test-element',
      'new value',
      'old value',
      mockContext,
      'Edit test element'
    );
  });

  it('should initialize with correct values', () => {
    expect(editCommand.getSight()).toBe('test-element');
    expect(editCommand.getDescription()).toBe('Edit test element');
  });

  it('should use default description if not provided', () => {
    const command = new EditCommand('element', 'new', 'old', mockContext);
    
    expect(command.getDescription()).toBe('Edit element');
  });

  it('should execute and save new value', async () => {
    await editCommand.execute();

    expect(mockApiService.save).toHaveBeenCalledWith({
      sight: 'test-element',
      value: 'new value'
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith('command:executed', {
      command: editCommand,
      sight: 'test-element',
      value: 'new value'
    });
  });

  it('should undo and save old value', async () => {
    await editCommand.undo();

    expect(mockApiService.save).toHaveBeenCalledWith({
      sight: 'test-element',
      value: 'old value'
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith('command:undone', {
      command: editCommand,
      sight: 'test-element',
      value: 'old value'
    });
  });

  it('should handle execute failures', async () => {
    const error = new Error('API Error');
    mockApiService.save.mockRejectedValue(error);

    await expect(editCommand.execute()).rejects.toThrow('API Error');

    expect(mockEventBus.emit).toHaveBeenCalledWith('command:failed', {
      command: editCommand,
      error
    });
  });

  it('should handle undo failures', async () => {
    const error = new Error('Undo API Error');
    mockApiService.save.mockRejectedValue(error);

    await expect(editCommand.undo()).rejects.toThrow('Undo API Error');

    expect(mockEventBus.emit).toHaveBeenCalledWith('command:undo-failed', {
      command: editCommand,
      error
    });
  });

  it('should always allow undo and redo', () => {
    expect(editCommand.canUndo()).toBe(true);
    expect(editCommand.canRedo()).toBe(true);
  });

  it('should serialize with command data', () => {
    const serialized = editCommand.serialize();

    expect(serialized.type).toBe('EditCommand');
    expect(serialized.sight).toBe('test-element');
    expect(serialized.newValue).toBe('new value');
    expect(serialized.oldValue).toBe('old value');
    expect(serialized.metadata).toBeDefined();
  });
});

describe('BatchCommand', () => {
  let batchCommand: BatchCommand;
  let command1: TestCommand;
  let command2: TestCommand;
  let command3: TestCommand;

  beforeEach(() => {
    batchCommand = new BatchCommand('Test batch operation');
    command1 = new TestCommand('Command 1');
    command2 = new TestCommand('Command 2');
    command3 = new TestCommand('Command 3');
  });

  it('should initialize with description', () => {
    expect(batchCommand.getDescription()).toBe('Test batch operation');
    expect(batchCommand.getSight()).toBe('batch'); // Default
  });

  it('should accept custom sight parameter', () => {
    const customBatch = new BatchCommand('Custom batch', 'custom-sight');
    
    expect(customBatch.getSight()).toBe('custom-sight');
  });

  it('should add and retrieve commands', () => {
    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);

    const commands = batchCommand.getCommands();

    expect(commands).toHaveLength(2);
    expect(commands[0]).toBe(command1);
    expect(commands[1]).toBe(command2);
  });

  it('should return readonly commands array', () => {
    batchCommand.addCommand(command1);
    
    const commands1 = batchCommand.getCommands();
    const commands2 = batchCommand.getCommands();

    expect(commands1).not.toBe(commands2); // Different arrays
    expect(commands1).toEqual(commands2); // Same content
  });

  it('should execute all commands in order', async () => {
    const executionOrder: string[] = [];

    command1.executeCallback = () => executionOrder.push('command1');
    command2.executeCallback = () => executionOrder.push('command2');
    command3.executeCallback = () => executionOrder.push('command3');

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);
    batchCommand.addCommand(command3);

    await batchCommand.execute();

    expect(executionOrder).toEqual(['command1', 'command2', 'command3']);
    expect(command1.isExecuted()).toBe(true);
    expect(command2.isExecuted()).toBe(true);
    expect(command3.isExecuted()).toBe(true);
  });

  it('should rollback executed commands if any command fails', async () => {
    command2.shouldFailExecute = true; // Make second command fail

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);
    batchCommand.addCommand(command3);

    await expect(batchCommand.execute()).rejects.toThrow('Execute failed');

    // First command should have been executed then undone
    expect(command1.isUndone()).toBe(true);
    expect(command2.isExecuted()).toBe(false); // Failed to execute
    expect(command3.isExecuted()).toBe(false); // Never executed
  });

  it('should handle rollback failures gracefully', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    command1.shouldFailUndo = true; // Make rollback fail
    command2.shouldFailExecute = true; // Make execution fail

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);

    await expect(batchCommand.execute()).rejects.toThrow('Execute failed');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to rollback command during batch execution:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('should undo all commands in reverse order', async () => {
    const undoOrder: string[] = [];

    command1.undoCallback = () => undoOrder.push('command1');
    command2.undoCallback = () => undoOrder.push('command2');
    command3.undoCallback = () => undoOrder.push('command3');

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);
    batchCommand.addCommand(command3);

    // Execute first
    await batchCommand.execute();

    // Then undo
    await batchCommand.undo();

    expect(undoOrder).toEqual(['command3', 'command2', 'command1']);
    expect(command1.isUndone()).toBe(true);
    expect(command2.isUndone()).toBe(true);
    expect(command3.isUndone()).toBe(true);
  });

  it('should skip commands that cannot be undone', async () => {
    command2.canUndo = jest.fn().mockReturnValue(false);

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);
    batchCommand.addCommand(command3);

    await batchCommand.execute();
    await batchCommand.undo();

    expect(command1.isUndone()).toBe(true);
    expect(command2.isExecuted()).toBe(true); // Still executed (couldn't undo)
    expect(command3.isUndone()).toBe(true);
  });

  it('should check if all commands can be undone', async () => {
    command1.canUndo = jest.fn().mockReturnValue(true);
    command2.canUndo = jest.fn().mockReturnValue(false);

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);

    expect(batchCommand.canUndo()).toBe(false);

    // Make all commands undoable
    command2.canUndo = jest.fn().mockReturnValue(true);

    expect(batchCommand.canUndo()).toBe(true);
  });

  it('should check if all commands can be redone', async () => {
    command1.canRedo = jest.fn().mockReturnValue(true);
    command2.canRedo = jest.fn().mockReturnValue(false);

    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);

    expect(batchCommand.canRedo()).toBe(false);

    // Make all commands redoable
    command2.canRedo = jest.fn().mockReturnValue(true);

    expect(batchCommand.canRedo()).toBe(true);
  });

  it('should serialize with nested command data', () => {
    batchCommand.addCommand(command1);
    batchCommand.addCommand(command2);

    const serialized = batchCommand.serialize();

    expect(serialized.type).toBe('BatchCommand');
    expect(serialized.commands).toHaveLength(2);
    expect(serialized.commands[0].type).toBe('TestCommand');
    expect(serialized.commands[1].type).toBe('TestCommand');
  });
});

describe('CommandHistory', () => {
  let history: CommandHistory;
  let mockContext: CommandContext;
  let mockEventBus: jest.Mocked<any>;
  let command1: TestCommand;
  let command2: TestCommand;
  let command3: TestCommand;

  beforeEach(() => {
    mockEventBus = {
      emit: jest.fn()
    };

    mockContext = {
      apiService: {},
      eventBus: mockEventBus
    };

    history = new CommandHistory(mockContext, 3); // Small history for testing

    command1 = new TestCommand('Command 1');
    command2 = new TestCommand('Command 2');
    command3 = new TestCommand('Command 3');
  });

  describe('basic operations', () => {
    it('should start with empty history', () => {
      expect(history.getHistory()).toHaveLength(0);
      expect(history.getCurrentIndex()).toBe(-1);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('should execute and add command to history', async () => {
      await history.execute(command1);

      expect(history.getHistory()).toHaveLength(1);
      expect(history.getCurrentIndex()).toBe(0);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      expect(command1.isExecuted()).toBe(true);
    });

    it('should emit events on execution', async () => {
      await history.execute(command1);

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:command-executed', {
        command: command1,
        historySize: 1,
        canUndo: true,
        canRedo: false
      });
    });

    it('should handle execution failures', async () => {
      command1.shouldFailExecute = true;

      await expect(history.execute(command1)).rejects.toThrow('Execute failed');

      expect(history.getHistory()).toHaveLength(0);
      expect(mockEventBus.emit).toHaveBeenCalledWith('history:execution-failed', {
        command: command1,
        error: expect.any(Error)
      });
    });
  });

  describe('undo operations', () => {
    beforeEach(async () => {
      await history.execute(command1);
      await history.execute(command2);
    });

    it('should undo last command', async () => {
      await history.undo();

      expect(history.getCurrentIndex()).toBe(0);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(true);
      expect(command2.isUndone()).toBe(true);
    });

    it('should emit events on undo', async () => {
      await history.undo();

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:undone', {
        command: command2,
        canUndo: true,
        canRedo: true
      });
    });

    it('should throw error when nothing to undo', async () => {
      await history.undo(); // Undo command2
      await history.undo(); // Undo command1

      await expect(history.undo()).rejects.toThrow('Nothing to undo');
    });

    it('should handle undo failures', async () => {
      command2.shouldFailUndo = true;

      await expect(history.undo()).rejects.toThrow('Undo failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:undo-failed', {
        command: command2,
        error: expect.any(Error)
      });
    });

    it('should not change index on undo failure', async () => {
      const originalIndex = history.getCurrentIndex();
      command2.shouldFailUndo = true;

      try {
        await history.undo();
      } catch (error) {
        // Expected
      }

      expect(history.getCurrentIndex()).toBe(originalIndex);
    });
  });

  describe('redo operations', () => {
    beforeEach(async () => {
      await history.execute(command1);
      await history.execute(command2);
      await history.undo(); // Undo command2 to create redo opportunity
    });

    it('should redo command', async () => {
      await history.redo();

      expect(history.getCurrentIndex()).toBe(1);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      expect(command2.isExecuted()).toBe(true);
    });

    it('should emit events on redo', async () => {
      await history.redo();

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:redone', {
        command: command2,
        canUndo: true,
        canRedo: false
      });
    });

    it('should throw error when nothing to redo', async () => {
      await history.redo(); // Redo command2

      await expect(history.redo()).rejects.toThrow('Nothing to redo');
    });

    it('should handle redo failures', async () => {
      command2.shouldFailExecute = true;

      await expect(history.redo()).rejects.toThrow('Execute failed');

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:redo-failed', {
        command: command2,
        error: expect.any(Error)
      });
    });

    it('should revert index on redo failure', async () => {
      const originalIndex = history.getCurrentIndex();
      command2.shouldFailExecute = true;

      try {
        await history.redo();
      } catch (error) {
        // Expected
      }

      expect(history.getCurrentIndex()).toBe(originalIndex);
    });
  });

  describe('history management', () => {
    it('should clear redo history when executing new command after undo', async () => {
      await history.execute(command1);
      await history.execute(command2);
      await history.undo(); // Creates redo opportunity
      
      expect(history.canRedo()).toBe(true);

      await history.execute(command3); // Should clear redo history

      expect(history.canRedo()).toBe(false);
      expect(history.getHistory()).toHaveLength(2); // command1, command3
    });

    it('should limit history size', async () => {
      // Execute 4 commands (limit is 3)
      await history.execute(command1);
      await history.execute(command2);
      await history.execute(command3);
      
      const command4 = new TestCommand('Command 4');
      await history.execute(command4);

      const historyCommands = history.getHistory();
      expect(historyCommands).toHaveLength(3);
      expect(historyCommands[0]).toBe(command2); // command1 should be removed
      expect(historyCommands[1]).toBe(command3);
      expect(historyCommands[2]).toBe(command4);
    });

    it('should adjust index when history is trimmed', async () => {
      await history.execute(command1);
      await history.execute(command2);
      await history.execute(command3);
      
      expect(history.getCurrentIndex()).toBe(2);

      const command4 = new TestCommand('Command 4');
      await history.execute(command4);

      expect(history.getCurrentIndex()).toBe(2); // Adjusted for removed command
    });

    it('should clear all history', () => {
      // Add some commands first
      history.execute(command1);
      history.execute(command2);

      history.clear();

      expect(history.getHistory()).toHaveLength(0);
      expect(history.getCurrentIndex()).toBe(-1);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);

      expect(mockEventBus.emit).toHaveBeenCalledWith('history:cleared', {
        canUndo: false,
        canRedo: false
      });
    });
  });

  describe('batch operations', () => {
    it('should start a new batch', () => {
      history.startBatch('batch1', 'Test batch');

      expect(() => history.addToBatch('batch1', command1)).not.toThrow();
    });

    it('should throw error when starting duplicate batch', () => {
      history.startBatch('batch1', 'Test batch');

      expect(() => history.startBatch('batch1', 'Duplicate batch'))
        .toThrow('Batch batch1 already started');
    });

    it('should throw error when adding to non-existent batch', () => {
      expect(() => history.addToBatch('nonexistent', command1))
        .toThrow('Batch nonexistent not found');
    });

    it('should execute batch commands', async () => {
      history.startBatch('batch1', 'Test batch');
      history.addToBatch('batch1', command1);
      history.addToBatch('batch1', command2);

      await history.executeBatch('batch1');

      expect(command1.isExecuted()).toBe(true);
      expect(command2.isExecuted()).toBe(true);
      expect(history.getHistory()).toHaveLength(1); // One batch command
      expect(history.getHistory()[0]).toBeInstanceOf(BatchCommand);
    });

    it('should throw error when executing non-existent batch', async () => {
      await expect(history.executeBatch('nonexistent'))
        .rejects
        .toThrow('Batch nonexistent not found');
    });

    it('should cancel batch', () => {
      history.startBatch('batch1', 'Test batch');
      history.addToBatch('batch1', command1);

      history.cancelBatch('batch1');

      expect(() => history.addToBatch('batch1', command2))
        .toThrow('Batch batch1 not found');
    });

    it('should clear batches when history is cleared', () => {
      history.startBatch('batch1', 'Test batch');
      
      history.clear();

      expect(() => history.addToBatch('batch1', command1))
        .toThrow('Batch batch1 not found');
    });
  });

  describe('serialization and memory info', () => {
    beforeEach(async () => {
      await history.execute(command1);
      await history.execute(command2);
    });

    it('should serialize history state', () => {
      const serialized = history.serialize();

      expect(serialized.history).toHaveLength(2);
      expect(serialized.currentIndex).toBe(1);
      expect(serialized.maxHistorySize).toBe(3);
      expect(serialized.history[0].type).toBe('TestCommand');
    });

    it('should provide memory info', () => {
      const memoryInfo = history.getMemoryInfo();

      expect(memoryInfo.commandCount).toBe(2);
      expect(memoryInfo.memoryEstimate).toBe('~1KB');
    });
  });

  describe('command state checking', () => {
    it('should check if commands can be undone/redone', async () => {
      command1.canUndo = jest.fn().mockReturnValue(false);
      await history.execute(command1);

      expect(history.canUndo()).toBe(false);

      command1.canUndo = jest.fn().mockReturnValue(true);
      expect(history.canUndo()).toBe(true);
    });

    it('should check redo capability', async () => {
      await history.execute(command1);
      await history.undo();
      
      command1.canRedo = jest.fn().mockReturnValue(false);
      expect(history.canRedo()).toBe(false);

      command1.canRedo = jest.fn().mockReturnValue(true);
      expect(history.canRedo()).toBe(true);
    });

    it('should handle edge cases for undo/redo checks', () => {
      // Empty history
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);

      // Invalid index
      history['currentIndex'] = -5;
      expect(history.canUndo()).toBe(false);

      history['currentIndex'] = 100;
      expect(history.canRedo()).toBe(false);
    });
  });
});