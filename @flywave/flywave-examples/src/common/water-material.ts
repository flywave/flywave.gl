/* Copyright (C) 2025 flywave.gl contributors */

import { type Feature, GeoCoordinates } from "@flywave/flywave.gl";
import { type Polygon as TurfPolygon, type Position } from "@turf/turf";
import * as turf from "@turf/turf";
import {
    cameraPosition,
    dot,
    float,
    length,
    max,
    mix,
    mul,
    normalize,
    positionGeometry,
    positionWorld,
    pow,
    reflect,
    texture,
    time,
    uniform,
    vec2,
    vec3
} from "three/tsl";
import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    Color,
    DataTexture,
    type Material,
    Mesh,
    type Matrix4,
    NodeMaterial,
    Object3D,
    RepeatWrapping,
    RGBAFormat,
    ShapeUtils,
    Texture,
    TextureLoader,
    UnsignedByteType,
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
    /** Scale of the normal-map based distortion with distance. Default `20.0`. */
    distortionScale?: number;
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
        const uSize = uniform(2.0) as any;
        const uSunColor = uniform(new Color(options.sunColor ?? 0xffffff)) as any;
        const uSunDirection = uniform(
            options.sunDirection ?? new Vector3(0.70707, 0.70707, 0.0)
        ) as any;
        const uWaterColor = uniform(new Color(options.waterColor ?? 0x555555)) as any;
        const uDistortionScale = uniform(options.distortionScale ?? 20.0) as any;

        const uv = positionGeometry.xy.mul(uSize);

        const uv0 = uv.div(103).add(vec2(time.div(17), time.div(29)));
        const uv1 = uv.div(107).sub(vec2(time.div(-19), time.div(31)));
        const uv2 = uv.div(vec2(8907.0, 9803.0)).add(vec2(time.div(101), time.div(97)));
        const uv3 = uv.div(vec2(1091.0, 1027.0)).sub(vec2(time.div(109), time.div(-113)));

        const noise = normalTexNode
            .sample(uv0)
            .add(normalTexNode.sample(uv1))
            .add(normalTexNode.sample(uv2))
            .add(normalTexNode.sample(uv3))
            .mul(0.5)
            .sub(1.0);

        const surfaceNormal = normalize(noise.xzy.mul(vec3(1.5, 1.5, 1.5)));

        const worldToEye = cameraPosition.sub(positionWorld);
        const eyeDirection = normalize(
            vec3(-0.22354059905927112, 0.8579892843484154, -0.46247593290409833)
        );

        const negSunDir = mul(normalize(uSunDirection), -1);
        // TODO(tsc): `reflect` overload resolution fails without the assertion.
        const reflection = normalize((reflect as any)(negSunDir, surfaceNormal));
        const direction = max(0.0, dot(eyeDirection, reflection));
        const specularColor = pow(direction, float(100)).mul(uSunColor).mul(2.0);
        const diffuseColor = max(0.0, dot(normalize(uSunDirection), surfaceNormal))
            .mul(uSunColor)
            .mul(0.5);

        const distance = length(worldToEye);
        const distFactor = float(0.001).add(float(1.0).div(distance)).mul(uDistortionScale);
        const distortion = surfaceNormal.xz.mul(distFactor);

        const theta = max(dot(eyeDirection, surfaceNormal), 0.1);
        const rf0 = float(0.3);
        const reflectance = rf0.add(
            float(1.0)
                .sub(rf0)
                .mul(pow(float(1.0).sub(theta), 5.0))
        );

        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(uWaterColor);
        const diffuseLight = uSunColor.mul(diffuseColor).mul(0.3).add(scatter);

        const albedo = mix(diffuseLight, vec3(0.1).add(specularColor), reflectance);

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

    constructor(feature: Feature, projection: IProjection, material: Material) {
        const geometry = new BufferGeometry();
        super(geometry, material);

        this.m_feature = feature;
        this.m_projection = projection;

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

    private updateGeometry(): void {
        // Clean up old geometry
        if (this.geometry) {
            this.geometry.dispose();
        }

        const centroid = turf.centroid(this.m_feature as any);
        const {
            geometry: { coordinates }
        } = centroid;
        this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], 0);

        const position = this.m_projection.projectPoint(
            this.anchor as GeoCoordinates,
            new Vector3()
        );
        const {
            geometry: { coordinates: featureCoordinates }
        } = this.m_feature as { geometry: TurfPolygon };

        // Process polygon coordinates (may contain holes, we only take the outer ring)
        const outLine = featureCoordinates[0] as Position[];

        // Generate vertices
        const vertices: Vector3[] = outLine.map((coord: Position) => {
            const geoCoord = new GeoCoordinates(coord[1], coord[0], coord[2] || 0);
            return this.m_projection.projectPoint(geoCoord, new Vector3()).sub(position);
        });

        // Triangulation
        const indices = ShapeUtils.triangulateShape(vertices, []);
        const uindices = new Uint16Array(indices.length * 3);

        for (let i = 0, j = 0; i < indices.length; i++, j += 3) {
            uindices[j] = indices[i][0];
            uindices[j + 1] = indices[i][1];
            uindices[j + 2] = indices[i][2];
        }

        // Coordinate transformation
        const mat = new Object3D();
        mat.lookAt(position);
        mat.updateMatrixWorld();
        const invert = mat.matrixWorld.clone().invert();

        // Create vertex buffer
        const positionBuffer: number[] = [];
        const box = new Box3();

        for (let i = 0; i < vertices.length; i++) {
            const vertex = vertices[i].clone().applyMatrix4(invert);
            positionBuffer.push(vertex.x, vertex.y, vertex.z);
            box.expandByPoint(vertex);
        }

        // Create UV coordinates
        const uvBuffer: number[] = [];
        const size = box.getSize(new Vector3());

        for (let i = 0; i < vertices.length; i++) {
            const coord = vertices[i].clone().applyMatrix4(invert).sub(box.min);
            uvBuffer.push(coord.x / size.x, coord.y / size.y);
        }

        // Create new geometry
        const geometry = new BufferGeometry();

        const positionAttribute = new BufferAttribute(new Float32Array(positionBuffer), 3);
        const uvAttribute = new BufferAttribute(new Float32Array(uvBuffer), 2);
        const indexAttribute = new BufferAttribute(uindices, 1);

        geometry.setIndex(indexAttribute);
        geometry.setAttribute("position", positionAttribute);
        geometry.setAttribute("uv", uvAttribute);

        this.geometry = geometry;
        this.lookAt(position);

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
