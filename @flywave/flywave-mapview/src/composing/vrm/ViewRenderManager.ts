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
    AgXCunchyToneMapping,
    temporalAntialias,
    highpVelocity,
    shadowLength,
    cloudRender,
    type CloudRenderNode,
    type LensFlareNode,
    type AerialPerspectiveNode,
    type TemporalAntialiasNode
} from "@flywave/flywave-atmosphere";

import type { IViewRenderConfig, IViewRenderManager } from "./ViewRenderTypes";
import { vignette } from "./effects/vignette";
import { brightnessContrast, hueSaturation, sepia } from "./effects/colorGrading";
import { bloom } from "./effects/bloom";
import { outline } from "./effects/outline";
import {
    TranslucentLayerEffect,
    TRANSLUCENT_LAYER_BIT,
    SPLAT_DEPTH_LAYER_BIT
} from "./TranslucentLayerEffect";

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
        lensFlare: {
            enabled: false,
            bloomIntensity: 0.05,
            ghostIntensity: 0.005,
            haloIntensity: 0.005,
            glareIntensity: 1
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
    private taaNode?: TemporalAntialiasNode;
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

        const taaEnabled = this.config.taa.enabled;
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

        this.passNode =
            Object.keys(mrtEntries).length > 1
                ? pass(scene, camera, { samples: 0 }).setMRT(mrt(mrtEntries))
                : pass(scene, camera, { samples: 0 });

        const colorNode = this.passNode.getTextureNode("output");
        const depthNode = this.passNode.getTextureNode("depth");

        let outputNode = colorNode;

        if (aerialEnabled) {
            let shadowLengthNode = null;
            if (hasCSM) {
                const viewZUnitTex = this.passNode.getTextureNode("viewZUnit");
                shadowLengthNode = shadowLength(this.csmShadowNode, viewZUnitTex);
            }
            this.aerialNode = aerialPerspective(outputNode, depthNode, shadowLengthNode);
            outputNode = this.aerialNode;
        }

        if (this.config.clouds?.enabled) {
            if (!this.m_cloudNode) {
                this.m_cloudNode = cloudRender(outputNode, depthNode, this.renderer);
                const pending = this.pendingCloudConfig;
                this.m_cloudNode.onReady = () => {
                    this.m_cloudNode!.onReady = null;
                    if (pending) {
                        this.m_cloudNode!.setConfig(pending as any);
                    }
                    this.needsUpdate = true;
                };
            } else {
                this.m_cloudNode._colorNode = outputNode;
                this.m_cloudNode._depthNode = depthNode ?? null;
            }
            outputNode = this.m_cloudNode;
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

        if (this.config.lensFlare.enabled) {
            this.lensFlareNode = lensFlare(convertToTexture(outputNode));
            outputNode = this.lensFlareNode;
        }

        let finalNode = vec4(outputNode.rgb, 1);
        if (this.config.toneMappingMode === "agx-punchy") {
            finalNode = vec4(agxPunchyToneMapping(outputNode.rgb, this.exposure), 1);
        } else {
            const mode = this.config.toneMappingMode;
            if (mode === "aces") {
                finalNode = vec4(
                    outputNode.rgb.toneMapping(THREE.ACESFilmicToneMapping, this.exposure),
                    1
                );
            } else if (mode === "linear") {
                finalNode = vec4(
                    outputNode.rgb.toneMapping(THREE.LinearToneMapping, this.exposure),
                    1
                );
            } else if (mode === "reinhard") {
                finalNode = vec4(
                    outputNode.rgb.toneMapping(THREE.ReinhardToneMapping, this.exposure),
                    1
                );
            } else if (mode === "agx") {
                finalNode = vec4(
                    outputNode.rgb.toneMapping(THREE.AgXToneMapping, this.exposure),
                    1
                );
            } else if (mode === "neutral") {
                finalNode = vec4(
                    outputNode.rgb.toneMapping(THREE.NeutralToneMapping, this.exposure),
                    1
                );
            }
        }
        if (taaEnabled) {
            const velocityNode = this.passNode.getTextureNode("velocity");
            this.taaNode = temporalAntialias(finalNode, depthNode, velocityNode, camera);
            finalNode = this.taaNode;
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

        if (this.translucentLayerEffect != null) {
            const buildingLayers = new THREE.Layers();
            buildingLayers.set(TRANSLUCENT_LAYER_BIT);

            // Pass: buildings only → vertex color with sun-direction lighting
            // (MeshStandardNodeMaterial + AtmosphereLightNode triggers WGSL error in
            // secondary TSL passes due to three.js shared light node instance design)
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
                return vec4(albedo.mul(light), depth.mul(float(10.0)).add(float(5.0)));
            })();
            _buildingColorMat.transparent = true;
            _buildingColorMat.blending = THREE.NoBlending;
            this.buildingColorPassNode = pass(scene, camera, { samples: 0 });
            this.buildingColorPassNode.setLayers(buildingLayers);
            this.buildingColorPassNode.overrideMaterial = _buildingColorMat;
            const buildingColorNode = this.buildingColorPassNode.getTextureNode("output");
            const objDepthEnc = buildingColorNode.a;

            const hasObject = objDepthEnc.greaterThan(float(2.0));
            const objDepth = objDepthEnc.sub(float(5.0)).div(float(10.0));
            const isOccluded = objDepth
                .greaterThan(depthNode)
                .and(objDepth.sub(depthNode).greaterThan(float(0.001)));
            const underground = hasObject.and(isOccluded);

            // Above ground: use main pass (full scene with lighting)
            // Below ground: blend building vertex color over scene
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
            finalNode = vec4(underground.select(undergroundBlend, finalNode.rgb), 1);
        }

        finalNode = finalNode.add(dithering);

        this.pipeline = new RenderPipeline(
            this.renderer,
            finalNode as ConstructorParameters<typeof RenderPipeline>[1]
        );
        this.pipeline.outputColorTransform = true;
        this.needsUpdate = false;
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

        this.pipeline.render();
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
    }

    getColorTexture(): THREE.Texture | null {
        return this.passNode?.renderTarget?.texture ?? null;
    }

    getDepthTexture(): THREE.Texture | null {
        return this.passNode?.renderTarget?.depthTexture ?? null;
    }

    async readDepthAsync(ndc: THREE.Vector2 | THREE.Vector3): Promise<number | null> {
        const rt = this.passNode?.renderTarget;
        if (rt == null) return null;

        const width = rt.width;
        const height = rt.height;
        const x = Math.round((ndc.x * 0.5 + 0.5) * width);
        const y = Math.round((ndc.y * 0.5 + 0.5) * height);
        if (x < 0 || x >= width || y < 0 || y >= height) return null;

        try {
            const buffer = new Float32Array(4);
            await this.renderer.readRenderTargetPixelsAsync(rt, x, y, 1, 1, buffer);
            return buffer[0];
        } catch {
            return null;
        }
    }
}
