/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { resolveGltfUrl } from "../../src/loader/parsers/helpers/Parse3DTileGltfView";
import { parseInstancedModel3DTile } from "../../src/loader/parsers/Parse3DTileInstancedModel";
import { type Tiles3DTileContent } from "../../src/loader/types";

const TILE_URL = "http://127.0.0.1:9002/gudao_test/output/i3dm/i3dm_6_0.i3dm";

function padLength(length: number, alignment: number): number {
    return (alignment - (length % alignment)) % alignment;
}

/** Minimal but valid GLB (glTF 2.0, no geometry) so that GLTFLoader.parse succeeds */
function buildMinimalGLB(): ArrayBuffer {
    const json = JSON.stringify({
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: []
    });
    const jsonBytes = new TextEncoder().encode(json);
    const jsonPadding = padLength(jsonBytes.length, 4);
    const jsonChunkLength = jsonBytes.length + jsonPadding;
    const totalLength = 12 + 8 + jsonChunkLength;

    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, 0x46546c67, true); // "glTF"
    view.setUint32(4, 2, true); // version
    view.setUint32(8, totalLength, true);

    view.setUint32(12, jsonChunkLength, true);
    view.setUint32(16, 0x4e4f534a, true); // "JSON"
    bytes.set(jsonBytes, 20);
    bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonChunkLength); // pad with spaces

    return buffer;
}

/**
 * Builds an i3dm tile with one instance and gltfFormat = 0 (external glTF URI),
 * laid out exactly like the exporter output seen in the wild:
 * header | table lengths | gltfFormat | featureTable JSON | featureTable binary | glTF URI
 */
function buildI3dmWithGltfUri(gltfUri: string): ArrayBuffer {
    const featureTableJsonText = JSON.stringify({
        INSTANCES_LENGTH: 1,
        POSITION: { byteOffset: 0, componentType: "FLOAT", type: "VEC3" }
    });
    const featureTableJsonLength =
        featureTableJsonText.length + padLength(featureTableJsonText.length, 8);
    const featureTableBinaryLength = 16; // one VEC3 float (12) padded to 8-byte alignment
    const gltfUriText = gltfUri + " ".repeat(padLength(gltfUri.length, 8));

    const byteLength =
        12 + 16 + 4 + featureTableJsonLength + featureTableBinaryLength + gltfUriText.length;

    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Fixed header
    view.setUint32(0, 0x6d643369, true); // "i3dm"
    view.setUint32(4, 1, true); // version
    view.setUint32(8, byteLength, true);

    // Table lengths
    view.setUint32(12, featureTableJsonLength, true);
    view.setUint32(16, featureTableBinaryLength, true);
    view.setUint32(20, 0, true);
    view.setUint32(24, 0, true);

    // glTF format: 0 = external URI
    view.setUint32(28, 0, true);

    let offset = 32;
    bytes.set(new TextEncoder().encode(featureTableJsonText), offset);
    bytes.fill(0x20, offset + featureTableJsonText.length, offset + featureTableJsonLength);
    offset += featureTableJsonLength;

    // POSITION of the single instance
    view.setFloat32(offset, 1, true);
    view.setFloat32(offset + 4, 2, true);
    view.setFloat32(offset + 8, 3, true);
    offset += featureTableBinaryLength;

    bytes.set(new TextEncoder().encode(gltfUriText), offset);

    return buffer;
}

function fakeFetch(responseBody: ArrayBuffer, status = 200) {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
        calls.push(url);
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? "OK" : "Not Found",
            arrayBuffer: async () => responseBody
        };
    };
    return { calls, fetchFn };
}

describe("i3dm 外部 glTF URI 解析（gltfFormat = 0）", function () {
    it("相对 URI 以瓦片自身 URL 为 base 解析，而不是以页面 URL 为 base", function () {
        expect(resolveGltfUrl("../templates/model.glb", TILE_URL)).to.equal(
            "http://127.0.0.1:9002/gudao_test/output/templates/model.glb"
        );
        // 页面来源（示例 dev server）绝不应成为 base
        expect(
            resolveGltfUrl(
                "../templates/model.glb",
                "http://127.0.0.1/gudao_test/output/i3dm/t.i3dm"
            )
        ).to.equal("http://127.0.0.1/gudao_test/output/templates/model.glb");
    });

    it("绝对 URI / data URI 原样保留", function () {
        expect(resolveGltfUrl("https://cdn.example.com/a.glb", TILE_URL)).to.equal(
            "https://cdn.example.com/a.glb"
        );
        expect(resolveGltfUrl("data:application/octet-stream;base64,AA==", TILE_URL)).to.equal(
            "data:application/octet-stream;base64,AA=="
        );
    });

    it("没有 base 时保持原样（不抛异常）", function () {
        expect(resolveGltfUrl("../templates/model.glb", undefined)).to.equal(
            "../templates/model.glb"
        );
    });

    it("解析 i3dm 时用绝对化后的 glTF URL 发起请求", async function () {
        const { calls, fetchFn } = fakeFetch(buildMinimalGLB());
        const tile = { shape: "tile3d" } as Tiles3DTileContent;

        await parseInstancedModel3DTile(
            tile,
            buildI3dmWithGltfUri("../templates/c11dcd626c58a292.glb"),
            0,
            { "3d-tiles": { loadGLTF: true } },
            { url: TILE_URL, fetch: fetchFn }
        );

        expect(calls).to.deep.equal([
            "http://127.0.0.1:9002/gudao_test/output/templates/c11dcd626c58a292.glb"
        ]);
        expect(tile.gltfUrl).to.equal(
            "http://127.0.0.1:9002/gudao_test/output/templates/c11dcd626c58a292.glb"
        );
        expect(tile.instances!.length).to.equal(1);
        expect(tile.gltf).to.be.an("object");
    });

    it("404 时抛出带已解析 URL 的明确错误", async function () {
        const { fetchFn } = fakeFetch(new ArrayBuffer(0), 404);
        let error: Error | undefined;

        try {
            await parseInstancedModel3DTile(
                { shape: "tile3d" } as Tiles3DTileContent,
                buildI3dmWithGltfUri("../templates/ff01c7bc4dca5156.glb"),
                0,
                { "3d-tiles": { loadGLTF: true } },
                { url: TILE_URL, fetch: fetchFn }
            );
        } catch (e) {
            error = e as Error;
        }

        expect(error).to.be.instanceOf(Error);
        expect(error!.message).to.contain(
            "http://127.0.0.1:9002/gudao_test/output/templates/ff01c7bc4dca5156.glb"
        );
    });
});
