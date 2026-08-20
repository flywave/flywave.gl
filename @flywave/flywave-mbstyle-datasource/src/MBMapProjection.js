"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBMapProjection = void 0;
exports.createProjection = createProjection;
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const flywave_geoutils_2 = require("@flywave/flywave-geoutils");
const flywave_geoutils_3 = require("@flywave/flywave-geoutils");
const flywave_geoutils_4 = require("@flywave/flywave-geoutils");
const MBProjection_1 = require("./MBProjection");
const degToRad = (d) => (d * Math.PI) / 180;
const radToDeg = (r) => (r * 180) / Math.PI;
class MBMapProjection extends flywave_geoutils_1.Projection {
    constructor(config) {
        super(flywave_geoutils_4.EarthConstants.EQUATORIAL_CIRCUMFERENCE);
        this.mbCustomProjection = true;
        this.m_config = config;
        this.m_circumference = flywave_geoutils_4.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
    }
    get type() {
        return flywave_geoutils_1.ProjectionType.Planar;
    }
    worldExtent(minElevation, maxElevation, result) {
        const ext = this.m_circumference;
        if (!result) {
            return {
                min: { x: 0, y: 0, z: minElevation },
                max: { x: ext, y: ext, z: maxElevation },
            };
        }
        result.min.x = 0;
        result.min.y = 0;
        result.min.z = minElevation;
        result.max.x = ext;
        result.max.y = ext;
        result.max.z = maxElevation;
        return result;
    }
    projectPoint(geoPoint, result) {
        var _a, _b, _c, _d, _e;
        const lng = (_b = (_a = geoPoint.longitude) !== null && _a !== void 0 ? _a : geoPoint.lng) !== null && _b !== void 0 ? _b : 0;
        const lat = (_d = (_c = geoPoint.latitude) !== null && _c !== void 0 ? _c : geoPoint.lat) !== null && _d !== void 0 ? _d : 0;
        const alt = (_e = geoPoint.altitude) !== null && _e !== void 0 ? _e : 0;
        const p = (0, MBProjection_1.project)(lng, lat, this.m_config);
        const worldX = p.x * this.m_circumference;
        const worldY = (1 - p.y) * this.m_circumference;
        if (!result) {
            return { x: worldX, y: worldY, z: alt };
        }
        result.x = worldX;
        result.y = worldY;
        result.z = alt;
        return result;
    }
    unprojectPoint(worldPoint) {
        var _a;
        const px = worldPoint.x / this.m_circumference;
        const py = 1 - worldPoint.y / this.m_circumference;
        const result = (0, MBProjection_1.unproject)(px, py, this.m_config);
        return new flywave_geoutils_3.GeoCoordinates(result.lat, result.lng, (_a = worldPoint.z) !== null && _a !== void 0 ? _a : 0);
    }
    unprojectAltitude(worldPoint) {
        var _a;
        return (_a = worldPoint.z) !== null && _a !== void 0 ? _a : 0;
    }
    projectBox(geoBox, result) {
        const sw = this.projectPoint({ longitude: geoBox.southWest.longitude, latitude: geoBox.southWest.latitude });
        const ne = this.projectPoint({ longitude: geoBox.northEast.longitude, latitude: geoBox.northEast.latitude });
        if (!result) {
            return {
                min: { x: Math.min(sw.x, ne.x), y: Math.min(sw.y, ne.y), z: 0 },
                max: { x: Math.max(sw.x, ne.x), y: Math.max(sw.y, ne.y), z: 0 },
            };
        }
        result.min.x = Math.min(sw.x, ne.x);
        result.min.y = Math.min(sw.y, ne.y);
        result.max.x = Math.max(sw.x, ne.x);
        result.max.y = Math.max(sw.y, ne.y);
        return result;
    }
    unprojectBox(worldBox) {
        const sw = this.unprojectPoint(worldBox.min);
        const ne = this.unprojectPoint(worldBox.max);
        return new flywave_geoutils_2.GeoBox(sw, ne);
    }
    getScaleFactor(_worldPoint) {
        return 1.0;
    }
    surfaceNormal(_worldPoint, normal) {
        if (!normal)
            return { x: 0, y: 0, z: 1 };
        normal.x = 0;
        normal.y = 0;
        normal.z = 1;
        return normal;
    }
    groundDistance(worldPoint) {
        var _a;
        return (_a = worldPoint.z) !== null && _a !== void 0 ? _a : 0;
    }
    scalePointToSurface(worldPoint) {
        worldPoint.z = 0;
        return worldPoint;
    }
}
exports.MBMapProjection = MBMapProjection;
function createProjection(config) {
    if (config.name === 'globe') {
        const { sphereProjection } = require('@flywave/flywave-geoutils');
        return sphereProjection;
    }
    if (config.name === 'mercator') {
        const { mercatorProjection } = require('@flywave/flywave-geoutils');
        return mercatorProjection;
    }
    return new MBMapProjection(config);
}
//# sourceMappingURL=MBMapProjection.js.map