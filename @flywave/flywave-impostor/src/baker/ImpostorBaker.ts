import * as THREE from "three";
import { octaUvToWorld } from "../octahedral-utils";
import { dilate } from "./dilation";
import type { ImpostorConfig, ImpostorData } from "../types";

export interface BakeResult {
    data: ImpostorData;
    textures: {
        albedo: Uint8ClampedArray;
        normal: Uint8ClampedArray;
        depth: Uint8ClampedArray;
        orm: Uint8ClampedArray;
    };
}

const NORMAL_MATERIAL_SHADER = {
    vertexShader: `
        varying vec3 vViewNormal;
        void main() {
            vViewNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vViewNormal;
        void main() {
            vec3 n = normalize(vViewNormal);
            gl_FragColor = vec4(-n.x, n.y, -n.z, 1.0) * 0.5 + 0.5;
        }
    `
};

const DEPTH_MATERIAL_SHADER = {
    vertexShader: `
        varying float vDepth;
        uniform float uNear;
        uniform float uRange;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            vDepth = (-mvPosition.z - uNear) / uRange;
        }
    `,
    fragmentShader: `
        varying float vDepth;
        void main() {
            float d = clamp(vDepth, 0.0, 1.0);
            gl_FragColor = vec4(d, d, d, 1.0);
        }
    `
};

const ORM_MATERIAL_SHADER = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uOrm;
        void main() {
            gl_FragColor = vec4(uOrm, 1.0);
        }
    `
};

function getMeshes(object: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    object.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
            meshes.push(child as THREE.Mesh);
        }
    });
    return meshes;
}

function computeBoundingBox(object: THREE.Object3D): THREE.Box3 {
    const box = new THREE.Box3();
    object.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
                box.expandByObject(mesh);
            }
        }
    });
    return box;
}

function collectMaterialORM(meshes: THREE.Mesh[]): Map<THREE.Mesh, THREE.Vector3> {
    const ormMap = new Map<THREE.Mesh, THREE.Vector3>();
    for (const mesh of meshes) {
        const orm = new THREE.Vector3(1, 1, 0);
        const mat = mesh.material as THREE.Material;
        if ((mat as any).aoMap) orm.x = 1.0;
        if ((mat as THREE.MeshStandardMaterial).roughness != null) {
            orm.y = (mat as THREE.MeshStandardMaterial).roughness;
        }
        if ((mat as THREE.MeshStandardMaterial).metalness != null) {
            orm.z = (mat as THREE.MeshStandardMaterial).metalness;
        }
        ormMap.set(mesh, orm);
    }
    return ormMap;
}

export class ImpostorBaker {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderTarget: THREE.WebGLRenderTarget;
    private frameResolution: number;
    private config: ImpostorConfig;
    private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

    constructor(config?: Partial<ImpostorConfig>) {
        this.config = { ...config } as any;
        this.frameResolution = Math.floor((config?.resolution ?? 1024) / (config?.frameSize ?? 16));

        const canvas = this.createCanvas();
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.frameResolution, this.frameResolution);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = false;

        this.scene = new THREE.Scene();
        this.scene.background = null;
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);

        this.renderTarget = new THREE.WebGLRenderTarget(
            this.frameResolution,
            this.frameResolution,
            {
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter
            }
        );
    }

    private createCanvas(): HTMLCanvasElement {
        if (typeof document !== "undefined") {
            return document.createElement("canvas");
        }
        throw new Error("Canvas not available - browser environment required for baking");
    }

    bake(model: THREE.Object3D): BakeResult {
        const meshes = getMeshes(model);
        if (meshes.length === 0) {
            throw new Error("No meshes found in model");
        }

        const bbox = computeBoundingBox(model);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const cameraDistance = size.length();

        if (cameraDistance < 0.0001) {
            throw new Error("Model bounding box is too small");
        }

        model.position.sub(center);

        const cameraHalfSize = cameraDistance / 2;
        this.camera.left = -cameraHalfSize;
        this.camera.right = cameraHalfSize;
        this.camera.top = cameraHalfSize;
        this.camera.bottom = -cameraHalfSize;
        this.camera.near = 0.01;
        this.camera.far = cameraDistance * 2;
        this.camera.updateProjectionMatrix();

        const frameSize = this.config.frameSize ?? 16;
        const isFullSphere = this.config.isFullSphere ?? true;
        const atlasSize = this.config.resolution ?? 1024;

        const albedoAtlas = new Uint8ClampedArray(atlasSize * atlasSize * 4);
        const normalAtlas = new Uint8ClampedArray(atlasSize * atlasSize * 4);
        const depthAtlas = new Uint8ClampedArray(atlasSize * atlasSize * 4);
        const ormAtlas = new Uint8ClampedArray(atlasSize * atlasSize * 4);

        const ormMap = collectMaterialORM(meshes);
        this.cacheMaterials(meshes);

        for (let y = 0; y < frameSize; y++) {
            for (let x = 0; x < frameSize; x++) {
                const uv = new THREE.Vector2(x / (frameSize - 1), y / (frameSize - 1));
                const dir = octaUvToWorld(uv, isFullSphere);

                const camPos = dir.clone().multiplyScalar(cameraDistance);
                this.camera.position.copy(camPos);
                this.camera.lookAt(0, 0, 0);
                this.camera.updateMatrixWorld();

                this.renderFrameToAtlas(
                    model,
                    x,
                    frameSize - 1 - y,
                    frameSize,
                    atlasSize,
                    albedoAtlas,
                    normalAtlas,
                    depthAtlas,
                    ormAtlas,
                    ormMap,
                    meshes
                );
            }
        }

        this.restoreMaterials(meshes);

        const dilDist = this.config.dilationDistance ?? 32;
        if (dilDist > 0) {
            const dilatedAlbedo = dilate(
                albedoAtlas,
                albedoAtlas,
                atlasSize,
                atlasSize,
                dilDist,
                4
            );
            const dilatedNormal = dilate(
                normalAtlas,
                albedoAtlas,
                atlasSize,
                atlasSize,
                dilDist,
                3
            );
            const dilatedDepth = dilate(depthAtlas, albedoAtlas, atlasSize, atlasSize, dilDist, 1);
            const dilatedOrm = dilate(ormAtlas, albedoAtlas, atlasSize, atlasSize, dilDist, 3);
            albedoAtlas.set(dilatedAlbedo);
            normalAtlas.set(dilatedNormal);
            depthAtlas.set(dilatedDepth);
            ormAtlas.set(dilatedOrm);
        }

        const scale = cameraDistance / 2;
        const aabbMax = scale / 2;

        const data: ImpostorData = {
            version: 1,
            frames: [frameSize, frameSize],
            isFullSphere,
            scale,
            aabbMax,
            positionOffset: [-center.x, -center.y, -center.z],
            aabb: {
                min: [bbox.min.x, bbox.min.y, bbox.min.z],
                max: [bbox.max.x, bbox.max.y, bbox.max.z]
            },
            textures: {
                albedo: "albedo.png",
                normal: "normal.png",
                depth: "depth.png",
                orm: "orm.png"
            }
        };

        return {
            data,
            textures: {
                albedo: albedoAtlas,
                normal: normalAtlas,
                depth: depthAtlas,
                orm: ormAtlas
            }
        };
    }

    private renderFrameToAtlas(
        model: THREE.Object3D,
        frameX: number,
        frameY: number,
        frameSize: number,
        atlasSize: number,
        albedoAtlas: Uint8ClampedArray,
        normalAtlas: Uint8ClampedArray,
        depthAtlas: Uint8ClampedArray,
        ormAtlas: Uint8ClampedArray,
        ormMap: Map<THREE.Mesh, THREE.Vector3>,
        meshes: THREE.Mesh[]
    ) {
        const frameRes = this.frameResolution;
        const pixelBuffer = new Uint8Array(frameRes * frameRes * 4);

        this.scene.add(model);

        this.restoreMaterials(meshes);
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(
            this.renderTarget,
            0,
            0,
            frameRes,
            frameRes,
            pixelBuffer
        );
        this.copyFrameToAtlas(
            pixelBuffer,
            albedoAtlas,
            frameX,
            frameY,
            frameSize,
            atlasSize,
            frameRes
        );

        const normalMat = new THREE.ShaderMaterial({
            vertexShader: NORMAL_MATERIAL_SHADER.vertexShader,
            fragmentShader: NORMAL_MATERIAL_SHADER.fragmentShader
        });
        this.overrideMaterials(meshes, normalMat);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(
            this.renderTarget,
            0,
            0,
            frameRes,
            frameRes,
            pixelBuffer
        );
        this.copyFrameToAtlas(
            pixelBuffer,
            normalAtlas,
            frameX,
            frameY,
            frameSize,
            atlasSize,
            frameRes
        );

        const depthMat = new THREE.ShaderMaterial({
            vertexShader: DEPTH_MATERIAL_SHADER.vertexShader,
            fragmentShader: DEPTH_MATERIAL_SHADER.fragmentShader,
            uniforms: {
                uNear: { value: this.camera.near },
                uRange: { value: this.camera.far - this.camera.near }
            }
        });
        this.overrideMaterials(meshes, depthMat);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(
            this.renderTarget,
            0,
            0,
            frameRes,
            frameRes,
            pixelBuffer
        );
        this.copyFrameToAtlas(
            pixelBuffer,
            depthAtlas,
            frameX,
            frameY,
            frameSize,
            atlasSize,
            frameRes
        );

        for (const mesh of meshes) {
            const orm = ormMap.get(mesh)!;
            const ormMat = new THREE.ShaderMaterial({
                vertexShader: ORM_MATERIAL_SHADER.vertexShader,
                fragmentShader: ORM_MATERIAL_SHADER.fragmentShader,
                uniforms: {
                    uOrm: { value: orm }
                }
            });
            mesh.material = ormMat;
        }
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.renderer.readRenderTargetPixels(
            this.renderTarget,
            0,
            0,
            frameRes,
            frameRes,
            pixelBuffer
        );
        this.copyFrameToAtlas(
            pixelBuffer,
            ormAtlas,
            frameX,
            frameY,
            frameSize,
            atlasSize,
            frameRes
        );

        this.restoreMaterials(meshes);
        this.scene.remove(model);
    }

    private copyFrameToAtlas(
        framePixels: Uint8Array,
        atlas: Uint8ClampedArray,
        frameX: number,
        frameY: number,
        frameSize: number,
        atlasSize: number,
        frameRes: number
    ) {
        const fps = atlasSize / frameSize;
        for (let py = 0; py < frameRes; py++) {
            const srcY = frameRes - 1 - py;
            const atlasY = Math.floor(frameY * fps + (py * fps) / frameRes);
            if (atlasY >= atlasSize) continue;
            for (let px = 0; px < frameRes; px++) {
                const atlasX = Math.floor(frameX * fps + (px * fps) / frameRes);
                if (atlasX >= atlasSize) continue;
                const srcIdx = (srcY * frameRes + px) * 4;
                const dstIdx = (atlasY * atlasSize + atlasX) * 4;
                atlas[dstIdx] = framePixels[srcIdx];
                atlas[dstIdx + 1] = framePixels[srcIdx + 1];
                atlas[dstIdx + 2] = framePixels[srcIdx + 2];
                atlas[dstIdx + 3] = framePixels[srcIdx + 3];
            }
        }
    }

    private cacheMaterials(meshes: THREE.Mesh[]) {
        for (const mesh of meshes) {
            this.originalMaterials.set(mesh, mesh.material);
        }
    }

    private restoreMaterials(meshes: THREE.Mesh[]) {
        for (const mesh of meshes) {
            const mat = this.originalMaterials.get(mesh);
            if (mat) mesh.material = mat;
        }
    }

    private overrideMaterials(meshes: THREE.Mesh[], material: THREE.Material) {
        for (const mesh of meshes) {
            mesh.material = material;
        }
    }

    dispose() {
        this.renderTarget.dispose();
        this.renderer.dispose();
    }
}

export function saveBakeResultPNG(
    result: BakeResult,
    textureNames: string[],
    encode: (name: string, data: Uint8ClampedArray, width: number, height: number) => void
) {
    const { data, textures } = result;
    const res = data.frames[0] > 0 ? Math.round(Math.sqrt(textures.albedo.length / 4)) : 1024;

    for (const name of textureNames) {
        const texData = (textures as any)[name];
        if (texData) {
            encode(name, texData, res, res);
        }
    }
}
