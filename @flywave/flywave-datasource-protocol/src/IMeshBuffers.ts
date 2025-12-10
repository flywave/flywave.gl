/* Copyright (C) 2025 flywave.gl contributors */

import { type Group } from "./DecodedTile";

export interface IMeshBuffers {
    /**
     * Array that stores the vertices of the mesh.
     */
    readonly positions: number[];

    /**
     * Array of [[Group]], used to defines multiple geometries sharing the same position attribute.
     */
    readonly groups: Group[];

    /**
     * Array that stores the indices of the mesh.
     */
    readonly indices: number[];

    /**
     * Array that stores the indices of the mesh edges.
     */
    readonly edgeIndices: number[];

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[];
}
