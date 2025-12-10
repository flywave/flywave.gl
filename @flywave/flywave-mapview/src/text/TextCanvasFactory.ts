/* Copyright (C) 2025 flywave.gl contributors */

import { type FontCatalog, TextCanvas } from "@flywave/flywave-text-canvas";
import { assert } from "@flywave/flywave-utils";
import type * as THREE from "three";

export class TextCanvasFactory {
    private m_minGlyphCount: number = 0; //Min amount of glyphs each [[TextCanvas]] layer can store.
    private m_maxGlyphCount: number = 0; //Max amount of glyphs each [[TextCanvas]] layer can store.

    /**
     * Creates an instance of text canvas factory.
     * @param m_renderer -
     */
    constructor(private readonly m_renderer: THREE.WebGLRenderer) {}

    setGlyphCountLimits(min: number, max: number) {
        this.m_minGlyphCount = min;
        this.m_maxGlyphCount = max;
    }

    /**
     * Creates text canvas
     * @param fontCatalog - Initial [[FontCatalog]].
     * @param name - Optional name for the TextCavas
     */
    createTextCanvas(fontCatalog: FontCatalog, name?: string): TextCanvas {
        assert(this.m_maxGlyphCount > 0);

        return new TextCanvas({
            renderer: this.m_renderer,
            fontCatalog,
            minGlyphCount: this.m_minGlyphCount,
            maxGlyphCount: this.m_maxGlyphCount,
            name
        });
    }
}
