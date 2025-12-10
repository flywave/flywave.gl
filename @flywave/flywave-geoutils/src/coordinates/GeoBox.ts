/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { type GeoBoxExtentLike } from "./GeoBoxExtentLike";
import { GeoCoordinates, MAX_LONGITUDE } from "./GeoCoordinates";
import { type GeoCoordinatesLike } from "./GeoCoordinatesLike";

export interface GeoBoxJSON {
    type: "GeoBox";
    bounds: GeoBoxArray;
}

/**
 * Represents a geographic bounding box as an array of numbers.
 * The array contains the minimum and maximum coordinates in the following order:
 * [west, south, east, north, minimum height, maximum height]
 *
 * - west: Minimum longitude in degrees (-180 to 180)
 * - south: Minimum latitude in degrees (-90 to 90)
 * - east: Maximum longitude in degrees (-180 to 180)
 * - north: Maximum latitude in degrees (-90 to 90)
 * - minimum height: Lowest elevation in meters
 * - maximum height: Highest elevation in meters
 *
 * @example
 * // Bounding box for New York City area
 * const nycBoundingBox: GeoboxArray = [
 *   -74.2591, // west
 *   40.4774,  // south
 *   -73.7004, // east
 *   40.9176,  // north
 *   -10,      // min height (could be below sea level)
 *   100       // max height (meters above sea level)
 * ];
 */
export type GeoBoxArray = [number, number, number, number, number, number];

/**
 * `GeoBox` is used to represent a bounding box in geo coordinates.
 */
export class GeoBox implements GeoBoxExtentLike {
    /**
     * Returns a `GeoBox` with the given geo coordinates.
     *
     * @param southWest - The south west position in geo coordinates.
     * @param northEast - The north east position in geo coordinates.
     */
    static fromCoordinates(southWest: GeoCoordinates, northEast: GeoCoordinates): GeoBox {
        return new GeoBox(southWest, northEast);
    }

    /**
     * Returns a `GeoBox` with the given center and dimensions.
     *
     * @param center - The center position of geo box.
     * @param extent - Box latitude and logitude span
     */
    static fromCenterAndExtents(center: GeoCoordinates, extent: GeoBoxExtentLike): GeoBox {
        return new GeoBox(
            new GeoCoordinates(
                center.latitude - extent.latitudeSpan / 2,
                center.longitude - extent.longitudeSpan / 2
            ),
            new GeoCoordinates(
                center.latitude + extent.latitudeSpan / 2,
                center.longitude + extent.longitudeSpan / 2
            )
        );
    }

    /**
     * Constructs a new `GeoBox` with the given geo coordinates.
     *
     * @param southWest - The south west position in geo coordinates.
     * @param northEast - The north east position in geo coordinates.
     */
    constructor(readonly southWest: GeoCoordinates, readonly northEast: GeoCoordinates) {
        if (this.west > this.east) {
            this.northEast.longitude += 360;
        }
    }

    /**
     * Returns the minimum altitude or `undefined`.
     */
    get minAltitude(): number | undefined {
        if (this.southWest.altitude === undefined || this.northEast.altitude === undefined) {
            return undefined;
        }
        return Math.min(this.southWest.altitude, this.northEast.altitude);
    }

    /**
     * Returns the maximum altitude or `undefined`.
     */
    get maxAltitude(): number | undefined {
        if (this.southWest.altitude === undefined || this.northEast.altitude === undefined) {
            return undefined;
        }
        return Math.max(this.southWest.altitude, this.northEast.altitude);
    }

    /**
     * Returns the south latitude in degrees of this `GeoBox`.
     */
    get south(): number {
        return this.southWest.latitude;
    }

    /**
     * Returns the north altitude in degrees of this `GeoBox`.
     */
    get north(): number {
        return this.northEast.latitude;
    }

    /**
     * Returns the west longitude in degrees of this `GeoBox`.
     */
    get west(): number {
        return this.southWest.longitude;
    }

    /**
     * Returns the east longitude in degrees of this `GeoBox`.
     */
    get east(): number {
        return this.northEast.longitude;
    }

    /**
     * Returns the center of this `GeoBox`.
     */
    get center(): GeoCoordinates {
        const latitude = (this.south + this.north) * 0.5;
        const { west, east } = this;
        const { minAltitude, altitudeSpan } = this;

        let altitude: number | undefined;

        if (minAltitude !== undefined && altitudeSpan !== undefined) {
            altitude = minAltitude + altitudeSpan * 0.5;
        }

        if (west <= east) {
            return new GeoCoordinates(latitude, (west + east) * 0.5, altitude);
        }

        let longitude = (360 + east + west) * 0.5;

        if (longitude > 360) {
            longitude -= 360;
        }

        return new GeoCoordinates(latitude, longitude, altitude);
    }

    /**
     * Returns the latitude span in radians.
     */
    get latitudeSpanInRadians(): number {
        return THREE.MathUtils.degToRad(this.latitudeSpan);
    }

    /**
     * Returns the longitude span in radians.
     */
    get longitudeSpanInRadians(): number {
        return THREE.MathUtils.degToRad(this.longitudeSpan);
    }

    /**
     * Returns the latitude span in degrees.
     */
    get latitudeSpan(): number {
        return this.north - this.south;
    }

    get altitudeSpan(): number | undefined {
        if (this.maxAltitude === undefined || this.minAltitude === undefined) {
            return undefined;
        }
        return this.maxAltitude - this.minAltitude;
    }

    /**
     * Returns the longitude span in degrees.
     */
    get longitudeSpan(): number {
        let width = this.northEast.longitude - this.southWest.longitude;

        if (width < 0) {
            width += 360;
        }

        return width;
    }

    /**
     * Returns the latitude span in degrees.
     * @deprecated Use [[latitudeSpan]] instead.
     */
    get latitudeSpanInDegrees(): number {
        return this.latitudeSpan;
    }

    /**
     * Returns the longitude span in degrees.
     * @deprecated Use [[longitudeSpan]] instead.
     */
    get longitudeSpanInDegrees(): number {
        return this.longitudeSpan;
    }

    /**
     * Returns `true` if the given geo coordinates are contained in this `GeoBox`.
     *
     * @param point - The geo coordinates.
     */
    contains(point: GeoCoordinates): boolean {
        if (
            point.altitude === undefined ||
            this.minAltitude === undefined ||
            this.maxAltitude === undefined
        ) {
            return this.containsHelper(point);
        }

        const isFlat = this.minAltitude === this.maxAltitude;
        const isSameAltitude = this.minAltitude === point.altitude;
        const isWithinAltitudeRange =
            this.minAltitude <= point.altitude && this.maxAltitude > point.altitude;

        // If box is flat, we should check the altitude and containment,
        // otherwise we should check also altitude difference where we consider
        // point to be inside if alt is from [m_minAltitude, m_maxAltitude) range!
        if (isFlat ? isSameAltitude : isWithinAltitudeRange) {
            return this.containsHelper(point);
        }

        return false;
    }

    /**
     * Clones this `GeoBox` instance.
     */
    clone(): GeoBox {
        return new GeoBox(this.southWest.clone(), this.northEast.clone());
    }

    /**
     * Update the bounding box by considering a given point.
     *
     * @param point - The point that may expand the bounding box.
     */
    growToContain(point: GeoCoordinatesLike) {
        this.southWest.latitude = Math.min(this.southWest.latitude, point.latitude);
        this.southWest.longitude = Math.min(this.southWest.longitude, point.longitude);
        this.southWest.altitude =
            this.southWest.altitude !== undefined && point.altitude !== undefined
                ? Math.min(this.southWest.altitude, point.altitude)
                : this.southWest.altitude !== undefined
                ? this.southWest.altitude
                : point.altitude !== undefined
                ? point.altitude
                : undefined;

        this.northEast.latitude = Math.max(this.northEast.latitude, point.latitude);
        this.northEast.longitude = Math.max(this.northEast.longitude, point.longitude);
        this.northEast.altitude =
            this.northEast.altitude !== undefined && point.altitude !== undefined
                ? Math.max(this.northEast.altitude, point.altitude)
                : this.northEast.altitude !== undefined
                ? this.northEast.altitude
                : point.altitude !== undefined
                ? point.altitude
                : undefined;
    }

    private containsHelper(point: GeoCoordinates): boolean {
        if (point.latitude < this.southWest.latitude || point.latitude >= this.northEast.latitude) {
            return false;
        }

        const { west, east } = this;

        let longitude = point.longitude;
        if (east > MAX_LONGITUDE) {
            while (longitude < west) {
                longitude = longitude + 360;
            }
        }

        if (longitude > east) {
            while (longitude > west + 360) {
                longitude = longitude - 360;
            }
        }

        return longitude >= west && longitude < east;
    }

    /**
     * Merge two GeoBox instances and return a new GeoBox
     * @param box1 - The first geographic bounding box
     * @param box2 - The second geographic bounding box
     * @returns A new merged GeoBox
     */
    static merge(box1: GeoBox, box2: GeoBox): GeoBox {
        const southWest = new GeoCoordinates(
            Math.min(box1.southWest.latitude, box2.southWest.latitude),
            Math.min(box1.southWest.longitude, box2.southWest.longitude),
            box1.southWest.altitude !== undefined && box2.southWest.altitude !== undefined
                ? Math.min(box1.southWest.altitude, box2.southWest.altitude)
                : undefined
        );

        const northEast = new GeoCoordinates(
            Math.max(box1.northEast.latitude, box2.northEast.latitude),
            Math.max(box1.northEast.longitude, box2.northEast.longitude),
            box1.northEast.altitude !== undefined && box2.northEast.altitude !== undefined
                ? Math.max(box1.northEast.altitude, box2.northEast.altitude)
                : undefined
        );

        return new GeoBox(southWest, northEast);
    }

    /**
     * Merge the current GeoBox with another GeoBox
     * @param other - The other GeoBox to merge
     * @returns A new merged GeoBox
     */
    merge(other: GeoBox): GeoBox {
        return GeoBox.merge(this, other);
    }

    /**
     * Expand the current GeoBox to include another GeoBox (modifies in place)
     * @param other - The other GeoBox to include
     * @returns The current instance (for chaining)
     */
    expandToInclude(other: GeoBox): this {
        this.southWest.latitude = Math.min(this.southWest.latitude, other.southWest.latitude);
        this.southWest.longitude = Math.min(this.southWest.longitude, other.southWest.longitude);

        this.northEast.latitude = Math.max(this.northEast.latitude, other.northEast.latitude);
        this.northEast.longitude = Math.max(this.northEast.longitude, other.northEast.longitude);

        if (this.southWest.altitude !== undefined && other.southWest.altitude !== undefined) {
            this.southWest.altitude = Math.min(this.southWest.altitude, other.southWest.altitude);
        } else {
            this.southWest.altitude = undefined;
        }

        if (this.northEast.altitude !== undefined && other.northEast.altitude !== undefined) {
            this.northEast.altitude = Math.max(this.northEast.altitude, other.northEast.altitude);
        } else {
            this.northEast.altitude = undefined;
        }

        return this;
    }

    /**
     * Check if the current geographic bounding box completely contains another geographic bounding box
     * @param geoBox - The other GeoBox to check
     * @returns True if the current box contains the other box
     */
    containsBox(geoBox: GeoBox): boolean {
        // Latitude range check
        if (geoBox.south < this.south || geoBox.north > this.north) {
            return false;
        }

        // Longitude range check (handling international date line)
        const thisWest = this.west;
        const thisEast = this.east;
        const otherWest = geoBox.west;
        const otherEast = geoBox.east;

        const isContainedInWestHemisphere = otherWest >= thisWest && otherEast >= thisWest;
        const isContainedInEastHemisphere = otherWest <= thisEast && otherEast <= thisEast;
        const longitudeContained =
            thisWest <= thisEast
                ? otherWest >= thisWest && otherEast <= thisEast
                : isContainedInWestHemisphere || isContainedInEastHemisphere;

        if (!longitudeContained) {
            return false;
        }

        // Altitude range check (only when both have altitude defined)
        if (this.minAltitude !== undefined && this.maxAltitude !== undefined) {
            if (geoBox.minAltitude === undefined || geoBox.maxAltitude === undefined) {
                return false;
            }
            return geoBox.minAltitude >= this.minAltitude && geoBox.maxAltitude <= this.maxAltitude;
        }

        return true;
    }

    /**
     * Check if the current geographic bounding box intersects with another geographic bounding box
     * @param geoBox - The other GeoBox to check
     * @returns True if the boxes intersect
     */
    intersectsBox(geoBox: GeoBox): boolean {
        // Latitude range has no intersection
        if (geoBox.north <= this.south || geoBox.south >= this.north) {
            return false;
        }

        // Longitude range check (handling international date line)
        const thisWest = this.west;
        const thisEast = this.east;
        const otherWest = geoBox.west;
        const otherEast = geoBox.east;

        const overlapsWestHemisphere = otherWest < thisEast && otherEast > thisWest;
        const overlapsEastHemisphere = otherWest < thisEast + 360 || otherEast > thisWest - 360;
        const longitudeIntersects =
            thisWest <= thisEast ? overlapsWestHemisphere : overlapsEastHemisphere;

        if (!longitudeIntersects) {
            return false;
        }

        // Altitude range check (only when both have altitude defined)
        if (
            this.minAltitude !== undefined &&
            this.maxAltitude !== undefined &&
            geoBox.minAltitude !== undefined &&
            geoBox.maxAltitude !== undefined
        ) {
            return geoBox.minAltitude < this.maxAltitude && geoBox.maxAltitude > this.minAltitude;
        }

        return true;
    }

    /**
     * Convert the GeoBox to an array representation
     * @returns GeoBoxArray representation
     */
    toArray(): GeoBoxArray {
        return [
            this.southWest.latitude,
            this.southWest.longitude,
            this.northEast.latitude,
            this.northEast.longitude,
            this.minAltitude ?? 0,
            this.maxAltitude ?? 0
        ];
    }

    /**
     * Copy values from another GeoBox
     * @param other - The other GeoBox to copy from
     * @returns The current instance (for chaining)
     */
    copy(other: GeoBox): this {
        this.southWest.copy(other.southWest);
        this.northEast.copy(other.northEast);
        return this;
    }

    /**
     * Create a GeoBox from an array representation
     * @param array - The array to create from
     * @returns A new GeoBox instance
     */
    static fromArray(array: GeoBoxArray) {
        return new GeoBox(
            new GeoCoordinates(array[0], array[1], array[4]),
            new GeoCoordinates(array[2], array[3], array[5])
        );
    }

    /**
     * Convert the GeoBox to JSON representation
     * @returns GeoBoxJSON representation
     */
    toJSON(): GeoBoxJSON {
        return {
            type: "GeoBox",
            bounds: this.toArray() as GeoBoxArray
        };
    }

    /**
     * Check if this GeoBox equals another GeoBox
     * @param other - The other GeoBox to compare
     * @returns True if the boxes are equal
     */
    equals(other: GeoBox) {
        return (
            this.southWest.equals(other.southWest) &&
            this.northEast.equals(other.northEast) &&
            this.minAltitude === other.minAltitude &&
            this.maxAltitude === other.maxAltitude
        );
    }

    /**
     * Create a GeoBox from JSON representation
     * @param json - The JSON to create from
     * @returns A new GeoBox instance
     */
    static fromJSON(json: GeoBoxJSON) {
        return GeoBox.fromArray(json.bounds);
    }
}
