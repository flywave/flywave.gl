/* Copyright (C) 2025 flywave.gl contributors */

import { type StyleSetOptions } from "@flywave/flywave-datasource-protocol/StyleSetEvaluator";

import { BatchStyleProcessor } from "../src/theme/BatchStyleProcessor";

/**
 * Batch style example
 * Shows how to use BatchStyleProcessor to handle 3D Tiles batch styles
 */
export class BatchStyleExample {
    private readonly m_styleProcessor: BatchStyleProcessor;

    constructor() {
        // Create style set options
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "batchId === 0",
                    technique: "batch-mesh" as any,
                    value: 10,
                    color: "#ff0000",
                    opacity: 0.8,
                    visible: true
                },
                {
                    when: "batchId > 0 && batchId < 5",
                    technique: "batch-mesh" as any,
                    value: 20,
                    color: "#00ff00",
                    opacity: 0.6,
                    visible: true
                },
                {
                    when: "batchId >= 5",
                    technique: "batch-mesh" as any,
                    value: 30,
                    color: "#0000ff",
                    opacity: 0.4,
                    visible: true
                }
            ]
        };

        // Create batch style processor
        this.m_styleProcessor = new BatchStyleProcessor(styleSetOptions);
    }

    /**
     * Get batch style example
     */
    getBatchStyleExample(): void {
        // Create test properties
        const properties = {
            batchId: 3,
            height: 150,
            type: "building"
        };

        // Get batch style
        const batchStyle = this.m_styleProcessor.getBatchStyle(properties);

        console.log("Batch Style:", batchStyle);
        // Output example:
        // {
        //   value: 20,
        //   color: "#00ff00",
        //   opacity: 0.6,
        //   visible: true,
        //   valueAnimation: undefined
        // }

        // You can also extract multiple styles
        const batchStyles = this.m_styleProcessor.extractBatchStyles(properties);
        console.log("Batch Styles Array:", batchStyles);
    }

    /**
     * Animated style example
     */
    getAnimatedBatchStyleExample(): void {
        // Create style set options with animation
        const animatedStyleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "height > 100",
                    technique: "batch-mesh" as any,
                    value: { from: 10, to: 50 },
                    valueAnimation: {
                        easing: "ease-in-out",
                        duration: 2000
                    },
                    color: "#ff5500",
                    opacity: { from: 0.2, to: 0.9 },
                    visible: true,
                    offset: { from: 0, to: 10 },
                    direction: "up"
                }
            ]
        };

        // Create a new batch style processor
        const animatedStyleProcessor = new BatchStyleProcessor(animatedStyleSetOptions);

        // Create test properties
        const properties = {
            batchId: 1,
            height: 150,
            type: "building"
        };

        // Get batch style
        const batchStyle = animatedStyleProcessor.getBatchStyle(properties);

        console.log("Animated Batch Style:", batchStyle);
        // Output example:
        // {
        //   value: { from: 10, to: 50 },
        //   color: "#ff5500",
        //   opacity: { from: 0.2, to: 0.9 },
        //   visible: true,
        //   offset: { from: 0, to: 10 },
        //   direction: "up",
        //   valueAnimation: {
        //     easing: "ease-in-out",
        //     duration: 2000
        //   }
        // }
    }
}

// Usage example
const example = new BatchStyleExample();
example.getBatchStyleExample();
example.getAnimatedBatchStyleExample();
