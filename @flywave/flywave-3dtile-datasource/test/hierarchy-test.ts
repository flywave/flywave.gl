/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme } from "@flywave/flywave-datasource-protocol";

import { Tiles3DStyleWatcher } from "../src/theme/Tiles3DStyleWatcher";

// Create a mock ITile object for testing
const createMockTile = (batchTableData: any) => {
    return {
        content: {
            uri: "test-tile.b3dm"
        },
        cached: {
            scene: {
                batchTable: batchTableData
            }
        }
    };
};

// Test batch table data (includes HIERARCHY extension)
const mockBatchTableWithHierarchy = {
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
                        parentId: [0],
                        id: ["ROM_501"]
                    }
                },
                {
                    name: "Furniture",
                    length: 1,
                    instances: {
                        type: ["Office Desk"],
                        model: ["ErgoDesk v2"],
                        parentId: [0],
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

// Test theme
const testTheme: Theme = {
    styles: {
        "3dtiles": [
            {
                when: "name === 'Headquarters Building'",
                technique: "tile3d",
                color: "#ff0000"
            },
            {
                when: "type === 'Office Desk'",
                technique: "tile3d",
                color: "#00ff00"
            }
        ]
    }
};

// Create Tiles3DStyleWatcher instance
const styleWatcher = new Tiles3DStyleWatcher(testTheme, "3dtiles");

// Test the method for extracting batch properties
const testExtractBatchProperties = () => {
    console.log("Testing extractBatchProperties with HIERARCHY...");

    // Test property extraction for batchId 3 (desk)
    const properties = (styleWatcher as any).extractBatchProperties(mockBatchTableWithHierarchy, 3);

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
};

// Run test
testExtractBatchProperties();
