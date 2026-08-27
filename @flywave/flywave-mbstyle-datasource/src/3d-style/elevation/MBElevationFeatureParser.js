"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeRelativeHeight = decodeRelativeHeight;
exports.decodeMetricHeight = decodeMetricHeight;
exports.parseElevationVertex = parseElevationVertex;
exports.parseElevationMeta = parseElevationMeta;
const MBElevationConstants_1 = require("./MBElevationConstants");
function decodeRelativeHeight(height) {
    const RELATIVE_ELEVATION_TO_METERS = 5.0;
    return (height / 10000.0) * RELATIVE_ELEVATION_TO_METERS;
}
function decodeMetricHeight(height) {
    return height / 10000.0;
}
function numProp(f, name) {
    const v = f.properties[name];
    if (v === undefined || v === null)
        return undefined;
    const n = +v;
    return Number.isNaN(n) ? undefined : n;
}
function normalizeCoord(v, layerExtent) {
    return layerExtent > 0 && layerExtent !== MBElevationConstants_1.ELEVATION_EXTENT
        ? (v / layerExtent) * MBElevationConstants_1.ELEVATION_EXTENT
        : v;
}
const schemaV100 = {
    meta: (f, out) => {
        const id = numProp(f, MBElevationConstants_1.PROPERTY_ELEVATION_ID);
        if (id === undefined)
            return false;
        out.id = id;
        const fixed = numProp(f, 'fixed_height_relative');
        out.constantHeight = fixed !== undefined ? decodeRelativeHeight(fixed) : undefined;
        out.bounds = f.bounds;
        return true;
    },
    vertex: (f, out) => {
        const id = numProp(f, MBElevationConstants_1.PROPERTY_ELEVATION_ID);
        const idx = numProp(f, 'elevation_idx');
        const extent = numProp(f, 'extent');
        const height = numProp(f, 'height_relative');
        if (id === undefined || idx === undefined || extent === undefined || height === undefined) {
            return false;
        }
        out.id = id;
        out.idx = idx;
        out.extent = normalizeCoord(extent, f.layerExtent);
        out.height = decodeRelativeHeight(height);
        out.x = normalizeCoord(f.x, f.layerExtent);
        out.y = normalizeCoord(f.y, f.layerExtent);
        return true;
    },
};
const schemaV101 = {
    meta: (f, out) => {
        const id = numProp(f, MBElevationConstants_1.PROPERTY_ELEVATION_ID);
        if (id === undefined)
            return false;
        out.id = id;
        const fixed = numProp(f, 'fixed_height');
        out.constantHeight = fixed !== undefined ? decodeMetricHeight(fixed) : undefined;
        out.bounds = f.bounds;
        return true;
    },
    vertex: (f, out) => {
        const id = numProp(f, MBElevationConstants_1.PROPERTY_ELEVATION_ID);
        const idx = numProp(f, 'elevation_idx');
        const extent = numProp(f, 'extent');
        const height = numProp(f, 'height');
        if (id === undefined || idx === undefined || extent === undefined || height === undefined) {
            return false;
        }
        out.id = id;
        out.idx = idx;
        out.extent = normalizeCoord(extent, f.layerExtent);
        out.height = decodeMetricHeight(height);
        out.x = normalizeCoord(f.x, f.layerExtent);
        out.y = normalizeCoord(f.y, f.layerExtent);
        return true;
    },
};
function getVersionSchema(version) {
    if (!version)
        return schemaV100;
    if (version === '1.0.1')
        return schemaV101;
    return undefined;
}
function parseElevationVertex(f) {
    const schema = getVersionSchema(f.properties.version);
    if (!schema || f.type !== 'Point' || f.properties['type'] !== 'curve_point')
        return null;
    const out = {};
    return schema.vertex(f, out) ? out : null;
}
function parseElevationMeta(f) {
    const schema = getVersionSchema(f.properties.version);
    if (!schema || f.type !== 'Polygon' || f.properties['type'] !== 'curve_meta')
        return null;
    const out = {};
    return schema.meta(f, out) ? out : null;
}
//# sourceMappingURL=MBElevationFeatureParser.js.map