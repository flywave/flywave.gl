/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapControls, MapControlsUI } from "@flywave/flywave-map-controls";
import { CopyrightElementHandler, MapView } from "@flywave/flywave-mapview";

import { GeoCoordinates, sphereProjection } from "@flywave/flywave-geoutils";
import { TilesRenderer } from "@flywave/flywave-3dtile-render";
import { apikey } from "./config";
import { HereTileProvider, HereWebTileDataSource } from "@flywave/flywave-webtile-datasource";
import { TileIntersection } from "../../flywave-3dtile-render/src/renderer/TilesRenderer";
import { Tile } from "../../flywave-3dtile-render/src/base/Tile";

/**
 * A simple example using the webtile data source. Tiles are retrieved from
 * ```
 * https://1.aerial.maps.ls.hereapi.com/maptile/2.1/maptile/newest/satellite.day/${level}/${column}/${row}/512/png8?apikey=${apikey}
 * ```
 *
 * A [[WebTileDataSource]] is created with specified applications' apikey passed
 * as [[WebTileDataSourceOptions]]
 * ```typescript
 * [[include:harp_gl_datasource_satellitetile_1.ts]]
 * ```
 * Then added to the [[MapView]]
 * ```typescript
 * [[include:harp_gl_datasource_satellitetile_2.ts]]
 * ```
 */

class MockMapView extends MapView {
    get isDynamicFrame() {
        return true;
    }
}
export namespace T3DTileRenderExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): [MapView, MapControls] {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MockMapView({
            projection: sphereProjection,
            target: new GeoCoordinates(36.10112950120568, 117.0042267735369, 0),
            zoomLevel: 18,
            canvas,
            theme: "resources/berlin_tilezen_base_globe.json"
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { zoomLevel: "input", projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        CopyrightElementHandler.install("copyrightNotice", map);

        // resize the mapView to maximum
        map.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return [map, controls];
    }

    const [mapView, controls] = initializeMapView("mapCanvas");

    function getCanvasPosition(
        event: MouseEvent | Touch,
        canvas: HTMLCanvasElement
    ): { x: number; y: number } {
        const { left, top } = canvas.getBoundingClientRect();
        return { x: event.clientX - Math.floor(left), y: event.clientY - Math.floor(top) };
    }

    let tileRender = new TilesRenderer({
        // url: "./resources/3dtile-data/pipe/tileset.json",
        url: "http://192.168.1.18/flywave-examples/data/%E7%89%B9%E9%AB%98%E5%8E%8B%E8%BE%93%E7%94%B5%E7%BA%BF%E8%B7%AF/3dtile/tileset.json",
        // url: "https://assets.cms.plateau.reearth.io/assets/99/e2a800-7d75-4d11-94e1-bef604c39d01/13103_minato-ku_pref_2023_citygml_1_op_bldg_3dtiles_13103_minato-ku_lod4/tileset.json",
        decoderPath: "./resources/"
    });
    mapView.add3DTileSet(tileRender);
    tileRender.getRootTileBoundingVolumeRegion().then(region => {
        controls.flyToBox(region);
    });

    let intersection: TileIntersection[] = [];
    const canvas = mapView.canvas;

    let preTile: Tile | undefined;
    canvas.addEventListener("mouseup", event => {
        const canvasPos = getCanvasPosition(event, canvas);
        const rayCaster = mapView.pickHandler.setupRaycaster(canvasPos.x, canvasPos.y);
        tileRender.raycast(rayCaster, intersection);

        const [picked] = intersection;
        if (picked) {
            if (preTile) {
                preTile.debugBoundingVolume(false);
            }
            preTile = picked.tile;
            preTile.debugBoundingVolume("box");
        }
        console.log(intersection);
        intersection.length = 0;
    });

    // controls.setTo(117.0002378472017, 36.04174517742333, 1171.7782847248018, 0, 0, 0);

    // controls.setTo(117.82701769728989, 36.831012861737015, 1171.7782847248018, 0, 0, 0);

    // snippet:harp_gl_datasource_satellitetile_1.ts
    const webTileDataSource = new HereWebTileDataSource({
        apikey,
        tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE
    });
    // end:harp_gl_datasource_satellitetile_1.ts

    // snippet:harp_gl_datasource_satellitetile_2.ts
    // mapView.addDataSource(webTileDataSource);
}
