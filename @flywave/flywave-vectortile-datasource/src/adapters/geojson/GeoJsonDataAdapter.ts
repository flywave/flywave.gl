/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueMap } from "@flywave/flywave-datasource-protocol/Env";
import { clipLineString } from "@flywave/flywave-geometry/ClipLineString";
import { GeoCoordinates, GeoPointLike, webMercatorProjection } from "@flywave/flywave-geoutils";
import { Vector2Like } from "@flywave/flywave-geoutils/math/Vector2Like";
import { ShapeUtils, Vector2, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import { world2tile } from "../../OmvUtils";

const DEFAULT_EXTENTS = 4 * 1024;

type GeoJsonGeometry =
    | GeoJsonLineStringGeometry
    | GeoJsonMultiLineStringGeometry
    | GeoJsonPolygonGeometry
    | GeoJsonMultiPolygonGeometry
    | GeoJsonPointGeometry
    | GeoJsonMultiPointGeometry;

interface GeoJsonLineStringGeometry {
    type: "LineString";
    coordinates: GeoPointLike[];
}

interface GeoJsonMultiLineStringGeometry {
    type: "MultiLineString";
    coordinates: GeoPointLike[][];
}

interface GeoJsonPointGeometry {
    type: "Point";
    coordinates: GeoPointLike;
}

interface GeoJsonMultiPointGeometry {
    type: "MultiPoint";
    coordinates: GeoPointLike[];
}

interface GeoJsonPolygonGeometry {
    type: "Polygon";
    coordinates: GeoPointLike[][];
}

interface GeoJsonMultiPolygonGeometry {
    type: "MultiPolygon";
    coordinates: GeoPointLike[][][];
}

interface GeoJsonFeature {
    id?: string;
    type: "Feature";
    properties: ValueMap;
    geometry: GeoJsonGeometry;
}

export interface GeoJsonFeatureCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

const worldP = new Vector3();

/**
 * Converts a `geoPoint` to local tile space.
 *
 * @param geoPoint - The input [[GeoPointLike]].
 * @param decodeInfo - The [[DecodeInfo]].
 * @param target - A [[VectorLike]] used as target of the converted coordinates.
 * @return A [[VectorLike]] with the converted point.
 * @hidden
 */
function convertPoint<VectorType extends Vector2Like>(
    geoPoint: GeoPointLike,
    decodeInfo: DecodeInfo,
    target: VectorType
): VectorType {
    webMercatorProjection.projectPoint(GeoCoordinates.fromGeoPoint(geoPoint), worldP);
    return world2tile(DEFAULT_EXTENTS, decodeInfo, worldP, false, target);
}

function convertLineStringGeometry(
    coordinates: GeoPointLike[],
    decodeInfo: DecodeInfo
) :any {
    const untiledPositions = coordinates.map(geoPoint => {
        return GeoCoordinates.fromGeoPoint(geoPoint);
    });

    const positions = coordinates.map(geoPoint =>
        convertPoint(geoPoint, decodeInfo, new Vector3())
    );

    return { untiledPositions, positions };
}

function convertLineGeometry(
    geometry: GeoJsonLineStringGeometry | GeoJsonMultiLineStringGeometry,
    decodeInfo: DecodeInfo
): ILineGeometry[] {
    if (geometry.type === "LineString") {
        return [convertLineStringGeometry(geometry.coordinates, decodeInfo)];
    }

    return geometry.coordinates.map(lineString =>
        convertLineStringGeometry(lineString, decodeInfo)
    );
}
function convertRings(coordinates: GeoPointLike[][], decodeInfo: DecodeInfo): IPolygonGeometry {
    const rings = coordinates.map((ring, i) => {
        const isOuterRing = i === 0;
        const { positions } = convertLineStringGeometry(ring, decodeInfo);
        const isClockWise = ShapeUtils.area(positions) > 0;
        if ((isOuterRing && !isClockWise) || (!isOuterRing && isClockWise)) {
            positions.reverse();
        }
        return positions;
    });
    return { rings };
}

function convertPolygonGeometry(
    geometry: GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry,
    decodeInfo: DecodeInfo
): IPolygonGeometry[] {
    if (geometry.type === "Polygon") {
        return [convertRings(geometry.coordinates, decodeInfo)];
    }

    return geometry.coordinates.map(polygon => convertRings(polygon, decodeInfo));
}

function convertPointGeometry(
    geometry: GeoJsonPointGeometry | GeoJsonMultiPointGeometry,
    decodeInfo: DecodeInfo
): Vector3[] {
    if (geometry.type === "Point") {
        return [convertPoint(geometry.coordinates, decodeInfo, new Vector3())];
    }

    return geometry.coordinates.map(geoPoint => convertPoint(geoPoint, decodeInfo, new Vector3()));
}

export interface GeoJsonDataAdapterOptions {
    /**
     * Mapbox-gl-js compatibility mode: geojson-vt semantics as configured by
     * mgl's GeoJSONSource — tile buffer of `128 * (EXTENT / tileSize)` =
     * 1024 extent units (vs. the legacy 100-unit border), and integer
     * quantization of tile-space vertices (geojson-vt `round: true`, and mgl
     * `load_geometry`'s preparePoint both round). mgl additionally simplifies
     * with Douglas-Peucker `tolerance = 0.375 * 8 = 3` extent units — not
     * applied here (render-test fixtures are near-degenerate short lines
     * where simplification is a no-op; recorded as a known gap).
     */
    mglCompat?: boolean;
}

export class GeoJsonDataAdapter implements DataAdapter {
    private readonly m_border: number;
    private readonly m_quantize: boolean;

    constructor(options?: GeoJsonDataAdapterOptions) {
        this.m_border = options?.mglCompat
            ? 128 * (DEFAULT_EXTENTS / 512)
            : 100; // legacy default, unchanged
        this.m_quantize = options?.mglCompat === true;
    }

    /**
     * @override
     */
    canProcess(featureCollection: Partial<GeoJsonFeatureCollection>): boolean {
        return (
            featureCollection &&
            featureCollection.type === "FeatureCollection" &&
            Array.isArray(featureCollection.features)
        );
    }

    /** @override */
    process(
        featureCollection: GeoJsonFeatureCollection,
        decodeInfo: DecodeInfo,
        geometryProcessor: IGeometryProcessor,
        layer: string = "geojson"
    ): void {
        if (!Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
            return;
        }

        for (const feature of featureCollection.features) {
            switch (feature.geometry.type) {
                case "LineString":
                case "MultiLineString": {
                    let geometry = convertLineGeometry(feature.geometry, decodeInfo);

                    const clippedGeometries: ILineGeometry[] = [];

                    const border = this.m_border;
                    if (this.m_quantize) {
                        // geojson-vt stores sliced vertices as integers.
                        for (const g of geometry) {
                            for (const p of g.positions as any) {
                                p.x = Math.round(p.x);
                                p.y = Math.round(p.y);
                            }
                        }
                    }

                    geometry.forEach(g => {
                        const clipped = clipLineString(
                            g.positions as any,
                            -border,
                            -border,
                            DEFAULT_EXTENTS + border,
                            DEFAULT_EXTENTS + border
                        );
                        clipped.forEach(positions => {
                            clippedGeometries.push({ positions:positions  as any});
                        });
                    });

                    geometry = clippedGeometries;

                    if (geometry.length > 0) {
                        geometryProcessor.processLineFeature(
                            layer,
                            DEFAULT_EXTENTS,
                            clippedGeometries,
                            feature.properties,
                            feature.id
                        );
                    }
                    break;
                }
                case "Polygon":
                case "MultiPolygon": {
                    const geometry = convertPolygonGeometry(feature.geometry, decodeInfo);
                    geometryProcessor.processPolygonFeature(
                        layer,
                        DEFAULT_EXTENTS,
                        geometry,
                        feature.properties,
                        feature.id
                    );
                    break;
                }
                case "Point":
                case "MultiPoint": {
                    const geometry = convertPointGeometry(feature.geometry, decodeInfo);
                    geometryProcessor.processPointFeature(
                        layer,
                        DEFAULT_EXTENTS,
                        geometry,
                        feature.properties,
                        feature.id
                    );
                    break;
                }
            }
        }
    }
}
