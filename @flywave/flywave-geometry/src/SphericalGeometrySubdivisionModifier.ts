/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, sphereProjection } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";

import { SubdivisionModifier } from "./SubdivisionModifier";

const VERTEX_POSITION_CACHE = [new Vector3(), new Vector3(), new Vector3()];

/**
 * The [[SphericalGeometrySubdivisionModifier]] subdivides triangle mesh geometries positioned
 * on the surface of a sphere centered at `(0, 0, 0)`.
 */
export class SphericalGeometrySubdivisionModifier extends SubdivisionModifier {
    /**
     * Constructs a new [[SphericalGeometrySubdivisionModifier]].
     *
     * @param angle - The maximum angle in radians between two vertices and the origin.
     * @param projection - The projection that defines the world space of this geometry.
     */
    constructor(readonly angle: number, readonly sourceProjection: Projection, readonly targetProjection: Projection = sphereProjection) {
        super();
    }

    /** @override */
    protected shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined {
        const aa = this.targetProjection.reprojectPoint(this.sourceProjection, a, VERTEX_POSITION_CACHE[0]);
        const bb = this.targetProjection.reprojectPoint(this.sourceProjection, b, VERTEX_POSITION_CACHE[1]);
        const cc = this.targetProjection.reprojectPoint(this.sourceProjection, c, VERTEX_POSITION_CACHE[2]);

        const alpha = aa.angleTo(bb);
        const beta = bb.angleTo(cc);
        const gamma = cc.angleTo(aa);

        // find the maximum angle
        const m = Math.max(alpha, Math.max(beta, gamma));

        // split the triangle if needed.
        if (m < this.angle) {
            return undefined;
        }

        if (m === alpha) {
            return 0;
        } else if (m === beta) {
            return 1;
        } else if (m === gamma) {
            return 2;
        }

        throw new Error("failed to split triangle");
    }
}
