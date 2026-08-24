/* Copyright (C) 2026 flywave.gl contributors */

import { SurfaceCapturePass } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";

/** Which captured surface kinds a draped primitive may stick to. */
export enum DrapedTarget {
    Terrain = 1,
    Model = 2,
    Both = 3
}

export interface DrapedSurfaceMaterialOptions {
    capturePass: SurfaceCapturePass;
    /** Line width in screen pixels (curtain mode only). */
    widthPixels?: number;
    color?: THREE.ColorRepresentation;
    opacity?: number;
    target?: DrapedTarget;
    /** Render the raw volumes translucent magenta, bypassing all gates. */
    debugShowVolume?: boolean;
    /**
     * Bisection aid: swap the TSL node material for a plain opaque basic
     * material on the very same mesh. Renders magenta when the mesh itself,
     * its anchor placement and visibility handling are healthy.
     */
    debugRawMaterial?: boolean;
    /**
     * Bisection aid applied on top of the real node material:
     * `1` replaces the fragment graph with flat opaque magenta (keeps vertex
     * stage and render state), `2` additionally resets the vertex stage to
     * `positionLocal` (curtain only). Higher levels strip more logic.
     */
    debugLevel?: number;
}
