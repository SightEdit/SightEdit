import { BaseEditor, EditMode } from '@sightedit/core';
export declare class ImageCropEditor extends BaseEditor {
    getMode(): EditMode;
    private cropper;
    private container;
    private originalSrc;
    private currentFilter;
    private pluginOptions;
    private imageElement;
    private sidebar;
    constructor(element: HTMLElement, config?: any);
    render(): void;
    private createModal;
    private createSidebar;
    private createPresetsSection;
    private createToolsSection;
    private createAdjustmentsSection;
    private createFiltersSection;
    private getFilterStyle;
    private initializeCropper;
    private handleAction;
    private handlePresetClick;
    private handleToolClick;
    private handleFilterClick;
    private handleSliderChange;
    private updateImageStyle;
    private handleKeyboard;
    private applyCrop;
    private hasAdjustments;
    private reset;
    private close;
    extractValue(): string;
    getValue(): string;
    setValue(value: string): void;
    applyValue(value: string): void;
    destroy(): void;
}
//# sourceMappingURL=editor.d.ts.map