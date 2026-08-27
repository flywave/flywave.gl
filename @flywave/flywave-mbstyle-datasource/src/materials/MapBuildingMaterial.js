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
exports.MapBuildingMaterial = void 0;
exports.extrudeBuilding = extrudeBuilding;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'building-color': '#cccccc',
    'building-height': 10,
    'building-base': 0,
    'building-roof-color': '#aaaaaa',
    'building-facade-floors': 3,
    'building-facade-unit-width': 6,
    'building-emissive-strength': 0,
};
const BUILDING_FRAG = `
uniform vec3 uRoofColor;
uniform float uFacadeFloors;
uniform float uFacadeUnitWidth;
uniform float uEmissiveStrength;
uniform float uBuildingHeight;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 applyFacade(vec3 baseColor, vec2 uv, float height) {
    float floorHeight = height / max(uFacadeFloors, 1.0);
    float floor = floor(uv.y / max(floorHeight, 0.01));
    float xUnit = floor(uv.x / max(uFacadeUnitWidth, 0.01));

    float windowU = fract(uv.x / max(uFacadeUnitWidth, 0.01));
    float windowV = fract(uv.y / max(floorHeight, 0.01));

    float windowMask = step(0.2, windowU) * step(0.0, 1.0 - windowU) *
                       step(0.2, windowV) * step(0.0, 1.0 - windowV);

    float h = hash12(vec2(xUnit, floor));
    float lit = step(0.6, h);

    vec3 windowColor = vec3(1.0, 0.9, 0.6) * lit * uEmissiveStrength;
    vec3 wallColor = baseColor * (0.7 + 0.3 * h);
    return mix(wallColor, mix(wallColor * 0.5, windowColor, lit), windowMask * 0.8);
}
`;
class MapBuildingMaterial extends THREE.MeshStandardMaterial {
    constructor(paint = {}) {
        super({
            flatShading: true,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1,
        });
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        const self = this;
        this.onBeforeCompile = (shader) => {
            shader.uniforms.uRoofColor = {
                value: new THREE.Color(self.m_paint['building-roof-color']).convertLinearToSRGB(),
            };
            shader.uniforms.uFacadeFloors = { value: self.m_paint['building-facade-floors'] };
            shader.uniforms.uFacadeUnitWidth = { value: self.m_paint['building-facade-unit-width'] };
            shader.uniforms.uEmissiveStrength = { value: self.m_paint['building-emissive-strength'] };
            shader.uniforms.uBuildingHeight = { value: self.m_paint['building-height'] };
            shader.fragmentShader = BUILDING_FRAG + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', `
                #include <colorspace_fragment>
                vec3 facadeColor = applyFacade(diffuseColor.rgb, vWorldPosition.xy, uBuildingHeight);
                float isRoof = step(0.9, abs(normalize(vNormal).z));
                diffuseColor.rgb = mix(facadeColor, uRoofColor, isRoof);
                `);
        };
        this.applyPaint();
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    applyPaint() {
        this.color.set(this.m_paint['building-color']);
        this.needsUpdate = true;
    }
}
exports.MapBuildingMaterial = MapBuildingMaterial;
function extrudeBuilding(footprint, height, base = 0) {
    const shape = new THREE.Shape();
    if (footprint.length === 0)
        return new THREE.BufferGeometry();
    shape.moveTo(footprint[0].x, footprint[0].y);
    for (let i = 1; i < footprint.length; i++) {
        shape.lineTo(footprint[i].x, footprint[i].y);
    }
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, {
        depth: height - base,
        bevelEnabled: false,
        steps: 1,
    });
    if (base > 0) {
        geom.translate(0, 0, base);
    }
    geom.rotateX(-Math.PI / 2);
    return geom;
}
//# sourceMappingURL=MapBuildingMaterial.js.map