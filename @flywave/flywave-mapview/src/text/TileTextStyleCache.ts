/* Copyright (C) 2025 flywave.gl contributors */

import {
    type IndexedTechniqueParams,
    type LineMarkerTechnique,
    type PoiTechnique,
    type TextTechnique
} from "@flywave/flywave-datasource-protocol";
import { type TextLayoutStyle, type TextRenderStyle } from "@flywave/flywave-text-canvas";

import { type Tile } from "../Tile";

export class TileTextStyleCache {
    private textRenderStyles: TextRenderStyle[] = [];
    private textLayoutStyles: TextLayoutStyle[] = [];
    private readonly tile: Tile;

    constructor(tile: Tile) {
        this.tile = tile;
    }

    clear() {
        this.textRenderStyles.length = 0;
        this.textLayoutStyles.length = 0;
    }

    getRenderStyle(
        technique: (TextTechnique | PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams
    ): TextRenderStyle {
        let style = this.textRenderStyles[technique._index];
        if (style === undefined) {
            style = this.textRenderStyles[technique._index] =
                this.tile.mapView.textElementsRenderer.styleCache.createRenderStyle(
                    this.tile,
                    technique
                );
        }
        return style;
    }

    getLayoutStyle(
        technique: (TextTechnique | PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams
    ): TextLayoutStyle {
        let style = this.textLayoutStyles[technique._index];
        if (style === undefined) {
            style = this.textLayoutStyles[technique._index] =
                this.tile.mapView.textElementsRenderer.styleCache.createLayoutStyle(
                    this.tile,
                    technique
                );
        }
        return style;
    }
}
