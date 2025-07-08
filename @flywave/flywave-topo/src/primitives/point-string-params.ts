import { App } from "../app";
import { PointStringParams } from "../common/render/primitives/point-string-params";
import { VertexIndices } from "../common/render/primitives/vertex-indices";
import { assert } from "../utils";
import { PolylineArgs } from "./mesh/mesh-primitives";
import { VertexTableBuilder } from "./vertex-table-builder";

export function createPointStringParams(args: PolylineArgs): PointStringParams | undefined {
    if (!args.flags.isDisjoint) return undefined;

    const vertices = VertexTableBuilder.buildFromPolylines(args, App.renderSystem.maxTextureSize);
    if (undefined === vertices) return undefined;

    const polylines = args.polylines;
    let vertIndices = polylines[0];
    if (polylines.length > 1) {
        vertIndices = [];
        for (const polyline of polylines) {
            for (const vertIndex of polyline) vertIndices.push(vertIndex);
        }
    }

    const vertexIndices = VertexIndices.fromArray(vertIndices);
    assert(vertexIndices.length === vertIndices.length);

    return {
        vertices,
        indices: vertexIndices,
        weight: args.width
    };
}
