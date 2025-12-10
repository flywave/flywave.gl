/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

/** Extract an arrow-like schema from a Draco mesh */

interface DracoSchema {
    attributes: { [name: string]: THREE.BufferAttribute };
    index?: THREE.BufferAttribute;
    metadata: Record<string, any>;
}

export function getDracoSchema(geometry: THREE.BufferGeometry, loaderData: any): DracoSchema {
    const schema: DracoSchema = {
        attributes: {},
        metadata: makeMetadata(loaderData.metadata)
    };

    // Process vertex attributes
    geometry.attributes = geometry.attributes || {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (attribute instanceof THREE.BufferAttribute) {
            schema.attributes[name] = createThreeAttribute(
                name,
                attribute,
                loaderData.attributes[name]
            );
        }
    }

    // Process indices
    if (geometry.index) {
        schema.index = createThreeIndex(geometry.index);
    }

    return schema;
}

function createThreeAttribute(
    name: string,
    attribute: THREE.BufferAttribute,
    loaderData: any
): THREE.BufferAttribute {
    return new THREE.BufferAttribute(
        attribute.array,
        attribute.itemSize,
        attribute.normalized
    ).setUsage(THREE.StaticDrawUsage);
}

function createThreeIndex(index: THREE.BufferAttribute): THREE.BufferAttribute {
    return new THREE.BufferAttribute(
        index.array,
        1 // The itemSize of the index is fixed to 1
    ).setUsage(THREE.StaticDrawUsage);
}

function makeMetadata(metadata: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key in metadata) {
        result[key] = {
            value: metadata[key].value,
            type: typeof metadata[key].value
        };
    }
    return result;
}
