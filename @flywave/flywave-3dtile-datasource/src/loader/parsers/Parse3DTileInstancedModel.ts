/* Copyright (C) 2025 flywave.gl contributors */

import { eastNorthUpToFixedFrame } from "@flywave/flywave-geoutils";
import { GL } from "@flywave/flywave-utils";
import { Matrix4, Quaternion, Vector3 } from "three";

import Tile3DBatchTable from "../classes/Tile3DBatchTable";
import Tile3DFeatureTable from "../classes/Tile3DFeatureTable";
import { type Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";
import { extractGLTF, parse3DTileGLTFViewSync } from "./helpers/Parse3DTileGltfView";
import { parse3DTileHeaderSync } from "./helpers/Parse3DTileHeader";
import { parse3DTileTablesHeaderSync, parse3DTileTablesSync } from "./helpers/Parse3DTileTables";

export async function parseInstancedModel3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<number> {
    byteOffset = parseInstancedModel(tile, arrayBuffer, byteOffset, options, context);
    await extractGLTF(tile, tile.gltfFormat || 0, options, context);
    return byteOffset;
}

function parseInstancedModel(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: any
): number {
    byteOffset = parse3DTileHeaderSync(tile, arrayBuffer, byteOffset);
    if (tile.version !== 1) {
        throw new Error(`Instanced 3D Model version ${tile.version} is not supported`);
    }

    byteOffset = parse3DTileTablesHeaderSync(tile, arrayBuffer, byteOffset);

    const view = new DataView(arrayBuffer);

    tile.gltfFormat = view.getUint32(byteOffset, true);
    byteOffset += 4;

    // PARSE FEATURE TABLE
    byteOffset = parse3DTileTablesSync(tile, arrayBuffer, byteOffset, options);

    byteOffset = parse3DTileGLTFViewSync(tile, arrayBuffer, byteOffset, options);

    if (!tile?.header?.featureTableJsonByteLength || tile.header.featureTableJsonByteLength === 0) {
        throw new Error("i3dm parser: featureTableJsonByteLength is zero.");
    }

    const featureTable = new Tile3DFeatureTable(tile.featureTableJson, tile.featureTableBinary);

    const instancesLength = featureTable.getGlobalProperty("INSTANCES_LENGTH");
    featureTable.featuresLength = instancesLength;

    if (!Number.isFinite(instancesLength)) {
        throw new Error("i3dm parser: INSTANCES_LENGTH must be defined");
    }

    tile.eastNorthUp = featureTable.getGlobalProperty("EAST_NORTH_UP");
    tile.rtcCenter = featureTable.getGlobalProperty("RTC_CENTER", GL.FLOAT, 3);

    const batchTable = new Tile3DBatchTable(
        tile.batchTableJson,
        tile.batchTableBinary,
        instancesLength
    );

    extractInstancedAttributes(tile, featureTable, batchTable, instancesLength);

    return byteOffset;
}

function extractInstancedAttributes(
    tile: Tiles3DTileContent,
    featureTable: Tile3DFeatureTable,
    batchTable: Tile3DBatchTable,
    instancesLength: number
) {
    const instances = new Array(instancesLength);
    const instancePosition = new Vector3();
    const instanceNormalRight = new Vector3();
    const instanceNormalUp = new Vector3();
    const instanceNormalForward = new Vector3();
    const instanceRotation = new Matrix4();
    const instanceQuaternion = new Quaternion();
    const instanceScale = new Vector3(1, 1, 1);
    const instanceTransform = new Matrix4();
    const scratch1 = new Vector3();
    const scratch2 = new Vector3();
    const scratch3 = new Vector3();
    const scratch4 = new Vector3();

    for (let i = 0; i < instancesLength; i++) {
        let position;

        // Get the instance position
        if (featureTable.hasProperty("POSITION")) {
            position = instancePosition.fromArray(
                featureTable.getProperty("POSITION", GL.FLOAT, 3, i, [])
            );
        } else if (featureTable.hasProperty("POSITION_QUANTIZED")) {
            position = instancePosition.fromArray(
                featureTable.getProperty("POSITION_QUANTIZED", GL.UNSIGNED_SHORT, 3, i, [])
            );

            const quantizedVolumeOffset = featureTable.getGlobalProperty(
                "QUANTIZED_VOLUME_OFFSET",
                GL.FLOAT,
                3
            );
            if (!quantizedVolumeOffset) {
                throw new Error(
                    "i3dm parser: QUANTIZED_VOLUME_OFFSET must be defined for quantized positions."
                );
            }

            const quantizedVolumeScale = featureTable.getGlobalProperty(
                "QUANTIZED_VOLUME_SCALE",
                GL.FLOAT,
                3
            );
            if (!quantizedVolumeScale) {
                throw new Error(
                    "i3dm parser: QUANTIZED_VOLUME_SCALE must be defined for quantized positions."
                );
            }

            const MAX_UNSIGNED_SHORT = 65535.0;
            instancePosition.set(
                (instancePosition.x / MAX_UNSIGNED_SHORT) * quantizedVolumeScale[0] +
                    quantizedVolumeOffset[0],
                (instancePosition.y / MAX_UNSIGNED_SHORT) * quantizedVolumeScale[1] +
                    quantizedVolumeOffset[1],
                (instancePosition.z / MAX_UNSIGNED_SHORT) * quantizedVolumeScale[2] +
                    quantizedVolumeOffset[2]
            );
            position = instancePosition;
        }

        if (!position) {
            throw new Error(
                "i3dm: POSITION or POSITION_QUANTIZED must be defined for each instance."
            );
        }

        instancePosition.copy(position);

        // Get the instance rotation
        const normalUp = scratch1.fromArray(
            featureTable.getProperty("NORMAL_UP", GL.FLOAT, 3, i, [])
        );
        const normalRight = scratch2.fromArray(
            featureTable.getProperty("NORMAL_RIGHT", GL.FLOAT, 3, i, [])
        );

        let hasCustomOrientation = false;
        if (normalUp) {
            if (!normalRight) {
                throw new Error(
                    "i3dm: Custom orientation requires both NORMAL_UP and NORMAL_RIGHT."
                );
            }
            instanceNormalUp.copy(normalUp);
            instanceNormalRight.copy(normalRight);
            hasCustomOrientation = true;
        } else {
            const octNormalUp = scratch1.fromArray(
                featureTable.getProperty("NORMAL_UP_OCT32P", GL.UNSIGNED_SHORT, 2, i, [])
            );
            const octNormalRight = scratch2.fromArray(
                featureTable.getProperty("NORMAL_RIGHT_OCT32P", GL.UNSIGNED_SHORT, 2, i, [])
            );

            if (octNormalUp) {
                if (!octNormalRight) {
                    throw new Error(
                        "i3dm: oct-encoded orientation requires NORMAL_UP_OCT32P and NORMAL_RIGHT_OCT32P"
                    );
                }
                throw new Error("i3dm: oct-encoded orientation not implemented");
            } else if (tile.eastNorthUp) {
                eastNorthUpToFixedFrame(instancePosition, instanceTransform);
                instanceRotation.extractRotation(instanceTransform);
            } else {
                instanceRotation.identity();
            }
        }

        if (hasCustomOrientation) {
            instanceNormalForward.crossVectors(instanceNormalRight, instanceNormalUp).normalize();
            instanceRotation.set(
                instanceNormalRight.x,
                instanceNormalUp.x,
                instanceNormalForward.x,
                0, // Row 1 (x-axis direction)
                instanceNormalRight.y,
                instanceNormalUp.y,
                instanceNormalForward.y,
                0, // Row 2 (y-axis direction)
                instanceNormalRight.z,
                instanceNormalUp.z,
                instanceNormalForward.z,
                0, // Row 3 (z-axis direction)
                0,
                0,
                0,
                1 // Row 4 (homogeneous coordinates)
            );
        }

        instanceQuaternion.setFromRotationMatrix(instanceRotation);

        // Get the instance scale
        instanceScale.set(1.0, 1.0, 1.0);
        const scale = featureTable.getProperty("SCALE", GL.FLOAT, 1, i, scratch3);
        if (Number.isFinite(scale)) {
            instanceScale.multiplyScalar(scale);
        }
        const nonUniformScale = scratch1.fromArray(
            featureTable.getProperty("SCALE_NON_UNIFORM", GL.FLOAT, 3, i, [])
        );
        if (nonUniformScale) {
            instanceScale.multiply(nonUniformScale);
        }

        // Get the batchId
        let batchId = featureTable.getProperty("BATCH_ID", GL.UNSIGNED_SHORT, 1, i, scratch4);
        if (batchId === undefined) {
            batchId = i;
        }

        // Create the model matrix and the instance
        instanceTransform.compose(instancePosition, instanceQuaternion, instanceScale);

        instances[i] = {
            modelMatrix: instanceTransform.clone(),
            batchId
        };
    }

    tile.instances = instances;
}
