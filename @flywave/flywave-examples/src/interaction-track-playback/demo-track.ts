/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Offline demo assets for the track-playback example: a generated GPS track
 * (a sine-modulated closed loop around the Jinan DEM site, ~200 timestamped
 * points), the full-route GeoJSON + inline theme, and the mover mesh.
 */

import { type MapAnchor, type MapView, type Theme } from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

/** Demo site: inside the local `resources/dem_terrain` coverage (Jinan). */
export const SITE = { lat: 36.4862, lng: 118.1727 };

/** Track shape: loop radius in degrees and the playback duration in seconds. */
export const TRACK_DURATION = 60;
export const TRACK_POINTS = 200;

/** Mover cruise height above the local terrain, in meters. */
export const HOVER_HEIGHT = 10;

/** One sampled track point. */
export interface TrackPoint {
    lat: number;
    lng: number;
    /** Seconds since track start. */
    t: number;
}

/** Generate the offline track: a sine-modulated closed loop around SITE. */
export function generateTrack(): TrackPoint[] {
    const points: TrackPoint[] = [];
    for (let i = 0; i < TRACK_POINTS; i++) {
        const phase = (i / TRACK_POINTS) * Math.PI * 2;
        // 3-lobe wobble makes the circuit recognizable as "planned route".
        const wobble = 1 + 0.25 * Math.sin(3 * phase);
        points.push({
            lat: SITE.lat + 0.018 * wobble * Math.sin(phase),
            lng: SITE.lng + 0.028 * wobble * Math.cos(phase),
            t: (i / (TRACK_POINTS - 1)) * TRACK_DURATION
        });
    }
    return points;
}

/** Build the full-track polyline feature (one LineString, offline data). */
export function trackGeojson(points: TrackPoint[]) {
    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                id: "planned-route",
                properties: { name: "planned route" },
                geometry: {
                    type: "LineString" as const,
                    coordinates: points.map(point => [point.lng, point.lat])
                }
            }
        ]
    };
}

/** Inline theme exposing the `track` style set used by the polyline. The
 * explicit `Theme` annotation is what makes `technique: "solid-line"` a
 * string literal instead of `string` under full tsc. */
export function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // Light sky so the theme-only scene reads as a bright stage.
        sky: { type: "gradient", topColor: "#9EC5E6", bottomColor: "#E9EDF2", groundColor: "#C8CEC8" },
        clearColor: "#DDE3EA",
        styles: {
            track: [
                {
                    when: ["==", ["geometry-type"], "LineString"],
                    // solid-line = screen-space extruded lines; lineWidth is a
                    // world-space length (meters by default).
                    technique: "solid-line",
                    attr: { color: "#FFB000", lineWidth: 30, opacity: 0.9 }
                }
            ]
        }
    };
}

/** Car-like mover: box body + direction cone, registered as a MapAnchor. */
export function createMover(mapView: MapView): MapAnchor {
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(24, 10, 48),
        new THREE.MeshStandardNodeMaterial({ color: 0x33ccff, roughness: 0.5, metalness: 0.2 })
    );
    body.position.y = 5;
    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(8, 18, 12),
        new THREE.MeshStandardNodeMaterial({ color: 0xff5533, roughness: 0.5 })
    );
    // +z is "forward" for the yaw applied by the playback loop.
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 10, 28);

    const root: MapAnchor = new THREE.Group();
    root.name = "track-mover";
    root.add(body, nose);
    mapView.mapAnchors.add(root);
    return root;
}
