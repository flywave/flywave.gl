/* Copyright (C) 2025 flywave.gl contributors */



import {
    BooleanClipNodeIntersection,
    BooleanClipNodeParity,
    BooleanClipNodeUnion
} from "./boolean-clip-node";
import { ClipPlane } from "./clip-plane";
import { type Clipper, ClipUtilities } from "./clip-utils";
import { ConvexClipPlaneSet } from "./convex-clip-plane-set";
import { UnionOfConvexClipPlaneSets } from "./union-of-convex-clip-plane-sets";

export class BooleanClipFactory {
    public static createCaptureUnion(clippers: Clipper | Clipper[], keepInside: boolean): Clipper {
        const result = new BooleanClipNodeUnion(keepInside);
        result.captureChild(clippers);
        return result;
    }

    public static createCaptureIntersection(
        clippers: Clipper | Clipper[],
        keepInside: boolean
    ): Clipper {
        const result = new BooleanClipNodeIntersection(keepInside);
        result.captureChild(clippers);
        return result;
    }

    public static createCaptureParity(clippers: Clipper | Clipper[], keepInside: boolean): Clipper {
        const result = new BooleanClipNodeParity(keepInside);
        result.captureChild(clippers);
        return result;
    }

    public static createCaptureDifference(
        primaryClipper: Clipper,
        excludedClipper: Clipper,
        keepInside: boolean
    ): Clipper {
        const mask = this.createCaptureUnion(excludedClipper, false);
        return this.createCaptureIntersection([primaryClipper, mask], keepInside);
    }

    public static createCaptureClipOutside(primaryClipper: Clipper): Clipper {
        return this.createCaptureUnion([primaryClipper], false);
    }

    public static parseToClipperArray(source: any): Clipper[] | undefined {
        if (Array.isArray(source)) {
            const clippers = [];
            for (const c of source) {
                const c1 = this.parseToClipper(c);
                if (!c1) return undefined;
                clippers.push(c1);
            }
            if (clippers.length === 0) return undefined;
            return clippers;
        } else {
            const c = this.parseToClipper(source);
            if (c) return [c];
        }
        return undefined;
    }

    public static parseToClipper(source?: object): Clipper | undefined {
        if (!source) return undefined;

        if (source.hasOwnProperty("normal") && source.hasOwnProperty("dist")) {
            return ClipPlane.fromJSON(source);
        } else if (Array.isArray(source)) {
            const clippers: Clipper[] = [];
            let numPlanes = 0;
            let numConvexSets = 0;
            for (const c of source) {
                const c1 = this.parseToClipper(c);
                if (!c1) return undefined;
                clippers.push(c1);
                if (c1 instanceof ClipPlane) numPlanes++;
                else if (c1 instanceof ConvexClipPlaneSet) numConvexSets++;
                else return undefined;
            }
            if (clippers.length === 0) return undefined;
            if (numPlanes === source.length) {
                return ConvexClipPlaneSet.createPlanes(clippers as ClipPlane[]);
            } else if (numConvexSets === source.length) {
                return UnionOfConvexClipPlaneSets.createConvexSets(
                    clippers as ConvexClipPlaneSet[]
                );
            }
        } else if (source.hasOwnProperty("OR")) {
            const clippers = this.parseToClipperArray((source as any).OR);
            if (clippers) return this.createCaptureUnion(clippers, true);
        } else if (source.hasOwnProperty("NOR")) {
            const clippers = this.parseToClipperArray((source as any).NOR);
            if (clippers) return this.createCaptureUnion(clippers, false);
        } else if (source.hasOwnProperty("AND")) {
            const clippers = this.parseToClipperArray((source as any).AND);
            if (clippers) return this.createCaptureIntersection(clippers, true);
        } else if (source.hasOwnProperty("NAND")) {
            const clippers = this.parseToClipperArray((source as any).NAND);
            if (clippers) return this.createCaptureIntersection(clippers, true);
        } else if (source.hasOwnProperty("XOR")) {
            const clippers = this.parseToClipperArray((source as any).XOR);
            if (clippers) return this.createCaptureParity(clippers, true);
        } else if (source.hasOwnProperty("NXOR")) {
            const clippers = this.parseToClipperArray((source as any).NXOR);
            if (clippers) return this.createCaptureParity(clippers, true);
        }
        return undefined;
    }

    public static anyClipperToJSON(clipper: any): any | undefined {
        if (ClipUtilities.isClipper(clipper)) {
            if (clipper.toJSON) return clipper.toJSON();
        }
        return undefined;
    }
}
