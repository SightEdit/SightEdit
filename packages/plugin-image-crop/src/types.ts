export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
}

export interface ImageData {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
}

export interface CanvasData {
  left: number;
  top: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface CropBoxData {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ContainerData {
  width: number;
  height: number;
}

export interface CropResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  cropData: CropData;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    format: string;
    quality: number;
    filter?: string;
    adjustments?: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      blur?: number;
    };
  };
}

export interface CropperCustomEvent extends CustomEvent {
  detail: {
    originalEvent?: Event;
    action?: string;
    canvas?: HTMLCanvasElement;
    cropData?: CropData;
  };
}

export type CropperEventType = 
  | 'ready'
  | 'cropstart'
  | 'cropmove'
  | 'cropend'
  | 'crop'
  | 'zoom';

export interface CropperEventHandlers {
  ready?: (event: CropperCustomEvent) => void;
  cropstart?: (event: CropperCustomEvent) => void;
  cropmove?: (event: CropperCustomEvent) => void;
  cropend?: (event: CropperCustomEvent) => void;
  crop?: (event: CropperCustomEvent) => void;
  zoom?: (event: CropperCustomEvent) => void;
}