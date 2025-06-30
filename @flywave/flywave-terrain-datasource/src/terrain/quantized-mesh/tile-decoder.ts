import {
    BufferAttribute,
    DecodedTile,
    DecoderOptions,
    Geometry,
    ITileDecoder,
    OptionsMap,
    RequestController,
    TileInfo
} from "@flywave/flywave-datasource-protocol";
import { Projection, TileKey } from "@flywave/flywave-geoutils";

import decode from "./decoder";

export const QUANTIZED_MESH_TILE_DECODER_ID = "quantized-mesh-tile-decoder";

export class QuantizedMeshTileDecoder implements ITileDecoder {
    connect(): Promise<void> {
        return Promise.resolve();
    }

    dispose() {
        // no impl
    }

    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    /**
     * Rearranges vertices components in more THREE.js-friendly
     * way [x, y, z, x, y, z, ...] instead of
     * [x, x, x,..., y, y, y,... z, z, z, ...].
     *
     * Also, scales x, y, z to be in [0, 1] range.
     *
     * @param {Uint16Array} vertexData
     * @returns {Float32Array}
     */
    constructPositionArray(vertexData) {
        const elementsPerVertex = 3;
        const vertexCount = vertexData.length / 3;
        const positionAttributeArray = new Float32Array(vertexData.length);

        const vertexMaxPosition = 32767;

        for (let i = 0; i < vertexCount; i++) {
            positionAttributeArray[i * elementsPerVertex] = vertexData[i] / vertexMaxPosition;
            positionAttributeArray[i * elementsPerVertex + 1] =
                vertexData[i + vertexCount] / vertexMaxPosition;
            positionAttributeArray[i * elementsPerVertex + 2] =
                vertexData[i + vertexCount * 2] / vertexMaxPosition;
        }

        return positionAttributeArray;
    }

    /**
     * Drops z-coordinate of each vertex to make a UV-map.
     *
     * @param {Float32Array} positionArray
     * @returns {Float32Array}
     */
    constructUvArray(positionArray) {
        return positionArray.filter((item, index) => index % 3 < 2);
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {}

    decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile | undefined> {
        const decodedTile = decode(data);
        const positionArray = this.constructPositionArray(decodedTile.vertexData);
        const uvArray = this.constructUvArray(positionArray);
        const vertexAttributes = [];

        vertexAttributes.push(
            {
                name: "position",
                type: "float",
                buffer: positionArray,
                itemCount: 3,
                metadata: decodedTile.header
            },
            {
                name: "uv",
                type: "float",
                buffer: uvArray,
                itemCount: 2
            }
        );

        Object.keys(decodedTile.extensions).forEach(key => {
            if (key === "vertexNormals" && decodedTile.extensions[key].byteLength > 0) {
                const array = new Uint8Array(decodedTile.extensions[key]);
                vertexAttributes.push({
                    name: "octNormal",
                    type: "float",
                    buffer: array,
                    itemCount: 2
                });
            }
        });

        const verityTile: DecodedTile = {
            techniques: [],
            geometries: [
                {
                    index: {
                        name: "index",
                        type: "uint16",
                        buffer: decodedTile.triangleIndices,
                        itemCount: 1
                    } as BufferAttribute,
                    vertexAttributes
                } as Geometry
            ]
        };

        return Promise.resolve(verityTile);
    }
}
