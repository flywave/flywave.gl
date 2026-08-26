/**
 * Mapbox uSVG IconSet PBF decoder + Canvas2D rasterizer.
 *
 * Decodes the .pbf sprite format ("icon_set") used by newer Mapbox styles.
 * Zero external dependencies — hand-written protobuf wire format reader.
 *
 * Reference: mapbox-gl-js src/data/usvg/usvg_pb_decoder.ts (529 lines) +
 *            src/data/usvg/usvg_pb_renderer.ts (461 lines).
 */

// ─── Protobuf wire format primitives ───

class PbfReader {
    private buf: Uint8Array;
    private view: DataView;
    pos = 0;
    /**
     * Wire type of the most recent field tag returned by nextField(). Kept
     * around so skipField() knows how to advance the cursor for unknown
     * fields without re-reading the tag.
     */
    private m_lastWireType = 0;

    constructor(data: ArrayBuffer | Uint8Array) {
        this.buf = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    }

    get length(): number { return this.buf.length; }

    readVarint(): number {
        let result = 0, shift = 0, byte: number;
        do {
            byte = this.buf[this.pos++];
            result |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80 && shift < 35);
        return result >>> 0;
    }

    readSVarint(): number {
        const n = this.readVarint();
        return (n >>> 1) ^ -(n & 1);
    }

    readFloat(): number {
        const v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }

    readString(): string {
        const len = this.readVarint();
        const start = this.pos;
        this.pos += len;
        return new TextDecoder().decode(this.buf.subarray(start, start + len));
    }

    readBytes(): Uint8Array {
        const len = this.readVarint();
        const start = this.pos;
        this.pos += len;
        return this.buf.subarray(start, start + len);
    }

    /** Read the next field tag. Returns field number, or 0 if at end. */
    nextField(end: number): number {
        if (this.pos >= end) return 0;
        const tag = this.readVarint();
        this.m_lastWireType = tag & 7;
        return tag >>> 3;
    }

    skipField(_fieldNumber: number): void {
        // Uses the wire type stashed by nextField() — the field number arg is
        // accepted only for API symmetry with the call sites.
        const wireType = this.m_lastWireType;
        if (wireType === 0) this.readVarint();
        else if (wireType === 1) this.pos += 8;
        else if (wireType === 2) {
            // NB: extract `readVarint()` first — `this.pos += this.readVarint()`
            // would capture the pre-call value of `this.pos` and then add the
            // returned length, dropping the varint's own byte count.
            const len = this.readVarint();
            this.pos += len;
        }
        else if (wireType === 5) this.pos += 4;
    }

    readPackedVarint(target: number[]): void {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end) target.push(this.readVarint());
    }

    readPackedSVarint(target: number[]): void {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end) target.push(this.readSVarint());
    }

    readPackedFloat(target: number[]): void {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end) target.push(this.readFloat());
    }
}

// ─── Enums ───

const PathCommand = { MOVE: 1, LINE: 2, QUAD: 3, CUBIC: 4, CLOSE: 5 } as const;
const PathRule = { NON_ZERO: 1, EVEN_ODD: 2 } as const;
const PaintOrder = { FILL_AND_STROKE: 1, STROKE_AND_FILL: 2 } as const;

// ─── Data types ───

interface Transform { sx: number; ky: number; kx: number; sy: number; tx: number; ty: number; }
interface Stop { offset: number; opacity: number; r: number; g: number; b: number; }
interface LinearGradient { x1: number; y1: number; x2: number; y2: number; stops: Stop[]; transform?: Transform; }
interface RadialGradient { cx: number; cy: number; r: number; fx: number; fy: number; fr: number; stops: Stop[]; transform?: Transform; }
interface Fill { paint: string; r: number; g: number; b: number; linearIdx: number; radialIdx: number; opacity: number; }
interface Stroke extends Fill { width: number; dasharray: number[]; linecap: number; linejoin: number; }

interface Path {
    fill?: Fill; stroke?: Stroke; paintOrder: number;
    commands: number[]; step: number; diffs: number[]; rule: number;
}
interface Group { opacity: number; transform?: Transform; clipPathIdx?: number; maskIdx?: number; children: Node[]; }
interface Node { type: 'group' | 'path'; group?: Group; path?: Path; }

interface UsvgTree {
    width: number; height: number;
    children: Node[];
    linearGradients: LinearGradient[];
    radialGradients: RadialGradient[];
}

export interface DecodedIcon {
    name: string;
    width: number;
    height: number;
    tree: UsvgTree;
    contentArea?: { left: number; top: number; width: number; height: number };
    stretchX: number[][];
    stretchY: number[][];
    /** IconMetadata.variables — recolorable color slots (mgl readVariable). */
    variables?: { name: string; rgb: [number, number, number] }[];
}

/**
 * Registry of decoded icon-set icons by name, so image params variants
 * (["image", name, {params: {fill}}]) can re-rasterize with color
 * replacements long after the sprite load discarded the raw PBF.
 */
export const IconSetRegistry = new Map<string, DecodedIcon>();

// ─── Color helper ───

function decodeColor(n: number): [number, number, number] {
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Message readers ───

function readTransform(pbf: PbfReader, end: number): Transform {
    const t: Transform = { sx: 1, ky: 0, kx: 0, sy: 1, tx: 0, ty: 0 };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: t.sx = pbf.readFloat(); break;
            case 2: t.ky = pbf.readFloat(); break;
            case 3: t.kx = pbf.readFloat(); break;
            case 4: t.sy = pbf.readFloat(); break;
            case 5: t.tx = pbf.readFloat(); break;
            case 6: t.ty = pbf.readFloat(); break;
            default: pbf.skipField(field);
        }
    }
    return t;
}

function readStop(pbf: PbfReader, end: number): Stop {
    const s: Stop = { offset: 0, opacity: 255, r: 0, g: 0, b: 0 };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: s.offset = pbf.readFloat(); break;
            case 2: s.opacity = pbf.readVarint(); break;
            case 3: { const [r, g, b] = decodeColor(pbf.readVarint()); s.r = r; s.g = g; s.b = b; break; }
            default: pbf.skipField(field);
        }
    }
    return s;
}

function readLinearGradient(pbf: PbfReader, end: number): LinearGradient {
    const g: LinearGradient = { x1: 0, y1: 0, x2: 1, y2: 0, stops: [] };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.transform = readTransform(pbf, se); break; }
            case 3: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.stops.push(readStop(pbf, se)); break; }
            case 4: g.x1 = pbf.readFloat(); break;
            case 5: g.y1 = pbf.readFloat(); break;
            case 6: g.x2 = pbf.readFloat(); break;
            case 7: g.y2 = pbf.readFloat(); break;
            default: pbf.skipField(field);
        }
    }
    return g;
}

function readRadialGradient(pbf: PbfReader, end: number): RadialGradient {
    const g: RadialGradient = { cx: 0.5, cy: 0.5, r: 0.5, fx: 0.5, fy: 0.5, fr: 0, stops: [] };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.transform = readTransform(pbf, se); break; }
            case 3: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.stops.push(readStop(pbf, se)); break; }
            case 4: g.cx = pbf.readFloat(); break;
            case 5: g.cy = pbf.readFloat(); break;
            case 6: g.r = pbf.readFloat(); break;
            case 7: g.fx = pbf.readFloat(); break;
            case 8: g.fy = pbf.readFloat(); break;
            case 9: g.fr = pbf.readFloat(); break;
            default: pbf.skipField(field);
        }
    }
    return g;
}

function readFill(pbf: PbfReader, end: number): Fill {
    const f: Fill = { paint: 'rgb_color', r: 0, g: 0, b: 0, linearIdx: 0, radialIdx: 0, opacity: 255 };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const [r, g, b] = decodeColor(pbf.readVarint()); f.r = r; f.g = g; f.b = b; f.paint = 'rgb_color'; break; }
            case 2: f.linearIdx = pbf.readVarint(); f.paint = 'linear_gradient_idx'; break;
            case 3: f.radialIdx = pbf.readVarint(); f.paint = 'radial_gradient_idx'; break;
            case 5: f.opacity = pbf.readVarint(); break;
            default: pbf.skipField(field);
        }
    }
    return f;
}

function readStroke(pbf: PbfReader, end: number): Stroke {
    const s: Stroke = {
        paint: 'rgb_color', r: 0, g: 0, b: 0, linearIdx: 0, radialIdx: 0, opacity: 255,
        width: 1, dasharray: [], linecap: 1, linejoin: 1,
    };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const [r, g, b] = decodeColor(pbf.readVarint()); s.r = r; s.g = g; s.b = b; break; }
            case 5: pbf.readPackedFloat(s.dasharray); break;
            case 8: s.opacity = pbf.readVarint(); break;
            case 9: s.width = pbf.readFloat(); break;
            case 10: s.linecap = pbf.readVarint(); break;
            case 11: s.linejoin = pbf.readVarint(); break;
            default: pbf.skipField(field);
        }
    }
    return s;
}

function readPath(pbf: PbfReader, end: number): Path {
    const p: Path = { paintOrder: 1, commands: [], step: 1, diffs: [], rule: 1 };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const __len = pbf.readVarint(); const se = pbf.pos + __len; p.fill = readFill(pbf, se); break; }
            case 2: { const __len = pbf.readVarint(); const se = pbf.pos + __len; p.stroke = readStroke(pbf, se); break; }
            case 3: p.paintOrder = pbf.readVarint(); break;
            case 5: pbf.readPackedVarint(p.commands); break;
            case 6: p.step = pbf.readFloat(); break;
            case 7: pbf.readPackedSVarint(p.diffs); break;
            case 8: p.rule = pbf.readVarint(); break;
            default: pbf.skipField(field);
        }
    }
    return p;
}

function readGroup(pbf: PbfReader, end: number): Group {
    const g: Group = { opacity: 255, children: [] };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.transform = readTransform(pbf, se); break; }
            case 2: g.opacity = pbf.readVarint(); break;
            case 5: g.clipPathIdx = pbf.readVarint(); break;
            case 6: g.maskIdx = pbf.readVarint(); break;
            case 7: { const __len = pbf.readVarint(); const se = pbf.pos + __len; g.children.push(readNode(pbf, se)); break; }
            default: pbf.skipField(field);
        }
    }
    return g;
}

function readNode(pbf: PbfReader, end: number): Node {
    const node: Node = { type: 'group' };
    let field: number;
    while ((field = pbf.nextField(end))) {
        if (field === 1) {
            const __len = pbf.readVarint(); const se = pbf.pos + __len;
            node.type = 'group'; node.group = readGroup(pbf, se);
        } else if (field === 2) {
            const __len = pbf.readVarint(); const se = pbf.pos + __len;
            node.type = 'path'; node.path = readPath(pbf, se);
        } else {
            pbf.skipField(field);
        }
    }
    return node;
}

function readUsvgTree(pbf: PbfReader, end: number): UsvgTree {
    const tree: UsvgTree = { width: 20, height: 20, children: [], linearGradients: [], radialGradients: [] };
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: tree.width = tree.height = pbf.readVarint(); break;
            case 2: tree.height = pbf.readVarint(); break;
            case 3: { const __len = pbf.readVarint(); const se = pbf.pos + __len; tree.children.push(readNode(pbf, se)); break; }
            case 4: { const __len = pbf.readVarint(); const se = pbf.pos + __len; tree.linearGradients.push(readLinearGradient(pbf, se)); break; }
            case 5: { const __len = pbf.readVarint(); const se = pbf.pos + __len; tree.radialGradients.push(readRadialGradient(pbf, se)); break; }
            default: pbf.skipField(field);
        }
    }
    return tree;
}

/** Top-level entry: decode an IconSet PBF buffer into DecodedIcon[]. */
export function decodeIconSet(data: ArrayBuffer | Uint8Array): DecodedIcon[] {
    const pbf = new PbfReader(data);
    const icons: DecodedIcon[] = [];
    const end = pbf.length;
    let field: number;
    while ((field = pbf.nextField(end))) {
        if (field === 1) {
            const __len = pbf.readVarint(); const iconEnd = pbf.pos + __len;
            icons.push(readIconEntry(pbf, iconEnd));
        } else {
            pbf.skipField(field);
        }
    }
    return icons;
}

function readIconEntry(pbf: PbfReader, end: number): DecodedIcon {
    let name = '';
    let tree: UsvgTree = { width: 20, height: 20, children: [], linearGradients: [], radialGradients: [] };
    let contentArea: DecodedIcon['contentArea'];
    let stretchX: number[] = [];
    let stretchY: number[] = [];
    let variables: DecodedIcon['variables'];
    let field: number;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: name = pbf.readString(); break;
            case 2: { // IconMetadata
                const __len = pbf.readVarint(); const me = pbf.pos + __len;
                let mf: number;
                while ((mf = pbf.nextField(me))) {
                    switch (mf) {
                        case 1: pbf.readPackedVarint(stretchX); break;
                        case 2: pbf.readPackedVarint(stretchY); break;
                        case 3: { // content_area (NonEmptyArea: 1 left, 2 width, 3 top, 4 height)
                            const __l = pbf.readVarint(); const ce = pbf.pos + __l;
                            let left = 0, width = 0, top = 0, height = 0, cf: number;
                            while ((cf = pbf.nextField(ce))) {
                                if (cf === 1) left = pbf.readVarint();
                                else if (cf === 2) width = pbf.readVarint();
                                else if (cf === 3) top = pbf.readVarint();
                                else if (cf === 4) height = pbf.readVarint();
                                else pbf.skipField(cf);
                            }
                            contentArea = { left, top, width, height };
                            break;
                        }
                        case 4: { // variables (Variable: 1 name, 2 rgb_color)
                            const __l = pbf.readVarint(); const ve = pbf.pos + __l;
                            let vname = ''; let vrgb: [number, number, number] | undefined; let vf: number;
                            while ((vf = pbf.nextField(ve))) {
                                if (vf === 1) vname = pbf.readString();
                                else if (vf === 2) vrgb = decodeColor(pbf.readVarint());
                                else pbf.skipField(vf);
                            }
                            if (vname && vrgb) {
                                (variables ??= []).push({ name: vname, rgb: vrgb });
                            }
                            break;
                        }
                        default: pbf.skipField(mf);
                    }
                }
                break;
            }
            case 3: { const __len = pbf.readVarint(); const te = pbf.pos + __len; tree = readUsvgTree(pbf, te); break; }
            default: pbf.skipField(field);
        }
    }
    const icon: DecodedIcon = { name, width: tree.width, height: tree.height, tree, contentArea, stretchX: [], stretchY: [] };
    if (variables) icon.variables = variables;
    IconSetRegistry.set(name, icon);
    return icon;
}

// ─── Canvas2D rasterizer ───

/**
 * Active image-params color replacements (mgl ColorReplacements): maps the
 * ORIGINAL fill color "r,g,b" of a variable slot to the replacement
 * [r, g, b, alpha-0..1] (mgl getStyleColor honors the replacement's alpha).
 * Rendering is synchronous, so a module-level slot is safe.
 */
let g_colorReplacements: Map<string, [number, number, number, number]> | null = null;

function replaced(r: number, g: number, b: number): [number, number, number, number] {
    if (g_colorReplacements) {
        const hit = g_colorReplacements.get(`${r},${g},${b}`);
        if (hit) return hit;
    }
    return [r, g, b, 1];
}

/**
 * Rasterize a decoded icon to a canvas at the given pixel ratio.
 * Returns an HTMLCanvasElement ready for use as a sprite texture.
 *
 * `params` mirrors mgl ImageVariant.params (["image", name, {params: {fill}}]):
 * each key matching an IconMetadata variable replaces that variable's color
 * everywhere it is used (fills, strokes, gradient stops).
 */
export function renderIconToCanvas(
    icon: DecodedIcon,
    dpr: number = 1,
    params?: Record<string, [number, number, number, number]>,
): HTMLCanvasElement {
    g_colorReplacements = null;
    if (params && icon.variables) {
        const replacements = new Map<string, [number, number, number, number]>();
        for (const v of icon.variables) {
            const p = params[v.name];
            if (p) replacements.set(v.rgb.join(','), p);
        }
        if (replacements.size > 0) g_colorReplacements = replacements;
    }
    const w = icon.width * dpr;
    const h = icon.height * dpr;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) throw new Error('Canvas not available');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    renderTree(ctx, icon.tree);
    g_colorReplacements = null;
    return canvas;
}

function renderTree(ctx: CanvasRenderingContext2D, tree: UsvgTree): void {
    for (const child of tree.children) {
        renderNode(ctx, child, tree);
    }
}

function renderNode(ctx: CanvasRenderingContext2D, node: Node, tree: UsvgTree): void {
    if (node.type === 'group' && node.group) {
        ctx.save();
        const g = node.group;
        if (g.transform) applyTransform(ctx, g.transform);
        ctx.globalAlpha *= g.opacity / 255;
        for (const child of g.children) renderNode(ctx, child, tree);
        ctx.restore();
    } else if (node.type === 'path' && node.path) {
        renderPath(ctx, node.path, tree);
    }
}

function applyTransform(ctx: CanvasRenderingContext2D, t: Transform): void {
    ctx.transform(t.sx, t.ky, t.kx, t.sy, t.tx, t.ty);
}

function buildPath2D(path: Path): Path2D {
    const p2d = new Path2D();
    const { commands, diffs, step } = path;
    if (diffs.length < 2) return p2d;
    let x = diffs[0] * step;
    let y = diffs[1] * step;
    p2d.moveTo(x, y);
    let j = 2;
    for (const cmd of commands) {
        switch (cmd) {
            case PathCommand.MOVE:
                x += diffs[j++] * step; y += diffs[j++] * step; p2d.moveTo(x, y); break;
            case PathCommand.LINE:
                x += diffs[j++] * step; y += diffs[j++] * step; p2d.lineTo(x, y); break;
            case PathCommand.QUAD: {
                const cpx = x + diffs[j++] * step, cpy = y + diffs[j++] * step;
                x = cpx + diffs[j++] * step; y = cpy + diffs[j++] * step;
                p2d.quadraticCurveTo(cpx, cpy, x, y); break;
            }
            case PathCommand.CUBIC: {
                const cp1x = x + diffs[j++] * step, cp1y = y + diffs[j++] * step;
                const cp2x = cp1x + diffs[j++] * step, cp2y = cp1y + diffs[j++] * step;
                x = cp2x + diffs[j++] * step; y = cp2y + diffs[j++] * step;
                p2d.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y); break;
            }
            case PathCommand.CLOSE:
                p2d.closePath(); break;
        }
    }
    return p2d;
}

function renderPath(ctx: CanvasRenderingContext2D, path: Path, tree: UsvgTree): void {
    const p2d = buildPath2D(path);
    const rule = path.rule === PathRule.EVEN_ODD ? 'evenodd' : 'nonzero';
    const doFillFirst = path.paintOrder !== PaintOrder.STROKE_AND_FILL;

    if (doFillFirst && path.fill) {
        applyFillStyle(ctx, path.fill, tree);
        ctx.fill(p2d, rule);
    }
    if (path.stroke) {
        applyStrokeStyle(ctx, path.stroke, tree);
        ctx.stroke(p2d);
    }
    if (!doFillFirst && path.fill) {
        applyFillStyle(ctx, path.fill, tree);
        ctx.fill(p2d, rule);
    }
}

function applyFillStyle(ctx: CanvasRenderingContext2D, fill: Fill, tree: UsvgTree): void {
    // Mirrors mgl's fillPath (usvg_pb_renderer.ts): stops multiply by the
    // fill opacity, a single stop degrades to a solid color, and the
    // gradient's own transform is applied to the context so the gradient
    // coordinates resolve in the correct user space.
    const alpha = fill.opacity / 255;
    const stopCss = (s: Stop): string => {
        const [r, g, b, ra] = replaced(s.r, s.g, s.b);
        return `rgba(${r},${g},${b},${ra * (s.opacity / 255) * alpha})`;
    };
    if (fill.paint === 'linear_gradient_idx' && tree.linearGradients[fill.linearIdx]) {
        const g = tree.linearGradients[fill.linearIdx];
        if (g.transform) applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.fillStyle = stopCss(g.stops[0]);
        } else {
            const grad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
            for (const s of g.stops) grad.addColorStop(s.offset, stopCss(s));
            ctx.fillStyle = grad;
        }
    } else if (fill.paint === 'radial_gradient_idx' && tree.radialGradients[fill.radialIdx]) {
        const g = tree.radialGradients[fill.radialIdx];
        if (g.transform) applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.fillStyle = stopCss(g.stops[0]);
        } else {
            const grad = ctx.createRadialGradient(g.fx, g.fy, g.fr, g.cx, g.cy, g.r);
            for (const s of g.stops) grad.addColorStop(s.offset, stopCss(s));
            ctx.fillStyle = grad;
        }
    } else {
        const [r, g, b, ra] = replaced(fill.r, fill.g, fill.b);
        ctx.fillStyle = `rgba(${r},${g},${b},${ra * alpha})`;
    }
}

// mgl: context.setTransform(makeTransform(g.transform).preMultiplySelf(context.getTransform()))
// — i.e. additional user-space transform for gradient coordinates.
function applyGradientTransform(ctx: CanvasRenderingContext2D, t: Transform): void {
    ctx.transform(t.sx, t.ky, t.kx, t.sy, t.tx, t.ty);
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, s: Stroke, tree: UsvgTree): void {
    const alpha = s.opacity / 255;
    if (s.paint === 'linear_gradient_idx' && tree.linearGradients[s.linearIdx]) {
        const g = tree.linearGradients[s.linearIdx];
        if (g.transform) applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            {
                const [r, gg, b, ra] = replaced(g.stops[0].r, g.stops[0].g, g.stops[0].b);
                ctx.strokeStyle = `rgba(${r},${gg},${b},${ra * (g.stops[0].opacity / 255) * alpha})`;
            }
        } else {
            const grad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
            for (const st of g.stops) {
                const [r, gg, b, ra] = replaced(st.r, st.g, st.b);
                grad.addColorStop(st.offset, `rgba(${r},${gg},${b},${ra * (st.opacity / 255) * alpha})`);
            }
            ctx.strokeStyle = grad;
        }
    } else if (s.paint === 'radial_gradient_idx' && tree.radialGradients[s.radialIdx]) {
        const g = tree.radialGradients[s.radialIdx];
        if (g.transform) applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            {
                const [r, gg, b, ra] = replaced(g.stops[0].r, g.stops[0].g, g.stops[0].b);
                ctx.strokeStyle = `rgba(${r},${gg},${b},${ra * (g.stops[0].opacity / 255) * alpha})`;
            }
        } else {
            const grad = ctx.createRadialGradient(g.fx, g.fy, g.fr, g.cx, g.cy, g.r);
            for (const st of g.stops) {
                const [r, gg, b, ra] = replaced(st.r, st.g, st.b);
                grad.addColorStop(st.offset, `rgba(${r},${gg},${b},${ra * (st.opacity / 255) * alpha})`);
            }
            ctx.strokeStyle = grad;
        }
    } else {
        {
            const [r, g, b, ra] = replaced(s.r, s.g, s.b);
            ctx.strokeStyle = `rgba(${r},${g},${b},${ra * alpha})`;
        }
    }
    ctx.lineWidth = s.width;
    ctx.lineCap = (['', 'butt', 'round', 'square'][s.linecap] ?? 'butt') as CanvasLineCap;
    ctx.lineJoin = (['', 'miter', 'miter-clip', 'round', 'bevel'][s.linejoin] ?? 'miter') as CanvasLineJoin;
    if (s.dasharray.length > 0) ctx.setLineDash(s.dasharray);
}
