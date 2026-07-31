export class ExplodeView {
    constructor(model: any, spreadFactor?: number);
    model: any;
    spreadFactor: number;
    parts: any[];
    progress: number;
    targetProgress: number;
    animating: boolean;
    _mode: string;
    _transitionFrom: number;
    sseThreshold: number;
    getParts(): any[];
    getCutterheadParts(): any[];
    getExplodableRoot(): any;
    get mode(): string;
    get isExploded(): boolean;
    findExplodableRoot(obj: any): any;
    analyzeParts(): void;
    syncOffsets(): void;
    updateSSECulling(camera: any, renderer: any): void;
    setMode(mode: any): void;
    explode(): void;
    collapse(): void;
    toggle(): void;
    startAnimation(): void;
    animate(): void;
    applyProgress(): void;
}
