/* Copyright (C) 2025 flywave.gl contributors */

import {
    ArcGISTileProvider,
    CesiumWorldTerrainSource,
    DEMTerrainSource,
    DrawEventNames,
    DrawMode,
    type FeatureCollection,
    GeoCoordinates,
    GeoJSONDrawControls,
    GeoLineString,
    ProjectionType,
    type MapView
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import { applyPanelStyle, checkIonToken, createExampleGui, createExampleMap, logExampleInfo } from "../common";

/**
 * Free global DEM (AWS Open Data Terrain Tiles, no token, CORS enabled) used
 * as the token-free fallback elevation source. `encoding: "terrarium"` must be
 * declared on the DEMTerrainSource constructor (height = R * 256 + G + B / 256
 * - 32768 m); the descriptor's own `encoding` field is not read for tiles.
 */
const FREE_TERRARIUM_DEM = {
    type: "raster-dem" as const,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    scheme: "xyz" as const,
    bounds: [-180, -85.0511, 180, 85.0511] as [number, number, number, number],
    minzoom: 0,
    maxzoom: 15,
    tileSize: 256,
    attribution: "Terrain: AWS Open Data Terrain Tiles / Mapzen"
};

/** Initial camera site: the sample route area (Guilin). */
const SITE = { lat: 22.404942179523914, lng: 109.02507529895595 };

/** Sample route loaded at startup so the measurement panel is not empty. */
function createSampleRoute(): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { id: "line-1", name: "Guilin Route" },
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [109.02507529895595, 22.404942179523914, 446.9],
                        [109.02907315802219, 22.40139448484383, 462.8],
                        [109.03212918907052, 22.398645455179835, 428.8],
                        [109.03131387590265, 22.39676317102972, 474.3],
                        [109.03039293306104, 22.394955466052163, 492.0],
                        [109.02896042591563, 22.394541139537225, 509.2],
                        [109.02814003868731, 22.394092936886747, 486.3],
                        [109.02081280261756, 22.39983029930943, 495.5],
                        [109.02486902365864, 22.40453119147113, 451.4]
                    ]
                }
            }
        ]
    };
}

/** Format meters as m / km. */
function formatLength(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
}

/** Format square meters as m2 / km2. */
function formatArea(squareMeters: number): string {
    return squareMeters >= 1e6
        ? `${(squareMeters / 1e6).toFixed(3)} km²`
        : `${squareMeters.toFixed(1)} m²`;
}

/**
 * Great-circle polyline length in meters via geoutils' haversine helper
 * (`GeoLineString.getLength`, R = 6371 km; vertex altitude is ignored, so
 * mountainous routes read slightly short of their 3D length).
 */
function measureLineLength(vertices: GeoCoordinates[]): number | undefined {
    if (vertices.length < 2) {
        return undefined;
    }
    return new GeoLineString(vertices).getLength();
}

/**
 * Planar polygon area approximation in square meters. Vertices are projected
 * with the view's active projection, re-expressed in a local orthonormal basis
 * on the ring centroid's tangent plane (globe) or the world XY plane (flat
 * projections), then measured with the shoelace formula.
 *
 * Precision note: this is a local tangent-plane approximation. It is exact for
 * small polygons on flat projections and degrades gracefully with polygon
 * size on the globe (quadratic error in size / earth radius); geodesic area
 * computation is out of scope for this example.
 */
function measurePolygonArea(mapView: MapView, vertices: GeoCoordinates[]): number | undefined {
    if (vertices.length < 3) {
        return undefined;
    }
    const points = vertices.map(vertex =>
        mapView.projection.projectPoint(vertex, new THREE.Vector3())
    );
    const origin = points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(points.length);
    const flat = mapView.projection.type === ProjectionType.Planar;

    // Orthonormal in-plane basis (u, v) of the measurement plane.
    let u: THREE.Vector3;
    let v: THREE.Vector3;
    if (flat) {
        u = new THREE.Vector3(1, 0, 0);
        v = new THREE.Vector3(0, 1, 0);
    } else {
        const up = origin.clone().normalize();
        u = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1));
        if (u.lengthSq() < 1e-8) {
            u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up);
        }
        u.normalize();
        v = new THREE.Vector3().crossVectors(up, u).normalize();
    }

    // Local 2D coordinates on the measurement plane, then the shoelace formula.
    const coords2d = points.map(point => {
        const local = point.clone().sub(origin);
        return new THREE.Vector2(local.dot(u), local.dot(v));
    });
    let twiceArea = 0;
    for (let i = 0; i < coords2d.length; i++) {
        const current = coords2d[i];
        const next = coords2d[(i + 1) % coords2d.length];
        twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) / 2;
}

/** The drawables type is structural: draw-controls does not export it. */
interface MeasurableDrawable {
    id: number;
    getVertices(): GeoCoordinates[];
    toGeoJSON(): { type: string };
}

/**
 * Measure one drawn object. Returns the display text, or undefined for
 * points. Polygon vertices are closed implicitly for the perimeter.
 */
function measureDrawable(mapView: MapView, object: MeasurableDrawable): string | undefined {
    const vertices = object.getVertices();
    if (object.toGeoJSON().type === "Polygon" && vertices.length >= 3) {
        const area = measurePolygonArea(mapView, vertices);
        const perimeter = measureLineLength([...vertices, vertices[0]]);
        return `area ${formatArea(area ?? 0)}, perimeter ${formatLength(perimeter ?? 0)}`;
    }
    const length = measureLineLength(vertices);
    return length !== undefined ? `length ${formatLength(length)}` : undefined;
}

/** Measurement bookkeeping shown in the side panel. */
const measurements = new Map<number, string>();

/** Draw + measure demo: draw/edit/export GeoJSON with live measurements. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView, controls } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng }, zoomLevel: 14, tilt: 45 }
    });

    // Token-gated elevation: Cesium World Terrain with an Ion token, falling
    // back to the token-free AWS terrarium DEM otherwise (see descriptor above).
    const ionToken = checkIonToken();
    const elevation: CesiumWorldTerrainSource | DEMTerrainSource =
        ionToken !== undefined
            ? new CesiumWorldTerrainSource({ accessToken: ionToken, assetId: 1 })
            : new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
    mapView.setElevationSource(elevation);
    elevation.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    const drawControls = new GeoJSONDrawControls(mapView, controls);
    const loaded = drawControls.addGeoJSON(createSampleRoute());
    console.log(`interaction-draw-measure: loaded ${loaded} GeoJSON feature(s)`);

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "absolute",
        right: "12px",
        top: "12px",
        padding: "10px 14px",
        font: "12px/1.7 sans-serif",
        color: "#e8eaed",
        whiteSpace: "pre-line",
        pointerEvents: "none",
        minWidth: "220px",
        maxWidth: "320px"
    } as CSSStyleDeclaration);
    applyPanelStyle(panel);
    document.body.appendChild(panel);

    /** Re-render the measurement panel from the bookkeeping map. */
    function updatePanel(): void {
        const rows = [...measurements.entries()].map(
            ([id, text]) => `#${id}: ${text}`
        );
        panel.innerHTML =
            "<b>Measurements</b><br>" +
            (rows.length > 0 ? rows.join("<br>") : "draw a line or polygon") +
            (ionToken === undefined ? "<br><i>no Ion token: AWS terrarium DEM</i>" : "");
    }

    // DrawEventNames.DRAW_END carries no object (only the mode); the reliable
    // "object exists" events are OBJECT_ADDED (draw finish AND addGeoJSON) and
    // OBJECT_MODIFIED(_END) for subsequent edits — re-measure there.
    drawControls.addEventListener(DrawEventNames.OBJECT_ADDED, event => {
        const object = event.object as MeasurableDrawable | undefined;
        if (object === undefined) {
            return;
        }
        const text = measureDrawable(mapView, object);
        if (text !== undefined) {
            measurements.set(object.id, text);
        }
        updatePanel();
    });
    drawControls.addEventListener(DrawEventNames.OBJECT_REMOVED, event => {
        const object = event.object as MeasurableDrawable | undefined;
        if (object !== undefined) {
            measurements.delete(object.id);
        }
        updatePanel();
    });
    drawControls.addEventListener(DrawEventNames.OBJECT_MODIFIED_END, event => {
        const object = event.object as MeasurableDrawable | undefined;
        if (object === undefined) {
            return;
        }
        const text = measureDrawable(mapView, object);
        if (text !== undefined) {
            measurements.set(object.id, text);
        }
        updatePanel();
    });
    drawControls.addEventListener(DrawEventNames.MODE_CHANGED, () => updatePanel());

    const gui = createExampleGui();
    const drawFolder = gui.addFolder("Draw");
    const actions = {
        point: () => drawControls.setMode(DrawMode.POINT),
        line: () => drawControls.setMode(DrawMode.LINE),
        polygon: () => drawControls.setMode(DrawMode.POLYGON),
        edit: () => drawControls.setMode(DrawMode.EDIT),
        undo: () => drawControls.undo(),
        clear: () => {
            drawControls.clearAll();
            measurements.clear();
            updatePanel();
        },
        export: () => {
            const geoJson = drawControls.exportToGeoJSON();
            const count = "features" in geoJson ? geoJson.features.length : 1;
            window.alert(`Exported ${count} feature(s) — see the measure panel for details`);
        }
    };
    drawFolder.add(actions, "point").name("Draw point");
    drawFolder.add(actions, "line").name("Draw line");
    drawFolder.add(actions, "polygon").name("Draw polygon");
    drawFolder.add(actions, "edit").name("Edit (drag vertices)");
    drawFolder.add(actions, "undo").name("Undo (Ctrl+Z)");
    drawFolder.add(actions, "clear").name("Clear all");
    drawFolder.add(actions, "export").name("Export GeoJSON");
    drawFolder.open();

    updatePanel();
    mapView.update();
    logExampleInfo("interaction-draw-measure", mapView);
}

main().catch(err => console.error("interaction-draw-measure failed:", err));
