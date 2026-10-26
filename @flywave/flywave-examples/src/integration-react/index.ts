/* Copyright (C) 2025 flywave.gl contributors */

/**
 * React integration (v2) — REAL react + `@flywave/flywave-react`.
 *
 * The tree mirrors the package's canonical usage (see its USAGE.md):
 *
 * ```tsx
 * <MapProvider theme={...} decoderUrl="flywave-decoders.js"
 *              target={...} zoomLevel={14} tilt={40}>
 *   <MapCanvas />   // owns the <canvas>, loading + error overlays
 *   <DemoApp />     // useMap / useDataSource / useMapEffect
 * </MapProvider>
 * ```
 *
 * Exports of `@flywave/flywave-react` used here (all from its real source):
 * - `MapProvider` — creates the `MapView` inside React state. Its options
 *   spread into `MapViewOptions`, so `target` / `zoomLevel` / `tilt` set the
 *   initial camera (the documented props alone start at the default globe
 *   pose). `enableControls` (default true) attaches `MapControls`.
 * - `MapCanvas` — renders the canvas, wires resize, shows loading/error UI.
 * - `useMap` — read the `MapView` anywhere in the tree.
 * - `useDataSource` (advanced) — create + add a data source, remove on
 *   unmount, expose `{ dataSource, isLoading, error }`.
 * - `useMapEffect` — run an effect when the `MapView` becomes available,
 *   with cleanup on unmount (used here for a throttled status line).
 *   Others available: `useMapControls`, `useMapZoom`, `useMapCamera`,
 *   `useMapTheme`, `useMapPicking`, `useMapEvents`, `useMapStatistics`.
 *
 * Integration from scratch needs these dependencies on the host package:
 *   react + react-dom (runtime), @flywave/flywave-react (workspace package),
 *   and for type checking @types/react + @types/react-dom. Until the @types
 *   packages are added, `react-modules.d.ts` next to this file provides
 *   minimal ambient declarations and must be deleted afterwards.
 *
 * Runtime wiring notes (verified in this repo):
 * - `decoderUrl` MUST be `"flywave-decoders.js"` (the file emitted next to
 *   the example bundles). `MapProvider` defaults to `"./decoder.bundle.js"`,
 *   which does not exist here, and an explicit decoderUrl would also disable
 *   the aggregate package's decoder auto-discovery.
 * - No `StrictMode`: its double-mount would construct and immediately
 *   dispose a `MapView`, and `MapProvider`/`MapCanvas` are not written for
 *   that cycle.
 */

import {
    type FeatureCollection,
    type Theme,
    FeaturesDataSource,
    GeoCoordinates,
    MapViewEventNames
} from "@flywave/flywave.gl";
import {
    MapCanvas,
    MapProvider,
    useDataSource,
    useMap,
    useMapEffect
} from "@flywave/flywave-react";
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import { createImageryWithFallback, demoImagery } from "../common";

import { Toolbar, type FlyToTarget } from "./components";

/** Demo site: inside the local `resources/dem_terrain` coverage (Shandong). */
const SITE = { lat: 36.4862, lng: 118.1727 };

/** Decoder worker bundle emitted by the examples webpack build. */
const DECODER_URL = "flywave-decoders.js";

/** Offline points of interest rendered through the `pois` style set. */
const POIS = [
    { name: "Depot A", lat: SITE.lat + 0.01, lng: SITE.lng - 0.012 },
    { name: "Depot B", lat: SITE.lat - 0.008, lng: SITE.lng + 0.014 },
    { name: "Depot C", lat: SITE.lat + 0.012, lng: SITE.lng + 0.01 }
];

/** Fly-to destinations advertised by the toolbar. */
const TARGETS: FlyToTarget[] = [
    { label: "Site", target: new GeoCoordinates(SITE.lat, SITE.lng), zoomLevel: 14.5, tilt: 45 },
    {
        label: "Depot A",
        target: new GeoCoordinates(POIS[0].lat, POIS[0].lng),
        zoomLevel: 16,
        tilt: 30
    },
    { label: "Overview", target: new GeoCoordinates(SITE.lat, SITE.lng), zoomLevel: 12.5, tilt: 20 }
];

/** Build the offline POI GeoJSON (top-level `id`s make features addressable). */
function buildPoiGeojson(): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: POIS.map(poi => ({
            type: "Feature" as const,
            id: poi.name,
            properties: { name: poi.name },
            geometry: { type: "Point" as const, coordinates: [poi.lng, poi.lat] }
        }))
    };
}

/** Inline theme (offline base + POI labels). Explicit `Theme` type is what
 * makes the `technique` string literal type-check against the theme model. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // Light sky so theme-only scenes read as a bright stage (base theme sky is deep blue).
        sky: {
            type: "gradient",
            topColor: "#9EC5E6",
            bottomColor: "#E9EDF2",
            groundColor: "#C8CEC8"
        },
        clearColor: "#DDE3EA",
        styles: {
            pois: [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "text",
                    attr: {
                        text: ["get", "name"],
                        color: "#FFFFFF",
                        backgroundColor: "#223344",
                        backgroundOpacity: 0.8,
                        size: 22,
                        priority: 90
                    }
                }
            ]
        }
    };
}

/** The demo app inside the provider: data source, status line, toolbar. */
function DemoApp(): object {
    // useState: plain React state for the throttled status line.
    const [status, setStatus] = useState("waiting for first frames…");

    // Imagery ground layer with offline debug-grid fallback. useDataSource
    // only accepts vector-tile sources, so the async attach goes through
    // useMapEffect; MapProvider owns the view, so no manual cleanup is needed.
    useMapEffect(map => {
        void createImageryWithFallback(map, demoImagery({ provider: "arcgis" }));
    }, []);

    // Real advanced hook: creates the source, adds it to the map, and removes
    // it on unmount. The `geojson` constructor option feeds setFromGeojson.
    useDataSource(
        () =>
            new FeaturesDataSource({
                name: "react-demo-pois",
                styleSetName: "pois",
                maxDataLevel: 14,
                geojson: buildPoiGeojson()
            }),
        []
    );

    // useMapEffect: runs when the MapView exists; cleanup on unmount. The
    // status refresh is throttled so the tree does not re-render per frame.
    useMapEffect(map => {
        let frames = 0;
        const onUpdate = (): void => {
            frames++;
        };
        map.addEventListener(MapViewEventNames.Update, onUpdate);
        const timer = window.setInterval(() => {
            setStatus(`frames rendered: ${frames} | zoom: ${map.zoomLevel.toFixed(2)}`);
        }, 250);
        return () => {
            map.removeEventListener(MapViewEventNames.Update, onUpdate);
            window.clearInterval(timer);
        };
    }, []);

    // useMap: the MapView flows through context into the toolbar buttons.
    return createElement(Toolbar, { mapView: useMap(), targets: TARGETS, status });
}

/** Entry: mount the provider tree into a full-viewport host element. */
function main(): void {
    const host = document.createElement("div");
    Object.assign(host.style, { position: "fixed", inset: "0" } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(host);

    createRoot(host).render(
        createElement(
            MapProvider,
            {
                theme: buildTheme(),
                decoderUrl: DECODER_URL,
                // Extra props spread into MapViewOptions: initial camera pose.
                target: new GeoCoordinates(SITE.lat, SITE.lng),
                zoomLevel: 14,
                tilt: 40
            },
            createElement(MapCanvas),
            createElement(DemoApp)
        )
    );
}

main();
