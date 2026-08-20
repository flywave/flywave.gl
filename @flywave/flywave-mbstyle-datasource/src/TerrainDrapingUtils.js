"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTileCamera = buildTileCamera;
exports.isEnvironmentObject = isEnvironmentObject;
const THREE = __importStar(require("three"));
function buildTileCamera(tile) {
    const { originX, originY, size } = tile;
    if (size <= 0)
        return null;
    const centerX = originX + size / 2;
    const centerZ = originY + size / 2;
    const camera = new THREE.OrthographicCamera(originX, originX + size, originY + size, originY, 1, 2000);
    camera.position.set(centerX, 1000, centerZ);
    camera.lookAt(centerX, 0, centerZ);
    camera.up.set(0, 0, 1);
    camera.updateProjectionMatrix();
    return camera;
}
function isEnvironmentObject(obj) {
    var _a;
    if (obj.isLight)
        return true;
    if ((_a = obj.userData) === null || _a === void 0 ? void 0 : _a.__mbEnvironment)
        return true;
    if (obj.isLineSegments)
        return true;
    return false;
}
//# sourceMappingURL=TerrainDrapingUtils.js.map