"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBGlobeController = void 0;
exports.latLngToECEF = latLngToECEF;
exports.ecefToLatLng = ecefToLatLng;
exports.globeTransitionWeight = globeTransitionWeight;
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
function latLngToECEF(lat, lng, radius = 6378137) {
    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;
    return {
        x: radius * Math.cos(phi) * Math.cos(lambda),
        y: radius * Math.sin(phi),
        z: radius * Math.cos(phi) * Math.sin(lambda),
    };
}
function ecefToLatLng(x, y, z) {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-6)
        return { lat: 0, lng: 0 };
    const lat = Math.asin(y / r) * 180 / Math.PI;
    const lng = Math.atan2(z, x) * 180 / Math.PI;
    return { lat, lng };
}
function globeTransitionWeight(zoom) {
    const t = Math.max(0, Math.min(1, (zoom - 5) / 1));
    return t * t * (3 - 2 * t);
}
class MBGlobeController {
    constructor(m_mapView) {
        this.m_mapView = m_mapView;
    }
    get isGlobe() {
        var _a;
        return ((_a = this.m_mapView.projection) === null || _a === void 0 ? void 0 : _a.type) === flywave_geoutils_1.ProjectionType.Spherical;
    }
    enableGlobe() {
        if (!this.isGlobe) {
            this.m_mapView.projection = flywave_geoutils_1.sphereProjection;
        }
    }
    enableMercator() {
        if (this.isGlobe) {
            this.m_mapView.projection = flywave_geoutils_1.mercatorProjection;
        }
    }
    setProjectionForZoom(zoom, threshold = 5) {
        if (zoom < threshold) {
            this.enableGlobe();
        }
        else {
            this.enableMercator();
        }
    }
    dispose() { }
}
exports.MBGlobeController = MBGlobeController;
//# sourceMappingURL=MBGlobeRenderer.js.map