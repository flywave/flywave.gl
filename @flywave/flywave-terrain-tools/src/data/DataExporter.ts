/* Copyright (C) 2025 flywave.gl contributors */

import type { BrushOperation, BrushSettings } from "@flywave/flywave-terrain-datasource";
import type { ExportedTerrainData } from "../types";

export class DataExporter {
    static exportToJSON(operations: BrushOperation[], operationIds: string[]): string {
        if (operations.length === 0 || operations.length !== operationIds.length) {
            throw new Error("Invalid operations or operationIds");
        }

        let minLat = Infinity,
            maxLat = -Infinity;
        let minLon = Infinity,
            maxLon = -Infinity;

        operations.forEach(op => {
            minLat = Math.min(minLat, op.position.latitude);
            maxLat = Math.max(maxLat, op.position.latitude);
            minLon = Math.min(minLon, op.position.longitude);
            maxLon = Math.max(maxLon, op.position.longitude);
        });

        const data: ExportedTerrainData = {
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            metadata: {
                totalOperations: operations.length,
                bounds: {
                    minLat,
                    maxLat,
                    minLon,
                    maxLon
                }
            },
            operations: operations.map((op, index) => {
                const settings = op.settings;
                const serializedSettings: any = {
                    type: settings.type,
                    radius: settings.radius,
                    hardness: settings.hardness
                };

                if ("heightDelta" in settings) {
                    serializedSettings.heightDelta = settings.heightDelta;
                }
                if ("strength" in settings) {
                    serializedSettings.strength = settings.strength;
                }
                if ("targetAltitude" in settings) {
                    serializedSettings.targetAltitude = settings.targetAltitude;
                }
                if ("scale" in settings) {
                    serializedSettings.scale = settings.scale;
                }
                if ("persistence" in settings) {
                    serializedSettings.persistence = settings.persistence;
                }

                return {
                    id: operationIds[index],
                    position: {
                        lat: op.position.latitude,
                        lon: op.position.longitude,
                        alt: op.position.altitude ?? 0
                    },
                    settings: serializedSettings
                };
            })
        };

        return JSON.stringify(data, null, 2);
    }

    static downloadJSON(data: string, filename: string = "terrain-modifications.json"): void {
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static exportAndDownload(
        operations: BrushOperation[],
        operationIds: string[],
        filename?: string
    ): void {
        const json = this.exportToJSON(operations, operationIds);
        this.downloadJSON(json, filename);
    }

    static copyToClipboard(data: string): Promise<void> {
        return navigator.clipboard.writeText(data);
    }
}
