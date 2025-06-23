// I3DM File Format
// https://github.com/CesiumGS/3d-tiles/blob/master/specification/TileFormats/Instanced3DModel/README.md

import { FeatureTable, BatchTable, BatchTableHeader } from "../utilities/FeatureTable";
import { arrayToString } from "../utilities/arrayToString";
import { Description, LoaderBase } from "./LoaderBase";

export interface I3DMDescription extends Description {
    featureTable: FeatureTable;
    batchTable: BatchTable;
    glbBytes: Uint8Array | null;
}

export class I3DMLoaderBase<
    BatchTableExtensions extends BatchTableHeader
> extends LoaderBase<I3DMDescription> {
    async parse(buffer: ArrayBuffer): Promise<I3DMDescription> {
        const dataView = new DataView(buffer);

        // 32-byte header

        // 4 bytes
        const magic =
            String.fromCharCode(dataView.getUint8(0)) +
            String.fromCharCode(dataView.getUint8(1)) +
            String.fromCharCode(dataView.getUint8(2)) +
            String.fromCharCode(dataView.getUint8(3));

        console.assert(magic === "i3dm");

        // 4 bytes
        const version = dataView.getUint32(4, true);

        console.assert(version === 1);

        // 4 bytes
        const byteLength = dataView.getUint32(8, true);

        console.assert(byteLength === buffer.byteLength);

        // 4 bytes
        const featureTableJSONByteLength = dataView.getUint32(12, true);

        // 4 bytes
        const featureTableBinaryByteLength = dataView.getUint32(16, true);

        // 4 bytes
        const batchTableJSONByteLength = dataView.getUint32(20, true);

        // 4 bytes
        const batchTableBinaryByteLength = dataView.getUint32(24, true);

        // 4 bytes
        const gltfFormat = dataView.getUint32(28, true);

        // Feature Table
        const featureTableStart = 32;
        const featureTableBuffer = buffer.slice(
            featureTableStart,
            featureTableStart + featureTableJSONByteLength + featureTableBinaryByteLength
        );
        const featureTable = new FeatureTable(
            featureTableBuffer,
            0,
            featureTableJSONByteLength,
            featureTableBinaryByteLength
        );

        // Batch Table
        const batchTableStart =
            featureTableStart + featureTableJSONByteLength + featureTableBinaryByteLength;
        const batchTableBuffer = buffer.slice(
            batchTableStart,
            batchTableStart + batchTableJSONByteLength + batchTableBinaryByteLength
        );
        const batchTable = new BatchTable<BatchTableExtensions>(
            batchTableBuffer,
            featureTable.getData("INSTANCES_LENGTH") as number,
            0,
            batchTableJSONByteLength,
            batchTableBinaryByteLength
        );

        const glbStart = batchTableStart + batchTableJSONByteLength + batchTableBinaryByteLength;
        const bodyBytes = new Uint8Array(buffer, glbStart, byteLength - glbStart);

        let glbBytes: Uint8Array | null = null;

        if (gltfFormat) {
            glbBytes = bodyBytes;
        } else {
            const externalUri = this.resolveExternalURL(arrayToString(bodyBytes));
            const response = await fetch(externalUri, this.fetchOptions);

            if (!response.ok) {
                throw new Error(
                    `I3DMLoaderBase: Failed to load file "${externalUri}" with status ${response.status}: ${response.statusText}`
                );
            }

            const externalBuffer = await response.arrayBuffer();
            glbBytes = new Uint8Array(externalBuffer);
        }

        return {
            version,
            featureTable,
            batchTable,
            glbBytes
        };
    }
}
