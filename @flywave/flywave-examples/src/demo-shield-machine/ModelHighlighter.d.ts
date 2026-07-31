export class ModelHighlighter {
    constructor(parts: any);
    parts: any;
    storedMaterials: Map<any, any>;
    _focusedPart: any;
    getRaycaster: any;
    outlineProvider: any;
    setRaycasterProvider(provider: any): void;
    setOutlineProvider(provider: any): void;
    get isFocused(): boolean;
    get focusedPart(): any;
    focus(part: any): void;
    unfocus(): void;
    toggleFocus(part: any): void;
    hitTest(x: any, y: any): any;
    storeOriginal(mesh: any, mat: any): void;
    applyFocus(): void;
    restore(): void;
    dispose(): void;
}
