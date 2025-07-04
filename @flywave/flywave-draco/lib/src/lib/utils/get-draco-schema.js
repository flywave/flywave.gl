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
exports.getDracoSchema = getDracoSchema;
const THREE = __importStar(require("three"));
function getDracoSchema(geometry, loaderData) {
    const schema = {
        attributes: {},
        metadata: makeMetadata(loaderData.metadata)
    };
    geometry.attributes = geometry.attributes || {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (attribute instanceof THREE.BufferAttribute) {
            schema.attributes[name] = createThreeAttribute(name, attribute, loaderData.attributes[name]);
        }
    }
    if (geometry.index) {
        schema.index = createThreeIndex(geometry.index);
    }
    return schema;
}
function createThreeAttribute(name, attribute, loaderData) {
    return new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized).setUsage(THREE.StaticDrawUsage);
}
function createThreeIndex(index) {
    return new THREE.BufferAttribute(index.array, 1).setUsage(THREE.StaticDrawUsage);
}
function makeMetadata(metadata) {
    const result = {};
    for (const key in metadata) {
        result[key] = {
            value: metadata[key].value,
            type: typeof metadata[key].value
        };
    }
    return result;
}
//# sourceMappingURL=get-draco-schema.js.map