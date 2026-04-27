/* Copyright (C) 2025 flywave.gl contributors */
import * as THREE from "three";
export function getDracoSchema(geometry, loaderData) {
    const schema = {
        attributes: {},
        metadata: makeMetadata(loaderData.metadata)
    };
    // Process vertex attributes
    geometry.attributes = geometry.attributes || {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (attribute instanceof THREE.BufferAttribute) {
            schema.attributes[name] = createThreeAttribute(name, attribute, loaderData.attributes[name]);
        }
    }
    // Process indices
    if (geometry.index) {
        schema.index = createThreeIndex(geometry.index);
    }
    return schema;
}
function createThreeAttribute(name, attribute, loaderData) {
    return new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized).setUsage(THREE.StaticDrawUsage);
}
function createThreeIndex(index) {
    return new THREE.BufferAttribute(index.array, 1 // The itemSize of the index is fixed to 1
    ).setUsage(THREE.StaticDrawUsage);
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