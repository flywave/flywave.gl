/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme } from "@flywave/flywave-datasource-protocol";
import { type Projection, EarthConstants, ProjectionType } from "@flywave/flywave-geoutils";
import {
    GroundAtmosphereMaterial,
    SkyAtmosphereMaterial
} from "@flywave/flywave-materials";
import { assert } from "@flywave/flywave-utils";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { type MapAnchor, type MapAnchors } from "./MapAnchors";

export  const ATMOSPHERE_SKY_RENDER_ORDER = Number.MIN_SAFE_INTEGER;
export  const ATMOSPHERE_GROUND_RENDER_ORDER = Number.MIN_SAFE_INTEGER;
/**
 * Atmosphere effect variants.
 */
export enum AtmosphereVariant {
    Ground = 0x1,
    Sky = 0x2,
    SkyAndGround = 0x3
}

/**
 * Atmosphere shader variants.
 */
export enum AtmosphereShadingVariant {
    ScatteringShader,
    SimpleColor,
    Wireframe
}

/**
 * Lists light modes.
 */
export enum AtmosphereLightMode {
    LightOverhead = 0,
    LightDynamic = 1
}

/**
 * Maximum altitude that atmosphere reaches as the percent of the Earth radius.
 */
const SKY_ATMOSPHERE_ALTITUDE_FACTOR = 0.025;

/**
 * Maximum altitude that ground atmosphere is visible as the percent of the Earth radius.
 */
const GROUND_ATMOSPHERE_ALTITUDE_FACTOR = 0.0001;

/**
 * Utility cache for holding temporary values.
 */
const cache = {
    clipPlanes: { near: 0, far: 0 }
};

/**
 * Class that provides {@link MapView}'s atmospheric scattering effect.
 */
export class MapViewAtmosphere {
    /**
     * User data name attribute assigned to created mesh.
     */
    static SkyAtmosphereUserName: string = "SkyAtmosphere";
    /**
     * User data name attribute assigned to created mesh.
     */
    static GroundAtmosphereUserName: string = "GroundAtmosphere";

    /**
     * Check if map anchors have already atmosphere effect added.
     *
     * @param mapAnchors - MapAnchors to check.
     */
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
    // TODO: Support for Theme definition should be added.
    //private m_cachedTheme: Theme = { styles: {} };

    private readonly m_lightDirection = new THREE.Vector3(0.0, 1.0, 0.0);

    get lightDirection() {
        return this.m_lightDirection;
    }

    /**
     * Creates and adds `Atmosphere` effects to the scene.
     *
     * @note Currently works only with globe projection.
     *
     * @param m_mapAnchors - The {@link MapAnchors} instance where the effect will be added.
     * @param m_sceneCamera - The camera used to render entire scene.
     * @param m_projection - The geo-projection used to transform geo coordinates to
     *                       cartesian space.
     * @param m_rendererCapabilities The capabilities of the WebGL renderer.
     * @param m_updateCallback - The optional callback to that should be called whenever atmosphere
     * configuration changes, may be used to inform related components (`MapView`) to redraw.
     * @param m_atmosphereVariant - The optional atmosphere configuration variant enum
     * [[AtmosphereVariant]], which denotes where the atmosphere scattering effect should be
     * applied, it may be ground or sky atmosphere only or most realistic for both, which is
     * chosen by default.
     * @param m_materialVariant - The optional material variant to be used, mainly for
     * testing and tweaking purposes.
     */
    constructor(
        private readonly m_mapAnchors: MapAnchors,
        private readonly m_sceneCamera: THREE.Camera,
        private readonly m_projection: Projection,
        private readonly m_rendererCapabilities: THREE.WebGLCapabilities,
        private readonly m_updateCallback?: () => void,
        private readonly m_atmosphereVariant: AtmosphereVariant = AtmosphereVariant.SkyAndGround,
        private readonly m_materialVariant = AtmosphereShadingVariant.ScatteringShader
    ) {
        // 初始化大气散射管理器
        // this.initializeAtmosphericScatteringManager();

        if (this.m_atmosphereVariant & AtmosphereVariant.Sky) {
            this.createSkyGeometry();
        }
        if (this.m_atmosphereVariant & AtmosphereVariant.Ground) {
            this.createGroundGeometry();
        }
        this.addToMapAnchors(this.m_mapAnchors);
    }

    get skyMesh(): THREE.Mesh | undefined {
        return this.m_skyMesh;
    }

    get groundMesh(): THREE.Mesh | undefined {
        return this.m_groundMesh;
    }

    /**
     * Allows to enable/disable the atmosphere effect, regardless of the theme settings.
     *
     * Use this method to change the setup in runtime without defining corresponding theme setup.
     *
     * @param enable - A boolean that specifies whether the atmosphere should be enabled or
     *                 disabled.
     */
    set enabled(enable: boolean) {
        // Check already disposed.
        if (this.disposed) {
            return;
        }
        if (this.m_enabled === enable) {
            return;
        }
        this.m_enabled = enable;
        const isAdded = MapViewAtmosphere.isPresent(this.m_mapAnchors);
        if (enable && !isAdded) {
            this.addToMapAnchors(this.m_mapAnchors);
        } else if (!enable && isAdded) {
            this.removeFromMapAnchors(this.m_mapAnchors);
        }
    }

    /**
     * Returns the current atmosphere status, enabled or disabled.
     */
    get enabled(): boolean {
        return this.m_enabled;
    }

    set lightMode(lightMode: AtmosphereLightMode) {
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

        // // 更新大气散射管理器中的光照方向
        // if (dynamicLight) {
        //     this.m_atmosphericScatteringManager.parameters = {
        //         lightDirection: this.m_lightDirection
        //     };
        // }
    }

    /**
     * 更新光照方向
     * @param lightDirection 新的光照方向
     */
    setLightDirection(lightDirection: THREE.Vector3): void {
        this.m_lightDirection.copy(lightDirection);

        // // 更新大气散射管理器中的光照方向
        // this.m_atmosphericScatteringManager.parameters = {
        //     lightDirection: this.m_lightDirection
        // };

        // 如果启用了动态光照，也更新材质
        if (this.m_groundMaterial instanceof GroundAtmosphereMaterial) {
            this.m_groundMaterial.setDynamicLighting(true);
        }
        if (this.m_skyMaterial instanceof SkyAtmosphereMaterial) {
            this.m_skyMaterial.setDynamicLighting(true);
        }
    }
  
    /**
     * Disposes allocated resources.
     */
    dispose() {
        // Unlink from scene and mapview anchors
        if (this.enabled) {
            this.enabled = false;
        }

        this.m_skyMaterial?.dispose();
        this.m_groundMaterial?.dispose();

        this.m_skyGeometry?.dispose();
        this.m_groundGeometry?.dispose();

        // After disposal we may no longer enable effect.
        this.m_skyGeometry = undefined;
        this.m_groundGeometry = undefined;

        this.m_skyMaterial = undefined;
        this.m_groundMaterial = undefined;

        this.m_skyMesh = undefined;
        this.m_groundMesh = undefined;
    }

    /**
     * Sets the atmosphere depending on the
     * {@link @flywave/flywave-datasource-protocol#Theme} instance provided.
     *
     * This function is called when a theme is loaded. Atmosphere is added only if the theme
     * contains a atmosphere definition with a:
     * - `color` property, used to set the atmosphere color.
     *
     * @param theme - A {@link @flywave/flywave-datasource-protocol#Theme} instance.
     */
    reset(theme: Theme) {
        //this.m_cachedTheme = theme;
    }

    private get disposed() {
        return this.m_skyMesh === undefined && this.m_groundMesh === undefined;
    }

    /**
     * Handles atmosphere effect adding.
     */
    private addToMapAnchors(mapAnchors: MapAnchors) {
        assert(!MapViewAtmosphere.isPresent(mapAnchors), "Atmosphere already added");
        if (this.m_skyMesh !== undefined) {
            mapAnchors.add(createMapAnchor(this.m_skyMesh, ATMOSPHERE_GROUND_RENDER_ORDER));
        }
        if (this.m_groundMesh !== undefined) {
            mapAnchors.add(createMapAnchor(this.m_groundMesh, ATMOSPHERE_SKY_RENDER_ORDER));
        }

        // Request an update once the anchor is added to {@link MapView}.
        if (this.m_updateCallback) {
            this.m_updateCallback();
        }
    }

    /**
     * Handles atmosphere effect removal.
     */
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
                depthTest: true, // hide atmosphere behind globe (note: transparent changes order)
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
                side: THREE.BackSide, // not truly supported in wireframe mode
                wireframe: true
            });
        }

        this.m_skyMesh = new THREE.Mesh(this.m_skyGeometry, this.m_skyMaterial);
        // Assign custom name so sky object may be easily recognized withing the scene.
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
                depthTest: true, // FrontSide is not fully supported, so need depth test
                depthWrite: false,
                side: THREE.FrontSide,
                wireframe: true
            });
        }

        this.m_groundMesh = new THREE.Mesh(this.m_groundGeometry, this.m_groundMaterial);
        // Assign name so object may be recognized withing the scene.
        this.m_groundMesh.name = MapViewAtmosphere.GroundAtmosphereUserName;

        this.setupGroundForRendering();
    }

    private setupSkyForRendering(): void {
        if (this.m_skyMesh === undefined) {
            return;
        }
        // Depending on material variant we need to update uniforms or only
        // update camera near/far planes cause camera need to see further then
        // actual earth geometry.
        let onBeforeCallback: (_camera: THREE.Camera, _material: THREE.Material) => void;
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            // Setup only further clip planes before rendering.
            onBeforeCallback = (camera: THREE.Camera, _material: THREE.Material) => {
                this.overrideClipPlanes(camera);
            };
        } else {
            // Setup proper clip planes and update uniforms values.
            onBeforeCallback = (camera: THREE.Camera, material: THREE.Material) => {
                this.overrideClipPlanes(camera);
                // Check material wasn't swapped.
                if (material instanceof SkyAtmosphereMaterial) {
                    assert(material instanceof SkyAtmosphereMaterial);
                    const mat = this.m_skyMaterial as SkyAtmosphereMaterial;
                    mat.updateUniforms(mat, this.m_skyMesh!, camera, this.m_lightDirection);
                }
            };
        }

        // Sky material should be already created with mesh.
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
        // Ground material should be already created.
        assert(this.m_groundMaterial !== undefined);
        // Ground mesh does not need custom clip planes and uses the same camera setup as
        // real (data source based) geometry.
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
        // Store current clip planes used by global camera before modifying them.
        const sceneCam = this.m_sceneCamera as THREE.PerspectiveCamera;
        cache.clipPlanes.near = sceneCam.near;
        cache.clipPlanes.far = sceneCam.far;
        // Calculate view ranges using world camera.
        // NOTE: ElevationProvider is not passed to evaluator, leaves min/max altitudes unchanged.
        const viewRanges = this.m_clipPlanesEvaluator.evaluateClipPlanes(
            this.m_sceneCamera,
            this.m_projection,
            undefined,
            this.m_rendererCapabilities.logarithmicDepthBuffer
        );
        // Update relative to eye camera used internally in rendering.
        assert(rteCamera instanceof THREE.PerspectiveCamera);
        const c = rteCamera as THREE.PerspectiveCamera;
        c.near = viewRanges.near;
        // Small margin ensures that we never cull small triangles just below or at
        // horizon - possible due to frustum culling in-precisions.
        c.far = viewRanges.far + EarthConstants.EQUATORIAL_RADIUS * 0.5;
        c.updateProjectionMatrix();
    }

    private revertClipPlanes(rteCamera: THREE.Camera) {
        assert(rteCamera instanceof THREE.PerspectiveCamera);
        const c = rteCamera as THREE.PerspectiveCamera;
        // Restore scene camera clip planes.
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
