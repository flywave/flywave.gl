"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeIconSet = decodeIconSet;
exports.renderIconToCanvas = renderIconToCanvas;
class PbfReader {
    constructor(data) {
        this.pos = 0;
        this.m_lastWireType = 0;
        this.buf = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    }
    get length() { return this.buf.length; }
    readVarint() {
        let result = 0, shift = 0, byte;
        do {
            byte = this.buf[this.pos++];
            result |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80 && shift < 35);
        return result >>> 0;
    }
    readSVarint() {
        const n = this.readVarint();
        return (n >>> 1) ^ -(n & 1);
    }
    readFloat() {
        const v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }
    readString() {
        const len = this.readVarint();
        const start = this.pos;
        this.pos += len;
        return new TextDecoder().decode(this.buf.subarray(start, start + len));
    }
    readBytes() {
        const len = this.readVarint();
        const start = this.pos;
        this.pos += len;
        return this.buf.subarray(start, start + len);
    }
    nextField(end) {
        if (this.pos >= end)
            return 0;
        const tag = this.readVarint();
        this.m_lastWireType = tag & 7;
        return tag >>> 3;
    }
    skipField(_fieldNumber) {
        const wireType = this.m_lastWireType;
        if (wireType === 0)
            this.readVarint();
        else if (wireType === 1)
            this.pos += 8;
        else if (wireType === 2) {
            const len = this.readVarint();
            this.pos += len;
        }
        else if (wireType === 5)
            this.pos += 4;
    }
    readPackedVarint(target) {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end)
            target.push(this.readVarint());
    }
    readPackedSVarint(target) {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end)
            target.push(this.readSVarint());
    }
    readPackedFloat(target) {
        const len = this.readVarint();
        const end = this.pos + len;
        while (this.pos < end)
            target.push(this.readFloat());
    }
}
const PathCommand = { MOVE: 1, LINE: 2, QUAD: 3, CUBIC: 4, CLOSE: 5 };
const PathRule = { NON_ZERO: 1, EVEN_ODD: 2 };
const PaintOrder = { FILL_AND_STROKE: 1, STROKE_AND_FILL: 2 };
function decodeColor(n) {
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function readTransform(pbf, end) {
    const t = { sx: 1, ky: 0, kx: 0, sy: 1, tx: 0, ty: 0 };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1:
                t.sx = pbf.readFloat();
                break;
            case 2:
                t.ky = pbf.readFloat();
                break;
            case 3:
                t.kx = pbf.readFloat();
                break;
            case 4:
                t.sy = pbf.readFloat();
                break;
            case 5:
                t.tx = pbf.readFloat();
                break;
            case 6:
                t.ty = pbf.readFloat();
                break;
            default: pbf.skipField(field);
        }
    }
    return t;
}
function readStop(pbf, end) {
    const s = { offset: 0, opacity: 255, r: 0, g: 0, b: 0 };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1:
                s.offset = pbf.readFloat();
                break;
            case 2:
                s.opacity = pbf.readVarint();
                break;
            case 3: {
                const [r, g, b] = decodeColor(pbf.readVarint());
                s.r = r;
                s.g = g;
                s.b = b;
                break;
            }
            default: pbf.skipField(field);
        }
    }
    return s;
}
function readLinearGradient(pbf, end) {
    const g = { x1: 0, y1: 0, x2: 1, y2: 0, stops: [] };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.transform = readTransform(pbf, se);
                break;
            }
            case 3: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.stops.push(readStop(pbf, se));
                break;
            }
            case 4:
                g.x1 = pbf.readFloat();
                break;
            case 5:
                g.y1 = pbf.readFloat();
                break;
            case 6:
                g.x2 = pbf.readFloat();
                break;
            case 7:
                g.y2 = pbf.readFloat();
                break;
            default: pbf.skipField(field);
        }
    }
    return g;
}
function readRadialGradient(pbf, end) {
    const g = { cx: 0.5, cy: 0.5, r: 0.5, fx: 0.5, fy: 0.5, fr: 0, stops: [] };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.transform = readTransform(pbf, se);
                break;
            }
            case 3: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.stops.push(readStop(pbf, se));
                break;
            }
            case 4:
                g.cx = pbf.readFloat();
                break;
            case 5:
                g.cy = pbf.readFloat();
                break;
            case 6:
                g.r = pbf.readFloat();
                break;
            case 7:
                g.fx = pbf.readFloat();
                break;
            case 8:
                g.fy = pbf.readFloat();
                break;
            case 9:
                g.fr = pbf.readFloat();
                break;
            default: pbf.skipField(field);
        }
    }
    return g;
}
function readFill(pbf, end) {
    const f = { paint: 'rgb_color', r: 0, g: 0, b: 0, linearIdx: 0, radialIdx: 0, opacity: 255 };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const [r, g, b] = decodeColor(pbf.readVarint());
                f.r = r;
                f.g = g;
                f.b = b;
                f.paint = 'rgb_color';
                break;
            }
            case 2:
                f.linearIdx = pbf.readVarint();
                f.paint = 'linear_gradient_idx';
                break;
            case 3:
                f.radialIdx = pbf.readVarint();
                f.paint = 'radial_gradient_idx';
                break;
            case 5:
                f.opacity = pbf.readVarint();
                break;
            default: pbf.skipField(field);
        }
    }
    return f;
}
function readStroke(pbf, end) {
    const s = {
        paint: 'rgb_color', r: 0, g: 0, b: 0, linearIdx: 0, radialIdx: 0, opacity: 255,
        width: 1, dasharray: [], linecap: 1, linejoin: 1,
    };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const [r, g, b] = decodeColor(pbf.readVarint());
                s.r = r;
                s.g = g;
                s.b = b;
                break;
            }
            case 5:
                pbf.readPackedFloat(s.dasharray);
                break;
            case 8:
                s.opacity = pbf.readVarint();
                break;
            case 9:
                s.width = pbf.readFloat();
                break;
            case 10:
                s.linecap = pbf.readVarint();
                break;
            case 11:
                s.linejoin = pbf.readVarint();
                break;
            default: pbf.skipField(field);
        }
    }
    return s;
}
function readPath(pbf, end) {
    const p = { paintOrder: 1, commands: [], step: 1, diffs: [], rule: 1 };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                p.fill = readFill(pbf, se);
                break;
            }
            case 2: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                p.stroke = readStroke(pbf, se);
                break;
            }
            case 3:
                p.paintOrder = pbf.readVarint();
                break;
            case 5:
                pbf.readPackedVarint(p.commands);
                break;
            case 6:
                p.step = pbf.readFloat();
                break;
            case 7:
                pbf.readPackedSVarint(p.diffs);
                break;
            case 8:
                p.rule = pbf.readVarint();
                break;
            default: pbf.skipField(field);
        }
    }
    return p;
}
function readGroup(pbf, end) {
    const g = { opacity: 255, children: [] };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.transform = readTransform(pbf, se);
                break;
            }
            case 2:
                g.opacity = pbf.readVarint();
                break;
            case 5:
                g.clipPathIdx = pbf.readVarint();
                break;
            case 6:
                g.maskIdx = pbf.readVarint();
                break;
            case 7: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                g.children.push(readNode(pbf, se));
                break;
            }
            default: pbf.skipField(field);
        }
    }
    return g;
}
function readNode(pbf, end) {
    const node = { type: 'group' };
    let field;
    while ((field = pbf.nextField(end))) {
        if (field === 1) {
            const __len = pbf.readVarint();
            const se = pbf.pos + __len;
            node.type = 'group';
            node.group = readGroup(pbf, se);
        }
        else if (field === 2) {
            const __len = pbf.readVarint();
            const se = pbf.pos + __len;
            node.type = 'path';
            node.path = readPath(pbf, se);
        }
        else {
            pbf.skipField(field);
        }
    }
    return node;
}
function readUsvgTree(pbf, end) {
    const tree = { width: 20, height: 20, children: [], linearGradients: [], radialGradients: [] };
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1:
                tree.width = tree.height = pbf.readVarint();
                break;
            case 2:
                tree.height = pbf.readVarint();
                break;
            case 3: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                tree.children.push(readNode(pbf, se));
                break;
            }
            case 4: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                tree.linearGradients.push(readLinearGradient(pbf, se));
                break;
            }
            case 5: {
                const __len = pbf.readVarint();
                const se = pbf.pos + __len;
                tree.radialGradients.push(readRadialGradient(pbf, se));
                break;
            }
            default: pbf.skipField(field);
        }
    }
    return tree;
}
function decodeIconSet(data) {
    const pbf = new PbfReader(data);
    const icons = [];
    const end = pbf.length;
    let field;
    while ((field = pbf.nextField(end))) {
        if (field === 1) {
            const __len = pbf.readVarint();
            const iconEnd = pbf.pos + __len;
            icons.push(readIconEntry(pbf, iconEnd));
        }
        else {
            pbf.skipField(field);
        }
    }
    return icons;
}
function readIconEntry(pbf, end) {
    let name = '';
    let tree = { width: 20, height: 20, children: [], linearGradients: [], radialGradients: [] };
    let contentArea;
    let stretchX = [];
    let stretchY = [];
    let field;
    while ((field = pbf.nextField(end))) {
        switch (field) {
            case 1:
                name = pbf.readString();
                break;
            case 2: {
                const __len = pbf.readVarint();
                const me = pbf.pos + __len;
                let mf;
                while ((mf = pbf.nextField(me))) {
                    switch (mf) {
                        case 1:
                            pbf.readPackedVarint(stretchX);
                            break;
                        case 2:
                            pbf.readPackedVarint(stretchY);
                            break;
                        default: pbf.skipField(mf);
                    }
                }
                break;
            }
            case 3: {
                const __len = pbf.readVarint();
                const te = pbf.pos + __len;
                tree = readUsvgTree(pbf, te);
                break;
            }
            default: pbf.skipField(field);
        }
    }
    return { name, width: tree.width, height: tree.height, tree, contentArea, stretchX: [], stretchY: [] };
}
function renderIconToCanvas(icon, dpr = 1) {
    const w = icon.width * dpr;
    const h = icon.height * dpr;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas)
        throw new Error('Canvas not available');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    renderTree(ctx, icon.tree);
    return canvas;
}
function renderTree(ctx, tree) {
    for (const child of tree.children) {
        renderNode(ctx, child, tree);
    }
}
function renderNode(ctx, node, tree) {
    if (node.type === 'group' && node.group) {
        ctx.save();
        const g = node.group;
        if (g.transform)
            applyTransform(ctx, g.transform);
        ctx.globalAlpha *= g.opacity / 255;
        for (const child of g.children)
            renderNode(ctx, child, tree);
        ctx.restore();
    }
    else if (node.type === 'path' && node.path) {
        renderPath(ctx, node.path, tree);
    }
}
function applyTransform(ctx, t) {
    ctx.transform(t.sx, t.ky, t.kx, t.sy, t.tx, t.ty);
}
function buildPath2D(path) {
    const p2d = new Path2D();
    const { commands, diffs, step } = path;
    if (diffs.length < 2)
        return p2d;
    let x = diffs[0] * step;
    let y = diffs[1] * step;
    p2d.moveTo(x, y);
    let j = 2;
    for (const cmd of commands) {
        switch (cmd) {
            case PathCommand.MOVE:
                x += diffs[j++] * step;
                y += diffs[j++] * step;
                p2d.moveTo(x, y);
                break;
            case PathCommand.LINE:
                x += diffs[j++] * step;
                y += diffs[j++] * step;
                p2d.lineTo(x, y);
                break;
            case PathCommand.QUAD: {
                const cpx = x + diffs[j++] * step, cpy = y + diffs[j++] * step;
                x = cpx + diffs[j++] * step;
                y = cpy + diffs[j++] * step;
                p2d.quadraticCurveTo(cpx, cpy, x, y);
                break;
            }
            case PathCommand.CUBIC: {
                const cp1x = x + diffs[j++] * step, cp1y = y + diffs[j++] * step;
                const cp2x = cp1x + diffs[j++] * step, cp2y = cp1y + diffs[j++] * step;
                x = cp2x + diffs[j++] * step;
                y = cp2y + diffs[j++] * step;
                p2d.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
                break;
            }
            case PathCommand.CLOSE:
                p2d.closePath();
                break;
        }
    }
    return p2d;
}
function renderPath(ctx, path, tree) {
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
function applyFillStyle(ctx, fill, tree) {
    const alpha = fill.opacity / 255;
    const stopCss = (s) => `rgba(${s.r},${s.g},${s.b},${(s.opacity / 255) * alpha})`;
    if (fill.paint === 'linear_gradient_idx' && tree.linearGradients[fill.linearIdx]) {
        const g = tree.linearGradients[fill.linearIdx];
        if (g.transform)
            applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.fillStyle = stopCss(g.stops[0]);
        }
        else {
            const grad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
            for (const s of g.stops)
                grad.addColorStop(s.offset, stopCss(s));
            ctx.fillStyle = grad;
        }
    }
    else if (fill.paint === 'radial_gradient_idx' && tree.radialGradients[fill.radialIdx]) {
        const g = tree.radialGradients[fill.radialIdx];
        if (g.transform)
            applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.fillStyle = stopCss(g.stops[0]);
        }
        else {
            const grad = ctx.createRadialGradient(g.fx, g.fy, g.fr, g.cx, g.cy, g.r);
            for (const s of g.stops)
                grad.addColorStop(s.offset, stopCss(s));
            ctx.fillStyle = grad;
        }
    }
    else {
        ctx.fillStyle = `rgba(${fill.r},${fill.g},${fill.b},${alpha})`;
    }
}
function applyGradientTransform(ctx, t) {
    ctx.transform(t.sx, t.ky, t.kx, t.sy, t.tx, t.ty);
}
function applyStrokeStyle(ctx, s, tree) {
    var _a, _b;
    const alpha = s.opacity / 255;
    if (s.paint === 'linear_gradient_idx' && tree.linearGradients[s.linearIdx]) {
        const g = tree.linearGradients[s.linearIdx];
        if (g.transform)
            applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.strokeStyle = `rgba(${g.stops[0].r},${g.stops[0].g},${g.stops[0].b},${(g.stops[0].opacity / 255) * alpha})`;
        }
        else {
            const grad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
            for (const st of g.stops)
                grad.addColorStop(st.offset, `rgba(${st.r},${st.g},${st.b},${(st.opacity / 255) * alpha})`);
            ctx.strokeStyle = grad;
        }
    }
    else if (s.paint === 'radial_gradient_idx' && tree.radialGradients[s.radialIdx]) {
        const g = tree.radialGradients[s.radialIdx];
        if (g.transform)
            applyGradientTransform(ctx, g.transform);
        if (g.stops.length === 1) {
            ctx.strokeStyle = `rgba(${g.stops[0].r},${g.stops[0].g},${g.stops[0].b},${(g.stops[0].opacity / 255) * alpha})`;
        }
        else {
            const grad = ctx.createRadialGradient(g.fx, g.fy, g.fr, g.cx, g.cy, g.r);
            for (const st of g.stops)
                grad.addColorStop(st.offset, `rgba(${st.r},${st.g},${st.b},${(st.opacity / 255) * alpha})`);
            ctx.strokeStyle = grad;
        }
    }
    else {
        ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
    }
    ctx.lineWidth = s.width;
    ctx.lineCap = ((_a = ['', 'butt', 'round', 'square'][s.linecap]) !== null && _a !== void 0 ? _a : 'butt');
    ctx.lineJoin = ((_b = ['', 'miter', 'miter-clip', 'round', 'bevel'][s.linejoin]) !== null && _b !== void 0 ? _b : 'miter');
    if (s.dasharray.length > 0)
        ctx.setLineDash(s.dasharray);
}
//# sourceMappingURL=IconSetPBFDecoder.js.map