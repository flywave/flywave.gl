/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { sphereProjection } from "@flywave/flywave-geoutils";
import { MapControls, MapControlsUI } from "@flywave/flywave-map-controls";
import { CopyrightElementHandler, MapView } from "@flywave/flywave-mapview";
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

import { apikey } from "./config";

export namespace GlobeExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme: "resources/berlin_tilezen_base_globe.json"
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

    function main() {
        const map = initializeMapView("mapCanvas");

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 90;
        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        map.canvas.parentElement!.appendChild(ui.domElement);
    }

    main();
}
