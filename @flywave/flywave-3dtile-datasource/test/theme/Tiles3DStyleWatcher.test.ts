/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import { expect } from "chai";

import { Tiles3DStyleWatcher } from "../../src/theme/Tiles3DStyleWatcher";

const THEME: any = {
    styles: {
        "3dtiles": [
            {
                id: "by-height",
                when: "height >= 15",
                technique: "tile3d",
                color: "#ff0000",
                opacity: 1
            }
        ]
    }
};

function makeB3DMTile(uri: string = "0/0.b3dm"): any {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("_BATCHID", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 1]), 1));
    const originMat = new THREE.MeshStandardMaterial();
    originMat.color.set(0xffffff);
    const mesh = new THREE.Mesh(geometry, originMat);
    const scene = new THREE.Scene();
    scene.add(mesh);
    (scene as any).batchTable = { json: { height: [10, 20] } };
    (scene as any).batchLength = 2;
    const tile = {
        __basePath: "mock://tiles",
        content: { uri },
        cached: { scene, geometry: [geometry], materials: [originMat] }
    };
    return { tile, mesh, originMat, geometry, scene };
}

function spyDispose(material: any): () => number {
    let count = 0;
    const original = material.dispose.bind(material);
    material.dispose = () => {
        count++;
        original();
    };
    return () => count;
}

const TILE_ID = "mock://tiles0/0.b3dm";

describe("Tiles3DStyleWatcher（批材质生命周期）", function () {
    let watcher: Tiles3DStyleWatcher;
    let tile: any;
    let mesh: THREE.Mesh;
    let originMat: THREE.MeshStandardMaterial;

    beforeEach(function () {
        watcher = new Tiles3DStyleWatcher(THEME, "3dtiles");
        ({ tile, mesh, originMat } = makeB3DMTile());
    });

    it("首次激活：按原始材质逐个创建批材质并挂载，保存原材质", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);

        const applied = (watcher as any).m_appliedMaterials.get(TILE_ID);
        expect(applied).to.have.lengthOf(1);
        expect(mesh.material).to.not.equal(originMat);
        expect((mesh.material as any).userData.originUUID).to.equal(originMat.uuid);
        expect(mesh.userData.originalMaterial).to.equal(originMat);
    });

    it("无逐出的反复激活/失活事件：已挂材质零触碰（同实例、零 dispose）", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        const first = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];
        const disposedCount = spyDispose(first);

        watcher.watchTileChange(tile, new Set(), false);
        watcher.watchTileChange(tile, new Set([tile]), true);
        watcher.watchTileChange(tile, new Set([tile]), true);

        expect(mesh.material).to.equal(first);
        expect(disposedCount()).to.equal(0);
    });

    it("样式更新重放：isCached 分支只重算样式，同一实例重挂", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        const first = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];
        const setBatchStylesSpy: any[] = [];
        (first as any).setBatchStyles = (styles: any) => setBatchStylesSpy.push(styles);

        const updated = watcher.updateStyleById("by-height", { color: "#0000ff" });
        expect(updated).to.equal(true);
        expect(setBatchStylesSpy).to.have.lengthOf(1);
        expect(mesh.material).to.equal(first);
    });

    it("逐出（onTileDisposed）：清空批材质/要素登记并遗忘 uri", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        watcher.onTileDisposed(tile);

        expect((watcher as any).m_appliedMaterials.has(TILE_ID)).to.equal(false);
        expect((watcher as any).m_tileFeatures.has(TILE_ID)).to.equal(false);
        expect((watcher as any)._watchIds.has("mock://tiles/0/0.b3dm")).to.equal(false);
    });

    it("重解析后的首次激活：全新实例套上全新 mesh（样式恢复）", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        const first = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];

        // 引擎 disposeTile 会经 cached.materials 别名回收实例，这里模拟之
        first.dispose();
        watcher.onTileDisposed(tile);

        const fresh = makeB3DMTile();
        tile.cached = {
            scene: fresh.scene,
            geometry: [fresh.geometry],
            materials: [fresh.originMat]
        };
        watcher.watchTileChange(tile, new Set([tile]), true);

        const second = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];
        expect(second).to.exist;
        expect(second).to.not.equal(first);
        expect(fresh.mesh.material).to.equal(second);
        expect((fresh.mesh.material as any).userData.originUUID).to.equal(fresh.originMat.uuid);
    });

    it("dispose()：无 mapRenderingManager 也不崩溃（可选链回归），恢复原材质并回收实例", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        const first = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];
        const disposedCount = spyDispose(first);

        expect(() => watcher.dispose()).to.not.throw();
        expect(mesh.material).to.equal(originMat);
        expect(disposedCount()).to.equal(1);
        expect((watcher as any).m_appliedMaterials.size).to.equal(0);
    });

    it("无匹配样式的瓦片（m_hasBatchStyles=false）不创建批材质", function () {
        const bare = new Tiles3DStyleWatcher({ styles: {} } as any, "3dtiles");
        bare.watchTileChange(tile, new Set([tile]), true);
        expect((bare as any).m_appliedMaterials.size).to.equal(0);
        expect(mesh.material).to.equal(originMat);
    });

    it("churn 压力：30 次连续 updateStyleById 零重建零 dispose（渲染路径零操作铁律）", function () {
        watcher.watchTileChange(tile, new Set([tile]), true);
        const first = (watcher as any).m_appliedMaterials.get(TILE_ID)[0];
        const disposedCount = spyDispose(first);
        const setBatchStylesCalls: any[] = [];
        (first as any).setBatchStyles = (styles: any) => setBatchStylesCalls.push(styles);

        for (let i = 0; i < 30; i++) {
            const color = `#0000${i.toString(16).padStart(2, "0")}`;
            expect(watcher.updateStyleById("by-height", { color })).to.equal(true);
        }

        expect(setBatchStylesCalls).to.have.lengthOf(30);
        expect(mesh.material).to.equal(first);
        expect(disposedCount()).to.equal(0);
        expect((watcher as any).m_appliedMaterials.get(TILE_ID)[0]).to.equal(first);
    });

    it("多瓦片部分逐出：其余瓦片实例不受影响，逐出瓦片重解析后独立重建", function () {
        const tileA = tile;
        const tileIdA = TILE_ID;
        const createdB = makeB3DMTile("1/1.b3dm");
        const tileIdB = "mock://tiles1/1.b3dm";

        watcher.watchTileChange(tileA, new Set([tileA]), true);
        watcher.watchTileChange(createdB.tile, new Set([tileA, createdB.tile]), true);

        const instanceA = (watcher as any).m_appliedMaterials.get(tileIdA)[0];
        const instanceB = (watcher as any).m_appliedMaterials.get(tileIdB)[0];
        expect(instanceA).to.exist;
        expect(instanceB).to.exist;
        expect(instanceB).to.not.equal(instanceA);

        // B 逐出（引擎 disposeTile 同步回收其实例），A/C 不受影响
        instanceB.dispose();
        watcher.onTileDisposed(createdB.tile);
        expect((watcher as any).m_appliedMaterials.get(tileIdA)[0]).to.equal(instanceA);
        expect((watcher as any).m_appliedMaterials.has(tileIdB)).to.equal(false);

        // B 重新解析后复活：只为 B 重建
        const freshB = makeB3DMTile("1/1.b3dm");
        watcher.watchTileChange(freshB.tile, new Set([tileA, freshB.tile]), true);

        const rebuiltB = (watcher as any).m_appliedMaterials.get(tileIdB)[0];
        expect(rebuiltB).to.exist;
        expect(rebuiltB).to.not.equal(instanceB);
        expect((watcher as any).m_appliedMaterials.get(tileIdA)[0]).to.equal(instanceA);
        expect(freshB.mesh.material).to.equal(rebuiltB);
        expect(tileA.cached.scene.children[0].material).to.equal(instanceA);
    });
});
