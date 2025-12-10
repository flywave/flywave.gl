/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBoxJSON,
    type GeoPointLike,
    GeoBox,
    GeoBoxArray,
    GeoCoordinates,
    GeoLineString,
    GeoPolygon
} from "@flywave/flywave-geoutils";
import {
    imageBitmapToTexture,
    textureToImageBitmap
} from "@flywave/flywave-utils/TextureSerializer";
import { type Texture, type Wrapping, RepeatWrapping } from "three";

/**
 * Represents a ground overlay texture with its geographic area and metadata
 *
 * This interface defines the structure of a ground overlay texture, which
 * is used to render images or patterns over specific geographic areas
 * on the terrain surface.
 */
export interface GroundOverlayTexture {
    /**
     * Unique identifier for the overlay
     *
     * Generated to uniquely identify this overlay across the system.
     */
    id: string;

    /**
     * The geographic area of the overlay - either a bounding box, polygon, or line string
     *
     * Defines the spatial extent of the overlay on the map. Different
     * geometry types allow for flexible overlay shapes.
     */
    geoArea: GeoBox | GeoPolygon | GeoLineString;

    /**
     * The texture object
     *
     * The Three.js texture that contains the image data to be rendered
     * over the specified geographic area.
     */
    texture: Texture;

    /**
     * Optional name/identifier for the overlay
     *
     * A human-readable name that can be used to identify the overlay
     * in addition to its unique ID.
     */
    name?: string;

    /**
     * Opacity for the overlay (0-1)
     *
     * Controls the transparency of the overlay, where 0 is completely
     * transparent and 1 is completely opaque.
     *
     * @default 1.0
     */
    opacity?: number;
}

/**
 * Serialized structure for GroundOverlayTexture
 *
 * This interface defines the JSON-serializable format used for
 * transmitting ground overlay textures between web workers and
 * for persistent storage.
 */
export interface GroundOverlayTextureJSON {
    /** Unique identifier for the overlay */
    id: string;

    /**
     * The geographic area of the overlay in JSON format
     *
     * Can be a GeoBoxJSON, polygon, or line string with width.
     */
    geoArea:
        | GeoBoxJSON
        | { type: "Polygon"; coordinates: GeoPointLike[] }
        | { type: "LineString"; coordinates: GeoPointLike[]; width?: number };

    /** The texture data as an ImageBitmap */
    texture: ImageBitmap;

    /** Texture repeat parameters [x, y] */
    textureRepeat: [number, number];

    /** Texture translation/offset parameters [x, y] */
    textureTranslate: [number, number];

    /** Texture wrapping mode for S coordinate */
    wrapS: number;

    /** Texture wrapping mode for T coordinate */
    wrapT: number;

    /** Optional name for the overlay */
    name?: string;

    /** Opacity value for the overlay */
    opacity: number;
}

/**
 * Serializes a GroundOverlayTexture to a JSON-serializable format
 *
 * This function converts a GroundOverlayTexture object into a format
 * that can be transmitted between web workers or stored persistently.
 * It handles the conversion of Three.js textures to ImageBitmaps and
 * geographic areas to JSON representations.
 *
 * @param overlay - The GroundOverlayTexture to serialize
 * @returns A promise that resolves to the serialized overlay data
 */
export async function serializeGroundOverlayTexture(
    overlay: GroundOverlayTexture
): Promise<GroundOverlayTextureJSON> {
    const textureBitmap = await textureToImageBitmap(overlay.texture);

    let geoArea:
        | GeoBoxJSON
        | { type: "Polygon"; coordinates: GeoPointLike[] }
        | { type: "LineString"; coordinates: GeoPointLike[]; width?: number };

    if (overlay.geoArea instanceof GeoBox) {
        geoArea = overlay.geoArea.toJSON();
    } else if (overlay.geoArea instanceof GeoPolygon) {
        const json = overlay.geoArea.toJSON();
        geoArea = {
            type: "Polygon",
            coordinates: json.coordinates
        };
    } else if (overlay.geoArea instanceof GeoLineString) {
        const json = overlay.geoArea.toJSON();
        geoArea = {
            type: "LineString",
            coordinates: json.coordinates,
            width: json.width
        };
    } else {
        // 向后兼容：处理传统的坐标数组
        geoArea = {
            type: "Polygon",
            coordinates: (overlay.geoArea as GeoCoordinates[]).map((coord: GeoCoordinates) => coord.toGeoPoint())
        };
    }

    return {
        id: overlay.id,
        geoArea,
        texture: textureBitmap,
        name: overlay.name,
        opacity: overlay.opacity ?? 1.0,
        textureRepeat: [overlay.texture.repeat.x, overlay.texture.repeat.y],
        textureTranslate: [overlay.texture.offset.x, overlay.texture.offset.y],
        wrapS: overlay.texture.wrapS,
        wrapT: overlay.texture.wrapT
    };
}

/**
 * Deserializes a GroundOverlayTexture from JSON format
 *
 * This function reconstructs a GroundOverlayTexture object from its
 * serialized JSON representation. It handles the conversion of
 * ImageBitmaps back to Three.js textures and JSON geographic areas
 * back to geometry objects.
 *
 * @param json - The serialized overlay data to deserialize
 * @returns The reconstructed GroundOverlayTexture object
 */
export function deserializeGroundOverlayTexture(
    json: GroundOverlayTextureJSON
): GroundOverlayTexture {
    const texture = imageBitmapToTexture(json.texture);
    texture.needsUpdate = false;
    texture.repeat.set(json.textureRepeat[0], json.textureRepeat[1]);
    texture.offset.set(json.textureTranslate[0], json.textureTranslate[1]);
    texture.wrapS = json.wrapS as Wrapping;
    texture.wrapT = json.wrapT as Wrapping;

    let geoArea: GeoBox | GeoPolygon | GeoLineString;

    if ((json.geoArea as { type: string }).type === "Polygon") {
        const polygonJson = json.geoArea as { type: "Polygon"; coordinates: GeoPointLike[] };
        const coords = polygonJson.coordinates.map(point => GeoCoordinates.fromGeoPoint(point));
        geoArea = new GeoPolygon(coords);
    } else if ((json.geoArea as { type: string }).type === "LineString") {
        const lineStringJson = json.geoArea as {
            type: "LineString";
            coordinates: GeoPointLike[];
            width?: number;
        };
        const coords = lineStringJson.coordinates.map(point => GeoCoordinates.fromGeoPoint(point));
        geoArea = new GeoLineString(coords, lineStringJson.width);
    } else if (Array.isArray(json.geoArea)) {
        // 向后兼容：处理传统的坐标数组
        const coords = json.geoArea.map(point => GeoCoordinates.fromGeoPoint(point));
        // 判断是否为闭合多边形（第一个和最后一个点相同）
        if (coords.length >= 3 && coords[0].equals(coords[coords.length - 1])) {
            geoArea = new GeoPolygon(coords);
        } else {
            // 作为线串处理
            geoArea = new GeoLineString(coords);
        }
    } else {
        // GeoBox JSON 格式
        geoArea = GeoBox.fromJSON(json.geoArea as GeoBoxJSON);
    }

    return {
        id: json.id,
        geoArea,
        texture,
        name: json.name,
        opacity: json.opacity
    };
}
