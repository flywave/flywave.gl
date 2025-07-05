import { IGodRaysEffect } from "@flywave/flywave-datasource-protocol";
import { GodRaysEffect } from "postprocessing";
import * as THREE from "three";

export class SunGodRaysEffect extends GodRaysEffect {
    private m_sunMesh: THREE.Mesh;
    private m_config: IGodRaysEffect;
    private m_lightPosition = new THREE.Vector3();
    public enabled = false;
    /**
     * 构造函数
     * @param camera - 主相机
     * @param atmosphere - 大气效果实例
     * @param config - 配置选项
     */
    constructor(camera: THREE.Camera, config: IGodRaysEffect) {
        // 合并配置与默认值
        const fullConfig = {
            ...config
        };

        // 创建太阳网格
        const geometry = new THREE.CircleGeometry(1, 32);

        const sunMesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
                depthTest: true,
                depthWrite: false,
                blending: THREE.NormalBlending
            })
        );
        sunMesh.name = "SunLightSource";

        // 初始化父类
        super(camera, sunMesh, {
            samples: fullConfig.samples,
            density: fullConfig.density,
            decay: fullConfig.decay,
            weight: fullConfig.weight,
            exposure: fullConfig.exposure,
            // clampMax: fullConfig.clampMax,
            blur: fullConfig.blur,
            resolutionScale: fullConfig.resolutionScale
        });

        this.m_sunMesh = sunMesh;
        this.m_config = fullConfig;

        // 初始更新太阳位置和方向
        this.updateSunPositionAndDirection();
    }

    /**
     * 获取当前配置
     */
    get config(): Readonly<IGodRaysEffect> {
        return this.m_config;
    }

    /**
     * 获取当前光源位置
     */
    get lightPosition(): THREE.Vector3 {
        return this.m_lightPosition;
    }

    /**
     * 更新配置
     * @param newConfig - 新的配置项
     */
    updateConfig(newConfig: Partial<IGodRaysEffect>): void {
        this.m_config = { ...this.m_config, ...newConfig };

        if (newConfig.samples !== undefined) {
            this.godRaysMaterial.samples = newConfig.samples;
        }
        if (newConfig.density !== undefined) {
            this.godRaysMaterial.density = newConfig.density;
        }
        if (newConfig.decay !== undefined) {
            this.godRaysMaterial.decay = newConfig.decay;
        }
        if (newConfig.weight !== undefined) {
            this.godRaysMaterial.weight = newConfig.weight;
        }
        if (newConfig.exposure !== undefined) {
            this.godRaysMaterial.exposure = newConfig.exposure;
        }
        if (newConfig.clampMax !== undefined) {
            this.godRaysMaterial.maxIntensity = newConfig.clampMax;
        }
        if (newConfig.blur !== undefined) {
            this.blurPass.enabled = newConfig.blur;
        }
        if (newConfig.resolutionScale !== undefined) {
            this.resolution.scale = newConfig.resolutionScale;
        }
    }

    /**
     * 更新太阳位置和方向以匹配大气光源方向
     */
    private updateSunPositionAndDirection(): void {
        this.m_sunMesh.position.copy(this.lightPosition);
        this.m_sunMesh.scale.setScalar(100000);

        // 使太阳始终朝向相机（保持视觉上的圆形）
        this.m_sunMesh.lookAt(new THREE.Vector3(0, 0, 0));
    }

    /**
     * 重写update方法，在每帧更新太阳位置和方向
     */
    update(
        renderer: THREE.WebGLRenderer,
        inputBuffer: THREE.WebGLRenderTarget,
        deltaTime?: number
    ): void {
        if (this.enabled) {
            this.updateSunPositionAndDirection();
            super.update(renderer, inputBuffer, deltaTime);
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        super.dispose();
        this.m_sunMesh.geometry.dispose();
        (this.m_sunMesh.material as THREE.Material).dispose();
    }
}
