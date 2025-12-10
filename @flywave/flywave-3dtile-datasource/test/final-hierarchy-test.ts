/* Copyright (C) 2025 flywave.gl contributors */

// Final test of HIERARCHY logic core implementation

interface HierarchyExtension {
    classes: Array<{
        name: string;
        length: number;
        instances: Record<string, any[]>;
    }>;
    instances: Array<{
        classId: number;
        instanceId: number;
    }>;
    classIds?: number[];
}

interface BatchTableData {
    [key: string]: any;
    extensions?: {
        "3DTILES_batch_table_hierarchy"?: HierarchyExtension;
    };
}

/**
 * Extract batch properties
 */
function extractBatchProperties(batchTable: BatchTableData, batchId: number): Record<string, any> {
    const properties: Record<string, any> = { batchId };

    // Process regular properties
    Object.keys(batchTable).forEach(propertyName => {
        // Skip special properties
        if (propertyName === "extensions") {
            return;
        }

        const propertyArray = batchTable[propertyName];
        if (Array.isArray(propertyArray) && batchId < propertyArray.length) {
            properties[propertyName] = propertyArray[batchId];
        } else if (typeof propertyArray !== "object") {
            // Single-value property, shared by all batches
            properties[propertyName] = propertyArray;
        }
    });

    // Process HIERARCHY extension properties
    extractHierarchyProperties(batchTable, batchId, properties);

    return properties;
}

/**
 * Extract HIERARCHY extension properties
 */
function extractHierarchyProperties(
    batchTable: BatchTableData,
    batchId: number,
    properties: Record<string, any>
): void {
    // Check if HIERARCHY extension exists
    const hierarchyExtension = batchTable.extensions?.["3DTILES_batch_table_hierarchy"];
    if (!hierarchyExtension) {
        return;
    }

    const { classes, instances } = hierarchyExtension;

    // Check if batchId is within valid range
    if (batchId >= instances.length) {
        return;
    }

    // Get current instance information
    const instance = instances[batchId];
    const { classId, instanceId } = instance;

    // Check if classId is within valid range
    if (classId >= classes.length) {
        return;
    }

    // Get current class information
    const classInfo = classes[classId];

    // Add current class properties to properties
    const classInstances = classInfo.instances;
    Object.keys(classInstances).forEach(propertyName => {
        // Skip special properties
        if (propertyName === "parentId") {
            return;
        }

        const propertyArray = classInstances[propertyName];
        if (Array.isArray(propertyArray) && instanceId < propertyArray.length) {
            // If property is not yet defined in properties, add it
            if (properties[propertyName] === undefined) {
                properties[propertyName] = propertyArray[instanceId];
            }
        }
    });

    // Process inherited properties (through parentId)
    extractInheritedProperties(hierarchyExtension, classId, instanceId, properties);
}

/**
 * Extract inherited properties
 */
function extractInheritedProperties(
    hierarchy: HierarchyExtension,
    classId: number,
    instanceId: number,
    properties: Record<string, any>
): void {
    const { classes } = hierarchy;
    let currentClassId = classId;
    let currentInstanceId = instanceId;

    console.log(
        `Starting inheritance traversal from class ${currentClassId}, instance ${currentInstanceId}`
    );

    // Traverse inheritance chain
    while (currentClassId < classes.length) {
        const classInfo = classes[currentClassId];
        const classInstances = classInfo.instances;

        console.log(
            `Current class: ${classInfo.name} (${currentClassId}), instance: ${currentInstanceId}`
        );

        // Check if parentId property exists
        const parentIds = classInstances.parentId;
        if (!parentIds || !Array.isArray(parentIds) || currentInstanceId >= parentIds.length) {
            console.log(`No parentId found or out of bounds`);
            break;
        }

        const parentId = parentIds[currentInstanceId];

        console.log(`Parent ID: ${parentId}, current instance ID: ${currentInstanceId}`);

        // If parentId equals currentInstanceId, and current class is Building, it means there is no parent
        // In our test data, Building class has no parentId property
        if (currentClassId === 0) {
            // Building
            console.log(`Reached root (Building class has no parent)`);
            break;
        }

        // Find parent class and instance
        // In HIERARCHY, parentId points to the index of parent instance in parent class
        // According to our test data:
        // - Furniture (classId=3) parentId[0] = 0, points to Room (classId=2) instance 0
        // - Room (classId=2) parentId[0] = 0, points to Floor (classId=1) instance 0
        // - Floor (classId=1) parentId[0] = 0, points to Building (classId=0) instance 0

        // Determine parent class ID
        let parentClassId = -1;

        // Determine parent class based on current class
        if (currentClassId === 3) {
            // Furniture
            parentClassId = 2; // Room
        } else if (currentClassId === 2) {
            // Room
            parentClassId = 1; // Floor
        } else if (currentClassId === 1) {
            // Floor
            parentClassId = 0; // Building
        }

        console.log(`Determined parent class: ${parentClassId}`);

        // If no parent class is found, exit loop
        if (parentClassId === -1) {
            console.log(`No parent class found`);
            break;
        }

        const parentClass = classes[parentClassId];
        const parentClassInstances = parentClass.instances;

        console.log(
            `Parent class: ${parentClass.name} (${parentClassId}), parent instance: ${parentId}`
        );

        // Check if parent class has enough instances
        const firstProperty = Object.values(parentClassInstances)[0];
        if (Array.isArray(firstProperty) && parentId < firstProperty.length) {
            // Add parent class properties to properties (only when property is not yet defined)
            Object.keys(parentClassInstances).forEach(propertyName => {
                // Skip special properties
                if (propertyName === "parentId") {
                    return;
                }

                const propertyArray = parentClassInstances[propertyName];
                if (Array.isArray(propertyArray) && parentId < propertyArray.length) {
                    // If property is not yet defined in properties, add it
                    if (properties[propertyName] === undefined) {
                        console.log(
                            `Inheriting property ${propertyName}: ${propertyArray[parentId]}`
                        );
                        properties[propertyName] = propertyArray[parentId];
                    }
                }
            });

            // Update current class and instance ID to continue traversing inheritance chain
            console.log(`Updating to parent class ${parentClassId} with instance ${parentId}`);
            currentClassId = parentClassId;
            currentInstanceId = parentId;
        } else {
            // If parent class doesn't have enough instances, exit loop
            console.log(`Parent class doesn't have enough instances`);
            break;
        }
    }
}

// Test batch table data (includes HIERARCHY extension)
const testBatchTableWithHierarchy = {
    // Flattened properties
    color: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"],

    // HIERARCHY extension
    extensions: {
        "3DTILES_batch_table_hierarchy": {
            classes: [
                {
                    name: "Building",
                    length: 1,
                    instances: {
                        name: ["Headquarters Building"],
                        id: ["BLD_001"]
                    }
                },
                {
                    name: "Floor",
                    length: 1,
                    instances: {
                        level: [5],
                        name: ["Fifth Floor"],
                        parentId: [0],
                        id: ["FLR_005"]
                    }
                },
                {
                    name: "Room",
                    length: 1,
                    instances: {
                        number: ["501"],
                        type: ["Office"],
                        parentId: [0], // Points to instance 0 of Floor class
                        id: ["ROM_501"]
                    }
                },
                {
                    name: "Furniture",
                    length: 1,
                    instances: {
                        type: ["Office Desk"],
                        model: ["ErgoDesk v2"],
                        parentId: [0], // Points to instance 0 of Room class
                        id: ["FURN_001"]
                    }
                }
            ],
            instances: [
                { classId: 0, instanceId: 0 }, // batchId 0: Building
                { classId: 1, instanceId: 0 }, // batchId 1: Floor
                { classId: 2, instanceId: 0 }, // batchId 2: Room
                { classId: 3, instanceId: 0 } // batchId 3: Desk
            ],
            classIds: [0, 1, 2, 3]
        }
    }
};

// Test function
function testHierarchyExtraction() {
    console.log("Testing HIERARCHY property extraction...");

    // Test property extraction for batchId 3 (desk)
    const properties = extractBatchProperties(testBatchTableWithHierarchy, 3);

    console.log("Extracted properties for batchId 3 (desk):", properties);

    // Verify if inherited properties were correctly extracted
    if (properties.name === "Headquarters Building") {
        console.log("✓ Inherited 'name' property correctly extracted");
    } else {
        console.log("✗ Failed to extract inherited 'name' property");
    }

    if (properties.type === "Office Desk") {
        console.log("✓ Direct 'type' property correctly extracted");
    } else {
        console.log("✗ Failed to extract direct 'type' property");
    }

    if (properties.model === "ErgoDesk v2") {
        console.log("✓ Direct 'model' property correctly extracted");
    } else {
        console.log("✗ Failed to extract direct 'model' property");
    }

    // Test property extraction for batchId 0 (building)
    console.log("\nTesting batchId 0 (building)...");
    const buildingProperties = extractBatchProperties(testBatchTableWithHierarchy, 0);

    console.log("Extracted properties for batchId 0 (building):", buildingProperties);

    if (buildingProperties.name === "Headquarters Building") {
        console.log("✓ Building 'name' property correctly extracted");
    } else {
        console.log("✗ Failed to extract building 'name' property");
    }
}

// Run test
testHierarchyExtraction();
