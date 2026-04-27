import { type GeoBoxJSON, type GeoPointLike, GeoBox, GeoLineString, GeoPolygon } from "@flywave/flywave-geoutils";
import { type Texture } from "three";
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
    geoArea: GeoBoxJSON | {
        type: "Polygon";
        coordinates: GeoPointLike[];
    } | {
        type: "LineString";
        coordinates: GeoPointLike[];
        width?: number;
    };
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
export declare function serializeGroundOverlayTexture(overlay: GroundOverlayTexture): Promise<GroundOverlayTextureJSON>;
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
export declare function deserializeGroundOverlayTexture(json: GroundOverlayTextureJSON): GroundOverlayTexture;
