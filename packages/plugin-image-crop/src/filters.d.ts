export type FilterType = 'none' | 'grayscale' | 'sepia' | 'vintage' | 'cold' | 'warm' | 'dramatic' | 'vivid' | 'muted';
export interface FilterDefinition {
    name: string;
    css: string;
    matrix?: number[];
}
export declare const filterDefinitions: Record<FilterType, FilterDefinition>;
export declare function applyFilter(canvas: HTMLCanvasElement, filter: FilterType, adjustments?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    blur?: number;
}): HTMLCanvasElement;
export declare class ImageFilter {
    private container;
    private image;
    private canvas;
    private ctx;
    private currentFilter;
    private adjustments;
    constructor(container: HTMLElement, imageSrc: string);
    private setupUI;
    private render;
    getFilteredDataURL(format?: string, quality?: number): string;
    getFilter(): FilterType;
    getAdjustments(): typeof this.adjustments;
}
//# sourceMappingURL=filters.d.ts.map