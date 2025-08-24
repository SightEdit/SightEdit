export interface ToolbarAction {
    id: string;
    label: string;
    icon: string;
    handler: () => void;
    active?: boolean;
    disabled?: boolean;
}
export declare class ImageCropToolbar {
    private container;
    private actions;
    private cropper;
    constructor(container: HTMLElement, cropper: any);
    private setupActions;
    private render;
    private setDragMode;
    private flipHorizontal;
    private flipVertical;
    private toggleAspectRatio;
    private toggleGrid;
    private updateActiveStates;
    private addStyles;
    updateCropper(cropper: any): void;
    setAction(actionId: string, updates: Partial<ToolbarAction>): void;
    addAction(action: ToolbarAction): void;
    removeAction(actionId: string): void;
}
//# sourceMappingURL=toolbar.d.ts.map