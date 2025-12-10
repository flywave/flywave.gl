/* Copyright (C) 2025 flywave.gl contributors */
import { TileKey, GeoCoordinates } from "@flywave/flywave-geoutils";
/**
 * Elevation debugging module for flywave inspector
 * Provides tools to debug elevation provider and elevation range source
 */
export class ElevationModule {
    constructor(mapView, parentGui, elevationProvider, elevationRangeSource) {
        this.elevationProvider = elevationProvider;
        this.elevationRangeSource = elevationRangeSource;
        this.mapView = mapView;
        this.gui = parentGui.addFolder("⛰️ Elevation");
        // Create sub-folders for different elevation components
        this.elevationFolder = this.gui.addFolder("Elevation Provider");
        this.rangeFolder = this.gui.addFolder("Elevation Range Source");
        this.setupElevationProviderDebugging();
        this.setupElevationRangeSourceDebugging();
        // Close folders by default
        this.elevationFolder.close();
        this.rangeFolder.close();
        this.gui.close();
    }
    /**
     * Set up elevation provider debugging tools
     */
    setupElevationProviderDebugging() {
        const elevationProvider = this.elevationProvider;
        if (!elevationProvider) {
            this.elevationFolder.add({ message: "No elevation provider available" }, "message").name("Status");
            return;
        }
        // Add basic info about the elevation provider
        const providerInfo = {
            hasProvider: !!elevationProvider,
            tilingScheme: elevationProvider.getTilingScheme ? "Available" : "N/A"
        };
        this.elevationFolder.add(providerInfo, "hasProvider").name("Has Provider").listen();
        this.elevationFolder.add(providerInfo, "tilingScheme").name("Tiling Scheme").listen();
        // Create controls for querying elevation
        const queryControls = {
            latitude: 0,
            longitude: 0,
            level: 14,
            queryElevation: () => {
                if (elevationProvider) {
                    try {
                        const geoPoint = new GeoCoordinates(queryControls.latitude, queryControls.longitude, 0);
                        const elevation = elevationProvider.getHeight(geoPoint, queryControls.level);
                        console.log(`Elevation at [${queryControls.latitude}, ${queryControls.longitude}] level ${queryControls.level}: ${elevation}m`);
                        let resultStr = '';
                        if (elevation !== undefined) {
                            resultStr = `Elevation: ${elevation}m`;
                        }
                        else {
                            resultStr = `No elevation data available at this location`;
                        }
                        // Create a temporary textarea to copy the result
                        const copyToClipboard = () => {
                            const tempTextArea = document.createElement('textarea');
                            tempTextArea.value = resultStr;
                            document.body.appendChild(tempTextArea);
                            tempTextArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(tempTextArea);
                            alert('Result copied to clipboard!');
                        };
                        // Show result with copy button
                        const resultDiv = document.createElement('div');
                        resultDiv.innerHTML = `
                            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 1px solid #ccc; z-index: 10000; max-width: 400px;">
                                <h4>Elevation Result</h4>
                                <pre style="white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; margin: 10px 0;">${resultStr}</pre>
                                <button id="copyElevationResult" style="padding: 8px 16px; margin-right: 10px;">Copy Result</button>
                                <button id="closeElevationResult" style="padding: 8px 16px;">Close</button>
                            </div>
                            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
                        `;
                        document.body.appendChild(resultDiv);
                        // Add event listeners
                        const copyBtn = document.getElementById('copyElevationResult');
                        const closeBtn = document.getElementById('closeElevationResult');
                        copyBtn?.addEventListener('click', copyToClipboard);
                        closeBtn?.addEventListener('click', () => {
                            document.body.removeChild(resultDiv);
                        });
                    }
                    catch (error) {
                        console.error("Error querying elevation:", error);
                        alert(`Error querying elevation: ${error.message}`);
                    }
                }
            }
        };
        // Set default coordinates to somewhere interesting
        queryControls.latitude = 40.7128; // New York
        queryControls.longitude = -74.0060;
        this.elevationFolder.add(queryControls, "latitude", -90, 90, 0.0001).name("Latitude");
        this.elevationFolder.add(queryControls, "longitude", -180, 180, 0.0001).name("Longitude");
        this.elevationFolder.add(queryControls, "level", 0, 20, 1).name("Level");
        this.elevationFolder.add(queryControls, "queryElevation").name("Query Elevation");
        // Add cache management controls
        const cacheControls = {
            clearCache: () => {
                if (elevationProvider) {
                    elevationProvider.clearCache();
                    console.log("Elevation provider cache cleared");
                    alert("Elevation provider cache cleared");
                }
            }
        };
        this.elevationFolder.add(cacheControls, "clearCache").name("Clear Cache");
    }
    /**
     * Set up elevation range source debugging tools
     */
    setupElevationRangeSourceDebugging() {
        const elevationRangeSource = this.elevationRangeSource;
        if (!elevationRangeSource) {
            this.rangeFolder.add({ message: "No elevation range source available" }, "message").name("Status");
            return;
        }
        // Add basic info about the elevation range source
        const rangeSourceInfo = {
            hasSource: !!elevationRangeSource,
            ready: elevationRangeSource.ready ? elevationRangeSource.ready() : false
        };
        this.rangeFolder.add(rangeSourceInfo, "hasSource").name("Has Source").listen();
        this.rangeFolder.add(rangeSourceInfo, "ready").name("Ready").listen();
        // Create controls for querying elevation range
        const rangeQueryControls = {
            level: 14,
            row: 0,
            column: 0,
            queryRange: async () => {
                try {
                    // Create a tile key from the inputs
                    const tileKey = TileKey.fromRowColumnLevel(rangeQueryControls.row, rangeQueryControls.column, rangeQueryControls.level);
                    console.log(`Querying elevation range for tile: ${tileKey.toString()}`);
                    // Try to get elevation range
                    if (elevationRangeSource.getElevationRange) {
                        const result = elevationRangeSource.getElevationRange(tileKey, this.mapView.dataSources);
                        console.log(`Elevation range result:`, result);
                        let resultStr = `Tile: ${tileKey.toString()}`;
                        resultStr += `\nMin Elevation: ${result.minElevation}m`;
                        resultStr += `\nMax Elevation: ${result.maxElevation}m`;
                        resultStr += `\nStatus: ${result.calculationStatus || 'Unknown'}`;
                        // Create a temporary textarea to copy the result
                        const copyToClipboard = () => {
                            const tempTextArea = document.createElement('textarea');
                            tempTextArea.value = resultStr;
                            document.body.appendChild(tempTextArea);
                            tempTextArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(tempTextArea);
                            alert('Result copied to clipboard!');
                        };
                        // Show result with copy button
                        const resultDiv = document.createElement('div');
                        resultDiv.innerHTML = `
                            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 1px solid #ccc; z-index: 10000; max-width: 400px;">
                                <h4>Elevation Range Result</h4>
                                <pre style="white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 10px; margin: 10px 0;">${resultStr}</pre>
                                <button id="copyRangeResult" style="padding: 8px 16px; margin-right: 10px;">Copy Result</button>
                                <button id="closeRangeResult" style="padding: 8px 16px;">Close</button>
                            </div>
                            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
                        `;
                        document.body.appendChild(resultDiv);
                        // Add event listeners
                        const copyBtn = document.getElementById('copyRangeResult');
                        const closeBtn = document.getElementById('closeRangeResult');
                        copyBtn?.addEventListener('click', copyToClipboard);
                        closeBtn?.addEventListener('click', () => {
                            document.body.removeChild(resultDiv);
                        });
                    }
                    else {
                        alert("getElevationRange method not available on this source");
                    }
                }
                catch (error) {
                    console.error("Error querying elevation range:", error);
                    alert(`Error querying elevation range: ${error.message}`);
                }
            }
        };
        // Set default tile coordinates
        rangeQueryControls.level = 14;
        rangeQueryControls.row = 100000;
        rangeQueryControls.column = 100000;
        this.rangeFolder.add(rangeQueryControls, "level", 0, 20, 1).name("Level");
        this.rangeFolder.add(rangeQueryControls, "row", 0, 500000, 1).name("Row");
        this.rangeFolder.add(rangeQueryControls, "column", 0, 500000, 1).name("Column");
        this.rangeFolder.add(rangeQueryControls, "queryRange").name("Query Range");
    }
    /**
     * Clean up resources
     */
    dispose() {
        this.elevationFolder.destroy();
        this.rangeFolder.destroy();
        this.gui.destroy();
    }
    /**
     * Get the GUI instance
     */
    getGUI() {
        return this.gui;
    }
}
//# sourceMappingURL=ElevationModule.js.map