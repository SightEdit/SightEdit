export interface CommandMetadata {
  timestamp: number;
  userId?: string;
  description: string;
  sight: string;
}

export abstract class Command {
  protected metadata: CommandMetadata;

  constructor(metadata: Partial<CommandMetadata> & Pick<CommandMetadata, 'description' | 'sight'>) {
    this.metadata = {
      timestamp: Date.now(),
      ...metadata
    };
  }

  abstract execute(): Promise<void>;
  abstract undo(): Promise<void>;
  abstract canUndo(): boolean;
  abstract canRedo(): boolean;

  getMetadata(): Readonly<CommandMetadata> {
    return { ...this.metadata };
  }

  getDescription(): string {
    return this.metadata.description;
  }

  getSight(): string {
    return this.metadata.sight;
  }

  // For command grouping/batching
  getBatchId(): string | null {
    return null;
  }

  // For serialization support
  serialize(): Record<string, any> {
    return {
      type: this.constructor.name,
      metadata: this.metadata
    };
  }
}

export interface CommandContext {
  apiService: any; // APIService type
  eventBus: any; // EventBus type
  element?: Element;
}

export class EditCommand extends Command {
  constructor(
    private sight: string,
    private newValue: any,
    private oldValue: any,
    private context: CommandContext,
    description?: string
  ) {
    super({
      sight,
      description: description || `Edit ${sight}`
    });
  }

  async execute(): Promise<void> {
    try {
      await this.context.apiService.save({
        sight: this.sight,
        value: this.newValue
      });

      this.context.eventBus.emit('command:executed', {
        command: this,
        sight: this.sight,
        value: this.newValue
      });
    } catch (error) {
      this.context.eventBus.emit('command:failed', {
        command: this,
        error: error as Error
      });
      throw error;
    }
  }

  async undo(): Promise<void> {
    try {
      await this.context.apiService.save({
        sight: this.sight,
        value: this.oldValue
      });

      this.context.eventBus.emit('command:undone', {
        command: this,
        sight: this.sight,
        value: this.oldValue
      });
    } catch (error) {
      this.context.eventBus.emit('command:undo-failed', {
        command: this,
        error: error as Error
      });
      throw error;
    }
  }

  canUndo(): boolean {
    return true;
  }

  canRedo(): boolean {
    return true;
  }

  serialize(): Record<string, any> {
    return {
      ...super.serialize(),
      sight: this.sight,
      newValue: this.newValue,
      oldValue: this.oldValue
    };
  }
}

export class BatchCommand extends Command {
  private commands: Command[] = [];

  constructor(description: string, sight: string = 'batch') {
    super({ description, sight });
  }

  addCommand(command: Command): void {
    this.commands.push(command);
  }

  async execute(): Promise<void> {
    const executedCommands: Command[] = [];

    try {
      for (const command of this.commands) {
        await command.execute();
        executedCommands.push(command);
      }
    } catch (error) {
      // Rollback executed commands
      for (const command of executedCommands.reverse()) {
        try {
          if (command.canUndo()) {
            await command.undo();
          }
        } catch (rollbackError) {
          console.warn('Failed to rollback command during batch execution:', rollbackError);
        }
      }
      throw error;
    }
  }

  async undo(): Promise<void> {
    // Undo commands in reverse order
    const commandsToUndo = [...this.commands].reverse();
    
    for (const command of commandsToUndo) {
      if (command.canUndo()) {
        await command.undo();
      }
    }
  }

  canUndo(): boolean {
    return this.commands.every(cmd => cmd.canUndo());
  }

  canRedo(): boolean {
    return this.commands.every(cmd => cmd.canRedo());
  }

  getCommands(): readonly Command[] {
    return [...this.commands];
  }

  serialize(): Record<string, any> {
    return {
      ...super.serialize(),
      commands: this.commands.map(cmd => cmd.serialize())
    };
  }
}

export class CommandHistory {
  private history: Command[] = [];
  private currentIndex = -1;
  private maxHistorySize = 100;
  private batchCommands = new Map<string, BatchCommand>();

  constructor(private context: CommandContext, maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  async execute(command: Command): Promise<void> {
    try {
      await command.execute();
      
      // Remove commands after current index (redo history)
      this.history.splice(this.currentIndex + 1);
      
      // Add new command
      this.history.push(command);
      this.currentIndex++;
      
      // Limit history size
      if (this.history.length > this.maxHistorySize) {
        const removeCount = this.history.length - this.maxHistorySize;
        this.history.splice(0, removeCount);
        this.currentIndex -= removeCount;
      }

      this.context.eventBus.emit('history:command-executed', {
        command,
        historySize: this.history.length,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });
    } catch (error) {
      this.context.eventBus.emit('history:execution-failed', {
        command,
        error: error as Error
      });
      throw error;
    }
  }

  async undo(): Promise<void> {
    if (!this.canUndo()) {
      throw new Error('Nothing to undo');
    }

    const command = this.history[this.currentIndex];
    
    try {
      await command.undo();
      this.currentIndex--;

      this.context.eventBus.emit('history:undone', {
        command,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });
    } catch (error) {
      this.context.eventBus.emit('history:undo-failed', {
        command,
        error: error as Error
      });
      throw error;
    }
  }

  async redo(): Promise<void> {
    if (!this.canRedo()) {
      throw new Error('Nothing to redo');
    }

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    
    try {
      await command.execute();

      this.context.eventBus.emit('history:redone', {
        command,
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      });
    } catch (error) {
      this.currentIndex--; // Revert index on failure
      this.context.eventBus.emit('history:redo-failed', {
        command,
        error: error as Error
      });
      throw error;
    }
  }

  canUndo(): boolean {
    return this.currentIndex >= 0 && 
           this.currentIndex < this.history.length &&
           this.history[this.currentIndex].canUndo();
  }

  canRedo(): boolean {
    return this.currentIndex + 1 < this.history.length &&
           this.history[this.currentIndex + 1].canRedo();
  }

  getHistory(): readonly Command[] {
    return [...this.history];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.batchCommands.clear();

    this.context.eventBus.emit('history:cleared', {
      canUndo: false,
      canRedo: false
    });
  }

  // Batch command support
  startBatch(batchId: string, description: string): void {
    if (this.batchCommands.has(batchId)) {
      throw new Error(`Batch ${batchId} already started`);
    }

    const batchCommand = new BatchCommand(description);
    this.batchCommands.set(batchId, batchCommand);
  }

  addToBatch(batchId: string, command: Command): void {
    const batchCommand = this.batchCommands.get(batchId);
    if (!batchCommand) {
      throw new Error(`Batch ${batchId} not found`);
    }

    batchCommand.addCommand(command);
  }

  async executeBatch(batchId: string): Promise<void> {
    const batchCommand = this.batchCommands.get(batchId);
    if (!batchCommand) {
      throw new Error(`Batch ${batchId} not found`);
    }

    await this.execute(batchCommand);
    this.batchCommands.delete(batchId);
  }

  cancelBatch(batchId: string): void {
    this.batchCommands.delete(batchId);
  }

  // Persistence support
  serialize(): Record<string, any> {
    return {
      history: this.history.map(cmd => cmd.serialize()),
      currentIndex: this.currentIndex,
      maxHistorySize: this.maxHistorySize
    };
  }

  // Get memory usage info
  getMemoryInfo(): { commandCount: number; memoryEstimate: string } {
    const commandCount = this.history.length;
    const memoryEstimate = `~${Math.round(commandCount * 0.5)}KB`; // Rough estimate
    
    return { commandCount, memoryEstimate };
  }
}