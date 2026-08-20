"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBMaterialFactory = void 0;
const index_1 = require("./materials/index");
class MBMaterialFactory {
    static create(layerType, paint, options) {
        return (0, index_1.createMBMaterial)(layerType, paint, options);
    }
}
exports.MBMaterialFactory = MBMaterialFactory;
//# sourceMappingURL=MBMaterialFactory.js.map