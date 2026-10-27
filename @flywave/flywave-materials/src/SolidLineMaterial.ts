/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { type LineCaps, type LineDashes } from "@flywave/flywave-datasource-protocol";
import {
    abs,
    attribute,
    ceil,
    clamp,
    cos as tslCos,
    Discard,
    distance as tslDistance,
    dot,
    exp,
    float,
    Fn,
    fwidth,
    length,
    max as tslMax,
    min as tslMin,
    mix as tslMix,
    mod,
    modelViewPosition,
    normalize,
    normalLocal,
    positionLocal,
    pow as tslPow,
    select,
    sign,
    sin as tslSin,
    smoothstep,
    sqrt,
    tan as tslTan,
    texture,
    uniform,
    varying,
    vec2,
    vec3,
    vec4
} from "three/tsl";
import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";

export enum LineCapsModes {
    CAPS_NONE = 0,
    CAPS_SQUARE,
    CAPS_ROUND,
    CAPS_TRIANGLE_IN,
    CAPS_TRIANGLE_OUT
}

export enum LineDashesModes {
    DASHES_SQUARE = 0,
    DASHES_ROUND,
    DASHES_DIAMOND
}

const LineCapsDefinesMapping: { [key in LineCaps]: number } = {
    None: LineCapsModes.CAPS_NONE,
    Square: LineCapsModes.CAPS_SQUARE,
    Round: LineCapsModes.CAPS_ROUND,
    TriangleIn: LineCapsModes.CAPS_TRIANGLE_IN,
    TriangleOut: LineCapsModes.CAPS_TRIANGLE_OUT
};

const LineDashesDefinesMapping: { [key in LineDashes]: number } = {
    Square: LineDashesModes.DASHES_SQUARE,
    Round: LineDashesModes.DASHES_ROUND,
    Diamond: LineDashesModes.DASHES_DIAMOND
};

export interface SolidLineMaterialParameters {
    color?: number | string;
    outlineColor?: number | string;
    depthTest?: boolean;
    depthWrite?: boolean;
    fog?: boolean;
    lineWidth?: number;
    outlineWidth?: number;
    opacity?: number;
    caps?: LineCaps;
    drawRangeStart?: number;
    drawRangeEnd?: number;
    dashes?: LineDashes;
    dashColor?: number | string;
    dashSize?: number;
    gapSize?: number;
    offset?: number;
    fadeNear?: number;
    fadeFar?: number;
    displacementMap?: THREE.Texture;
    displacementMapUvMatrix?: THREE.Matrix3;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class SolidLineMaterial extends NodeMaterial {
    static DEFAULT_COLOR: number = 0xff0000;
    static DEFAULT_WIDTH: number = 1.0;
    static DEFAULT_OUTLINE_WIDTH: number = 0.0;
    static DEFAULT_OPACITY: number = 1.0;
    static DEFAULT_DRAW_RANGE_START: number = 0.0;
    static DEFAULT_DRAW_RANGE_END: number = 1.0;
    static DEFAULT_DASH_SIZE: number = 1.0;
    // harp.gl also defaults the gapSize UNIFORM to 1, but compiles its dash
    // code out unless the gapSize SETTER ran with a value > 0 (the
    // USE_DASHED_LINE define). This port gates dashes at runtime on
    // `gapSize > 0` instead, so the default must be 0 or every solid line
    // renders with a 1m/1m dash pattern.
    static DEFAULT_GAP_SIZE: number = 0.0;
    static DEFAULT_OFFSET: number = 0.0;

    private readonly m_diffuseColorU = uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR));
    private readonly m_outlineColorU = uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR));
    private readonly m_dashColorU = uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR));
    private readonly m_extrusionWidthU = uniform(SolidLineMaterial.DEFAULT_WIDTH / 2);
    private readonly m_outlineWidthU = uniform(SolidLineMaterial.DEFAULT_OUTLINE_WIDTH);
    private readonly m_offsetU = uniform(SolidLineMaterial.DEFAULT_OFFSET);
    private readonly m_opacityU = uniform(SolidLineMaterial.DEFAULT_OPACITY);
    private readonly m_tileSizeU = uniform(new THREE.Vector2());
    private readonly m_fadeNearU = uniform(-1.0);
    private readonly m_fadeFarU = uniform(-1.0);
    private readonly m_drawRangeU = uniform(
        new THREE.Vector2(
            SolidLineMaterial.DEFAULT_DRAW_RANGE_START,
            SolidLineMaterial.DEFAULT_DRAW_RANGE_END
        )
    );

    private readonly m_dashSizeU = uniform(SolidLineMaterial.DEFAULT_DASH_SIZE);
    private readonly m_gapSizeU = uniform(SolidLineMaterial.DEFAULT_GAP_SIZE);
    private readonly m_displacementMapNode = texture(
        new THREE.DataTexture(
            new Uint8Array([255, 255, 255, 255]),
            1,
            1,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        )
    );

    private readonly m_capsModeU = uniform(LineCapsModes.CAPS_ROUND);
    private readonly m_dashesModeU = uniform(LineDashesModes.DASHES_SQUARE);

    opacity: number = 1.0;
    fog: boolean = true;
    displacementMap: THREE.Texture | null = null;
    displacementMapUvMatrix: THREE.Matrix3 | null = null;
    stencilWrite: boolean = false;
    stencilFunc: any = THREE.NotEqualStencilFunc;
    stencilZPass: any = THREE.ReplaceStencilOp;
    stencilRef: number = 1;

    /**
     * Camera distance where fading starts. Fading is disabled while
     * `fadeNear === fadeFar` (the default `-1 / -1` sentinel).
     */
    get fadeNear(): number {
        return this.m_fadeNearU.value;
    }

    set fadeNear(value: number) {
        this.m_fadeNearU.value = value;
    }

    /** Camera distance where fading completes, see [[fadeNear]]. */
    get fadeFar(): number {
        return this.m_fadeFarU.value;
    }

    set fadeFar(value: number) {
        this.m_fadeFarU.value = value;
    }

    constructor(params?: SolidLineMaterialParameters) {
        super();
        this.name = "SolidLineMaterial";
        this.transparent = true;

        if (params) {
            if (params.color !== undefined) this.m_diffuseColorU.value.set(params.color as any);
            if (params.outlineColor !== undefined)
                this.m_outlineColorU.value.set(params.outlineColor as any);
            if (params.dashColor !== undefined)
                this.m_dashColorU.value.set(params.dashColor as any);
            if (params.lineWidth !== undefined) this.m_extrusionWidthU.value = params.lineWidth / 2;
            if (params.outlineWidth !== undefined) this.m_outlineWidthU.value = params.outlineWidth;
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
                this.m_opacityU.value = params.opacity;
            }
            if (params.depthTest !== undefined) this.depthTest = params.depthTest;
            if (params.depthWrite !== undefined) this.depthWrite = params.depthWrite;
            if (params.fadeNear !== undefined) {
                this.fadeNear = params.fadeNear;
                this.m_fadeNearU.value = params.fadeNear;
            }
            if (params.fadeFar !== undefined) {
                this.fadeFar = params.fadeFar;
                this.m_fadeFarU.value = params.fadeFar;
            }
            if (params.displacementMap) {
                this.displacementMap = params.displacementMap;
                this.m_displacementMapNode.value = params.displacementMap;
            }
            if (params.drawRangeStart !== undefined)
                this.m_drawRangeU.value.x = params.drawRangeStart;
            if (params.drawRangeEnd !== undefined) this.m_drawRangeU.value.y = params.drawRangeEnd;
            if (params.dashSize !== undefined) this.m_dashSizeU.value = params.dashSize;
            if (params.gapSize !== undefined) this.m_gapSizeU.value = params.gapSize;
            if (params.offset !== undefined) this.m_offsetU.value = params.offset;
            if (params.caps !== undefined)
                this.m_capsModeU.value = LineCapsDefinesMapping[params.caps];
            if (params.dashes !== undefined)
                this.m_dashesModeU.value = LineDashesDefinesMapping[params.dashes];
            this.fog = params.fog ?? true;
        }

        this.stencilWrite = this.opacity < 0.98;
        this.setupNodes();
    }

    private setupNodes() {
        const extrusionCoord = attribute("extrusionCoord", "vec3");
        const biTangent = attribute("biTangent", "vec4");
        const tangent = attribute("tangent", "vec3");
        // Corner factors come from the geometry itself: the two vertices of
        // each vertex pair carry opposite signs in `extrusionCoord.y`, and
        // `extrusionCoord.x` flips sign between a quad's start and end
        // vertex pairs, so sign() yields the across/along corner factors
        // without requiring the optional `uv` attribute. Reading `uvNode()`
        // here made the whole line vanish on geometries without uvs (NaN
        // position -> culled primitives, no error).
        const acrossCorner = sign(extrusionCoord.y);
        const alongCorner = sign(extrusionCoord.x);

        const extrusionWidth = this.m_extrusionWidthU;
        const outlineWidth = this.m_outlineWidthU;
        const offsetU = this.m_offsetU;
        const drawRange = this.m_drawRangeU;
        const totalWidth = extrusionWidth.add(outlineWidth);
        const tanHalfAngle = tslTan(biTangent.w.div(2));
        const hasAngle = biTangent.w.notEqual(0);

        // Vertex-stage values the fragment SDF consumes through varyings.
        // This restores the harp.gl `extrudeLine` inout-uv contract, which
        // rewrites the corner-factor vector BEFORE it reaches the fragment:
        // x becomes the along-line position extended by one total width past
        // the segment ends (the quads overlap the joints, giving the round
        // fragment caps geometry to cut into), and y becomes the signed
        // total width. Deriving these per fragment from the raw attribute
        // instead made vCoords.x a near-zero constant while vCoords.zw kept
        // the real arc length, so the segment-cap distance grew with arc
        // length and discarded every quad past a polyline's first corner —
        // regular gaps that look exactly like a dashed line.
        const SEGMENT_OFFSET = float(0.1);
        const segment = abs(extrusionCoord.xy).sub(SEGMENT_OFFSET);
        const segmentPos = sign(extrusionCoord.x).div(2).add(0.5);
        const linePos = tslMix(segment.x, segment.y, segmentPos);
        const alongCoord = tslMix(
            linePos.add(alongCorner.mul(totalWidth)),
            linePos.add(alongCorner.mul(acrossCorner).mul(totalWidth).mul(tanHalfAngle)),
            hasAngle
        );
        const acrossCoord = acrossCorner.mul(totalWidth);
        const extrusionFactor = acrossCorner.mul(tanHalfAngle);
        const vAlongCoord = varying(alongCoord);
        const vAcrossCoord = varying(acrossCoord);
        const vExtrusionFactor = varying(extrusionFactor);
        // vCoords.zw (the per-vertex start/end arc lengths) must ALSO come
        // from the vertex stage: computing `abs(interpolated attribute)`
        // per fragment dips to zero at the ribbon centerline, which trips
        // the segment end mask along the whole line and hollows out the
        // ribbon center (bright edges around a background-colored core).
        const vSegment = varying(segment);

        // === Position Node ===
        this.positionNode = Fn(() => {
            const posAngle = positionLocal.add(
                acrossCorner
                    .mul(totalWidth)
                    .mul(biTangent.xyz)
                    .div(tslCos(biTangent.w.div(2)))
            );
            const posNoAngle = positionLocal
                .add(acrossCorner.mul(totalWidth).mul(biTangent.xyz))
                .add(alongCorner.mul(totalWidth).mul(tangent));
            const pos = tslMix(posNoAngle, posAngle, hasAngle);
            return pos.add(
                biTangent.xyz.mul(offsetU).mul(sqrt(float(1).add(tslPow(abs(tanHalfAngle), 2))))
            );
        })();

        // === Fragment (color/alpha) Nodes ===
        // NOTE: the computed vec4 is routed through `colorNode`/`opacityNode`,
        // NOT `fragmentNode`. In three r185 `NodeMaterial.setup()` only wraps
        // the output in the renderer's MRT node when `fragmentNode === null`;
        // a custom fragmentNode emits exactly one fragment output. The scene
        // is rendered into an MRT pass (ViewRenderManager: `output` +
        // `pickDepth` color targets), so a single-output pipeline is invalid:
        // WebGPU rejects it ("Color target has no corresponding fragment
        // stage output but writeMask ... is not zero", targets[1]), the
        // command buffer is invalidated and the WHOLE frame is lost; WebGL2
        // renders the line into a mismatched draw buffer. The standard
        // colorNode path produces one output per MRT target and keeps
        // NodeMaterial.setupFog applied to the line color.
        const fragmentColor = Fn(() => {
            const extrusionFactor = vExtrusionFactor;
            const totalWidth = extrusionWidth.add(outlineWidth);

            const vRangeX = extrusionCoord.z;
            const vCoords = vec4(
                vAlongCoord.div(vRangeX),
                vAcrossCoord.div(extrusionWidth),
                vSegment.div(vRangeX)
            );

            // roundEdgesAndAddCaps
            const widthRatio = extrusionWidth.div(vRangeX);
            let dist = abs(vCoords.y);
            const segmentBeginMask = clamp(ceil(vCoords.z.sub(vCoords.x)), 0, 1);
            const segmentEndMask = clamp(ceil(vCoords.x.sub(vCoords.w)), 0, 1);
            dist = tslMax(
                dist,
                segmentBeginMask.mul(
                    length(vec2(vCoords.x.sub(vCoords.z).div(widthRatio), vCoords.y))
                )
            );
            dist = tslMax(
                dist,
                segmentEndMask.mul(
                    length(vec2(vCoords.x.sub(vCoords.w).div(widthRatio), vCoords.y))
                )
            );

            // Caps for non-ROUND modes. harp.gl compiles this whole block
            // out for CAPS_ROUND (#if CAPS_MODE != CAPS_ROUND) — round joints
            // rely only on the per-segment end circles above. The runtime
            // select chain has no Round branch and would fall through to the
            // TRIANGLE_IN distance, carving a triangle notch into every
            // joint overlap zone: once the width reaches screen pixels the
            // line turns into a dotted/dashed chain with one hole per
            // polyline vertex.
            const useCapsBlock = this.m_capsModeU.notEqual(LineCapsModes.CAPS_ROUND);
            const capRangeMask = clamp(float(1).sub(ceil(extrusionFactor.sub(drawRange.y))), 0, 1);
            const beginCapMask = clamp(ceil(drawRange.x.sub(vCoords.x)), 0, 1);
            const endCapMask = clamp(ceil(vCoords.x.sub(drawRange.y)), 0, 1);
            const capMask = capRangeMask.mul(tslMax(beginCapMask, endCapMask));
            const capDistVal = tslMax(vCoords.x.sub(drawRange.y), drawRange.x.sub(vCoords.x)).div(
                widthRatio
            );

            const distNone = tslMax(abs(vCoords.y), capDistVal.add(0.1).div(0.1));
            const distSquare = tslMax(abs(vCoords.y), capDistVal);
            const distTriOut = abs(vCoords.y).add(capDistVal);
            const distTriIn = tslMax(
                abs(vCoords.y),
                capDistVal.sub(abs(vCoords.y)).add(capDistVal)
            );

            const capDistMode = select(
                this.m_capsModeU.equal(LineCapsModes.CAPS_NONE),
                distNone,
                select(
                    this.m_capsModeU.equal(LineCapsModes.CAPS_SQUARE),
                    distSquare,
                    select(
                        this.m_capsModeU.equal(LineCapsModes.CAPS_TRIANGLE_OUT),
                        distTriOut,
                        distTriIn
                    )
                )
            );
            dist = select(useCapsBlock, tslMix(dist, capDistMode, capMask), dist);

            // Edge distance and opacity
            const distToEdge = dist.sub(totalWidth.div(extrusionWidth));
            const width = fwidth(distToEdge);
            const useBoxstep = this.m_opacityU.lessThan(0.98);
            const sBoxstep = clamp(distToEdge.add(width).div(width.mul(2)), 0, 1);
            const sSmooth = smoothstep(width.negate(), width, distToEdge);
            const s = float(1).sub(tslMix(sSmooth, sBoxstep, useBoxstep));
            let alpha = this.m_opacityU.mul(s);

            // Dashed line
            const useDashed = this.m_gapSizeU.greaterThan(0);
            const d = this.m_dashSizeU.div(vRangeX);
            const g = this.m_gapSizeU.div(vRangeX);
            const distToDashOrigin = mod(vCoords.x, d.add(g)).div(d);
            const distDashBase = float(0.5).sub(
                tslDistance(vec2(distToDashOrigin), d.add(g).div(d).mul(0.5))
            );
            const distToDashEdge = select(
                this.m_dashesModeU.equal(LineDashesModes.DASHES_ROUND),
                float(0.5).sub(tslDistance(vec2(dist.mul(0.5), distDashBase), vec2(0, 0.5))),
                select(
                    this.m_dashesModeU.equal(LineDashesModes.DASHES_DIAMOND),
                    distDashBase.sub(dist.mul(0.5)),
                    distDashBase
                )
            );
            const dashWidth = fwidth(distToDashEdge);
            const dashBlendFactor = float(1).sub(
                smoothstep(dashWidth.negate(), dashWidth, distToDashEdge)
            );

            // Outline
            const useOutline = outlineWidth.greaterThan(0);
            const distToOutline = dist.sub(1);
            const outlineW = fwidth(distToOutline);
            const outlineBlendFactor = smoothstep(outlineW.negate(), outlineW, distToOutline);

            // Color mixing. The dash tint is gated on `useDashed` exactly as
            // harp.gl's #ifdef did: with dashes disabled the mix is compiled
            // out there, while a runtime `gapSize === 0` still evaluates
            // `dashBlendFactor`, whose mod() pattern would periodically tint
            // the line toward dashColor (red) along its length.
            let outputDiffuse = select(
                useDashed,
                tslMix(this.m_diffuseColorU, this.m_dashColorU, dashBlendFactor),
                this.m_diffuseColorU
            );
            outputDiffuse = tslMix(outputDiffuse, this.m_outlineColorU, outlineBlendFactor);

            // Dash alpha
            alpha = select(useDashed, alpha.mul(float(1).sub(dashBlendFactor)), alpha);

            // Fading
            const mvDepth = modelViewPosition.z.negate();
            // The disabled-fade sentinel is fadeNear == fadeFar (both default
            // to -1). `smoothstep` with equal edges divides by zero
            // ((x - e0) / (e1 - e0) = +Inf for every depth in front of the
            // camera, clamped to 1), which multiplied alpha by 0 and made the
            // whole line invisible on both backends without any error. Emit a
            // constant 0 instead while fading is disabled.
            const fadeDisabled = this.m_fadeNearU.equal(this.m_fadeFarU);
            const fadeFactor = select(
                fadeDisabled,
                float(0),
                smoothstep(this.m_fadeNearU, this.m_fadeFarU, mvDepth)
            );
            alpha = alpha.mul(float(1).sub(fadeFactor));

            return vec4(outputDiffuse, alpha);
        })();
        this.colorNode = fragmentColor;
        // The alpha above already contains `m_opacityU` (kept in sync with
        // the engine-facing `opacity` by the constructor / setOpacity). Pin
        // opacityNode to 1 so `Material.opacity` — which the tile builder
        // also writes directly (applyBaseColorToMaterial) — cannot multiply
        // the same opacity factor a second time.
        this.opacityNode = float(1);
    }

    get color(): THREE.Color {
        return this.m_diffuseColorU.value;
    }

    set color(value: THREE.Color) {
        this.m_diffuseColorU.value.copy(value);
    }

    get outlineColor(): THREE.Color {
        return this.m_outlineColorU.value;
    }

    set outlineColor(value: THREE.Color) {
        this.m_outlineColorU.value.copy(value);
    }

    get dashColor(): THREE.Color {
        return this.m_dashColorU.value;
    }

    set dashColor(value: THREE.Color) {
        this.m_dashColorU.value.copy(value);
    }

    get lineWidth(): number {
        return this.m_extrusionWidthU.value * 2;
    }

    set lineWidth(value: number) {
        this.m_extrusionWidthU.value = value / 2;
    }

    get outlineWidth(): number {
        return this.m_outlineWidthU.value;
    }

    set outlineWidth(value: number) {
        this.m_outlineWidthU.value = value;
    }

    get dashSize(): number {
        return this.m_dashSizeU.value;
    }

    set dashSize(value: number) {
        this.m_dashSizeU.value = value;
    }

    get gapSize(): number {
        return this.m_gapSizeU.value;
    }

    set gapSize(value: number) {
        this.m_gapSizeU.value = value;
    }

    get offset(): number {
        return this.m_offsetU.value;
    }

    set offset(value: number) {
        this.m_offsetU.value = value;
    }

    get drawRangeStart(): number {
        return this.m_drawRangeU.value.x;
    }

    set drawRangeStart(value: number) {
        this.m_drawRangeU.value.x = value;
    }

    get drawRangeEnd(): number {
        return this.m_drawRangeU.value.y;
    }

    set drawRangeEnd(value: number) {
        this.m_drawRangeU.value.y = value;
    }

    get caps(): LineCaps {
        const val = this.m_capsModeU.value;
        const found = Object.entries(LineCapsDefinesMapping).find(([, v]) => v === val);
        return found ? (found[0] as LineCaps) : "Round";
    }

    set caps(value: LineCaps) {
        if (LineCapsDefinesMapping.hasOwnProperty(value))
            this.m_capsModeU.value = LineCapsDefinesMapping[value];
    }

    get dashes(): LineDashes {
        const val = this.m_dashesModeU.value;
        const found = Object.entries(LineDashesDefinesMapping).find(([, v]) => v === val);
        return found ? (found[0] as LineDashes) : "Square";
    }

    set dashes(value: LineDashes) {
        if (LineDashesDefinesMapping.hasOwnProperty(value))
            this.m_dashesModeU.value = LineDashesDefinesMapping[value];
    }

    set clipTileSize(tileSize: THREE.Vector2) {
        this.m_tileSizeU.value.copy(tileSize);
    }

    get clipTileSize(): THREE.Vector2 {
        return this.m_tileSizeU.value;
    }

    setOpacity(opacity: number) {
        this.opacity = opacity;
        this.m_opacityU.value = opacity;
        this.stencilWrite = opacity < 0.98;
    }
}
