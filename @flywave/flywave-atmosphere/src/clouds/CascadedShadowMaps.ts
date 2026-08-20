import { Box3, Matrix4, Object3D, Vector2, Vector3, type PerspectiveCamera } from "three/webgpu";

import { FrustumCorners } from "./FrustumCorners";
import { splitFrustum, type FrustumSplitMode } from "./splitFrustum";

const vectorScratch1 = new Vector3();
const vectorScratch2 = new Vector3();
const matrixScratch1 = new Matrix4();
const matrixScratch2 = new Matrix4();
const frustumScratch = new FrustumCorners();
const boxScratch = new Box3();

export interface Cascade {
    readonly interval: Vector2;
    readonly matrix: Matrix4;
    readonly inverseMatrix: Matrix4;
    readonly projectionMatrix: Matrix4;
    readonly inverseProjectionMatrix: Matrix4;
    readonly viewMatrix: Matrix4;
    readonly inverseViewMatrix: Matrix4;
}

export interface CascadedShadowMapsOptions {
    cascadeCount: number;
    mapSize: Vector2;
    maxFar?: number | null;
    farScale?: number;
    splitMode?: FrustumSplitMode;
    splitLambda?: number;
    margin?: number;
    fade?: boolean;
}

export const cascadedShadowMapsDefaults = {
    maxFar: null,
    farScale: 1,
    splitMode: "practical" as FrustumSplitMode,
    splitLambda: 0.5,
    margin: 0,
    fade: true
};

export class CascadedShadowMaps {
    readonly cascades: Cascade[] = [];

    readonly mapSize = new Vector2();
    maxFar: number | null;
    farScale: number;
    splitMode: FrustumSplitMode;
    splitLambda: number;
    margin: number;
    fade: boolean;

    private readonly cameraFrustum = new FrustumCorners();
    private readonly frusta: FrustumCorners[] = [];
    private readonly splits: number[] = [];
    private _far = 0;

    constructor(options: CascadedShadowMapsOptions) {
        const { cascadeCount, mapSize, maxFar, farScale, splitMode, splitLambda, margin, fade } = {
            ...cascadedShadowMapsDefaults,
            ...options
        };
        this.cascadeCount = cascadeCount;
        this.mapSize.copy(mapSize);
        this.maxFar = maxFar;
        this.farScale = farScale;
        this.splitMode = splitMode;
        this.splitLambda = splitLambda;
        this.margin = margin;
        this.fade = fade;
    }

    get cascadeCount(): number {
        return this.cascades.length;
    }

    set cascadeCount(value: number) {
        if (value !== this.cascadeCount) {
            for (let i = 0; i < value; ++i) {
                this.cascades[i] ??= {
                    interval: new Vector2(),
                    matrix: new Matrix4(),
                    inverseMatrix: new Matrix4(),
                    projectionMatrix: new Matrix4(),
                    inverseProjectionMatrix: new Matrix4(),
                    viewMatrix: new Matrix4(),
                    inverseViewMatrix: new Matrix4()
                };
            }
            this.cascades.length = value;
        }
    }

    get far(): number {
        return this._far;
    }

    private updateIntervals(camera: PerspectiveCamera): void {
        const cascadeCount = this.cascadeCount;
        const splits = this.splits;
        const far = this.far;
        // Reference splits assume near ≪ far (their camera near = 1). RTE
        // cameras pull near up to viewing distance, making near/far ≈ 1 and
        // collapsing practical splits to ~[1, 1, 1] — all cascades then share
        // nearly the same ortho box and the same region is marched 3×. Split
        // in the thickness domain instead (nominal near = 1, far = thickness)
        // to reproduce the reference distribution ([≈0.134, ≈0.28, 1] at
        // λ=0.6, N=3) as fractions of the actual [near, far] span. Consumers
        // (FrustumCorners.split corner lerp and the shader's slab-normalized
        // cascade selection) share this fraction basis.
        const thickness = Math.max(far - camera.near, 2);
        splitFrustum(this.splitMode, cascadeCount, 1, thickness, this.splitLambda, splits);
        this.cameraFrustum.setFromCamera(camera.projectionMatrixInverse, far);
        this.cameraFrustum.split(splits, this.frusta);

        const cascades = this.cascades;
        for (let i = 0; i < cascadeCount; ++i) {
            cascades[i].interval.set(splits[i - 1] ?? 0, splits[i] ?? 0);
        }
    }

    private getFrustumRadius(camera: PerspectiveCamera, frustum: FrustumCorners): number {
        const nearCorners = frustum.near;
        const farCorners = frustum.far;
        let diagonalLength = Math.max(
            farCorners[0].distanceTo(farCorners[2]),
            farCorners[0].distanceTo(nearCorners[2])
        );

        if (this.fade) {
            const near = camera.near;
            const far = this.far;
            const distance = farCorners[0].z / (far - near);
            diagonalLength += 0.25 * distance ** 2 * (far - near);
        }
        return diagonalLength * 0.5;
    }

    private updateMatrices(camera: PerspectiveCamera, sunDirection: Vector3, distance = 1): void {
        const lightOrientationMatrix = matrixScratch1.lookAt(
            vectorScratch1.setScalar(0),
            vectorScratch2.copy(sunDirection).multiplyScalar(-1),
            Object3D.DEFAULT_UP
        );
        const cameraToLightMatrix = matrixScratch2.multiplyMatrices(
            matrixScratch2.copy(lightOrientationMatrix).invert(),
            camera.matrixWorld
        );

        const frusta = this.frusta;
        const cascades = this.cascades;
        const margin = this.margin;
        const mapSize = this.mapSize;

        for (let i = 0; i < frusta.length; ++i) {
            const cascade = cascades[i];

            const radius = this.getFrustumRadius(camera, frusta[i]);
            const left = -radius;
            const right = radius;
            const top = radius;
            const bottom = -radius;
            cascade.projectionMatrix.makeOrthographic(
                left,
                right,
                top,
                bottom,
                -this.margin,
                radius * 2 + this.margin
            );

            const { near, far } = frustumScratch.copy(frusta[i]).applyMatrix4(cameraToLightMatrix);
            const bbox = boxScratch.makeEmpty();
            for (let j = 0; j < 4; j++) {
                bbox.expandByPoint(near[j]);
                bbox.expandByPoint(far[j]);
            }
            const center = bbox.getCenter(vectorScratch1);
            center.z = bbox.max.z + margin;

            const texelWidth = (right - left) / mapSize.width;
            const texelHeight = (top - bottom) / mapSize.height;
            center.x = Math.round(center.x / texelWidth) * texelWidth;
            center.y = Math.round(center.y / texelHeight) * texelHeight;

            center.applyMatrix4(lightOrientationMatrix);
            const position = vectorScratch2.copy(sunDirection).multiplyScalar(distance).add(center);
            cascade.inverseViewMatrix
                .lookAt(center, position, Object3D.DEFAULT_UP)
                .setPosition(position);
        }
    }

    update(
        camera: PerspectiveCamera,
        sunDirection: Vector3,
        matrixViewToTarget: Matrix4,
        distance?: number
    ): void {
        this._far =
            this.maxFar != null
                ? Math.min(this.maxFar, camera.far * this.farScale)
                : camera.far * this.farScale;

        this.updateIntervals(camera);
        this.updateMatrices(camera, sunDirection, distance);

        const cascades = this.cascades;
        const cascadeCount = this.cascadeCount;
        for (let i = 0; i < cascadeCount; ++i) {
            const {
                matrix,
                inverseMatrix,
                projectionMatrix,
                inverseProjectionMatrix,
                viewMatrix,
                inverseViewMatrix
            } = cascades[i];
            inverseProjectionMatrix.copy(projectionMatrix).invert();
            viewMatrix.copy(inverseViewMatrix).invert();
            matrix.copy(projectionMatrix).multiply(viewMatrix);
            inverseMatrix.copy(inverseViewMatrix).multiply(inverseProjectionMatrix);
        }
    }
}
