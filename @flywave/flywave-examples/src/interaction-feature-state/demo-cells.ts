/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Offline demo data + inline theme for the feature-state example: a grid of
 * schematic district cells around Jinan (real area, NOT real boundaries),
 * mirroring the built-in GeoJSON pattern of `styling-extrusion-bars`.
 */

import { type FeatureCollection, type Theme } from "@flywave/flywave.gl";

/** Grid anchor: west/south corner of the demo cell grid (Jinan area). */
export const GRID_ORIGIN = { lat: 36.5, lng: 116.95 };
/** Cell size in degrees and grid shape — mirrors styling-extrusion-bars. */
export const CELL_SIZE = { lng: 0.05, lat: 0.035 };
export const GRID_COLS = 4;
export const GRID_ROWS = 3;

/** The GeoJSON property the color expression reads (0 = base, 1 = highlight). */
export const SELECTED_PROP = "selected";

/** Local model of one district cell; `id` doubles as the feature id. */
export interface DistrictModel {
    id: string;
    name: string;
    population: number;
}

/** Static demo data: 12 schematic cells (values only, not real boundaries). */
export const DISTRICTS: DistrictModel[] = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => ({
    id: `cell-${i}`,
    name: `Cell ${String.fromCharCode(65 + (i % GRID_COLS))}${Math.floor(i / GRID_COLS) + 1}`,
    population: 200000 + i * 90000
}));

/**
 * Build the offline GeoJSON. The TOP-LEVEL feature `id` is load-bearing: the
 * GeoJSON decoder maps it to the `$id` attribute, `getFeatureId` reads `$id`
 * from the picked feature's userData, and `PickResult.featureId` returns it.
 * Without it `featureId` would come back `undefined` and feature state could
 * not be addressed per feature.
 */
export function buildGeojson(selectedId: string | null): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: DISTRICTS.map((district, i) => {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);
            const x0 = GRID_ORIGIN.lng + col * CELL_SIZE.lng;
            const y0 = GRID_ORIGIN.lat + row * CELL_SIZE.lat;
            return {
                type: "Feature" as const,
                id: district.id,
                properties: {
                    name: district.name,
                    population: district.population,
                    [SELECTED_PROP]: district.id === selectedId ? 1 : 0
                },
                geometry: {
                    type: "Polygon" as const,
                    coordinates: [
                        [
                            [x0, y0],
                            [x0 + CELL_SIZE.lng * 0.92, y0],
                            [x0 + CELL_SIZE.lng * 0.92, y0 + CELL_SIZE.lat * 0.9],
                            [x0, y0 + CELL_SIZE.lat * 0.9],
                            [x0, y0]
                        ]
                    ]
                }
            };
        })
    };
}

/** Inline theme: extruded cells whose color reads the `selected` property. */
export function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // Light sky so the theme-only scene reads as a bright stage.
        sky: { type: "gradient", topColor: "#9EC5E6", bottomColor: "#E9EDF2", groundColor: "#C8CEC8" },
        clearColor: "#DDE3EA",
        styles: {
            cells: [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    attr: {
                        // Plain data attribute: recomputed on setFromGeojson
                        // re-decode (feature-state is NOT legal here — see the
                        // main file for the verified StyleSetEvaluator
                        // restriction to the `enabled` attribute).
                        color: [
                            "case",
                            ["==", ["get", SELECTED_PROP], 1],
                            "#FF5A36",
                            [
                                "step",
                                ["get", "population"],
                                "#2C4A7C",
                                600000,
                                "#3E63B0",
                                900000,
                                "#5585CC"
                            ]
                        ],
                        height: 120,
                        footprint: true,
                        lineColor: "#16233F",
                        lineWidth: 2,
                        // The ONLY style attribute that supports the
                        // feature-state operator (StyleSetEvaluator): hide
                        // features whose DataSource state has hidden: true.
                        enabled: ["!", ["coalesce", ["feature-state", "hidden"], false]]
                    }
                }
            ]
        }
    };
}
