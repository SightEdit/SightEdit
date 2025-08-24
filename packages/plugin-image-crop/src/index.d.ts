import type { Plugin } from '@sightedit/core';
export interface ImageCropPluginOptions {
    aspectRatio?: number | null;
    viewMode?: 0 | 1 | 2 | 3;
    dragMode?: 'crop' | 'move' | 'none';
    initialAspectRatio?: number;
    responsive?: boolean;
    restore?: boolean;
    checkCrossOrigin?: boolean;
    checkOrientation?: boolean;
    modal?: boolean;
    guides?: boolean;
    center?: boolean;
    highlight?: boolean;
    background?: boolean;
    autoCrop?: boolean;
    autoCropArea?: number;
    movable?: boolean;
    rotatable?: boolean;
    scalable?: boolean;
    zoomable?: boolean;
    zoomOnTouch?: boolean;
    zoomOnWheel?: boolean;
    wheelZoomRatio?: number;
    cropBoxMovable?: boolean;
    cropBoxResizable?: boolean;
    toggleDragModeOnDblclick?: boolean;
    minContainerWidth?: number;
    minContainerHeight?: number;
    minCanvasWidth?: number;
    minCanvasHeight?: number;
    minCropBoxWidth?: number;
    minCropBoxHeight?: number;
    filters?: boolean;
    toolbar?: boolean;
    presets?: CropPreset[];
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
}
export interface CropPreset {
    name: string;
    aspectRatio: number;
    icon?: string;
}
export declare class ImageCropPlugin implements Plugin {
    name: string;
    version: string;
    private options;
    private stylesInjected;
    constructor(options?: ImageCropPluginOptions);
    init(sightEdit: any): void;
    private openCropEditor;
    private registerKeyboardShortcuts;
    private injectStyles;
    private getStyles;
    destroy(): void;
}
export { ImageCropEditor } from './editor';
export { ImageFilter } from './filters';
export { ImageCropToolbar } from './toolbar';
export * from './types';
export default ImageCropPlugin;
//# sourceMappingURL=index.d.ts.map