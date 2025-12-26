import { ElementType } from '../types';

/**
 * Transform context - metadata about the transformation
 */
export interface TransformContext {
  sight: string;
  type: ElementType;
  direction: 'input' | 'output';
  element?: HTMLElement;
  metadata?: Record<string, any>;
}

/**
 * Transform function signature
 */
export type TransformFunction = (
  value: any,
  context: TransformContext
) => any | Promise<any>;

/**
 * Transform definition
 */
export interface Transform {
  name: string;
  transform: TransformFunction;
  priority?: number;
}

/**
 * Transform Pipeline - Manages value transformations
 */
export class TransformPipeline {
  private transforms: Map<string, Transform> = new Map();
  private sortedTransforms: Transform[] = [];

  /**
   * Add a transform to the pipeline
   */
  addTransform(transform: Transform): void {
    this.transforms.set(transform.name, transform);
    this.rebuildSortedList();
  }

  /**
   * Remove a transform from the pipeline
   */
  removeTransform(name: string): void {
    this.transforms.delete(name);
    this.rebuildSortedList();
  }

  /**
   * Check if a transform exists
   */
  hasTransform(name: string): boolean {
    return this.transforms.has(name);
  }

  /**
   * Get a transform by name
   */
  getTransform(name: string): Transform | undefined {
    return this.transforms.get(name);
  }

  /**
   * Get all transforms
   */
  getAllTransforms(): Transform[] {
    return [...this.sortedTransforms];
  }

  /**
   * Clear all transforms
   */
  clearTransforms(): void {
    this.transforms.clear();
    this.sortedTransforms = [];
  }

  /**
   * Apply all transforms to a value
   */
  async applyTransforms(value: any, context: TransformContext): Promise<any> {
    let result = value;

    for (const transform of this.sortedTransforms) {
      try {
        result = await transform.transform(result, context);
      } catch (error) {
        console.error(`[SightEdit Transform] Error in transform "${transform.name}":`, error);
        // Continue with other transforms
      }
    }

    return result;
  }

  /**
   * Apply input transforms (when loading data)
   */
  async applyInputTransforms(
    value: any,
    sight: string,
    type: ElementType,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.applyTransforms(value, {
      sight,
      type,
      direction: 'input',
      metadata
    });
  }

  /**
   * Apply output transforms (when saving data)
   */
  async applyOutputTransforms(
    value: any,
    sight: string,
    type: ElementType,
    element?: HTMLElement,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.applyTransforms(value, {
      sight,
      type,
      direction: 'output',
      element,
      metadata
    });
  }

  /**
   * Rebuild sorted transform list by priority
   */
  private rebuildSortedList(): void {
    this.sortedTransforms = Array.from(this.transforms.values()).sort((a, b) => {
      const priorityA = a.priority ?? 10;
      const priorityB = b.priority ?? 10;
      return priorityA - priorityB;
    });
  }

  /**
   * Create a scoped pipeline (for specific types or sights)
   */
  createScopedPipeline(
    filter: (transform: Transform, context: TransformContext) => boolean
  ): TransformPipeline {
    const scoped = new TransformPipeline();

    // Add filtered transforms
    this.sortedTransforms.forEach(transform => {
      scoped.addTransform({
        ...transform,
        transform: async (value, context) => {
          if (filter(transform, context)) {
            return transform.transform(value, context);
          }
          return value;
        }
      });
    });

    return scoped;
  }
}

/**
 * Global transform pipeline instance
 */
let globalPipeline: TransformPipeline | null = null;

/**
 * Get global transform pipeline
 */
export function getGlobalPipeline(): TransformPipeline {
  if (!globalPipeline) {
    globalPipeline = new TransformPipeline();
  }
  return globalPipeline;
}

/**
 * Reset global pipeline (for testing)
 */
export function resetGlobalPipeline(): void {
  globalPipeline = new TransformPipeline();
}
