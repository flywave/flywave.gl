/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import { Matrix4, PerspectiveCamera, Vector2, Vector3, WebGPUCoordinateSystem } from "three/webgpu";

import { CascadedShadowMaps } from "../../src/clouds/CascadedShadowMaps";
import { splitFrustum } from "../../src/clouds/splitFrustum";

const EPS = 1e-6;

function makeCamera(near = 1, far = 5000): PerspectiveCamera {
    const camera = new PerspectiveCamera(60, 16 / 9, near, far);
    // CloudRenderNode consumes a WebGPU reversed-Z projection (consistent with the
    // engine's reversedDepthBuffer); CascadedShadowMaps.setFromCamera resolves corners
    // with z_ndc: near=1 / far=0. Write a projection matrix of that shape manually to
    // bypass PerspectiveCamera's default WebGL matrix.
    const t = Math.tan(((60 / 2) * Math.PI) / 180);
    const aspect = 16 / 9;
    const proj = new Matrix4().makePerspective(
        -t * aspect,
        t * aspect,
        t,
        -t,
        near,
        far,
        WebGPUCoordinateSystem,
        true
    );
    camera.projectionMatrix.copy(proj);
    camera.projectionMatrixInverse.copy(proj).invert();
    return camera;
}

// Oblique sun direction to avoid being parallel to Object3D.DEFAULT_UP, which would degenerate lookAt
const SUN = new Vector3(0.4, -0.3, 0.85).normalize();

describe("CascadedShadowMaps（云影 CSM）", function () {
    it("update 后 far = min(maxFar, camera.far * farScale)", function () {
        const csm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            maxFar: 100000,
            splitLambda: 0.6,
            fade: false
        });
        const camera = makeCamera(1, 5000);
        csm.update(camera, SUN, undefined, 1000);
        expect(csm.far).to.equal(5000);

        csm.farScale = 2;
        csm.update(camera, SUN, undefined, 1000);
        expect(csm.far).to.equal(10000);

        csm.farScale = 1;
        csm.maxFar = 3000;
        csm.update(camera, SUN, undefined, 1000);
        expect(csm.far).to.equal(3000);
    });

    it("级联区间连续覆盖 [0,1] 且与 splitFrustum 一致", function () {
        const csm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            maxFar: 100000,
            splitLambda: 0.6,
            fade: false
        });
        const camera = makeCamera(1, 5000);
        csm.update(camera, SUN, undefined, 1000);
        const splits = splitFrustum("practical", 3, camera.near, csm.far, 0.6);
        let prev = 0;
        for (let i = 0; i < 3; ++i) {
            expect(csm.cascades[i].interval.x).to.approximately(prev, EPS);
            expect(csm.cascades[i].interval.y).to.approximately(splits[i], 1e-9);
            prev = splits[i];
        }
        expect(csm.cascades[2].interval.y).to.approximately(1, 1e-9);
    });

    it("matrix 与 inverseMatrix 互逆，投影为正交投影", function () {
        const csm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            maxFar: 100000,
            splitLambda: 0.6,
            fade: false
        });
        csm.update(makeCamera(), SUN, undefined, 1000);
        for (const cascade of csm.cascades) {
            const m = cascade.matrix.elements;
            const inv = cascade.inverseMatrix.elements;
            // matrix × inverseMatrix ≈ I: check the diagonal and key zero entries
            expect(m[0] * inv[0] + m[4] * inv[1] + m[8] * inv[2] + m[12] * inv[3]).to.approximately(
                1,
                1e-4
            );
            expect(m[1] * inv[0] + m[5] * inv[1] + m[9] * inv[2] + m[13] * inv[3]).to.approximately(
                0,
                1e-4
            );
            // Orthographic projection signature: w row = (0,0,0,1)
            const p = cascade.projectionMatrix.elements;
            expect(p[3]).to.equal(0);
            expect(p[7]).to.equal(0);
            expect(p[11]).to.equal(0);
            expect(p[15]).to.equal(1);
        }
    });

    it("fade 开启会扩大级联包围半径（投影 x 缩放变小）", function () {
        const camera = makeCamera();
        const noFade = new CascadedShadowMaps({
            cascadeCount: 1,
            mapSize: new Vector2(512, 512),
            fade: false
        });
        const fade = new CascadedShadowMaps({
            cascadeCount: 1,
            mapSize: new Vector2(512, 512),
            fade: true
        });
        noFade.update(camera, SUN, undefined, 1000);
        fade.update(camera, SUN, undefined, 1000);
        expect(fade.cascades[0].projectionMatrix.elements[0]).to.be.below(
            noFade.cascades[0].projectionMatrix.elements[0]
        );
    });

    it("splitMode 影响 interval 划分", function () {
        const uniformCsm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            splitMode: "uniform"
        });
        const logCsm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            splitMode: "logarithmic"
        });
        const camera = makeCamera(1, 10000);
        uniformCsm.update(camera, SUN, undefined, 1000);
        logCsm.update(camera, SUN, undefined, 1000);
        expect(logCsm.cascades[0].interval.y).to.be.below(uniformCsm.cascades[0].interval.y);
    });

    it("cascadeCount setter 增减并复用既有对象", function () {
        const csm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512)
        });
        const first = csm.cascades[0];
        csm.cascadeCount = 2;
        expect(csm.cascades).to.have.lengthOf(2);
        expect(csm.cascades[0]).to.equal(first);
        csm.cascadeCount = 4;
        expect(csm.cascades).to.have.lengthOf(4);
        expect(csm.cascades[0]).to.equal(first);
    });

    it("update 产出有限矩阵（无 NaN）", function () {
        const csm = new CascadedShadowMaps({
            cascadeCount: 3,
            mapSize: new Vector2(512, 512),
            splitLambda: 0.6
        });
        csm.update(makeCamera(), SUN, undefined, 100000);
        for (const cascade of csm.cascades) {
            for (const m of [
                cascade.matrix,
                cascade.inverseMatrix,
                cascade.viewMatrix,
                cascade.inverseViewMatrix,
                cascade.projectionMatrix,
                cascade.inverseProjectionMatrix
            ]) {
                for (const v of m.elements) {
                    expect(v, "matrix element").to.be.finite;
                }
            }
        }
    });
});
