/* Copyright (C) 2025 flywave.gl contributors */

import { type BlendFunction, Effect, EffectAttribute, Selection } from "postprocessing";
import {
    type Camera,
    type Scene,
    type WebGLRenderer,
    Color,
    DepthTexture,
    LinearFilter,
    RGBAFormat,
    Uniform,
    UnsignedShortType,
    WebGLRenderTarget
} from "three";

export interface TranslucentDepthEffectOptions {
    blendFunction?: BlendFunction;
    mixFactor?: number;
    blendMode?: "mix" | "add" | "multiply" | "screen";
}

export class TranslucentDepthEffect extends Effect {
    private _selection: Selection;
    private readonly targetRenderTarget: WebGLRenderTarget;
    private readonly originalClearColor: Color;

    constructor(
        private readonly scene: Scene,
        private readonly camera: Camera,
        options: TranslucentDepthEffectOptions = {}
    ) {
        const { mixFactor = 0.1, blendMode = "mix" } = options;

        super("TranslucentDepthEffect", getTranslucentDepthFragmentShader(), {
            attributes: EffectAttribute.DEPTH,
            uniforms: new Map([
                ["tTargetColor", new Uniform(null)],
                ["tTargetDepth", new Uniform(null)],
                ["mixFactor", new Uniform(mixFactor)],
                [
                    "blendMode",
                    new Uniform(
                        blendMode === "add"
                            ? 1.0
                            : blendMode === "multiply"
                            ? 2.0
                            : blendMode === "screen"
                            ? 3.0
                            : 0.0
                    )
                ]
            ])
        });

        this._selection = new Selection();
        this.originalClearColor = new Color();

        // 创建渲染目标用于渲染选中的物体
        this.targetRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
            depthTexture: new DepthTexture(1, 1, UnsignedShortType)
        });
    }

    public update(
        renderer: WebGLRenderer,
        inputBuffer: WebGLRenderTarget,
        deltaTime?: number
    ): void {
        const scene = this.scene;
        const camera = this.camera;

        if (!scene || !camera) return;

        // 使用 Selection 来控制渲染
        if (this._selection.size > 0) {
            this.renderSelectedObjects(renderer, scene, camera);
            this.uniforms.get("tTargetColor")!.value = this.targetRenderTarget.texture;
            this.uniforms.get("tTargetDepth")!.value = this.targetRenderTarget.depthTexture;
        } else {
            // 如果没有选择内容，清空纹理引用
            this.uniforms.get("tTargetColor")!.value = null;
            this.uniforms.get("tTargetDepth")!.value = null;
        }

        super.update(renderer, inputBuffer, deltaTime);
    }

    private renderSelectedObjects(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
        // 保存原始状态
        const originalRenderTarget = renderer.getRenderTarget();
        renderer.getClearColor(this.originalClearColor);
        const originalClearAlpha = renderer.getClearAlpha();
        const originalAutoClear = renderer.autoClear;
        const originalLayers = camera.layers.mask;

        // 设置选择层的渲染
        camera.layers.set(this._selection.layer);

        // 保存原始背景并移除背景
        const originalBackground = scene.background;
        scene.background = null;

        // 渲染选中的物体到目标纹理
        renderer.setRenderTarget(this.targetRenderTarget);
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);

        // 恢复状态
        scene.background = originalBackground;
        renderer.setRenderTarget(originalRenderTarget);
        renderer.setClearColor(this.originalClearColor, originalClearAlpha);
        renderer.autoClear = originalAutoClear;
        camera.layers.mask = originalLayers;
        // renderer.render(scene, camera);
    }

    public setSize(width: number, height: number): void {
        this.targetRenderTarget.setSize(width, height);
    }

    // Selection 相关方法
    public get selection(): Selection {
        return this._selection;
    }

    public set selection(value: Selection) {
        this._selection = value;
    }

    // 属性访问器
    get mixFactor(): number {
        return this.uniforms.get("mixFactor")!.value;
    }

    set mixFactor(value: number) {
        this.uniforms.get("mixFactor")!.value = value;
    }

    public setBlendMode(mode: "mix" | "add" | "multiply" | "screen"): void {
        this.uniforms.get("blendMode")!.value =
            mode === "add" ? 1.0 : mode === "multiply" ? 2.0 : mode === "screen" ? 3.0 : 0.0;
    }

    public override dispose(): void {
        super.dispose();
        this.targetRenderTarget.dispose();
        this._selection.clear();
    }
}

function getTranslucentDepthFragmentShader(): string {
    return `
        uniform sampler2D tTargetColor;
        uniform sampler2D tTargetDepth; 
        uniform float mixFactor;
        uniform float depthThreshold;
        uniform float blendMode;
        
        vec3 blendMix(vec3 base, vec3 blend, float opacity) {
            return mix(base, blend, opacity);
        }
        
        vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
            return base + blend * opacity;
        }
        
        vec3 blendMultiply(vec3 base, vec3 blend, float opacity) {
            return mix(base, base * blend, opacity);
        }
        
        vec3 blendScreen(vec3 base, vec3 blend, float opacity) {
            return mix(base, 1.0 - (1.0 - base) * (1.0 - blend), opacity);
        }
        
        void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
            vec4 targetColor = texture2D(tTargetColor, uv);
            float targetDepth = texture2D(tTargetDepth, uv).r; 
            float sceneDepth = depth;

            // outputColor = targetColor;
            // return;
            
            bool hasTargetContent = targetColor.a > 0.1 && targetDepth > 0.0;
            
            if (hasTargetContent) {
                bool isTargetInFront = (targetDepth - sceneDepth) < 0.0001;
                bool isBackground = sceneDepth >= 0.999;
                
                if (isTargetInFront) {
                    // 目标物体在前面或是背景 - 直接显示目标物体
                    outputColor = inputColor;
                } else {
                    // 目标物体被遮挡 - 应用混合效果
                    vec3 resultColor = inputColor.rgb;
                    
                    if (blendMode < 0.5) {
                        resultColor = blendMix(inputColor.rgb, targetColor.rgb, mixFactor);
                    } else if (blendMode < 1.5) {
                        resultColor = blendAdd(inputColor.rgb, targetColor.rgb, mixFactor);
                    } else if (blendMode < 2.5) {
                        resultColor = blendMultiply(inputColor.rgb, targetColor.rgb, mixFactor);
                    } else {
                        resultColor = blendScreen(inputColor.rgb, targetColor.rgb, mixFactor);
                    }
                    
                    outputColor = vec4(resultColor, max(inputColor.a, targetColor.a));
                }
            } else {
                // 没有目标物体 - 显示主场景
                outputColor = inputColor;
            }
        }
    `;
}
