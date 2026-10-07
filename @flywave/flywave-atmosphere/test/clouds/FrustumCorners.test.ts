/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import { Matrix4, Vector3, WebGPUCoordinateSystem } from "three/webgpu";

import { FrustumCorners } from "../../src/clouds/FrustumCorners";
import { splitFrustum } from "../../src/clouds/splitFrustum";

const EPS = 1e-6;

/**
 * Builds the inverse of a WebGPU reversed-Z perspective projection.
 * FrustumCorners.setFromCamera resolves corners with z_ndc: near=1 / far=0 (the
 * engine's reversedDepthBuffer convention), matching the matrix shape actually
 * consumed by the AtmosphereContext camera.
 */
function makeInverseProjection(near = 1, far = 100, fov = 60, aspect = 1): Matrix4 {
    const t = Math.tan(((fov / 2) * Math.PI) / 180);
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
    return proj.invert();
}

describe("FrustumCorners（视锥角点）", function () {
    it("setFromCamera：reversed-Z 下 near 平面角 z=-near，far 平面角 |z|=far", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(1, 100), 100);
        expect(corners.near[0].z).to.approximately(-1, EPS);
        expect(corners.far[0].z).to.approximately(-100, EPS);
    });

    it("far 角点横向张角是 near 的 far/near 倍", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(1, 100), 100);
        const ratio = Math.abs(corners.far[0].x) / Math.abs(corners.near[0].x);
        expect(ratio).to.approximately(100, 1e-4);
    });

    it("split：单段切割的子视锥在切点处共享边界面", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(1, 100), 100);
        // Two split points produce two segments; the last segment's far is always the
        // original far (the index === length-1 branch)
        const [a, b] = corners.split([0.5, 1]);
        // First segment: near = original near, far = midpoint
        expect(a.near[0].z).to.approximately(corners.near[0].z, EPS);
        expect(a.far[0].z).to.approximately((corners.near[0].z + corners.far[0].z) / 2, 1e-4);
        // Second segment: near = midpoint, far = original far
        expect(b.near[0].z).to.approximately(a.far[0].z, EPS);
        expect(b.far[0].z).to.approximately(corners.far[0].z, EPS);
    });

    it("split：按 CSM 实际切分比例产出 N 段且首尾贴合完整视锥", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(1, 1000), 1000);
        const splits = splitFrustum("practical", 3, 1, 1000, 0.6);
        const frusta = corners.split(splits);
        expect(frusta).to.have.lengthOf(3);
        expect(frusta[0].near[0].z).to.approximately(corners.near[0].z, EPS);
        expect(frusta[2].far[0].z).to.approximately(corners.far[0].z, EPS);
        // Adjacent segments share their splitting plane
        for (let i = 1; i < 3; ++i) {
            expect(frusta[i].near[0].z).to.approximately(frusta[i - 1].far[0].z, 1e-4);
        }
    });

    it("clone/copy 是深拷贝", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(), 100);
        const clone = corners.clone();
        clone.near[0].set(99, 99, 99);
        expect(corners.near[0].x).to.not.equal(99);
        const copied = new FrustumCorners().copy(corners);
        copied.far[1].set(-99, -99, -99);
        expect(corners.far[1].x).to.not.equal(-99);
    });

    it("applyMatrix4：所有角点统一变换", function () {
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(), 100);
        const before = corners.near[0].clone();
        const translate = new Matrix4().makeTranslation(10, 20, 30);
        corners.applyMatrix4(translate);
        const expected = before.clone().applyMatrix4(translate);
        expect(corners.near[0].x).to.approximately(expected.x, EPS);
        expect(corners.near[0].y).to.approximately(expected.y, EPS);
        expect(corners.near[0].z).to.approximately(expected.z, EPS);
    });

    it("far 超出投影范围时被 clamp（multiplyScalar 的 min 语义）", function () {
        // Projection far=100, sampled at 50: the far corner should be scaled to -50
        const corners = new FrustumCorners().setFromCamera(makeInverseProjection(1, 100), 50);
        expect(corners.far[0].z).to.approximately(-50, EPS);
    });

    it("输入约定守卫：reversed-Z 投影把 viewZ=-near 映到 z_ndc=1、-far 映到 0", function () {
        // The corner assumptions of setFromCamera are built on this projection shape;
        // if the upstream matrix convention changes, this assertion fails first,
        // prompting a sync of setFromCamera and this test's construction
        const t = Math.tan((30 * Math.PI) / 180);
        const proj = new Matrix4().makePerspective(
            -t,
            t,
            t,
            -t,
            1,
            100,
            WebGPUCoordinateSystem,
            true
        );
        const ndcNear = new Vector3(0, 0, -1).applyMatrix4(proj);
        const ndcFar = new Vector3(0, 0, -100).applyMatrix4(proj);
        // three's Vector3.applyMatrix4 already performs the perspective divide
        expect(ndcNear.z).to.approximately(1, EPS);
        expect(ndcFar.z).to.approximately(0, EPS);
    });
});
