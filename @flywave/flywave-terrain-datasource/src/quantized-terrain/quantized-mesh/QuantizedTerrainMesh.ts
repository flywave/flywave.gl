/* Copyright (C) 2025 flywave.gl contributors */

import { getProjection, getProjectionName } from "@flywave/flywave-datasource-protocol";
import {
    type GeoBoxArray,
    type GeoCoordinates,
    type Projection,
    GeoBox
} from "@flywave/flywave-geoutils";
import {
    type SerializableGeometryData,
    deserializeBufferGeometry,
    serializeBufferGeometry
} from "@flywave/flywave-utils/bufferGeometryTransfer";
import { estimateGeometryMemory } from "@flywave/flywave-utils/meshMemoryUtils";
import {
    type BufferGeometry,
    type BufferGeometryEventMap,
    type DataTextureImageData,
    type Material,
    type NormalBufferAttributes,
    DataTexture,
    LinearFilter,
    LinearMipMapLinearFilter,
    Matrix4,
    Mesh,
    Quaternion,
    Texture,
    Vector3
} from "three/webgpu";

import DEMData, { type SerializedDEMData } from "../../dem-terrain/dem/DemData";
import { DemTileResource } from "../../dem-terrain/DEMTileProvider";
import {
    type HeightMapModificationEventParams,
    type HeightMapModifier,
    type HeightMapModifierManager,
    type SerializedHeightMapModifier
} from "../../ground-modification-manager";
import { renderGroundModificationHeightMap, renderHeightMap } from "../../terrain-processor";
import { QuantizedTileResource } from "../QuantizedTileResource";
import { type MetadataExtension } from "./QuantizedMeshLoader";

const isWorker = typeof document === "undefined";

export type WaterMask = DataTextureImageData & {
    geoBox: GeoBoxArray;
};

export type QuantizedMetaData = {
    minHeight: number;
    maxHeight: number;
    /**
     * The `metadata` extension JSON carried by the tile (when requested).
     * `available` lists the subtree tile ranges that exist below this tile,
     * which is how deeper real data (up to `maxzoom`) is discovered.
     */
    metadata?: {
        available?: unknown;
        geometricerror?: number;
        [key: string]: unknown;
    };
} & MetadataExtension;

export interface QuantizedTerrainMeshData {
    metadata: QuantizedMetaData;
    geometry: SerializableGeometryData;
    projectionName: string;
    waterMask?: WaterMask;
    geoBox: GeoBoxArray;
    matrix: number[];
    minimumHeight: number;
    maximumHeight: number;
    demMap?: SerializedDEMData;
    groundElevationModified?: boolean;
    heightMapModifiers?: SerializedHeightMapModifier[];
}

/**
 * Uniform grid over the tile's UV space listing the cap triangles that
 * overlap each cell. Built lazily on the first height query.
 */
interface HeightQueryIndex {
    /** Number of cells per axis. */
    grid: number;
    /** Start offset of each cell's triangle list (length grid * grid + 1). */
    cells: Int32Array;
    /** Triangle offsets into the geometry index buffer. */
    triangles: Int32Array;
}

export class QuantizedTerrainMesh extends QuantizedTileResource {
    private _demMap?: DEMData;
    private _groundElevationModified?: boolean;
    /** Lazily built UV-space triangle index for height sampling. */
    private _heightIndex?: HeightQueryIndex;
    quantizedGeometry: BufferGeometry;
    position: Vector3 = new Vector3();
    private readonly m_geoCenter: GeoCoordinates;
    quaternion: Quaternion = new Quaternion();
    scale: Vector3 = new Vector3();
    metadataExtension?: QuantizedMetaData;
    waterMaskTexture?: DataTexture;
    declare geoBox: GeoBox;

    constructor(
        data: QuantizedTerrainMeshData | Mesh,
        private m_projection?: Projection,
        public waterMask?: WaterMask
    ) {
        super(
            data instanceof Mesh
                ? GeoBox.fromArray(data.userData.geoBox)
                : GeoBox.fromArray(data.geoBox)
        );
        if (data instanceof Mesh) {
            this.quantizedGeometry = data.geometry;
            this.position.copy(data.position);
            this.quaternion.copy(data.quaternion);
            this.scale.copy(data.scale);
            this.metadataExtension = data.userData as QuantizedMetaData;
            this.geoBox = GeoBox.fromArray(data.userData.geoBox);
            this.m_geoCenter = this.m_projection.unprojectPoint(this.position);
        } else {
            this.quantizedGeometry = deserializeBufferGeometry(data.geometry);
            const projection = getProjection(data.projectionName);
            this.m_projection = projection;
            new Matrix4()
                .fromArray(data.matrix)
                .decompose(this.position, this.quaternion, this.scale);

            this.metadataExtension = data.metadata;
            this.geoBox = GeoBox.fromArray(data.geoBox);
            this.m_geoCenter = projection.unprojectPoint(this.position);
            if (data.demMap) {
                this._demMap = DEMData.fromSerialized(data.demMap);
            }
            this._groundElevationModified = data.groundElevationModified;
        }

        if (this.waterMask) {
            this.waterMaskTexture = new DataTexture(
                this.waterMask.data,
                this.waterMask.width,
                this.waterMask.height
            );

            this.waterMaskTexture.flipY = true;
            this.waterMaskTexture.minFilter = LinearMipMapLinearFilter;
            this.waterMaskTexture.magFilter = LinearFilter;
        }
    }

    public async generateAndProcessTerrain(options: {
        heightMap?: {
            geoBox: GeoBox;
            flipY?: boolean;
        };
        clip: HeightMapModifier[];
        projection: Projection;
    }) {
        if (options.heightMap)
            await this.drawHeightMap(
                options.heightMap.geoBox,
                options.clip,
                options.heightMap.flipY
            );
    }

    private async drawHeightMap(
        geoBox: GeoBox,
        heightMapModifiers?: HeightMapModifier[],
        flipY?: boolean
    ) {
        const drawGeoBox = geoBox.clone();
        drawGeoBox.southWest.altitude = this.minHeight;
        drawGeoBox.northEast.altitude = this.maxHeight;

        const originDrawRange = this.quantizedGeometry.drawRange;
        const { start, count } = this.quantizedGeometry.groups[0];

        this.quantizedGeometry.drawRange = {
            start,
            count
        };

        const rawData = await renderHeightMap(this.quantizedGeometry);

        this.quantizedGeometry.drawRange = originDrawRange;

        this._demMap = new DEMData("", rawData, geoBox, undefined, true, false);

        if (heightMapModifiers?.length) {
            const processed = await renderGroundModificationHeightMap(
                heightMapModifiers,
                drawGeoBox,
                new Texture(this._demMap.data),
                this._demMap.data.width,
                this._demMap.data.height,
                flipY
            );

            this._demMap = new DEMData(
                "",
                processed?.image ?? rawData,
                drawGeoBox,
                undefined,
                false,
                false
            );

            this._groundElevationModified = true;
        }

        const { min, max } = this._demMap.getMinMaxElevation();
        this.metaData.maxHeight = max;
        this.metaData.minHeight = min;
    }

    toQuantizedTerrainMeshData(): QuantizedTerrainMeshData {
        const data: QuantizedTerrainMeshData = {
            waterMask: this.waterMask,
            metadata: this.metaData,
            geoBox: this.geoBox.toArray(),
            projectionName: getProjectionName(this.m_projection),
            minimumHeight: this.minHeight,
            maximumHeight: this.maxHeight,
            matrix: new Matrix4().compose(this.position, this.quaternion, this.scale).toArray(),
            geometry: serializeBufferGeometry(this.quantizedGeometry),
            groundElevationModified: this._groundElevationModified
        };

        if (this.demMap && isWorker) {
            data.demMap = this.demMap.serialize();
        }
        return data;
    }

    static fromQuantizedTerrainMeshData(data: QuantizedTerrainMeshData) {
        return new QuantizedTerrainMesh(data);
    }

    static fromMesh(mesh: Mesh, projection: Projection) {
        return new QuantizedTerrainMesh(mesh, projection);
    }

    get metaData(): QuantizedMetaData {
        return this.metadataExtension;
    }

    get isGroundElevationModified() {
        return this._groundElevationModified;
    }

    getBytesUsed(): number {
        return (
            estimateGeometryMemory(this.quantizedGeometry) +
            (this._demMap?.getBytesUsed() || 0) +
            (this.waterMask?.data.byteLength || 0)
        );
    }

    makeQuantizeMesh<T extends Material | Material[]>(material?: T) {
        const quantizeMesh = new Mesh(this.quantizedGeometry, material);
        quantizeMesh.position.copy(this.position);
        quantizeMesh.quaternion.copy(this.quaternion);
        quantizeMesh.scale.copy(this.scale);
        quantizeMesh.userData = this.metaData;
        quantizeMesh.frustumCulled = false;
        return quantizeMesh;
    }

    get minHeight(): number {
        return this.metaData.minHeight;
    }

    get maxHeight(): number {
        return this.metaData.maxHeight;
    }

    get demMap() {
        return this._demMap;
    }

    /**
     * Samples the terrain surface height at normalized tile coordinates.
     *
     * The height is read from the triangle mesh itself (linear interpolation
     * inside the triangle that contains the point), matching what the GPU
     * renders. This replaces the former per-tile 256x256 height raster for
     * CPU height queries, so no raster has to be generated or retained.
     *
     * @param x - Normalized coordinate along the tile's longitude span (0..1).
     * @param y - Normalized coordinate along the tile's latitude span (0..1).
     * @returns The interpolated altitude in meters, or undefined when the
     *          point cannot be located in the cap surface.
     */
    sampleHeight(x: number, y: number): number | undefined {
        const geometry = this.quantizedGeometry;
        if (!geometry) {
            return undefined;
        }
        const index = geometry.getIndex();
        const uv = geometry.getAttribute("uv");
        const altitude = geometry.getAttribute("altitude");
        if (!index || !uv || !altitude) {
            return undefined;
        }

        if (!this._heightIndex) {
            this._heightIndex = buildHeightQueryIndex(geometry);
        }
        const heightIndex = this._heightIndex;
        if (!heightIndex) {
            return undefined;
        }

        const px = Math.min(1, Math.max(0, x));
        const py = Math.min(1, Math.max(0, y));
        const { grid, cells, triangles } = heightIndex;
        const uvArray = uv.array as Float32Array;
        const altitudeArray = altitude.array as Float32Array;
        const indexArray = index.array;

        const sampleCell = (cellX: number, cellY: number): number | undefined => {
            if (cellX < 0 || cellY < 0 || cellX >= grid || cellY >= grid) {
                return undefined;
            }
            const cell = cellY * grid + cellX;
            const start = cells[cell];
            const end = cells[cell + 1];
            for (let i = start; i < end; i++) {
                const offset = triangles[i];
                const i0 = indexArray[offset];
                const i1 = indexArray[offset + 1];
                const i2 = indexArray[offset + 2];

                const u0 = uvArray[i0 * 2];
                const v0 = uvArray[i0 * 2 + 1];
                const u1 = uvArray[i1 * 2];
                const v1 = uvArray[i1 * 2 + 1];
                const u2 = uvArray[i2 * 2];
                const v2 = uvArray[i2 * 2 + 1];

                const denominator = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
                if (denominator === 0) {
                    continue;
                }

                const w0 = ((v1 - v2) * (px - u2) + (u2 - u1) * (py - v2)) / denominator;
                const w1 = ((v2 - v0) * (px - u2) + (u0 - u2) * (py - v2)) / denominator;
                const w2 = 1 - w0 - w1;

                // Slight negative tolerance so points exactly on a shared edge
                // are not rejected by both adjacent triangles.
                if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) {
                    return w0 * altitudeArray[i0] + w1 * altitudeArray[i1] + w2 * altitudeArray[i2];
                }
            }
            return undefined;
        };

        const cellX = Math.min(grid - 1, Math.floor(px * grid));
        const cellY = Math.min(grid - 1, Math.floor(py * grid));

        let height = sampleCell(cellX, cellY);
        if (height !== undefined) {
            return height;
        }

        // A triangle necessarily sits in the cell containing every point of its
        // bounding box, so the direct hit above almost always succeeds. The
        // neighbourhood scan only covers mesh edges / degenerate cells.
        for (let radius = 1; radius <= 2 && height === undefined; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
                        continue;
                    }
                    height = sampleCell(cellX + dx, cellY + dy);
                    if (height !== undefined) {
                        break;
                    }
                }
            }
        }

        return height;
    }

    protected get geometry(): BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap> {
        return this.quantizedGeometry as BufferGeometry<
            NormalBufferAttributes,
            BufferGeometryEventMap
        >;
    }

    public get geometryProjection(): Projection {
        return this.m_projection;
    }

    protected updateGeometryProjection(projection: Projection) {
        this.m_projection = projection;
        projection.projectPoint(this.geoCenter, this.position);
    }

    protected get geoCenter() {
        return this.m_geoCenter;
    }

    public async handleGroundModificationChange(
        event: HeightMapModificationEventParams,
        modify: HeightMapModifierManager
    ): Promise<void> {
        if (!this._demMap) return Promise.resolve();

        return DemTileResource.createDemTileResourceFromImageryData(
            this._demMap.data,
            this.tileKey,
            this.terrainSource,
            this._demMap.encoding
        ).then((demTileResource: DemTileResource) => {
            this._demMap?.dispose();
            this._demMap = demTileResource.demData;
            this._groundElevationModified = true;
        });
    }

    protected disposeResources(): void {
        this.quantizedGeometry?.dispose();
        this.waterMaskTexture?.dispose();
        this._demMap?.dispose();
        this._heightIndex = undefined;
    }
}

/**
 * Builds the UV-space lookup grid used by {@link QuantizedTerrainMesh.sampleHeight}.
 *
 * Only the first geometry group (the cap surface) is indexed — the bottom
 * cap and the skirt strips are not part of the terrain surface.
 */
function buildHeightQueryIndex(geometry: BufferGeometry): HeightQueryIndex | undefined {
    const index = geometry.getIndex();
    const uv = geometry.getAttribute("uv");
    const altitude = geometry.getAttribute("altitude");
    if (!index || !uv || !altitude) {
        return undefined;
    }

    const group = geometry.groups.length > 0 ? geometry.groups[0] : undefined;
    const start = group ? group.start : 0;
    const end = group ? group.start + group.count : index.count;
    const triangleCount = Math.floor((end - start) / 3);
    if (triangleCount <= 0) {
        return undefined;
    }

    const grid = 32;
    const indexArray = index.array;
    const uvArray = uv.array as Float32Array;

    const cells = new Int32Array(grid * grid + 1);
    // Per-triangle UV bounding box in grid coordinates (minX, minY, maxX, maxY).
    const bounds = new Int32Array(triangleCount * 4);

    const toCell = (value: number): number =>
        Math.min(grid - 1, Math.max(0, Math.floor(value * grid)));

    for (let t = 0; t < triangleCount; t++) {
        const offset = start + t * 3;
        const i0 = indexArray[offset];
        const i1 = indexArray[offset + 1];
        const i2 = indexArray[offset + 2];

        const u0 = uvArray[i0 * 2];
        const u1 = uvArray[i1 * 2];
        const u2 = uvArray[i2 * 2];
        const v0 = uvArray[i0 * 2 + 1];
        const v1 = uvArray[i1 * 2 + 1];
        const v2 = uvArray[i2 * 2 + 1];

        const minX = toCell(Math.min(u0, u1, u2));
        const maxX = toCell(Math.max(u0, u1, u2));
        const minY = toCell(Math.min(v0, v1, v2));
        const maxY = toCell(Math.max(v0, v1, v2));

        bounds[t * 4] = minX;
        bounds[t * 4 + 1] = minY;
        bounds[t * 4 + 2] = maxX;
        bounds[t * 4 + 3] = maxY;

        for (let cy = minY; cy <= maxY; cy++) {
            for (let cx = minX; cx <= maxX; cx++) {
                cells[cy * grid + cx + 1]++;
            }
        }
    }

    for (let i = 0; i < grid * grid; i++) {
        cells[i + 1] += cells[i];
    }

    const triangles = new Int32Array(cells[grid * grid]);
    // Cursor per cell, reset after filling.
    const cursor = new Int32Array(grid * grid + 1);
    cursor.set(cells);

    for (let t = 0; t < triangleCount; t++) {
        const minX = bounds[t * 4];
        const minY = bounds[t * 4 + 1];
        const maxX = bounds[t * 4 + 2];
        const maxY = bounds[t * 4 + 3];
        const offset = start + t * 3;
        for (let cy = minY; cy <= maxY; cy++) {
            for (let cx = minX; cx <= maxX; cx++) {
                triangles[cursor[cy * grid + cx]++] = offset;
            }
        }
    }

    // The cursor array is only used while filling; it goes out of scope here.
    return { grid, cells, triangles };
}
