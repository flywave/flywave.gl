/* Copyright (C) 2025 flywave.gl contributors */

import { assert, defaultValue, GL } from "@flywave/flywave-utils";

import {
    COMPONENTS_PER_ATTRIBUTE,
    createTypedArrayFromAccessor
} from "./helpers/Tile3DAccessorUtils";

const defined = x => x !== undefined;
const scratchVisited = [];
const scratchStack = [];
let marker = 0;

export function initializeHierarchy(batchTable, jsonHeader, binaryBody) {
    if (!jsonHeader) {
        return null;
    }

    let hierarchy = batchTable.getExtension("3DTILES_batch_table_hierarchy");

    const legacyHierarchy = jsonHeader.HIERARCHY;
    if (legacyHierarchy) {
        // eslint-disable-next-line
        console.warn("3D Tile Parser: HIERARCHY is deprecated. Use 3DTILES_batch_table_hierarchy.");
        jsonHeader.extensions = jsonHeader.extensions || {};
        jsonHeader.extensions["3DTILES_batch_table_hierarchy"] = legacyHierarchy;
        hierarchy = legacyHierarchy;
    }

    if (!hierarchy) {
        return null;
    }

    return initializeHierarchyValues(hierarchy, binaryBody);
}

function getBinaryProperties(featuresLength, properties, binaryBody) {
    let binaryProperties;
    for (const name in properties) {
        if (properties.hasOwnProperty(name)) {
            const property = properties[name];
            if ("byteOffset" in property) {
                // This is a binary property
                const type = property.type;
                assert(Number.isFinite(property.componentType), "componentType is required.");
                if (!defined(type)) {
                    throw new Error("type is required.");
                }
                if (!defined(binaryBody)) {
                    throw new Error("Property " + name + " requires a batch table binary.");
                }

                const binaryAccessor = getBinaryAccessor(property);
                const componentCount = binaryAccessor.componentsPerAttribute;
                const classType = binaryAccessor.classType;

                const byteOffset = property.byteOffset;
                const typedArray = binaryAccessor.createArrayBufferView(
                    binaryBody.buffer,
                    binaryBody.byteOffset + byteOffset,
                    featuresLength
                );

                if (!defined(binaryProperties)) {
                    binaryProperties = {};
                }

                // Store any information needed to access the binary data, including the typed array,
                // componentCount (e.g. a VEC4 would be 4), and the type used to pack and unpack (e.g. Cartesian4).
                binaryProperties[name] = {
                    typedArray,
                    componentCount,
                    type: classType
                };
            }
        }
    }
    return binaryProperties;
}

// eslint-disable-next-line max-statements
function initializeHierarchyValues(hierarchyJson, binaryBody) {
    let i;
    let classId;
    let binaryAccessor;

    const instancesLength = hierarchyJson.instancesLength;
    const classes = hierarchyJson.classes;
    let classIds = hierarchyJson.classIds;
    let parentCounts = hierarchyJson.parentCounts;
    let parentIds = hierarchyJson.parentIds;
    let parentIdsLength = instancesLength;

    if (defined(classIds.byteOffset)) {
        classIds.componentType = defaultValue(classIds.componentType, GL.UNSIGNED_SHORT);
        classIds.type = AttributeType.SCALAR;
        binaryAccessor = getBinaryAccessor(classIds);
        classIds = binaryAccessor.createArrayBufferView(
            binaryBody.buffer,
            binaryBody.byteOffset + classIds.byteOffset,
            instancesLength
        );
    }

    let parentIndexes;
    if (defined(parentCounts)) {
        if (defined(parentCounts.byteOffset)) {
            parentCounts.componentType = defaultValue(
                parentCounts.componentType,
                GL.UNSIGNED_SHORT
            );
            parentCounts.type = AttributeType.SCALAR;
            binaryAccessor = getBinaryAccessor(parentCounts);
            parentCounts = binaryAccessor.createArrayBufferView(
                binaryBody.buffer,
                binaryBody.byteOffset + parentCounts.byteOffset,
                instancesLength
            );
        }
        parentIndexes = new Uint16Array(instancesLength);
        parentIdsLength = 0;
        for (i = 0; i < instancesLength; ++i) {
            parentIndexes[i] = parentIdsLength;
            parentIdsLength += parentCounts[i];
        }
    }

    if (defined(parentIds) && defined(parentIds.byteOffset)) {
        parentIds.componentType = defaultValue(parentIds.componentType, GL.UNSIGNED_SHORT);
        parentIds.type = AttributeType.SCALAR;
        binaryAccessor = getBinaryAccessor(parentIds);
        parentIds = binaryAccessor.createArrayBufferView(
            binaryBody.buffer,
            binaryBody.byteOffset + parentIds.byteOffset,
            parentIdsLength
        );
    }

    const classesLength = classes.length;
    for (i = 0; i < classesLength; ++i) {
        const classInstancesLength = classes[i].length;
        const properties = classes[i].instances;
        const binaryProperties = getBinaryProperties(classInstancesLength, properties, binaryBody);
        classes[i].instances = combine(binaryProperties, properties);
    }

    const classCounts = new Array(classesLength).fill(0);
    const classIndexes = new Uint16Array(instancesLength);
    for (i = 0; i < instancesLength; ++i) {
        classId = classIds[i];
        classIndexes[i] = classCounts[classId];
        ++classCounts[classId];
    }

    const hierarchy = {
        classes,
        classIds,
        classIndexes,
        parentCounts,
        parentIndexes,
        parentIds
    };

    validateHierarchy(hierarchy);

    return hierarchy;
}

// HELPER CODE

// Traverse over the hierarchy and process each instance with the endConditionCallback.
// When the endConditionCallback returns a value, the traversal stops and that value is returned.
export function traverseHierarchy(hierarchy, instanceIndex, endConditionCallback) {
    if (!hierarchy) {
        return;
    }

    const parentCounts = hierarchy.parentCounts;
    const parentIds = hierarchy.parentIds;
    if (parentIds) {
        return endConditionCallback(hierarchy, instanceIndex);
    }
    if (parentCounts > 0) {
        return traverseHierarchyMultipleParents(hierarchy, instanceIndex, endConditionCallback);
    }
    return traverseHierarchySingleParent(hierarchy, instanceIndex, endConditionCallback);
}

function traverseHierarchyMultipleParents(hierarchy, instanceIndex, endConditionCallback) {
    const classIds = hierarchy.classIds;
    const parentCounts = hierarchy.parentCounts;
    const parentIds = hierarchy.parentIds;
    const parentIndexes = hierarchy.parentIndexes;
    const instancesLength = classIds.length;

    // Ignore instances that have already been visited. This occurs in diamond inheritance situations.
    // Use a marker value to indicate that an instance has been visited, which increments with each run.
    // This is more efficient than clearing the visited array every time.
    const visited = scratchVisited;
    visited.length = Math.max(visited.length, instancesLength);
    const visitedMarker = ++marker;

    const stack = scratchStack;
    stack.length = 0;
    stack.push(instanceIndex);

    while (stack.length > 0) {
        instanceIndex = stack.pop();
        if (visited[instanceIndex] === visitedMarker) {
            // This instance has already been visited, stop traversal
            continue;
        }
        visited[instanceIndex] = visitedMarker;
        const result = endConditionCallback(hierarchy, instanceIndex);
        if (defined(result)) {
            // The end condition was met, stop the traversal and return the result
            return result;
        }
        const parentCount = parentCounts[instanceIndex];
        const parentIndex = parentIndexes[instanceIndex];
        for (let i = 0; i < parentCount; ++i) {
            const parentId = parentIds[parentIndex + i];
            // Stop the traversal when the instance has no parent (its parentId equals itself)
            // else add the parent to the stack to continue the traversal.
            if (parentId !== instanceIndex) {
                stack.push(parentId);
            }
        }
    }

    return null;
}

function traverseHierarchySingleParent(hierarchy, instanceIndex, endConditionCallback) {
    let hasParent = true;
    while (hasParent) {
        const result = endConditionCallback(hierarchy, instanceIndex);
        if (defined(result)) {
            // The end condition was met, stop the traversal and return the result
            return result;
        }
        const parentId = hierarchy.parentIds[instanceIndex];
        hasParent = parentId !== instanceIndex;
        instanceIndex = parentId;
    }
    throw new Error("traverseHierarchySingleParent");
}

// DEBUG CODE

function validateHierarchy(hierarchy) {
    const scratchValidateStack = [];

    const classIds = hierarchy.classIds;
    const instancesLength = classIds.length;

    for (let i = 0; i < instancesLength; ++i) {
        validateInstance(hierarchy, i, scratchValidateStack);
    }
}

function validateInstance(hierarchy, instanceIndex, stack) {
    const parentCounts = hierarchy.parentCounts;
    const parentIds = hierarchy.parentIds;
    const parentIndexes = hierarchy.parentIndexes;
    const classIds = hierarchy.classIds;
    const instancesLength = classIds.length;

    if (!defined(parentIds)) {
        // No need to validate if there are no parents
        return;
    }

    assert(
        instanceIndex < instancesLength,
        `Parent index ${instanceIndex} exceeds the total number of instances: ${instancesLength}`
    );
    assert(
        stack.indexOf(instanceIndex) === -1,
        "Circular dependency detected in the batch table hierarchy."
    );

    stack.push(instanceIndex);
    const parentCount = defined(parentCounts) ? parentCounts[instanceIndex] : 1;
    const parentIndex = defined(parentCounts) ? parentIndexes[instanceIndex] : instanceIndex;
    for (let i = 0; i < parentCount; ++i) {
        const parentId = parentIds[parentIndex + i];
        // Stop the traversal when the instance has no parent (its parentId equals itself), else continue the traversal.
        if (parentId !== instanceIndex) {
            validateInstance(hierarchy, parentId, stack);
        }
    }
    stack.pop(instanceIndex);
}
// Define attribute type enum
export const AttributeType = {
    SCALAR: "SCALAR",
    VEC2: "VEC2",
    VEC3: "VEC3",
    VEC4: "VEC4",
    MAT2: "MAT2",
    MAT3: "MAT3",
    MAT4: "MAT4"
};

// Get binary accessor
function getBinaryAccessor(property) {
    const { componentType, type } = property;
    const componentsPerAttribute = COMPONENTS_PER_ATTRIBUTE[type];

    return {
        componentsPerAttribute,
        classType: null, // May be unpacking type in practical applications
        createArrayBufferView(buffer, byteOffset, length) {
            return createTypedArrayFromAccessor(
                {
                    componentType,
                    type,
                    byteOffset: 0 // Because the offset has been processed externally
                },
                buffer,
                byteOffset,
                length
            ).values;
        }
    };
}

// Merge binary properties and regular properties
function combine(binaryProperties, properties) {
    const combined = { ...properties };

    if (binaryProperties) {
        for (const name in binaryProperties) {
            if (binaryProperties.hasOwnProperty(name)) {
                // Override regular properties with binary properties
                combined[name] = binaryProperties[name];

                // Delete binary descriptors in original properties
                if (combined[name] && combined[name].byteOffset !== undefined) {
                    delete combined[name].byteOffset;
                    delete combined[name].componentType;
                    delete combined[name].type;
                }
            }
        }
    }

    return combined;
}
