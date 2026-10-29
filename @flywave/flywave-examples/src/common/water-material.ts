/* Copyright (C) 2025 flywave.gl contributors */

import { type Feature, GeoCoordinates } from "@flywave/flywave.gl";
import { type Polygon as TurfPolygon, type Position } from "@turf/turf";
import * as turf from "@turf/turf";
import {
    cameraPosition,
    dot,
    float,
    max,
    mix,
    modelWorldMatrix,
    normalize,
    positionGeometry,
    positionWorld,
    pow,
    reflect,
    texture,
    time,
    uniform,
    vec2,
    vec4
} from "three/tsl";
import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    Color,
    DataTexture,
    type Material,
    Matrix4,
    Mesh,
    NodeMaterial,
    RepeatWrapping,
    RGBAFormat,
    ShapeUtils,
    Texture,
    TextureLoader,
    UnsignedByteType,
    Vector2,
    Vector3
} from "three/webgpu";

/**
 * Options for constructing a {@link WaterMaterial}.
 *
 * `normalsUrl` is only required by the {@link createWaterMaterial} factory; the class itself falls
 * back to `./waternormals.jpg` relative to the page, matching the original implementation.
 */
export interface WaterMaterialOptions {
    /** Opacity of the water surface. Default `0.9`. */
    alpha?: number;
    /** Animation speed multiplier. Default `1.0`. */
    speed?: number;
    /** Direction of the sun light. Default `(0.70707, 0.70707, 0.0)`. */
    sunDirection?: Vector3;
    /** Color of the sun light/specular highlights. Default `0xffffff`. */
    sunColor?: number | string | Color;
    /** Base color of the water body. Default `0x555555`. */
    waterColor?: number | string | Color;
    /** Color of the sky the surface reflects. Default `0x8fb6cc`. */
    skyColor?: number | string | Color;
    /**
     * Normal-map tiling density: UV units per world meter. The default inherited
     * from the original material is `2`, which on a ground-level water body gives
     * ~50 m wide ripples (i.e. an apparently flat sheet). Raise it to `20`–`30`
     * for a lake you can actually look at from above.
     */
    textureScale?: number;
    /**
     * Amplitude of the normal-map driven surface perturbation. Higher values
     * give choppier, more broken reflections. Default `20.0`.
     */
    distortionScale?: number;
    /**
     * Strength of the reflected-light term (fresnel weighted sky/specular mix).
     * `1` is the original reflective look, `0` renders the diffuse water body
     * only. Mirrors the `waterReflection` display option of f4map. Default `1`.
     */
    reflectionStrength?: number;
    /** Whether the material reacts to scene fog. Default `false`. */
    fog?: boolean;
    /** Water normal map as a ready {@link Texture} or a URL to load one from. */
    normalMap?: Texture | string;
}

/** Options for {@link createWaterMaterial}. */
export interface ICreateWaterMaterialOptions extends Omit<WaterMaterialOptions, "normalMap"> {
    /**
     * URL of the water normal map texture (e.g. `resources/waternormals.jpg`). Resolution of the
     * URL is the responsibility of the caller.
     */
    normalsUrl: string;
}

/**
 * Animated water surface material built from TSL node graphs.
 *
 * Ported from `src/real-world-ecological-farming/water.ts` as a reusable component. The material
 * samples a normal map at four scrolling UV offsets to build a procedural surface normal and
 * combines diffuse, scatter and specular lighting terms.
 */
export class WaterMaterial extends NodeMaterial {
    private m_speed: number;
    private m_reflectionStrength: number;
    private readonly m_reflectionUniform: any;
    private readonly m_speedUniform: any;
    private readonly m_normalSampler: Texture | null = null;
    private m_mirrorSampler: Texture | null = null;

    constructor(options: WaterMaterialOptions = {}) {
        super();

        this.transparent = true;
        this.lights = false;
        this.fog = options.fog ?? false;

        this.m_speed = options.speed ?? 1.0;

        const placeholder = new DataTexture(
            new Uint8Array([128, 128, 255, 255]),
            1,
            1,
            RGBAFormat,
            UnsignedByteType
        );
        placeholder.needsUpdate = true;
        placeholder.wrapS = RepeatWrapping;
        placeholder.wrapT = RepeatWrapping;

        let normalTex: Texture;
        if (options.normalMap instanceof Texture) {
            normalTex = options.normalMap;
        } else if (typeof options.normalMap === "string") {
            normalTex = new TextureLoader().load(options.normalMap);
        } else {
            normalTex = new TextureLoader().load("./waternormals.jpg");
        }
        normalTex.wrapS = RepeatWrapping;
        normalTex.wrapT = RepeatWrapping;
        this.m_normalSampler = normalTex;

        const normalTexNode = texture(placeholder);
        // TODO(tsc): `onObjectUpdate` is untyped in three/webgpu; swap the placeholder for the
        // loaded normal map as soon as the material object is known to the node.
        normalTexNode.onObjectUpdate(({ material }: any) => {
            const tex = (material as WaterMaterial).m_normalSampler;
            return tex && tex.image ? tex : placeholder;
        });

        // TODO(tsc): `uniform` return types are too narrow for mixed value types in
        // three/webgpu, hence the assertions (inherited from the original example).
        const uAlpha = uniform(options.alpha ?? 0.9) as any;
        const uSize = uniform(options.textureScale ?? 2.0) as any;
        const uSunColor = uniform(new Color(options.sunColor ?? 0xffffff)) as any;
        const uSunDirection = uniform(
            options.sunDirection ?? new Vector3(0.35, -0.45, 0.82)
        ) as any;
        const uWaterColor = uniform(new Color(options.waterColor ?? 0x555555)) as any;
        const uSkyColor = uniform(new Color(options.skyColor ?? 0x8fb6cc)) as any;
        const uDistortionScale = uniform(options.distortionScale ?? 20.0) as any;
        const uReflection = uniform(options.reflectionStrength ?? 1.0) as unknown as ReturnType<
            typeof float
        >;
        const uSpeed = uniform(this.m_speed) as any;
        this.m_speedUniform = uSpeed;
        this.m_reflectionStrength = options.reflectionStrength ?? 1.0;
        this.m_reflectionUniform = uReflection;

        // The shading frame comes from the mesh itself, not from a shared
        // uniform: `PolygonMesh` orients every polygon so its local +Z is the
        // projection's up vector and its local X/Y are the in-plane tangents.
        // Multiplying the basis vectors by `modelWorldMatrix` with w = 0 picks up
        // the rotation only — this stays correct for planar *and* spherical
        // projections, and for every polygon of the layer independently.
        const upWorld = normalize(modelWorldMatrix.mul(vec4(0, 0, 1, 0)).xyz);
        const tangentXWorld = normalize(modelWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz);
        const tangentYWorld = normalize(modelWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz);

        const uv = positionGeometry.xy.mul(uSize);

        const t = time.mul(uSpeed) as unknown as ReturnType<typeof float>;
        const uv0 = uv.div(103).add(vec2(t.div(17), t.div(29)));
        const uv1 = uv.div(107).sub(vec2(t.div(-19), t.div(31)));
        const uv2 = uv.div(vec2(8907.0, 9803.0)).add(vec2(t.div(101), t.div(97)));
        const uv3 = uv.div(vec2(1091.0, 1027.0)).sub(vec2(t.div(109), t.div(-113)));

        const noise = normalTexNode
            .sample(uv0)
            .add(normalTexNode.sample(uv1))
            .add(normalTexNode.sample(uv2))
            .add(normalTexNode.sample(uv3))
            .mul(0.5)
            .sub(1.0);

        // Tangent-space slope of the water surface, scaled by `distortionScale`
        // (20 is the neutral value inherited from the original material).
        const slope = noise.xy.mul(uDistortionScale.mul(0.055));
        const surfaceNormal = normalize(
            upWorld.add(tangentXWorld.mul(slope.x)).add(tangentYWorld.mul(slope.y))
        );

        // Real view vector: `cameraPosition` is the render camera origin and map
        // anchors are already placed camera-relative, so this is a valid
        // direction even though both live in the RTE frame.
        const viewDirection = normalize(cameraPosition.sub(positionWorld));
        const sunDirection = normalize(uSunDirection);

        // Schlick fresnel. At a steep view the water body dominates; towards the
        // horizon the reflected sky takes over — this gradient is what makes a
        // flat sheet read as water.
        const rf0 = float(0.02);
        const fresnel = rf0
            .add(
                float(1.0)
                    .sub(rf0)
                    .mul(pow(float(1.0).sub(max(dot(viewDirection, surfaceNormal), 0.0)), 5.0))
            )
            .mul(uReflection);

        const reflected = normalize((reflect as any)(sunDirection.mul(-1), surfaceNormal));
        const glint = pow(max(dot(viewDirection, reflected), 0.0), float(90.0))
            .mul(uSunColor)
            .mul(2.5);

        const diffuse = max(dot(sunDirection, surfaceNormal), 0.0).mul(uSunColor).mul(0.12);
        const bodyColor = uWaterColor.mul(0.85).add(diffuse);
        const reflectedColor = uSkyColor.mul(0.6).add(glint);

        const albedo = mix(bodyColor, reflectedColor, fresnel).add(glint.mul(0.35));

        this.colorNode = albedo;
        this.opacityNode = uAlpha;
    }

    /** Sets the mirror/reflection texture used for planar reflections (reserved). */
    setMirrorSampler(texture: Texture): void {
        this.m_mirrorSampler = texture;
    }

    /** Updates the camera position uniform (reserved, currently a no-op). */
    setCameraPosition(_position: Vector3): void {}

    /** Updates the texture projection matrix (reserved, currently a no-op). */
    setTextureMatrix(_matrix: Matrix4): void {}

    /** Animation speed multiplier of the water surface. */
    get speed(): number {
        return this.m_speed;
    }

    set speed(value: number) {
        this.m_speed = value;
        if (this.m_speedUniform !== undefined) {
            this.m_speedUniform.value = value;
        }
    }

    /**
     * Strength of the reflected-light term, clamped to `[0, 1]`.
     *
     * `0` disables the reflected sky/specular contribution (the equivalent of
     * f4map's unchecked `waterReflection` display option); `1` restores it.
     * Takes effect on the next rendered frame.
     */
    get reflectionStrength(): number {
        return this.m_reflectionStrength;
    }

    set reflectionStrength(value: number) {
        const clamped = Math.min(1, Math.max(0, value));
        this.m_reflectionStrength = clamped;
        if (this.m_reflectionUniform !== undefined) {
            this.m_reflectionUniform.value = clamped;
        }
    }

    dispose(): void {
        this.m_normalSampler?.dispose();
        this.m_mirrorSampler?.dispose();
        super.dispose();
    }
}

/**
 * Creates an animated water surface material.
 *
 * Factory wrapper around {@link WaterMaterial} that makes the normal map URL an explicit,
 * required parameter instead of the hardcoded `./waternormals.jpg` default of the original
 * example. All other options are passed through unchanged.
 *
 * @param options - Material options including the required `normalsUrl`.
 * @returns A new {@link WaterMaterial} instance.
 */
export function createWaterMaterial(options: ICreateWaterMaterialOptions): WaterMaterial {
    const { normalsUrl, ...rest } = options;
    return new WaterMaterial({ ...rest, normalMap: normalsUrl });
}

/**
 * Minimal projection contract required by {@link PolygonMesh}, satisfied by
 * `mapView.projection`.
 */
export interface IProjection {
    /** Projects a geo coordinate into world (cartesian) space. */
    projectPoint(coord: GeoCoordinates, target?: Vector3): Vector3;
}

/**
 * A THREE.Mesh that triangulates a GeoJSON polygon feature into world space geometry, anchored at
 * the polygon centroid.
 *
 * Ported from `src/real-world-ecological-farming/PolygonMesh.ts` as a reusable component. Add it
 * to `mapView.mapAnchors` so it survives the per-frame scene rebuild.
 */
export class PolygonMesh extends Mesh {
    private m_feature: Feature;
    private readonly m_projection: IProjection;
    private readonly m_altitude: number;
    private readonly m_surfaceFrame = {
        up: new Vector3(0, 0, 1),
        tangentX: new Vector3(1, 0, 0),
        tangentY: new Vector3(0, 1, 0)
    };

    /**
     * @param feature - GeoJSON polygon feature (outer ring plus optional holes).
     * @param projection - Projection used to place and shape the polygon.
     * @param material - Material for the surface.
     * @param altitude - Altitude of the polygon plane in meters. Staying above the
     * ground plane avoids depth fighting with the basemap fill underneath.
     */
    constructor(feature: Feature, projection: IProjection, material: Material, altitude = 0) {
        const geometry = new BufferGeometry();
        super(geometry, material);

        this.m_feature = feature;
        this.m_projection = projection;
        this.m_altitude = altitude;

        this.updateGeometry();

        this.renderOrder = Number.MAX_SAFE_INTEGER;
    }

    /** Replaces the polygon feature and rebuilds the geometry. */
    updateFeature(feature: Feature): void {
        this.m_feature = feature;
        this.updateGeometry();
    }

    /** Returns the currently displayed polygon feature. */
    getFeature(): Feature {
        return this.m_feature;
    }

    /**
     * World-space frame of the polygon plane.
     *
     * `up` is the projection's local vertical, `tangentX`/`tangentY` are the
     * in-plane axes of the mesh's local X/Y. Pass this to
     * {@link WaterMaterial.setSurfaceFrame} so the lighting matches the geometry.
     */
    get surfaceFrame(): Readonly<{ up: Vector3; tangentX: Vector3; tangentY: Vector3 }> {
        return this.m_surfaceFrame;
    }

    /**
     * Builds a flat polygon in a local tangent frame.
     *
     * The frame is derived from the projection itself: projecting the same point
     * twice, one meter apart in altitude, yields the local up vector. This is the
     * only definition that works for every projection — deriving "up" as
     * `lookAt(worldOrigin → centroid)` (the original port) is a vertical curtain
     * on flat projections such as web mercator, because there the world origin is
     * not the earth centre.
     */
    private updateGeometry(): void {
        // Clean up old geometry
        if (this.geometry) {
            this.geometry.dispose();
        }

        const centroid = turf.centroid(this.m_feature as any);
        const {
            geometry: { coordinates: centroidCoordinates }
        } = centroid;
        const longitude = centroidCoordinates[0];
        const latitude = centroidCoordinates[1];

        const anchor = new GeoCoordinates(latitude, longitude, this.m_altitude);
        this.anchor = anchor;

        const center = this.m_projection.projectPoint(anchor, new Vector3());
        const upSample = this.m_projection.projectPoint(
            new GeoCoordinates(latitude, longitude, this.m_altitude + 1),
            new Vector3()
        );
        const up = upSample.sub(center).normalize();
        if (up.lengthSq() === 0) {
            up.set(0, 1, 0);
        }

        // Arbitrary but stable tangent basis: pick a reference axis that is not
        // parallel to `up`, then build a right-handed frame around it.
        const reference = Math.abs(up.z) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
        const axisX = new Vector3().crossVectors(reference, up).normalize();
        const axisY = new Vector3().crossVectors(up, axisX).normalize();

        const {
            geometry: { coordinates: featureCoordinates }
        } = this.m_feature as { geometry: TurfPolygon };

        const outerRing = featureCoordinates[0] as Position[];
        const holes = featureCoordinates.slice(1) as Position[][];

        const toLocal = (coord: Position): Vector3 => {
            const world = this.m_projection
                .projectPoint(
                    new GeoCoordinates(coord[1], coord[0], this.m_altitude),
                    new Vector3()
                )
                .sub(center);
            return new Vector3(world.dot(axisX), world.dot(axisY), world.dot(up));
        };

        const outerVertices = outerRing.map(toLocal);
        const holeVertices = holes.map(ring => ring.map(toLocal));
        const vertices = outerVertices.concat(...holeVertices);

        // Triangulation in the local XY plane
        const outer2D = outerVertices.map(vertex => new Vector2(vertex.x, vertex.y));
        const holes2D = holeVertices.map(ring =>
            ring.map(vertex => new Vector2(vertex.x, vertex.y))
        );
        const indices = ShapeUtils.triangulateShape(outer2D, holes2D);
        const uindices = new Uint32Array(indices.length * 3);

        for (let i = 0, j = 0; i < indices.length; i++, j += 3) {
            uindices[j] = indices[i][0];
            uindices[j + 1] = indices[i][1];
            uindices[j + 2] = indices[i][2];
        }

        // Create vertex buffer
        const positionBuffer: number[] = [];
        const box = new Box3();

        for (const vertex of vertices) {
            positionBuffer.push(vertex.x, vertex.y, vertex.z);
            box.expandByPoint(vertex);
        }

        // Create UV coordinates
        const uvBuffer: number[] = [];
        const size = box.getSize(new Vector3());

        for (const vertex of vertices) {
            uvBuffer.push(
                size.x === 0 ? 0 : (vertex.x - box.min.x) / size.x,
                size.y === 0 ? 0 : (vertex.y - box.min.y) / size.y
            );
        }

        // Create new geometry
        const geometry = new BufferGeometry();

        const positionAttribute = new BufferAttribute(new Float32Array(positionBuffer), 3);
        const uvAttribute = new BufferAttribute(new Float32Array(uvBuffer), 2);
        const indexAttribute = new BufferAttribute(uindices, 1);

        geometry.setIndex(indexAttribute);
        geometry.setAttribute("position", positionAttribute);
        geometry.setAttribute("uv", uvAttribute);
        geometry.computeVertexNormals();

        this.geometry = geometry;

        // Orient the mesh so its local +Z is the projection's up vector. Map
        // anchors only set the position, so this rotation survives each frame.
        this.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(axisX, axisY, up));

        this.m_surfaceFrame.up.copy(up);
        this.m_surfaceFrame.tangentX.copy(axisX);
        this.m_surfaceFrame.tangentY.copy(axisY);

        // Save feature data
        this.userData = {
            feature: {
                ...this.m_feature,
                geometryType: "polygon" as const
            }
        };
    }

    dispose(): void {
        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.material) {
            if (Array.isArray(this.material)) {
                this.material.forEach(material => {
                    material.dispose();
                });
            } else {
                this.material.dispose();
            }
        }
    }
}
