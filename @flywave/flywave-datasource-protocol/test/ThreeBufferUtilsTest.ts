/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import * as THREE from "three";

import { type BufferAttribute, type Geometry } from "../src/DecodedTile";
import { ThreeBufferUtils } from "../src/ThreeBufferUtils";

describe("ThreeBufferUtils", function () {
    function bufferElementSize(type: string) {
        switch (type) {
            case "int8":
                return 1;
            case "uint8":
                return 1;
            case "int16":
                return 2;
            case "uint16":
                return 2;
            case "int32":
                return 4;
            case "uint32":
                return 4;
            case "float":
                return 4;
        }
        throw new Error("Unknown buffer element type");
    }
    function compareBufferAttribute(
        threeBufferAttribute: THREE.BufferAttribute,
        flywaveBufferAttribute: BufferAttribute
    ) {
        expect(threeBufferAttribute.itemSize).to.be.equal(flywaveBufferAttribute.itemCount);
        const itemSize = bufferElementSize(flywaveBufferAttribute.type);
        expect(threeBufferAttribute.array.length).to.be.equal(
            flywaveBufferAttribute.buffer.byteLength / itemSize
        );
        expect(threeBufferAttribute.normalized).to.be.equal(flywaveBufferAttribute.normalized);
    }

    function compareBufferGeometry(
        threeBufferGeometry: THREE.BufferGeometry,
        flywaveBufferGeometry: Geometry
    ) {
        if (threeBufferGeometry.index === null) {
            assert(flywaveBufferGeometry.index === undefined);
        } else {
            assert(flywaveBufferGeometry.index !== undefined);
            compareBufferAttribute(threeBufferGeometry.index, flywaveBufferGeometry.index!);
        }
        for (const attrName in threeBufferGeometry.attributes) {
            if (!threeBufferGeometry.hasOwnProperty(attrName)) {
                continue;
            }
            const threeAttr = threeBufferGeometry.attributes[attrName];
            assert(threeAttr !== undefined);
            if (threeAttr.array === undefined) {
                // TODO: Check InterleavedBufferAttribute as well
                continue;
            }
            const threeBufferAttribute = threeAttr as THREE.BufferAttribute;
            const flywaveAttr = flywaveBufferGeometry.vertexAttributes?.find(
                (buf: BufferAttribute) => {
                    return buf.name === attrName;
                }
            );
            assert(flywaveAttr !== undefined);
            compareBufferAttribute(threeBufferAttribute, flywaveAttr!);
        }
    }
    it("convert buffer geometry w/ index buffer", function () {
        const threeBufferGeometry = new THREE.BoxGeometry();
        const techniqueIndex = 42;

        const flywaveBufferGeometry = ThreeBufferUtils.fromThreeBufferGeometry(
            threeBufferGeometry,
            techniqueIndex
        );

        compareBufferGeometry(threeBufferGeometry, flywaveBufferGeometry);
    });
    it("convert buffer geometry w/o index buffer", function () {
        const threeBufferGeometry = new THREE.BufferGeometry();
        const vertices = new Array<number>(30);
        const normals = new Array<number>(30);
        const uvs = new Array<number>(20);

        threeBufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        threeBufferGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        threeBufferGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

        const techniqueIndex = 42;

        const flywaveBufferGeometry = ThreeBufferUtils.fromThreeBufferGeometry(
            threeBufferGeometry,
            techniqueIndex
        );

        compareBufferGeometry(threeBufferGeometry, flywaveBufferGeometry);
    });
});
