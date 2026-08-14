// @ts-nocheck
import * as THREE from "three/webgpu";
import { RenderPipeline, type Renderer, NodeMaterial, MeshBasicNodeMaterial } from "three/webgpu";
import {
    float,
    mrt,
    output,
    pass,
    positionView,
    uniform,
    vec4,
    vec3,
    Fn,
    depth,
    normalView,
    attribute,
    min,
    texture,
    vec2,
    floor,
    positionLocal,
    modelViewMatrix,
    cameraProjectionMatrix,
    modelWorldMatrix,
    cameraViewMatrix
} from "three/tsl";

import type { CascadedShadowMapsNode } from "@flywave/flywave-atmosphere";

import {
    dithering,
    lensFlare,
    aerialPerspective,
    convertToTexture,
    agxPunchyToneMapping,
    temporalAntialias,
    highpVelocity,
    shadowLength,
    cloudRender,
    type CloudRenderNode,
    type LensFlareNode,
    type AerialPerspectiveNode,
    type TemporalAntialiasNode
} from "@flywave/flywave-atmosphere";

import { smaaWrapped } from "@flywave/flywave-atmosphere";

import type { IViewRenderConfig, IViewRenderManager, ILensFlareConfig } from "./ViewRenderTypes";
import { vignette } from "./effects/vignette";
import { brightnessContrast, hueSaturation, sepia } from "./effects/colorGrading";
import { bloom } from "./effects/bloom";
import { outline } from "./effects/outline";
import {
    TranslucentLayerEffect,
    TRANSLUCENT_LAYER_BIT,
    SPLAT_DEPTH_LAYER_BIT
} from "./TranslucentLayerEffect";

interface DepthSlot {
    /** Pixel the cached invW was read from, in render-target pixels. */
    px: number;
    py: number;
    invW: number | null;
    inFlight: boolean;
    camPos: THREE.Vector3;
    camDir: THREE.Vector3;
}

function createDepthSlot(): DepthSlot {
    return {
        px: -1,
        py: -1,
        invW: null,
        inFlight: false,
        camPos: new THREE.Vector3(),
        camDir: new THREE.Vector3()
    };
}

export class ViewRenderManager implements IViewRenderManager {
    readonly config: IViewRenderConfig = {
        aerialPerspective: { enabled: false },
        bloom: { enabled: false, intensity: 0.05, radius: 0.5, threshold: 0.5 },
        vignette: { enabled: false, offset: 1, darkness: 1 },
        brightnessContrast: { enabled: false, brightness: 0, contrast: 0 },
        hueSaturation: { enabled: false, hue: 0, saturation: 0 },
        sepia: { enabled: false, amount: 0 },
        outline: { enabled: false, thickness: 0.002, color: "#ffffff" },
        taa: { enabled: false },
        clouds: { enabled: false },
        antialiasing: "taa",
        lensFlare: {
            enabled: true,
            bloomIntensity: 0.005,
            ghostIntensity: 1e-5,
            haloIntensity: 1e-5,
            glareIntensity: 1e-5
        },
        toneMappingMode: "agx-punchy"
    };

    needsUpdate: boolean = true;

    private pipeline?: RenderPipeline;
    private passNode?: ReturnType<typeof pass>;
    private buildingColorPassNode?: ReturnType<typeof pass>;
    private lensFlareNode?: LensFlareNode;
    private aerialNode?: AerialPerspectiveNode;
    private m_cloudNode?: CloudRenderNode;
    private pendingCloudConfig?: Record<string, unknown>;
    /**
     * Called once the cloud render node finishes its async texture load and is
     * ready to accept config. AtmosphereSystem hooks this to push the persisted
     * cloud config (quality preset + overrides) that arrived before the node
     * existed.
     */
    onCloudNodeReady?: () => void;
    private taaNode?: TemporalAntialiasNode;
    private _smaaNode?: ReturnType<typeof smaa>;
    private scene?: THREE.Scene;
    private camera?: THREE.Camera;
    private _sunDir?: ReturnType<typeof uniform<"vec3">>;
    private _ambient?: ReturnType<typeof uniform<"float">>;
    private _sunDirWarned = false;

    bloomObjects: Set<THREE.Object3D> = new Set();
    bloomIgnoreObjects: Set<THREE.Object3D> = new Set();
    translucentLayerEffect?: TranslucentLayerEffect;
    csmShadowNode?: CascadedShadowMapsNode;
    exposure = uniform(3);

    gpuPicking: boolean = false;

    /**
     * The camera-relative camera the pass actually renders with (positioned
     * at the origin) — the pose that produced the pickDepth contents. GPU
     * depth must be unprojected with THIS camera, not MapView's geo-world
     * camera (the two frames are ~Earth-radius apart).
     */
    get renderCamera(): THREE.Camera | undefined {
        return this.camera;
    }

    private mrtKeys: string[] = ["output"];
    private pickDepthTexIndex: number = -1;
    private lastCameraPos: THREE.Vector3 = new THREE.Vector3();
    private lastCameraDir: THREE.Vector3 = new THREE.Vector3();
    private tmpDir: THREE.Vector3 = new THREE.Vector3();

    /** Screen-center depth, auto-refreshed on camera motion (updateLookAtSettings). */
    private centerSlot: DepthSlot = createDepthSlot();
    /** Depth of the last non-center pixel queried through {@link readDepth}. */
    private querySlot: DepthSlot = createDepthSlot();

    get aerialPerspectiveNode(): AerialPerspectiveNode | undefined {
        return this.aerialNode;
    }
    get cloudNode(): CloudRenderNode | undefined {
        return this.m_cloudNode;
    }

    constructor(private readonly renderer: Renderer) {}

    private buildNodeGraph(scene: THREE.Scene, camera: THREE.Camera): void {
        this.pipeline?.dispose();
        this.camera = camera;

        const taaEnabled = this.config.antialiasing === "taa";
        const bloomEnabled = this.config.bloom.enabled;
        const aerialEnabled = this.config.aerialPerspective.enabled;
        const hasCSM = this.csmShadowNode != null;

        const WORLD_TO_UNIT = 0.001;

        const mrtEntries: Record<string, unknown> = { output };
        if (taaEnabled) mrtEntries.velocity = highpVelocity;
        if (bloomEnabled) mrtEntries.bloomIntensity = float(0);
        if (aerialEnabled && hasCSM) {
            mrtEntries.viewZUnit = positionView.z.mul(WORLD_TO_UNIT);
        }
        if (this.gpuPicking) {
            const clipPos = cameraProjectionMatrix.mul(positionView);
            mrtEntries.pickDepth = vec4(float(1).div(clipPos.w), float(0), float(0), float(1));
        }

        this.mrtKeys = Object.keys(mrtEntries);

        this.passNode =
            Object.keys(mrtEntries).length > 1
                ? pass(scene, camera, { samples: 0 }).setMRT(mrt(mrtEntries))
                : pass(scene, camera, { samples: 0 });

        const colorNode = this.passNode.getTextureNode("output");
        const depthNode = this.passNode.getTextureNode("depth");

        if (this.gpuPicking) {
            this.passNode.getTextureNode("pickDepth");
        }

        let outputNode = colorNode;

        // Clouds first (matches reference EffectComposer order: Clouds before
        // AerialPerspective). AerialPerspective then processes the cloud+scene
        // composite and applies god rays from cloud shadowLength.
        if (this.config.clouds?.enabled) {
            if (!this.m_cloudNode) {
                this.m_cloudNode = cloudRender(outputNode, depthNode, this.renderer);
                const pending = this.pendingCloudConfig;
                this.m_cloudNode.onReady = () => {
                    this.m_cloudNode!.onReady = null;
                    if (pending) {
                        this.m_cloudNode!.setConfig(pending as any);
                    }
                    // Let AtmosphereSystem push its persisted config now that the
                    // node is ready (covers the case where updateOptions ran
                    // before the VRM/cloudNode existed).
                    this.onCloudNodeReady?.();
                    this.needsUpdate = true;
                };
            } else {
                this.m_cloudNode._colorNode = outputNode;
                this.m_cloudNode._depthNode = depthNode ?? null;
            }
            outputNode = this.m_cloudNode;
        } else if (this.m_cloudNode != null) {
            this.m_cloudNode.dispose();
            this.m_cloudNode = undefined;
        }

        if (aerialEnabled) {
            let shadowLengthNode = null;
            if (hasCSM) {
                const viewZUnitTex = this.passNode.getTextureNode("viewZUnit");
                shadowLengthNode = shadowLength(this.csmShadowNode, viewZUnitTex);
            }
            this.aerialNode = aerialPerspective(outputNode, depthNode, shadowLengthNode);
            this.aerialNode.setConfig(this.config.aerialPerspective);
            // Feed cloud shadow length (god rays) + cloud overlay into aerial perspective.
            if (this.m_cloudNode != null) {
                this.aerialNode.setCloudShadowLength(this.m_cloudNode.shadowLengthTexture);
                this.aerialNode.setCloudOverlay(this.m_cloudNode.overlayTexture);
                // RT ping-pong swap changes texture references each frame.
                // Update aerial node's texture refs after every swap.
                this.m_cloudNode.onTexturesSwapped = () => {
                    this.aerialNode.setCloudShadowLength(this.m_cloudNode!.shadowLengthTexture);
                    this.aerialNode.setCloudOverlay(this.m_cloudNode!.overlayTexture);
                };
            }
            outputNode = this.aerialNode;
        }

        if (this.config.lensFlare.enabled) {
            if (!this.lensFlareNode) {
                this.lensFlareNode = lensFlare(convertToTexture(outputNode));
                this.lensFlareNode.setConfig(this.config.lensFlare);
            } else {
                this.lensFlareNode.inputNode = convertToTexture(outputNode);
                this.lensFlareNode.setConfig(this.config.lensFlare);
            }
            outputNode = this.lensFlareNode;
        } else if (this.lensFlareNode != null) {
            this.lensFlareNode.dispose();
            this.lensFlareNode = undefined;
        }

        if (bloomEnabled) {
            const bloomIntensityPass = this.passNode.getTextureNode("bloomIntensity");
            const bloomInput =
                bloomIntensityPass != null ? colorNode.mul(bloomIntensityPass) : colorNode;
            const bloomPass = bloom(
                bloomInput,
                this.config.bloom.intensity,
                this.config.bloom.radius,
                this.config.bloom.threshold
            );
            outputNode = outputNode.add(bloomPass);
        }

        let finalNode = this.applyToneMapping(outputNode);

        if (taaEnabled) {
            const velocityNode = this.passNode.getTextureNode("velocity");
            this.taaNode = temporalAntialias(finalNode, depthNode, velocityNode, camera);
            finalNode = this.taaNode;
        } else if (this.config.antialiasing === "smaa") {
            const smaaNode = smaaWrapped(finalNode);
            this._smaaNode = smaaNode;
            finalNode = smaaNode;
            console.log("[VRM] SMAA wrapper node created and attached to pipeline");
        } else {
            this._smaaNode = null;
        }

        if (this.config.outline.enabled) {
            finalNode = outline(
                finalNode,
                depthNode,
                this.config.outline.thickness,
                this.config.outline.color
            );
        }
        if (this.config.vignette.enabled) {
            finalNode = vignette(
                finalNode,
                this.config.vignette.offset,
                this.config.vignette.darkness
            );
        }
        if (this.config.brightnessContrast.enabled) {
            finalNode = brightnessContrast(
                finalNode,
                this.config.brightnessContrast.brightness,
                this.config.brightnessContrast.contrast
            );
        }
        if (this.config.hueSaturation.enabled) {
            finalNode = hueSaturation(
                finalNode,
                this.config.hueSaturation.hue,
                this.config.hueSaturation.saturation
            );
        }
        if (this.config.sepia.enabled) {
            finalNode = sepia(finalNode, this.config.sepia.amount);
        }

        if (this.translucentLayerEffect != null && this.translucentLayerEffect.hasObjects) {
            const buildingLayers = new THREE.Layers();
            buildingLayers.set(TRANSLUCENT_LAYER_BIT);
            this._sunDir = uniform(vec3(new THREE.Vector3(0, 1, 0)));
            this._ambient = uniform(float(0.25));
            const _buildingFallback = uniform(vec3(new THREE.Color(0xc4b89e)));
            const _buildingColorMat = new MeshBasicNodeMaterial();
            _buildingColorMat.colorNode = Fn(() => {
                const vertexColor = attribute("color", "vec3");
                const hasVertexColor = vertexColor.length().greaterThan(0.005);
                const albedo = hasVertexColor.select(vertexColor, _buildingFallback);
                const n = normalView.normalize();
                const ndl = n.dot(this._sunDir!).max(0);
                const light = ndl.mul(0.75).add(this._ambient!);
                return vec4(albedo.mul(light), float(1));
            })();
            _buildingColorMat.transparent = true;
            _buildingColorMat.blending = THREE.NoBlending;
            this.buildingColorPassNode = pass(scene, camera, { samples: 0 });
            this.buildingColorPassNode.setLayers(buildingLayers);
            this.buildingColorPassNode.overrideMaterial = _buildingColorMat;
            const buildingColorNode = this.buildingColorPassNode.getTextureNode("output");

            const hasObject = buildingColorNode.a.greaterThan(float(0.5));

            const alpha = float(0.3);
            const buildingColor = vec4(
                this.config.toneMappingMode === "agx-punchy"
                    ? agxPunchyToneMapping(buildingColorNode.rgb, this.exposure)
                    : buildingColorNode.rgb,
                1
            );
            const undergroundBlend = finalNode.rgb
                .mul(float(1.0).sub(alpha))
                .add(buildingColor.rgb.mul(alpha));
            finalNode = vec4(hasObject.select(undergroundBlend, finalNode.rgb), 1);
        }

        finalNode = finalNode.add(dithering);

        this.pipeline = new RenderPipeline(
            this.renderer,
            finalNode as ConstructorParameters<typeof RenderPipeline>[1]
        );
        this.pipeline.outputColorTransform = true;
        this.needsUpdate = false;

        const rt = this.passNode?.renderTarget;
        if (rt && this.gpuPicking) {
            this.pickDepthTexIndex = rt.textures.findIndex(
                (t: THREE.Texture) => t.name === "pickDepth"
            );
        }
    }

    private applyToneMapping(color: any, mode?: string, exposure: any = this.exposure): any {
        const tmMode = mode ?? this.config.toneMappingMode;
        if (tmMode === "agx-punchy") {
            return vec4(agxPunchyToneMapping(color.rgb, exposure), 1);
        }
        const tmMapping: Record<string, number> = {
            aces: THREE.ACESFilmicToneMapping,
            linear: THREE.LinearToneMapping,
            reinhard: THREE.ReinhardToneMapping,
            cineon: THREE.CineonToneMapping,
            agx: THREE.AgXToneMapping,
            neutral: THREE.NeutralToneMapping
        };
        const tm = tmMapping[tmMode];
        if (tm !== undefined) {
            return color.toneMapping(tm, exposure);
        }
        console.warn(
            `ViewRenderManager: unsupported tone mapping mode "${tmMode}", falling back to aces`
        );
        return color.toneMapping(THREE.ACESFilmicToneMapping, exposure);
    }

    render(scene: THREE.Scene, camera: THREE.Camera): void {
        if (this.needsUpdate || this.pipeline == null) {
            this.buildNodeGraph(scene, camera);
        }

        // Update sun direction for building color override material
        if (this._sunDir != null) {
            const atmoLight = scene.getObjectByProperty("type", "AtmosphereLight") as
                | THREE.Object3D
                | undefined;
            if (atmoLight != null) {
                this._sunDir.value.copy(atmoLight.position).normalize();
            } else if (this.translucentLayerEffect?.hasObjects && !this._sunDirWarned) {
                this._sunDirWarned = true;
                console.warn(
                    "ViewRenderManager: AtmosphereLight not found in scene — building underground " +
                        "lighting will use default sun direction (0,1,0)"
                );
            }
        }

        // Update near/far from camera for depth linearization
        if (camera instanceof THREE.PerspectiveCamera) {
            this.cameraNearFar.near = camera.near;
            this.cameraNearFar.far = camera.far;
        }

        this.pipeline.render();

        if (this.gpuPicking) {
            const moved =
                this.lastCameraPos.distanceToSquared(camera.position) > 0.01 ||
                this.lastCameraDir.distanceToSquared(camera.getWorldDirection(this.tmpDir)) >
                    0.0001;
            this.lastCameraPos.copy(camera.position);
            if (moved) {
                this.requestCenterDepthRead();
            }
            // Keep the query slot continuously fresh while it is in use —
            // same reliable mechanism as the center cache (per-frame refresh,
            // inFlight-throttled), instead of one-shot call-time requests.
            if (this.querySlot.px >= 0 && performance.now() - this.querySlotLastUse < 1000) {
                this.requestDepthRead(this.querySlot, this.querySlot.px, this.querySlot.py);
            }
        }
    }

    setSize(width: number, height: number): void {
        this.needsUpdate = true;
    }

    dispose(): void {
        this.pipeline?.dispose();
        this.pipeline = undefined;
        this.passNode = undefined;
        this.buildingColorPassNode = undefined;
        this.lensFlareNode = undefined;
        this.aerialNode = undefined;
        this.m_cloudNode = undefined;
        this.taaNode = undefined;
        this.centerSlot = createDepthSlot();
        this.querySlot = createDepthSlot();
    }

    setLensFlareConfig(config: ILensFlareConfig): void {
        this.config.lensFlare = config;
        if (this.lensFlareNode != null) {
            this.lensFlareNode.setConfig(config);
        }
        this.needsUpdate = true;
    }

    getColorTexture(): THREE.Texture | null {
        return this.passNode?.renderTarget?.texture ?? null;
    }

    getDepthTexture(): THREE.Texture | null {
        return this.passNode?.renderTarget?.depthTexture ?? null;
    }

    /**
     * Synchronous depth lookup at the given NDC position. The screen center is
     * kept warm by render(); any other pixel is tracked by the query slot,
     * which render() refreshes EVERY FRAME while recently used (same reliable
     * mechanism as the center cache). readDepth only reads — no call-time
     * request races.
     */
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): number | null {
        if (!this.gpuPicking || this.camera == null) return null;
        const rt = this.passNode?.renderTarget;
        if (rt == null || this.pickDepthTexIndex < 0) return null;

        const { x, y } = this.ndcToPixel(ndc, rt);
        if (x < 0 || x >= rt.width || y < 0 || y >= rt.height) return null;

        this.querySlotLastUse = performance.now();

        if (x === Math.round(rt.width * 0.5) && y === Math.round(rt.height * 0.5)) {
            const moved =
                this.centerSlot.camPos.distanceToSquared(this.camera.position) > 0.01 ||
                this.centerSlot.camDir.distanceToSquared(
                    this.camera.getWorldDirection(this.tmpDir)
                ) > 0.0001;
            if (moved) {
                this.requestDepthRead(this.centerSlot, x, y);
            }
            return this.centerSlot.invW === null
                ? null
                : this.invWToNdcZ(this.centerSlot.invW);
        }

        const slot = this.querySlot;
        // Retarget only when the pixel actually moved beyond tolerance — hand
        // jitter wanders ±1px between events and an exact comparison reset
        // the slot on every call, keeping it permanently cold (all MISS).
        if (Math.abs(slot.px - x) > 2 || Math.abs(slot.py - y) > 2) {
            slot.px = x;
            slot.py = y;
            slot.invW = null;
            this.requestDepthRead(slot, x, y);
            return null;
        }

        // Pixel matches → serve whatever the continuous per-frame refresh has
        // (Cesium "previous frame depth" semantics).
        this.requestDepthRead(slot, x, y); // keep refreshing (inFlight throttles)
        return slot.invW === null ? null : this.invWToNdcZ(slot.invW);
    }

    private querySlotLastUse: number = 0;

    private invWToNdcZ(invW: number): number {
        // Use the actual projection matrix instead of hand-written formula
        const zEye = -1 / invW;
        const pm = this.camera!.projectionMatrix.elements;
        const zClip = pm[10] * zEye + pm[14];
        const wClip = -zEye;
        const ndcZ = zClip / wClip;
        return ndcZ * 0.5 + 0.5;
    }

    /**
     * NDC → render-target pixel, top-left origin (WebGPU texture row 0 is the
     * top). Same convention as MapViewPoints' ndcToScreen — the inverse of
     * MapView.getNormalizedScreenCoordinates — but in render-target pixels,
     * rounded to the NEAREST pixel (ceil grabs the neighbor across 0.5px
     * boundaries, which on silhouette edges is a different surface).
     */
    private ndcToPixel(
        ndc: THREE.Vector2 | THREE.Vector3,
        rt: THREE.RenderTarget
    ): { x: number; y: number } {
        return {
            x: Math.round(((ndc.x + 1) / 2) * rt.width),
            y: Math.round(((1 - ndc.y) / 2) * rt.height)
        };
    }

    private cameraNearFar: { near: number; far: number } = { near: 1, far: 1000 };

    async readDepthAsync(ndc: THREE.Vector2 | THREE.Vector3): Promise<number | null> {
        const rt = this.passNode?.renderTarget;
        if (rt == null || this.pickDepthTexIndex < 0) return null;

        const { x, y } = this.ndcToPixel(ndc, rt);
        if (x < 0 || x >= rt.width || y < 0 || y >= rt.height) return null;

        try {
            const data = await this.renderer.readRenderTargetPixelsAsync(
                rt,
                x,
                y,
                1,
                1,
                this.pickDepthTexIndex
            );
            const invW = halfFloatToNumber((data as Uint16Array)[0]);
            if (!isFinite(invW) || invW <= 0) return null;
            if (this.camera == null) return null;
            const zEye = -1 / invW;
            const pm = this.camera.projectionMatrix.elements;
            const zClip = pm[10] * zEye + pm[14];
            const wClip = -zEye;
            const ndcZ = zClip / wClip;
            return ndcZ * 0.5 + 0.5;
        } catch {
            return null;
        }
    }

    private requestCenterDepthRead(): void {
        const rt = this.passNode?.renderTarget;
        if (rt == null) return;
        this.requestDepthRead(
            this.centerSlot,
            Math.round(rt.width * 0.5),
            Math.round(rt.height * 0.5)
        );
    }

    private requestDepthRead(slot: DepthSlot, x: number, y: number): void {
        // Serialize ALL depth readbacks — concurrent readRenderTargetPixelsAsync
        // calls (query slot + per-frame center refresh) trample each other's
        // results and resolve to 0, starving every consumer.
        if (slot.inFlight || this.depthReadBusy || this.pickDepthTexIndex < 0) return;
        const rt = this.passNode?.renderTarget;
        if (rt == null || this.camera == null) return;

        slot.camPos.copy(this.camera.position);
        slot.camDir.copy(this.camera.getWorldDirection(this.tmpDir));

        slot.inFlight = true;
        this.depthReadBusy = true;

        this.renderer
            .readRenderTargetPixelsAsync(rt, x, y, 1, 1, this.pickDepthTexIndex)
            .then(data => {
                const invW = halfFloatToNumber((data as Uint16Array)[0]);
                if (isFinite(invW) && invW > 0) {
                    slot.invW = invW;
                    slot.px = x;
                    slot.py = y;
                }
            })
            .catch(() => {})
            .finally(() => {
                slot.inFlight = false;
                this.depthReadBusy = false;
            });
    }

    private depthReadBusy: boolean = false;
}

function halfFloatToNumber(u16: number): number {
    const s = (u16 >> 15) & 1;
    const e = (u16 >> 10) & 0x1f;
    const f = u16 & 0x3ff;
    if (e === 0) return 0;
    if (e === 31) return f ? NaN : s ? -Infinity : Infinity;
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}
