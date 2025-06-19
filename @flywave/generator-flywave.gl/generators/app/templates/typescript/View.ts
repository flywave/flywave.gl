/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@flywave/flywave-datasource-protocol/src";
import { MapControls } from "@flywave/flywave-map-controls";
import { MapView } from "@flywave/flywave-mapview";
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

const defaultTheme = "resources/berlin_tilezen_base.json";

export interface ViewParameters {
    theme?: string | Theme;
    canvas: HTMLCanvasElement;
}

export class View {
    readonly canvas: HTMLCanvasElement;
    readonly theme: string | Theme;

    readonly mapView: MapView;

    constructor(args: ViewParameters) {
        this.canvas = args.canvas;
        this.theme = args.theme === undefined ? defaultTheme : args.theme;
        this.mapView = this.initialize();
    }

    protected initialize(): MapView {
        const mapView = new MapView({
            canvas: this.canvas,
            theme: this.theme,
            decoderUrl: "decoder.bundle.js"
        });

        const dataSource = new VectorTileDataSource({
            authenticationCode: "<%= apikey %>"
        });
        mapView.addDataSource(dataSource);

        MapControls.create(mapView);

        return mapView;
    }
}
