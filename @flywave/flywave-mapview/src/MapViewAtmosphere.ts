/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme } from "@flywave/flywave-datasource-protocol";
import { type Projection, EarthConstants, ProjectionType } from "@flywave/flywave-geoutils";
import { GroundAtmosphereMaterial, SkyAtmosphereMaterial } from "@flywave/flywave-materials";
import { assert } from "@flywave/flywave-utils";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { type MapAnchor, type MapAnchors } from "./MapAnchors";

export const ATMOSPHERE_SKY_RENDER_ORDER = Number.MIN_SAFE_INTEGER;
export const ATMOSPHERE_GROUND_RENDER_ORDER = Number.MIN_SAFE_INTEGER;

export enum AtmosphereVariant {
    Ground = 0x1,
    Sky = 0x2,
    SkyAndGround = 0x3
}

export enum AtmosphereShadingVariant {
    ScatteringShader,
    SimpleColor,
    Wireframe
}

export enum AtmosphereLightMode {
    LightOverhead = 0,
    LightDynamic = 1
}

export enum AtmosphereBackend {
    Legacy = "legacy",
    Bruneton = "bruneton"
}

const SKY_ATMOSPHERE_ALTITUDE_FACTOR = 0.025;
const GROUND_ATMOSPHERE_ALTITUDE_FACTOR = 0.0001;

const cache = {
    clipPlanes: { near: 0, far: 0 }
};

export class MapViewAtmosphere {
    static SkyAtmosphereUserName: string = "SkyAtmosphere";
    static GroundAtmosphereUserName: string = "GroundAtmosphere";

    static isPresent(mapAnchors: MapAnchors): boolean {
        for (const mapAnchor of mapAnchors.children) {
            if (
                mapAnchor.name === MapViewAtmosphere.SkyAtmosphereUserName ||
                mapAnchor.name === MapViewAtmosphere.GroundAtmosphereUserName
            ) {
                return true;
            }
        }
        return false;
    }

    private m_enabled: boolean = true;
    private m_skyGeometry?: THREE.BufferGeometry;
    private m_skyMaterial?: THREE.Material;
    private m_skyMesh?: THREE.Mesh;
    private m_groundGeometry?: THREE.BufferGeometry;
    private m_groundMaterial?: THREE.Material;
    private m_groundMesh?: THREE.Mesh;

    private readonly m_clipPlanesEvaluator = new TiltViewClipPlanesEvaluator(
        EarthConstants.EQUATORIAL_RADIUS * SKY_ATMOSPHERE_ALTITUDE_FACTOR,
        0,
        1.0,
        0.05,
        10000000.0
    );

    private readonly m_lightDirection = new THREE.Vector3(0.0, 1.0, 0.0);

    get lightDirection() {
        return this.m_lightDirection;
    }

    private readonly m_backend: AtmosphereBackend;

    constructor(
        private readonly m_mapAnchors: MapAnchors,
        private readonly m_sceneCamera: THREE.Camera,
        private readonly m_projection: Projection,
        private readonly m_rendererCapabilities: THREE.WebGLCapabilities,
        private readonly m_updateCallback?: () => void,
        private readonly m_atmosphereVariant: AtmosphereVariant = AtmosphereVariant.SkyAndGround,
        private readonly m_materialVariant = AtmosphereShadingVariant.ScatteringShader,
        backend: AtmosphereBackend = AtmosphereBackend.Legacy
    ) {
        this.m_backend = backend;

        if (backend === AtmosphereBackend.Legacy) {
            if (this.m_atmosphereVariant & AtmosphereVariant.Sky) {
                this.createSkyGeometry();
            }
            if (this.m_atmosphereVariant & AtmosphereVariant.Ground) {
                this.createGroundGeometry();
            }
            this.addToMapAnchors(this.m_mapAnchors);
        }
    }

    get backend(): AtmosphereBackend {
        return this.m_backend;
    }

    get skyMesh(): THREE.Mesh | undefined {
        return this.m_skyMesh;
    }

    get groundMesh(): THREE.Mesh | undefined {
        return this.m_groundMesh;
    }

    set enabled(enable: boolean) {
        if (this.disposed) {
            return;
        }
        if (this.m_enabled === enable) {
            return;
        }
        this.m_enabled = enable;
        if (this.m_backend === AtmosphereBackend.Legacy) {
            const isAdded = MapViewAtmosphere.isPresent(this.m_mapAnchors);
            if (enable && !isAdded) {
                this.addToMapAnchors(this.m_mapAnchors);
            } else if (!enable && isAdded) {
                this.removeFromMapAnchors(this.m_mapAnchors);
            }
        }
    }

    get enabled(): boolean {
        return this.m_enabled;
    }

    set lightMode(lightMode: AtmosphereLightMode) {
        if (this.m_backend === AtmosphereBackend.Bruneton) {
            return;
        }
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            return;
        }
        const dynamicLight = lightMode === AtmosphereLightMode.LightDynamic;
        if (this.m_groundMaterial !== undefined) {
            const groundMat = this.m_groundMaterial as GroundAtmosphereMaterial;
            groundMat.setDynamicLighting(dynamicLight);
        }
        if (this.m_skyMaterial !== undefined) {
            const skyMat = this.m_skyMaterial as SkyAtmosphereMaterial;
            skyMat.setDynamicLighting(dynamicLight);
        }
    }

    setLightDirection(lightDirection: THREE.Vector3): void {
        this.m_lightDirection.copy(lightDirection);

        if (this.m_backend === AtmosphereBackend.Bruneton) {
            return;
        }
        if (this.m_groundMaterial instanceof GroundAtmosphereMaterial) {
            this.m_groundMaterial.setDynamicLighting(true);
        }
        if (this.m_skyMaterial instanceof SkyAtmosphereMaterial) {
            this.m_skyMaterial.setDynamicLighting(true);
        }
    }

    dispose() {
        if (this.enabled) {
            this.enabled = false;
        }

        this.m_skyMaterial?.dispose();
        this.m_groundMaterial?.dispose();

        this.m_skyGeometry?.dispose();
        this.m_groundGeometry?.dispose();

        this.m_skyGeometry = undefined;
        this.m_groundGeometry = undefined;

        this.m_skyMaterial = undefined;
        this.m_groundMaterial = undefined;

        this.m_skyMesh = undefined;
        this.m_groundMesh = undefined;
    }

    reset(theme: Theme) {}

    private get disposed() {
        return this.m_backend === AtmosphereBackend.Bruneton
            ? true
            : this.m_skyMesh === undefined && this.m_groundMesh === undefined;
    }

    private addToMapAnchors(mapAnchors: MapAnchors) {
        assert(!MapViewAtmosphere.isPresent(mapAnchors), "Atmosphere already added");
        if (this.m_skyMesh !== undefined) {
            mapAnchors.add(createMapAnchor(this.m_skyMesh, ATMOSPHERE_GROUND_RENDER_ORDER));
        }
        if (this.m_groundMesh !== undefined) {
            mapAnchors.add(createMapAnchor(this.m_groundMesh, ATMOSPHERE_SKY_RENDER_ORDER));
        }

        if (this.m_updateCallback) {
            this.m_updateCallback();
        }
    }

    private removeFromMapAnchors(mapAnchors: MapAnchors) {
        if (!MapViewAtmosphere.isPresent(mapAnchors)) {
            return;
        }
        let update = false;
        if (this.m_skyMesh !== undefined) {
            mapAnchors.remove(this.m_skyMesh);
            update = true;
        }
        if (this.m_groundMesh !== undefined) {
            mapAnchors.remove(this.m_groundMesh);
            update = true;
        }
        if (update && this.m_updateCallback) {
            this.m_updateCallback();
        }
    }

    private createSkyGeometry() {
        switch (this.m_projection.type) {
            case ProjectionType.Spherical:
                this.m_skyGeometry = new THREE.SphereGeometry(
                    EarthConstants.EQUATORIAL_RADIUS * (1 + SKY_ATMOSPHERE_ALTITUDE_FACTOR),
                    256,
                    256
                );
                break;
            default: {
                this.m_skyGeometry = new THREE.PlaneGeometry(200, 200);
                break;
            }
        }

        this.m_skyGeometry.translate(0, 0, 0);

        if (this.m_materialVariant === AtmosphereShadingVariant.ScatteringShader) {
            this.m_skyMaterial = new SkyAtmosphereMaterial({
                rendererCapabilities: this.m_rendererCapabilities
            });
        } else if (this.m_materialVariant === AtmosphereShadingVariant.SimpleColor) {
            this.m_skyMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0xc4f8ed),
                opacity: 0.4,
                transparent: false,
                depthTest: true,
                depthWrite: false,
                side: THREE.BackSide,
                blending: THREE.NormalBlending,
                fog: false
            });
        } else {
            this.m_skyMaterial = new THREE.MeshStandardMaterial({
                color: 0x7fffff,
                depthTest: false,
                depthWrite: false,
                normalScale: new THREE.Vector2(-1, -1),
                side: THREE.BackSide,
                wireframe: true
            });
        }

        this.m_skyMesh = new THREE.Mesh(this.m_skyGeometry, this.m_skyMaterial);
        this.m_skyMesh.name = MapViewAtmosphere.SkyAtmosphereUserName;
        this.setupSkyForRendering();
    }

    private createGroundGeometry() {
        switch (this.m_projection.type) {
            case ProjectionType.Spherical:
                this.m_groundGeometry = new THREE.SphereGeometry(
                    EarthConstants.EQUATORIAL_RADIUS * (1 + GROUND_ATMOSPHERE_ALTITUDE_FACTOR),
                    256,
                    256
                );
                break;
            default: {
                this.m_groundGeometry = new THREE.PlaneGeometry(200, 200);
                break;
            }
        }
        this.m_groundGeometry.translate(0, 0, 0);

        if (this.m_materialVariant === AtmosphereShadingVariant.ScatteringShader) {
            this.m_groundMaterial = new GroundAtmosphereMaterial({
                rendererCapabilities: this.m_rendererCapabilities
            });
        } else if (this.m_materialVariant === AtmosphereShadingVariant.SimpleColor) {
            this.m_groundMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0x00c5ff),
                opacity: 0.4,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.FrontSide,
                blending: THREE.NormalBlending,
                fog: false
            });
        } else {
            this.m_groundMaterial = new THREE.MeshStandardMaterial({
                color: 0x11899a,
                depthTest: true,
                depthWrite: false,
                side: THREE.FrontSide,
                wireframe: true
            });
        }

        this.m_groundMesh = new THREE.Mesh(this.m_groundGeometry, this.m_groundMaterial);
        this.m_groundMesh.name = MapViewAtmosphere.GroundAtmosphereUserName;
        this.setupGroundForRendering();
    }

    private setupSkyForRendering(): void {
        if (this.m_skyMesh === undefined) {
            return;
        }
        let onBeforeCallback: (_camera: THREE.Camera, _material: THREE.Material) => void;
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            onBeforeCallback = (camera: THREE.Camera, _material: THREE.Material) => {
                this.overrideClipPlanes(camera);
            };
        } else {
            onBeforeCallback = (camera: THREE.Camera, material: THREE.Material) => {
                this.overrideClipPlanes(camera);
                if (material instanceof SkyAtmosphereMaterial) {
                    assert(material instanceof SkyAtmosphereMaterial);
                    const mat = this.m_skyMaterial as SkyAtmosphereMaterial;
                    mat.updateUniforms(mat, this.m_skyMesh!, camera, this.m_lightDirection);
                }
            };
        }

        assert(this.m_skyMaterial !== undefined);
        this.m_skyMesh.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.BufferGeometry,
            material: THREE.Material,
            _group: THREE.Group
        ) => {
            onBeforeCallback(camera, material);
        };

        this.m_skyMesh.onAfterRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.BufferGeometry,
            _material: THREE.Material,
            _group: THREE.Group
        ) => {
            this.revertClipPlanes(camera);
        };
    }

    private setupGroundForRendering(): void {
        if (this.m_groundMesh === undefined) {
            return;
        }
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            return;
        }
        assert(this.m_groundMaterial !== undefined);
        this.m_groundMesh.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.BufferGeometry,
            material: THREE.Material,
            _group: THREE.Group
        ) => {
            if (material instanceof GroundAtmosphereMaterial) {
                assert(material instanceof GroundAtmosphereMaterial);
                const mat = this.m_groundMaterial as GroundAtmosphereMaterial;
                mat.updateUniforms(mat, this.m_groundMesh!, camera, this.m_lightDirection);
            }
        };
    }

    private overrideClipPlanes(rteCamera: THREE.Camera) {
        const sceneCam = this.m_sceneCamera as THREE.PerspectiveCamera;
        cache.clipPlanes.near = sceneCam.near;
        cache.clipPlanes.far = sceneCam.far;
        const viewRanges = this.m_clipPlanesEvaluator.evaluateClipPlanes(
            this.m_sceneCamera,
            this.m_projection,
            undefined,
            this.m_rendererCapabilities.logarithmicDepthBuffer
        );
        assert(rteCamera instanceof THREE.PerspectiveCamera);
        const c = rteCamera as THREE.PerspectiveCamera;
        c.near = viewRanges.near;
        c.far = viewRanges.far + EarthConstants.EQUATORIAL_RADIUS * 0.5;
        c.updateProjectionMatrix();
    }

    private revertClipPlanes(rteCamera: THREE.Camera) {
        assert(rteCamera instanceof THREE.PerspectiveCamera);
        const c = rteCamera as THREE.PerspectiveCamera;
        c.near = cache.clipPlanes.near;
        c.far = cache.clipPlanes.far;
        c.updateProjectionMatrix();
    }
}

function createMapAnchor(mesh: THREE.Mesh, renderOrder: number): MapAnchor<THREE.Mesh> {
    const anchor = mesh as MapAnchor<THREE.Mesh>;
    anchor.renderOrder = renderOrder;
    anchor.pickable = false;
    anchor.anchor = new THREE.Vector3(0, 0, 0);
    return anchor;
}
