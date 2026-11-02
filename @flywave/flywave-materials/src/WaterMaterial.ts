/* Copyright (C) 2025 flywave.gl contributors */

import {
    cameraPosition,
    dot,
    float,
    max,
    mix,
    modelWorldMatrix,
    normalize,
    positionLocal,
    positionWorld,
    pow,
    reflect,
    texture,
    time,
    uniform,
    vec2,
    vec4
} from "three/tsl";
import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";

import { enforceBlending } from "./Utils";

/**
 * Flat neutral normal map used until a real water normal map is assigned.
 * Shared by all water materials — it is never written to and never disposed.
 */
const FLAT_NORMAL_TEXTURE = (() => {
    const placeholder = new THREE.DataTexture(
        new Uint8Array([128, 128, 255, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
    );
    placeholder.wrapS = THREE.RepeatWrapping;
    placeholder.wrapT = THREE.RepeatWrapping;
    placeholder.needsUpdate = true;
    return placeholder;
})();

/**
 * Options for constructing a {@link WaterMaterial}.
 */
export interface WaterMaterialParameters {
    /** Base color of the water body. Default `0x555555`. */
    color?: THREE.ColorRepresentation;
    /** Opacity of the water surface. Default `0.9`. */
    opacity?: number;
    /** Color of the sky the surface reflects. Default `0x8fb6cc`. */
    skyColor?: THREE.ColorRepresentation;
    /** Color of the sun specular highlights. Default `0xffffff`. */
    sunColor?: THREE.ColorRepresentation;
    /**
     * Direction of the sun light in world space (z is up on planar
     * projections). Default `(0.35, -0.45, 0.82)`.
     */
    sunDirection?: THREE.Vector3 | number[];
    /**
     * Normal-map tiling density, in repeats per world meter. Values around
     * `20`-`30` give visibly animated ripples on a lake looked at from above;
     * the default `2` yields an almost flat sheet.
     */
    textureScale?: number;
    /**
     * Amplitude of the normal-map driven surface perturbation. Default `20`.
     */
    distortionScale?: number;
    /**
     * Strength of the reflected-light term (fresnel weighted sky/specular
     * mix), clamped to `[0, 1]`. `0` renders the diffuse water body only.
     * Default `1`.
     */
    reflectionStrength?: number;
    /** Animation speed multiplier of the surface waves. Default `1`. */
    speed?: number;
    /** Water normal map. A flat placeholder map is used until one is set. */
    normalMap?: THREE.Texture;
}

/**
 * Animated water surface material built from TSL node graphs.
 *
 * The material samples a normal map at four scrolling UV offsets to build a
 * procedural surface normal and combines diffuse, fresnel weighted sky
 * reflection and sun glint terms. All parameters are uniforms, and the
 * animation is driven by the TSL `time` node — the material never touches
 * per-frame JavaScript.
 *
 * The UVs are derived from `positionLocal` scaled to world-meter repeats and
 * anchored by the per-instance {@link WaterMaterial.setTileCenter tile
 * center}: tile geometry is placed by a translation-only transform (see
 * `TileObjectsRenderer`), so local coordinates plus the tile center are
 * stable world meters. That keeps the wave pattern continuous across
 * neighboring tiles and independent of both the zoom level and the RTE
 * camera position (`positionWorld` is camera-relative in this engine and
 * must not be used for UVs). The center contribution is wrapped to `[0, 1)`
 * on the CPU in double precision — world coordinates are far beyond float32
 * UV precision, and unwrapped values render as blocky mosaic.
 */
export class WaterMaterial extends NodeMaterial {
    /**
     * `NodeMaterial.customProgramCacheKey` hashes every node instance id
     * (`Node.customCacheKey() → this.id`), so structurally identical
     * instances never share a built state: every tile's material would pay a
     * full NodeBuilder.build/analyze/generate on both backends.
     *
     * The water graph is identical for every instance (all parameters are
     * uniforms), so a constant per-class key lets all tiles share one built
     * state. Per-instance uniform VALUES are unaffected — uniform upload
     * reads each instance's nodes at draw time.
     */
    public override customProgramCacheKey(): string {
        return "flywave:" + this.type;
    }

    static DEFAULT_COLOR: number = 0x555555;
    static DEFAULT_OPACITY: number = 0.9;
    static DEFAULT_SKY_COLOR: number = 0x8fb6cc;
    static DEFAULT_SUN_COLOR: number = 0xffffff;
    static DEFAULT_SUN_DIRECTION: THREE.Vector3 = new THREE.Vector3(0.35, -0.45, 0.82);
    static DEFAULT_TEXTURE_SCALE: number = 2.0;
    static DEFAULT_DISTORTION_SCALE: number = 20.0;
    static DEFAULT_REFLECTION_STRENGTH: number = 1.0;
    static DEFAULT_SPEED: number = 1.0;

    /** Marks water materials for pipeline code that must not rely on names. */
    readonly isWaterMaterial: boolean = true;

    private readonly m_colorU = uniform(new THREE.Color(WaterMaterial.DEFAULT_COLOR));
    private readonly m_skyColorU = uniform(new THREE.Color(WaterMaterial.DEFAULT_SKY_COLOR));
    private readonly m_sunColorU = uniform(new THREE.Color(WaterMaterial.DEFAULT_SUN_COLOR));
    private readonly m_sunDirectionU = uniform(WaterMaterial.DEFAULT_SUN_DIRECTION.clone());
    private readonly m_opacityU = uniform(WaterMaterial.DEFAULT_OPACITY);
    private readonly m_textureScaleU = uniform(WaterMaterial.DEFAULT_TEXTURE_SCALE);
    private readonly m_distortionScaleU = uniform(WaterMaterial.DEFAULT_DISTORTION_SCALE);
    private readonly m_reflectionU = uniform(WaterMaterial.DEFAULT_REFLECTION_STRENGTH);
    private readonly m_speedU = uniform(WaterMaterial.DEFAULT_SPEED);
    /**
     * World-anchored UV offsets, one per noise layer, wrapped to `[0, 1)`
     * (see `updateUvOffsets`): the tile center lives in world meters (~1e7),
     * and feeding it through the shader's float32 math would destroy the UV
     * fraction — the mosaic artifact. The wrapped offsets are exact, so the
     * mapping stays world-linear and seamless across neighboring tiles.
     */
    private readonly m_uvOffsetAU = uniform(new THREE.Vector4());
    private readonly m_uvOffsetBU = uniform(new THREE.Vector4());
    private readonly m_normalMapNode = texture(FLAT_NORMAL_TEXTURE);

    /** Tile center in world meters, kept for offset recomputation. */
    private readonly m_tileCenter = new THREE.Vector3();

    /**
     * Constructs a water surface material.
     *
     * @param params - Material parameters, all optional.
     */
    constructor(params: WaterMaterialParameters = {}) {
        super();

        this.type = "WaterMaterial";

        // Water follows the ground-fill convention: it stays in the OPAQUE
        // pass with `depthTest` off (the harp.gl ground rule — testing depth
        // while coplanar with the depth-writing ground fills produces severe
        // per-pixel z-fighting), so occlusion works exactly like every other
        // fill: via render order (roads 5.x/10…, buildings 2000 draw after
        // the water's 5). The alpha look is preserved through order-preserving
        // blending instead of `transparent`, the same mechanism solid lines
        // use (see `enforceBlending`).
        enforceBlending(this);
        this.lights = false;

        if (params.color !== undefined) {
            this.color = params.color;
        }
        if (params.opacity !== undefined) {
            this.opacity = params.opacity;
        }
        if (params.skyColor !== undefined) {
            this.skyColor = params.skyColor;
        }
        if (params.sunColor !== undefined) {
            this.sunColor = params.sunColor;
        }
        if (params.sunDirection !== undefined) {
            this.sunDirection = params.sunDirection;
        }
        if (params.textureScale !== undefined) {
            this.textureScale = params.textureScale;
        }
        if (params.distortionScale !== undefined) {
            this.distortionScale = params.distortionScale;
        }
        if (params.reflectionStrength !== undefined) {
            this.reflectionStrength = params.reflectionStrength;
        }
        if (params.speed !== undefined) {
            this.speed = params.speed;
        }
        if (params.normalMap !== undefined) {
            this.normalMap = params.normalMap;
        }

        this.buildNodeGraph();
    }

    /**
     * Builds the TSL shading graph.
     *
     * The shading frame comes from the mesh's model matrix: tile water
     * polygons are placed by a translation-only transform, so the basis
     * vectors stay the projection's up/tangent axes. Multiplying by
     * `modelWorldMatrix` with `w = 0` picks up rotation only, which keeps the
     * graph correct for planar and spherical projections alike.
     */
    private buildNodeGraph(): void {
        const upWorld = normalize(modelWorldMatrix.mul(vec4(0, 0, 1, 0)).xyz);
        const tangentXWorld = normalize(modelWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz);
        const tangentYWorld = normalize(modelWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz);

        // World-meter UVs: tile-local positions scaled to repeats; the world
        // anchor arrives pre-wrapped in `m_uvOffsetAU/m_uvOffsetBU` (see
        // `updateUvOffsets` for why the center must never enter this math).
        const localUv = positionLocal.xy.mul(this.m_textureScaleU);

        const t = time.mul(this.m_speedU);
        const uv0 = localUv
            .div(103)
            .add(this.m_uvOffsetAU.xy)
            .add(vec2(t.div(17), t.div(29)));
        const uv1 = localUv
            .div(107)
            .add(this.m_uvOffsetAU.zw)
            .sub(vec2(t.div(-19), t.div(31)));
        const uv2 = localUv
            .div(vec2(8907.0, 9803.0))
            .add(this.m_uvOffsetBU.xy)
            .add(vec2(t.div(101), t.div(97)));
        const uv3 = localUv
            .div(vec2(1091.0, 1027.0))
            .add(this.m_uvOffsetBU.zw)
            .sub(vec2(t.div(109), t.div(-113)));

        const noise = this.m_normalMapNode
            .sample(uv0)
            .add(this.m_normalMapNode.sample(uv1))
            .add(this.m_normalMapNode.sample(uv2))
            .add(this.m_normalMapNode.sample(uv3))
            .mul(0.5)
            .sub(1.0);

        // Tangent-space slope of the water surface, scaled by the distortion
        // (`0.055` makes the default distortion of 20 the neutral value).
        const slope = noise.xy.mul(this.m_distortionScaleU.mul(0.055));
        const surfaceNormal = normalize(
            upWorld.add(tangentXWorld.mul(slope.x)).add(tangentYWorld.mul(slope.y))
        );

        // `cameraPosition` is the render camera origin and tile objects are
        // placed camera-relative (RTE), so this is a valid view direction.
        const viewDirection = normalize(cameraPosition.sub(positionWorld));
        const sunDirection = normalize(this.m_sunDirectionU);

        // Schlick fresnel. At a steep view the water body dominates; towards
        // the horizon the reflected sky takes over — this gradient is what
        // makes a flat sheet read as water.
        const rf0 = float(0.02);
        const fresnel = rf0
            .add(
                float(1.0)
                    .sub(rf0)
                    .mul(pow(float(1.0).sub(max(dot(viewDirection, surfaceNormal), 0.0)), 5.0))
            )
            .mul(this.m_reflectionU);

        const reflected = normalize(reflect(sunDirection.mul(-1), surfaceNormal));
        const glint = pow(max(dot(viewDirection, reflected), 0.0), float(90.0))
            .mul(this.m_sunColorU)
            .mul(2.5);

        const diffuse = max(dot(sunDirection, surfaceNormal), 0.0).mul(this.m_sunColorU).mul(0.12);
        const bodyColor = this.m_colorU.mul(0.85).add(diffuse);
        const reflectedColor = this.m_skyColorU.mul(0.6).add(glint);

        this.colorNode = mix(bodyColor, reflectedColor, fresnel).add(glint.mul(0.35));
        this.opacityNode = this.m_opacityU;
    }

    /** Base color of the water body. */
    get color(): THREE.Color {
        return this.m_colorU.value;
    }

    set color(value: THREE.ColorRepresentation) {
        this.m_colorU.value.set(value);
    }

    /** Opacity of the water surface. */
    override get opacity(): number {
        return this.m_opacityU.value;
    }

    override set opacity(value: number) {
        // `Material`'s constructor assigns `this.opacity` before this
        // subclass's field initializers have run — the uniform does not exist
        // yet at that point, so only the base field can be written.
        super.opacity = value;
        if (this.m_opacityU !== undefined) {
            this.m_opacityU.value = value;
        }
    }

    /** Color of the sky the surface reflects at grazing angles. */
    get skyColor(): THREE.Color {
        return this.m_skyColorU.value;
    }

    set skyColor(value: THREE.ColorRepresentation) {
        this.m_skyColorU.value.set(value);
    }

    /** Color of the sun specular highlights. */
    get sunColor(): THREE.Color {
        return this.m_sunColorU.value;
    }

    set sunColor(value: THREE.ColorRepresentation) {
        this.m_sunColorU.value.set(value);
    }

    /** Direction of the sun light in world space. */
    get sunDirection(): THREE.Vector3 {
        return this.m_sunDirectionU.value;
    }

    set sunDirection(value: THREE.Vector3 | number[]) {
        if (Array.isArray(value)) {
            this.m_sunDirectionU.value.set(value[0], value[1], value[2]);
        } else {
            this.m_sunDirectionU.value.copy(value);
        }
    }

    /** Normal-map tiling density, in repeats per world meter. */
    get textureScale(): number {
        return this.m_textureScaleU.value;
    }

    set textureScale(value: number) {
        this.m_textureScaleU.value = value;
        this.updateUvOffsets();
    }

    /** Amplitude of the normal-map driven surface perturbation. */
    get distortionScale(): number {
        return this.m_distortionScaleU.value;
    }

    set distortionScale(value: number) {
        this.m_distortionScaleU.value = value;
    }

    /**
     * Strength of the reflected-light term, clamped to `[0, 1]`. Takes effect
     * on the next rendered frame.
     */
    get reflectionStrength(): number {
        return this.m_reflectionU.value;
    }

    set reflectionStrength(value: number) {
        this.m_reflectionU.value = Math.min(1, Math.max(0, value));
    }

    /** Animation speed multiplier of the surface waves. */
    get speed(): number {
        return this.m_speedU.value;
    }

    set speed(value: number) {
        this.m_speedU.value = value;
    }

    /**
     * The water normal map. The map is sampled at scrolling offsets, so it is
     * always switched to `RepeatWrapping` on assignment. Swapping the map only
     * changes a texture binding — the built program is unaffected.
     */
    get normalMap(): THREE.Texture {
        return this.m_normalMapNode.value;
    }

    set normalMap(value: THREE.Texture) {
        if (value === this.m_normalMapNode.value) {
            return;
        }
        value.wrapS = THREE.RepeatWrapping;
        value.wrapT = THREE.RepeatWrapping;
        this.m_normalMapNode.value = value;
    }

    /**
     * Anchors the surface UVs to world space.
     *
     * Must be called once per tile with the tile's world center: tile geometry
     * is placed by a translation-only transform, so local positions plus this
     * center are the world meters the wave pattern is stable in.
     *
     * @param center - The tile's world center (see `Tile.center`).
     */
    setTileCenter(center: THREE.Vector3): void {
        this.m_tileCenter.copy(center);
        this.updateUvOffsets();
    }

    /**
     * Recomputes the world-anchored, per-layer UV offsets.
     *
     * The exact world UV of a fragment is `(local + center) * textureScale`,
     * divided by the layer's period. Since the texture repeats every `1.0` UV
     * units, the center contribution can be wrapped to `[0, 1)` — and MUST be:
     * world coordinates reach ~1e7 meters, where float32 (both in the uniform
     * upload and the shader math) has a resolution of whole texture repeats,
     * which renders as large blocky mosaic instead of waves. The wrap happens
     * here in float64, keeping the mapping exact (`frac(a + b) ===
     * frac(a + frac(b))`) and the shader-side terms small.
     */
    private updateUvOffsets(): void {
        const scale = this.m_textureScaleU.value;
        const x = this.m_tileCenter.x;
        const y = this.m_tileCenter.y;
        // Layer periods mirror the shader: scalars 103/107, then vec2
        // (8907, 9803) and (1091, 1027).
        this.m_uvOffsetAU.value.set(
            mod1((x * scale) / 103),
            mod1((y * scale) / 103),
            mod1((x * scale) / 107),
            mod1((y * scale) / 107)
        );
        this.m_uvOffsetBU.value.set(
            mod1((x * scale) / 8907.0),
            mod1((y * scale) / 9803.0),
            mod1((x * scale) / 1091.0),
            mod1((y * scale) / 1027.0)
        );
    }
}

/**
 * Wraps a value to `[0, 1)` in double precision (JS `%` keeps the sign of
 * the dividend; negative offsets would still work, but keep the range
 * documented).
 */
function mod1(value: number): number {
    return value - Math.floor(value);
}
