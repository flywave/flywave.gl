interface Transform {
    sx: number;
    ky: number;
    kx: number;
    sy: number;
    tx: number;
    ty: number;
}
interface Stop {
    offset: number;
    opacity: number;
    r: number;
    g: number;
    b: number;
}
interface LinearGradient {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stops: Stop[];
    transform?: Transform;
}
interface RadialGradient {
    cx: number;
    cy: number;
    r: number;
    fx: number;
    fy: number;
    fr: number;
    stops: Stop[];
    transform?: Transform;
}
interface Fill {
    paint: string;
    r: number;
    g: number;
    b: number;
    linearIdx: number;
    radialIdx: number;
    opacity: number;
}
interface Stroke extends Fill {
    width: number;
    dasharray: number[];
    linecap: number;
    linejoin: number;
}
interface Path {
    fill?: Fill;
    stroke?: Stroke;
    paintOrder: number;
    commands: number[];
    step: number;
    diffs: number[];
    rule: number;
}
interface Group {
    opacity: number;
    transform?: Transform;
    clipPathIdx?: number;
    maskIdx?: number;
    children: Node[];
}
interface Node {
    type: 'group' | 'path';
    group?: Group;
    path?: Path;
}
interface UsvgTree {
    width: number;
    height: number;
    children: Node[];
    linearGradients: LinearGradient[];
    radialGradients: RadialGradient[];
}
export interface DecodedIcon {
    name: string;
    width: number;
    height: number;
    tree: UsvgTree;
    contentArea?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    stretchX: number[][];
    stretchY: number[][];
}
export declare function decodeIconSet(data: ArrayBuffer | Uint8Array): DecodedIcon[];
export declare function renderIconToCanvas(icon: DecodedIcon, dpr?: number): HTMLCanvasElement;
export {};
//# sourceMappingURL=IconSetPBFDecoder.d.ts.map