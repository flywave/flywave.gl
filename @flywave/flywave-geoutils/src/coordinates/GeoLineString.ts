/* Copyright (C) 2025 flywave.gl contributors */

import { type KrigingModel, type Variogram, Kriging } from "@flywave/flywave-kriging-gl";
import type * as turf from "@turf/turf";
import { Vector3 } from "three";

import { type CurveConfig, CurveGenerator } from "../math/CurveGenerator";
import { HeightAwareBufferGenerator } from "../math/HeightAwareBufferGenerator";
import { mercatorProjection } from "../projection/MercatorProjection";
import { GeoBox } from "./GeoBox";
import { GeoCoordinates } from "./GeoCoordinates";
import { type GeoCoordinatesLike } from "./GeoCoordinatesLike";
import { type GeoCoordLike } from "./GeoCoordLike";
import { type GeoPointLike } from "./GeoPointLike";
import { type GeoPolygonCoordinates, GeoPolygon } from "./GeoPolygon";

type MinTwoItemsArray<T> = [T, T, ...T[]];

export type GeoLineStringCoordinates = Array<
  GeoCoordinatesLike | GeoCoordinates | GeoCoordLike | GeoPointLike
> & { length: 2 | number };

export interface GeoLineStringJSON {
    type: "LineString";
    coordinates: GeoPointLike[];
    width?: number;
    options?: CurveConfig;
}

export type GeoLineStringOptions = CurveConfig;

/**
 * A GeoLineString in 2D Space with optional altitude.
 *
 * @beta @internal
 */
export class GeoLineString {
    private readonly m_coordinates: MinTwoItemsArray<GeoCoordinates>;
    private readonly m_spline_coordinates: MinTwoItemsArray<GeoCoordinates>;

    private readonly m_width: number;

    private readonly m_innerfactor: number = 1;

    private readonly m_variogram: Variogram | undefined;

    /**
     * Creates a GeoLineString instance
     *
     * @param coordinates An array of GeoCoordinates acting as the Vertices of the LineString.
     * @param width The width of the line in meters. Default is 0.
     */
    constructor(
        coordinates: GeoLineStringCoordinates,
        width: number = 0,
        private readonly options?: GeoLineStringOptions
    ) {
        this.m_coordinates = coordinates.map(coord => {
            return GeoCoordinates.fromObject(coord);
        }) as MinTwoItemsArray<GeoCoordinates>;
        this.m_width = width;

        if (options && options.type) {
            this.m_spline_coordinates = new CurveGenerator()
                .generate(
                    this.m_coordinates.map(coordinate => {
                        return mercatorProjection.projectPoint(coordinate, new Vector3());
                    }),
                    options
                )
                .map(coordinate => {
                    return mercatorProjection.unprojectPoint(coordinate);
                }) as MinTwoItemsArray<GeoCoordinates>;
        }
    }

    get coordinates(): MinTwoItemsArray<GeoCoordinates> {
        return this.m_spline_coordinates ?? this.m_coordinates;
    }

    get width(): number {
        return this.m_width;
    }

    /**
     * Converts this LineString to a Polygon by applying a buffer operation
     *
     * @param options Additional buffer options
     * @returns The GeoPolygon created from the buffered line string
     */
    toPolygon(options?: {
        widthFactor?: number;
        units?: turf.Units;
        steps?: number;
        krigingModel?: KrigingModel;
    }): GeoPolygon {
        const bufferGenerator = new HeightAwareBufferGenerator();
        const buffered = bufferGenerator.generate3DBuffer(
            this.coordinates,
            this.m_width * (options?.widthFactor || 1),
            {
                units: options?.units || "meters",
                steps: options?.steps || 8
            }
        );

        return new GeoPolygon(buffered as GeoPolygonCoordinates);
    }

    /**
     * Gets a BoundingBox for the LineString
     */
    getGeoBoundingBox(): GeoBox {
        const latitudes = this.coordinates.map(coord => coord.latitude);
        const longitudes = this.coordinates.map(coord => coord.longitude);

        const south = Math.min(...latitudes);
        const north = Math.max(...latitudes);
        const west = Math.min(...longitudes);
        const east = Math.max(...longitudes);

        return GeoBox.fromCoordinates(
            new GeoCoordinates(south, west),
            new GeoCoordinates(north, east)
        );
    }

    /**
     * Gets the length of the LineString in meters
     */
    getLength(): number {
        let length = 0;

        for (let i = 0; i < this.coordinates.length - 1; i++) {
            const from = this.coordinates[i];
            const to = this.coordinates[i + 1];

            // Simple approximation using Haversine formula
            const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
            const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
            const lat1 = (from.latitude * Math.PI) / 180;
            const lat2 = (to.latitude * Math.PI) / 180;

            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            length += 6371000 * c; // Earth radius in meters
        }

        return length;
    }

    public toJSON(): GeoLineStringJSON {
        return {
            type: "LineString",
            coordinates: this.coordinates.map(coord => {
                return [coord.longitude, coord.latitude, coord.altitude];
            }),
            options: this.options,
            width: this.m_width
        };
    }

    public static fromJSON(json: GeoLineStringJSON): GeoLineString {
        return new GeoLineString(
            json.coordinates.map(coord => {
                return new GeoCoordinates(coord[1], coord[0], coord[2]);
            }) as GeoLineStringCoordinates,
            json.width || 0,
            json.options
        );
    }
}
