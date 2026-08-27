"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getElevationFeature = getElevationFeature;
exports.getOverlappingElevationParts = getOverlappingElevationParts;
const MBElevationConstants_1 = require("./MBElevationConstants");
function getElevationFeature(featureProps, sameTileFeatures, registry) {
    if (!featureProps)
        return undefined;
    const value = +featureProps[MBElevationConstants_1.PROPERTY_ELEVATION_ID];
    if (Number.isNaN(value))
        return undefined;
    if (sameTileFeatures) {
        return sameTileFeatures.find(f => f.id === value);
    }
    if (!registry || registry.length === 0)
        return undefined;
    let lo = 0;
    let hi = registry.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (registry[mid].feature.id < value)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return lo < registry.length && registry[lo].feature.id === value
        ? registry[lo].feature
        : undefined;
}
function getOverlappingElevationParts(featureProps, registry, consumerZ, consumerX, consumerY) {
    if (!featureProps || !registry || registry.length === 0)
        return [];
    const value = +featureProps[MBElevationConstants_1.PROPERTY_ELEVATION_ID];
    if (Number.isNaN(value))
        return [];
    let lo = 0;
    let hi = registry.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (registry[mid].feature.id < value)
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    if (lo < 0 || lo >= registry.length || registry[lo].feature.id !== value)
        return [];
    const isRelated = (z, x, y) => {
        if (z >= consumerZ) {
            const s = Math.pow(2, z - consumerZ);
            return Math.floor(x / s) === consumerX && Math.floor(y / s) === consumerY;
        }
        const s = Math.pow(2, consumerZ - z);
        return Math.floor(consumerX / s) === x && Math.floor(consumerY / s) === y;
    };
    const result = [];
    for (let i = lo; i < registry.length && registry[i].feature.id === value; i++) {
        const e = registry[i];
        if (isRelated(e.z, e.x, e.y) || e.feature.constantHeight != null) {
            result.push(e);
        }
    }
    return result;
}
//# sourceMappingURL=MBGetElevationFeature.js.map