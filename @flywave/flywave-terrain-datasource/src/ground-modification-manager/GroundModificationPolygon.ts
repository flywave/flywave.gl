/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBoxArray,
    type GeoBoxJSON,
    type GeoLineStringJSON,
    type GeoPointLike,
    type GeoPolygonCoordinates,
    GeoBox,
    GeoCoordinates,
    GeoLineString,
    GeoLineStringCoordinates,
    GeoPolygon
} from "@flywave/flywave-geoutils";

/**
 * Vertex data source type
 *
 * Determines where the vertex data originates from when modifying terrain.
 * This affects how the modification is applied to the base terrain data.
 */
export type VertexSourceType =
    | "fixed" // Fixed value specified
    | "geometry"; // From height coordinates in geometry

/**
 * Height operation mode type
 *
 * Defines how the height modification is applied to the base terrain.
 * Different operations produce different visual effects and use cases.
 */
export type HeightOperationType =
    | "replace" // Replace base height entirely
    | "add" // Add to base height
    | "subtract" // Subtract from base height
    | "max" // Take maximum height (modified height vs base height)
    | "min"; // Take minimum height (modified height vs base height)

/**
 * Ground modification type (composite type)
 *
 * Combines vertex source and height operation to define how terrain is modified.
 * This composite type allows for flexible terrain modification strategies.
 */
export interface GroundModificationType {
    /**
     * Source of the vertex data
     *
     * Determines whether the modification uses fixed values or geometry-based
     * height coordinates as the source for vertex data.
     */
    vertexSource: VertexSourceType;

    /**
     * Operation to perform on the height values
     *
     * Specifies how the modification height values should be combined
     * with the base terrain height values.
     */
    heightOperation: HeightOperationType;
}

/**
 * Serialized format for worker communication and storage
 *
 * This format is optimized for transmission between web workers and persistent storage.
 * It uses JSON-compatible types to ensure efficient serialization and deserialization.
 */
export interface SerializedGroundModificationPolygon {
    /**
     * Unique identifier for the polygon
     *
     * Used to uniquely identify this modification across the system.
     */
    id: string;

    /**
     * Type of ground modification to apply
     *
     * Defines how the terrain should be modified using vertex source
     * and height operation parameters.
     */
    type: GroundModificationType;

    /**
     * Geographical area definition in various formats
     *
     * Can be a polygon, line string with width, bounding box, or array of points.
     * The format varies depending on the type of geographic area being defined.
     */
    geoArea:
        | GeoPointLike[]
        | GeoBoxJSON
        | { type: "Polygon"; coordinates: GeoPointLike[] }
        | { type: "LineString"; coordinates: GeoPointLike[]; width?: number };

    /**
     * Depth or height value for the modification (optional)
     *
     * When present, defines the vertical extent of the modification in meters.
     * Positive values typically represent elevation, negative values excavation.
     */
    depthOrHeight?: number;

    /**
     * Bounding box of the polygon in array format [west, south, east, north]
     *
     * Provides a quick spatial index for the modification without requiring
     * complex geometric calculations.
     */
    boundingBox: GeoBoxArray;

    /**
     * Slope width for the modification (optional)
     *
     * When present, defines the width of the slope transition zone around
     * the modification area. This creates smoother transitions between
     * modified and unmodified terrain.
     */
    slopeWidth?: number;
}

/**
 * Represents a ground modification polygon with spatial properties
 *
 * Used to define areas where terrain height should be modified.
 * This interface provides a rich set of properties for defining
 * complex terrain modifications with spatial boundaries.
 */
export interface GroundModificationPolygon {
    /**
     * Unique identifier for the polygon
     *
     * Generated to uniquely identify this modification across the system.
     */
    id: string;

    /**
     * Type of ground modification to apply
     *
     * Defines how the terrain should be modified using vertex source
     * and height operation parameters.
     */
    type: GroundModificationType;

    /**
     * Geographical area where the modification applies
     *
     * Can be a bounding box, polygon, or line string depending on
     * the shape of the area to be modified.
     */
    geoArea: GeoBox | GeoPolygon | GeoLineString;

    /**
     * Depth or height value for the modification (optional)
     *
     * When present, defines the vertical extent of the modification in meters.
     * Positive values typically represent elevation, negative values excavation.
     */
    depthOrHeight?: number;

    /**
     * Width of the slope (optional)
     *
     * When present, defines the horizontal extent of the slope transition
     * zone around the modification area. This creates smoother transitions
     * between modified and unmodified terrain.
     */
    slopeWidth?: number;

    /**
     * Bounding box of the polygon
     *
     * Provides a quick spatial index for the modification without requiring
     * complex geometric calculations. Used for spatial queries and culling.
     */
    boundingBox: GeoBox;
}

/**
 * Serializes a GroundModificationPolygon to a format suitable for storage/transfer
 *
 * Converts geometry objects to JSON representations for efficient transmission
 * between web workers and persistent storage. This is necessary because
 * complex geometry objects cannot be directly serialized.
 *
 * @param polygon The GroundModificationPolygon to serialize
 * @returns SerializedGroundModificationPolygon in JSON-compatible format
 */
export function serializeGroundModificationPolygon(
    polygon: GroundModificationPolygon
): SerializedGroundModificationPolygon {
    let geoArea:
        | GeoPointLike[]
        | GeoBoxJSON
        | { type: "Polygon"; coordinates: GeoPointLike[] }
        | { type: "LineString"; coordinates: GeoPointLike[]; width?: number };

    if (polygon.geoArea instanceof GeoPolygon) {
        // Serialize GeoPolygon to JSON format
        const json = polygon.geoArea.toJSON();
        geoArea = {
            type: "Polygon",
            coordinates: json.coordinates
        };
    } else if (polygon.geoArea instanceof GeoLineString) {
        // Serialize GeoLineString to JSON format
        const json = polygon.geoArea.toJSON();
        geoArea = json;
    } else if (Array.isArray(polygon.geoArea)) {
        // Legacy coordinate array (backward compatibility)
        geoArea = polygon.geoArea.map(coord => coord.toGeoPoint());
    } else {
        // GeoBox serialization
        geoArea = polygon.geoArea.toJSON();
    }

    return {
        id: polygon.id,
        type: polygon.type,
        geoArea,
        depthOrHeight: polygon.depthOrHeight,
        slopeWidth: polygon.slopeWidth,
        boundingBox: polygon.boundingBox.toArray()
    };
}

/**
 * Deserializes a SerializedGroundModificationPolygon back to a GroundModificationPolygon
 *
 * Reconstructs geometry objects from JSON representations. This is the inverse
 * operation of serializeGroundModificationPolygon and is used when loading
 * modifications from storage or receiving them from web workers.
 *
 * @param serialized The serialized polygon data to deserialize
 * @returns GroundModificationPolygon with reconstructed geometry objects
 */
export function deserializeGroundModificationPolygon(
    serialized: SerializedGroundModificationPolygon
): GroundModificationPolygon {
    let geoArea: GeoBox | GeoPolygon | GeoLineString;

    if ((serialized.geoArea as { type: string }).type === "Polygon") {
        // GeoPolygon JSON format reconstruction
        const polygonJson = serialized.geoArea as { type: "Polygon"; coordinates: GeoPointLike[] };
        const coords = polygonJson.coordinates.map(point => GeoCoordinates.fromGeoPoint(point));
        geoArea = new GeoPolygon(coords as GeoPolygonCoordinates);
    } else if ((serialized.geoArea as { type: string }).type === "LineString") {
        // GeoLineString JSON format reconstruction
        const lineStringJson = serialized.geoArea as GeoLineStringJSON;
        geoArea = GeoLineString.fromJSON(lineStringJson);
    } else {
        // GeoBox JSON format reconstruction
        geoArea = GeoBox.fromJSON(serialized.geoArea as GeoBoxJSON);
    }

    return {
        id: serialized.id,
        type: serialized.type,
        geoArea,
        slopeWidth: serialized.slopeWidth,
        depthOrHeight: serialized.depthOrHeight,
        boundingBox: GeoBox.fromArray(serialized.boundingBox)
    };
}
