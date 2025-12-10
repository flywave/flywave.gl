/* Copyright (C) 2025 flywave.gl contributors */

import { BufferAttribute, BufferGeometry, Sphere, Vector3, type DataTexture } from "three";

import { ITileResource, TileValidResource } from "../TileResourceManager";
import { GeoCoordinates, Projection } from "@flywave/flywave-geoutils";
import { getProjection, getProjectionName, RequestController } from "@flywave/flywave-datasource-protocol";
import { TaskType } from "../Constants";
import type { TileGeometryReprojectionData, TileGeometryReprojectionParams } from "./TileWorkerDecoder";
import { Tile } from "@flywave/flywave-mapview";
import { DecodedTerrainTile } from "../TerrainDecoderWorker";
import { get } from "http";

/**
 * Interface representing a height map with displacement data
 *
 * This interface defines the methods required for accessing height
 * and displacement data from quantized terrain tiles. It provides
 * methods for getting texture data, raw buffer data, and sampling
 * height values at specific coordinates.
 */
export interface IHeightMap {
    /**
     * Gets the displacement map as a Three.js DataTexture
     *
     * This method returns the height/displacement data as a Three.js
     * DataTexture that can be used directly in WebGL rendering.
     *
     * @returns DataTexture containing height/displacement data
     */
    getDisplacementMap(): DataTexture;

    /**
     * Gets the raw displacement map buffer data
     *
     * This method returns the raw height/displacement data as a
     * Uint8ClampedArray that can be used for computational purposes
     * or conversion to other formats.
     *
     * @returns Uint8ClampedArray containing the height/displacement data
     */
    getDisplacementMapBuffer(): Uint8ClampedArray;

    /**
     * Gets the height value at normalized coordinates (0-1 range)
     *
     * This method samples the height map at the specified normalized
     * coordinates, returning the height value at that point. The
     * coordinates are normalized to the range [0, 1] where (0, 0)
     * represents the bottom-left corner and (1, 1) represents the
     * top-right corner.
     *
     * @param x - Normalized x coordinate (0-1)
     * @param y - Normalized y coordinate (0-1)
     * @param ignoreGroundModification - Whether to ignore ground modifications
     * @returns Height value at the specified coordinates
     */
    getByScale(x: number, y: number, ignoreGroundModification?: boolean): number;
}

/**
 * Abstract base class for quantized tile resources that include height map data
 *
 * This abstract class extends TileValidResource to provide a common interface
 * for quantized terrain tile resources that include height map data. It defines
 * the required properties for accessing height information and elevation bounds.
 */
export abstract class QuantizedTileResource extends TileValidResource {
    /**
     * Gets the height map implementation for this tile
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide access to the height map data for this tile.
     *
     * @returns IHeightMap instance
     */
    abstract get demMap(): IHeightMap;

    /**
     * Gets the maximum height value in this tile
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide the maximum elevation value within this tile's bounds.
     *
     * @returns Maximum height in meters
     */
    abstract get maxHeight(): number;

    /**
     * Gets the minimum height value in this tile
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide the minimum elevation value within this tile's bounds.
     *
     * @returns Minimum height in meters
     */
    abstract get minHeight(): number;

    /**
     * Gets the geometry of this tile
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide the geometry data for this tile.
     *
     * @returns BufferGeometry instance
     */
    protected abstract get geometry(): BufferGeometry;

    /**
     * Gets the projection used for this tile's geometry
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide the projection used for this tile's geometry.
     *
     * @returns Projection instance
     */
    public abstract get geometryProjection(): Projection;


    /**
     * Gets the center of this tile's geometry in geographic coordinates
     *
     * This abstract method must be implemented by concrete subclasses
     * to provide the center of this tile's geometry in geographic coordinates.
     *
     * @returns GeoCoordinates instance representing the center of the tile's geometry
     */
    protected abstract get geoCenter(): GeoCoordinates;

    /**
     * Sets the projection used for this tile's geometry
     *
     * This abstract method must be implemented by concrete subclasses
     * to set the projection used for this tile's geometry.
     *
     * @param projection - Projection instance to set
     */
    protected abstract updateGeometryProjection(projection: Projection);

    /**
     * Reprojects the geometry of this tile to the specified projection
     *
     * This abstract method must be implemented by concrete subclasses
     * to reproject the geometry of this tile to the specified projection.
     *
     * @param projection - Projection to reproject to
     */
    private m_reProjectGeometryPanding: boolean = false;

    private projectionCacheBuffer: {
        [key: string]: {
            position: BufferAttribute,
            normal: BufferAttribute, 
            boundingSphere: Sphere,
        }
    };
    /**
     * Attempts to reproject the tile geometry to the specified target projection
     * 
     * This method checks if reprojection is needed and initiates the reprojection process
     * if required. It handles duplicate request prevention and projection state management.
     * 
     * @param targetProjection - The target projection system to reproject to
     * @param tile - The tile containing geometry data to reproject
     * @returns Promise<void> if reprojection is initiated, true if already in progress, 
     *          false if no reprojection needed or cannot be performed
     */
    public tryReprojectToProjection(targetProjection: Projection): Promise<void> | boolean {
        if (this.geometryProjection === targetProjection) {
            return false;
        }


        const cached = this.projectionCacheBuffer?.[getProjectionName(targetProjection)];
        if (cached) {
            // 使用缓存的数据
            this.updateGeometryProjection(targetProjection);
            this.geometry.setAttribute("position", cached.position);
            this.geometry.setAttribute("normal", cached.normal);
            this.terrainSource.updateTileOverlays();
            return false;
        }

        if (this.m_reProjectGeometryPanding) {
            return true;
        }

        this.m_reProjectGeometryPanding = true;

        let posiiton = this.geometry.getAttribute("position");
        let normal = this.geometry.getAttribute("normal");

        this.terrainSource.decoder.decodeTile({
            position: {
                array: posiiton.array,
                itemSize: posiiton.itemSize,
            },
            sourceProjectionName: getProjectionName(this.geometryProjection),
            type: TaskType.GeometryReprojection,
            center: this.geometryProjection.projectPoint(this.geoCenter),
            targetTileCenter: targetProjection.projectPoint(this.geoCenter),
        } as TileGeometryReprojectionParams & {
            type: TaskType;
        } as unknown as Record<string, unknown>, this.tileKey, targetProjection, this.m_RequestController).then((params: DecodedTerrainTile) => {

            let reprojectedGeometry = params.tileTerrain as TileGeometryReprojectionData

            this.updateGeometryProjection(getProjection(reprojectedGeometry.targetProjectionName));
            this.m_reProjectGeometryPanding = false;

            if(this.projectionCacheBuffer)throw new Error("projectionCacheBuffer is not empty");

            this.projectionCacheBuffer = {};
            this.projectionCacheBuffer[reprojectedGeometry.sourceProjectionName] = {
                position: posiiton as BufferAttribute,
                normal: normal as BufferAttribute,
                boundingSphere: this.geometry.boundingSphere,
            }

            let targetPosition = new BufferAttribute(reprojectedGeometry.position.array, reprojectedGeometry.position.itemSize)
            targetPosition.needsUpdate = true;
            this.geometry.setAttribute("position", targetPosition);
             this.geometry.deleteAttribute("normal");
            this.geometry.computeVertexNormals();
            this.geometry.computeBoundingSphere();
            this.projectionCacheBuffer[reprojectedGeometry.targetProjectionName] = {
                position: targetPosition,
                normal: this.geometry.getAttribute("normal") as BufferAttribute,
                boundingSphere: this.geometry.boundingSphere,
            }


            this.terrainSource.updateTileOverlays();
        });
        return true;
    }


    private m_RequestController = new RequestController();

    dispose(): void {
        super.dispose();
        this.m_RequestController.abort();
    }
}
