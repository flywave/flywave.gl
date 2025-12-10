/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxArray, type Projection, GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import {
    type SerializableGeometryData,
    deserializeBufferGeometry,
    serializeBufferGeometry
} from "@flywave/flywave-utils/bufferGeometryTransfer";
import { estimateGeometryMemory } from "@flywave/flywave-utils/meshMemoryUtils";
import {
    type BufferGeometry,
    type Material,
    type TextureImageData,
    BufferGeometryEventMap,
    DataTexture,
    LinearFilter,
    LinearMipMapLinearFilter,
    Matrix4,
    Mesh,
    NormalBufferAttributes,
    Quaternion,
    Texture,
    Vector3
} from "three";

import DEMData, { SerializedDEMData } from "../../dem-terrain/dem/DemData";
import { DemTileResource } from "../../dem-terrain/DEMTileProvider";
import {
    type GroundModificationEventParams,
    type GroundModificationManager,
    type GroundModificationPolygon,
    type SerializedGroundModificationPolygon,
} from "../../ground-modification-manager";
import { renderGroundModificationHeightMap, renderHeightMap } from "../../terrain-processor";
import { QuantizedTileResource } from "../QuantizedTileResource";
import { type MetadataExtension } from "./QuantizedMeshLoader";
import { getProjection, getProjectionName } from "@flywave/flywave-datasource-protocol";

const isWorker = typeof document === "undefined";

export type WaterMask = TextureImageData & {
    geoBox: GeoBoxArray;
};

export type QuantizedMetaData = {
    minHeight: number;
    maxHeight: number;
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
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
}

export class QuantizedTerrainMesh extends QuantizedTileResource {
    private _demMap?: DEMData;
    private _groundElevationModified?: boolean;
    quantizedGeometry: BufferGeometry;
    position: Vector3 = new Vector3();
    private m_geoCenter: GeoCoordinates;
    quaternion: Quaternion = new Quaternion();
    scale: Vector3 = new Vector3();
    metadataExtension?: QuantizedMetaData;
    waterMaskTexture?: DataTexture;
    declare geoBox: GeoBox;

    constructor(data: QuantizedTerrainMeshData | Mesh, private m_projection?: Projection, public waterMask?: WaterMask) {
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
            let projection = getProjection(data.projectionName);
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

    public generateAndProcessTerrain(options: {
        heightMap?: {
            geoBox: GeoBox;
            flipY?: boolean;
        };
        clip: GroundModificationPolygon[];
        projection: Projection;
    }) {
        if (options.heightMap)
            this.drawHeightMap(options.heightMap.geoBox, options.clip, options.heightMap.flipY);
    }


    private drawHeightMap(
        geoBox: GeoBox,
        groundModificationPolygons?: GroundModificationPolygon[],
        flipY?: boolean
    ) {
        geoBox.southWest.altitude = this.minHeight;
        geoBox.northEast.altitude = this.maxHeight;

        const originDrawRange = this.quantizedGeometry.drawRange;
        const { start, count } = this.quantizedGeometry.groups[0];

        this.quantizedGeometry.drawRange = {
            start,
            count
        };

        const rawData = renderHeightMap(this.quantizedGeometry);

        this.quantizedGeometry.drawRange = originDrawRange;

        this._demMap = new DEMData("", rawData, rawData, geoBox, undefined, true, true);

        if (groundModificationPolygons?.length) {
            const processed = renderGroundModificationHeightMap(
                groundModificationPolygons,
                geoBox,
                new Texture(this._demMap.rawImageData),
                this._demMap.rawImageData.width,
                this._demMap.rawImageData.height,
                flipY
            );

            this._demMap = new DEMData(
                "",
                rawData,
                processed.image,
                geoBox,
                undefined,
                false,
                true
            );

            this._groundElevationModified = true;
        }

        this.metaData.maxHeight = this._demMap.tree._maximums[0];
        this.metaData.minHeight = this._demMap.tree._minimums[0];
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

    protected get geometry(): BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap> {
        return this.quantizedGeometry as BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap>;
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

    protected handleGroundModificationChange(
        event: GroundModificationEventParams,
        modify: GroundModificationManager
    ): Promise<void> {
        return DemTileResource.createDemTileResourceFromImageryData(
            this._demMap.rawImageData,
            this.tileKey,
            this.terrainSource,
            this._demMap.encoding
        ).then((demTileResource: DemTileResource) => {
            this._demMap = demTileResource.demData;
        });
    }

    protected disposeResources(): void {
        this.quantizedGeometry?.dispose();
        this.waterMaskTexture?.dispose();
        this._demMap?.dispose();
    }
}
