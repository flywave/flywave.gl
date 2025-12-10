/* Copyright (C) 2025 flywave.gl contributors */
import * as THREE from 'three';
import { TileKey, geographicTerrainStandardTiling, normalizedEquirectangularProjection, GeoBox, OrientedBox3, GeoCoordinates } from "@flywave/flywave-geoutils";
/**
 * Frustum culling debugging module for flywave inspector
 * Provides tools to test frustum culling with elevation data
 */
export class FrustumCullingModule {
    constructor(mapView, parentGui, elevationProvider, elevationRangeSource) {
        this.mapView = mapView;
        this.elevationProvider = elevationProvider;
        this.elevationRangeSource = elevationRangeSource;
        this.gui = parentGui.addFolder("🔍 Frustum Culling");
        // Create sub-folder for frustum culling
        this.frustumFolder = this.gui.addFolder("Frustum Culling Test");
        this.setupFrustumCullingDebugging();
        // Close folders by default
        this.frustumFolder.close();
        this.gui.close();
    }
    /**
     * Set up frustum culling debugging tools
     */
    setupFrustumCullingDebugging() {
        // Get current camera parameters
        const camera = this.mapView.camera;
        const projectionMatrix = camera.projectionMatrix;
        const viewMatrix = camera.matrixWorld;
        // Create controls for querying frustum culling
        const queryControls = {
            level: 14,
            row: 0,
            column: 0,
            testFrustumCulling: () => {
                try {
                    // Create a tile key from the inputs
                    const tileKey = TileKey.fromRowColumnLevel(queryControls.row, queryControls.column, queryControls.level);
                    console.log(`Testing frustum culling for tile: ${tileKey.toString()}`);
                    // Get the camera frustum
                    const projectionMatrix = this.mapView.camera.projectionMatrix;
                    const viewMatrix = this.mapView.camera.matrixWorld.clone().invert();
                    const viewProjectionMatrix = new THREE.Matrix4();
                    viewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix);
                    const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjectionMatrix);
                    // Store results for display
                    const levelCheckResults = [];
                    // Start with the input tile key and go up to level 0
                    let currentTileKey = tileKey;
                    while (currentTileKey.level >= 0) {
                        // 1. Get the GeoBox for the tile
                        const geoBox = geographicTerrainStandardTiling.getGeoBox(currentTileKey);
                        // 2. Get elevation range for the tile if available
                        let minElevation = 0;
                        let maxElevation = 0;
                        try {
                            const elevationRange = this.elevationRangeSource.getElevationRange(currentTileKey, this.mapView.dataSources);
                            minElevation = elevationRange.minElevation;
                            maxElevation = elevationRange.maxElevation;
                        }
                        catch (e) {
                            // If elevation range is not available, use default values
                            console.warn(`Could not get elevation range for tile ${currentTileKey.toString()}:`, e);
                        }
                        // 3. Create a GeoBox with elevation
                        const geoBoxWithElevation = new GeoBox(new GeoCoordinates(geoBox.southWest.latitude, geoBox.southWest.longitude, minElevation), new GeoCoordinates(geoBox.northEast.latitude, geoBox.northEast.longitude, maxElevation));
                        // 4. Project the GeoBox to OrientedBox3
                        const orientedBox = normalizedEquirectangularProjection.projectBox(geoBoxWithElevation, new OrientedBox3());
                        // 5. Test frustum culling
                        const isIntersecting = orientedBox.intersects(frustum);
                        // Store the result
                        levelCheckResults.push({
                            level: currentTileKey.level,
                            tileKey: currentTileKey,
                            intersects: isIntersecting,
                            geoBox: geoBoxWithElevation,
                            orientedBox: orientedBox
                        });
                        // If we're at level 0, break
                        if (currentTileKey.level === 0) {
                            break;
                        }
                        // Move to parent tile
                        currentTileKey = currentTileKey.parent();
                    }
                    // Display results in a modal with copy functionality
                    this.displayResults(levelCheckResults, projectionMatrix, viewMatrix);
                }
                catch (error) {
                    console.error("Error testing frustum culling:", error);
                    alert(`Error testing frustum culling: ${error.message}`);
                }
            }
        };
        // Set default tile coordinates
        queryControls.level = 14;
        queryControls.row = 10000;
        queryControls.column = 10000;
        this.frustumFolder.add(queryControls, "level", 0, 20, 1).name("Level");
        this.frustumFolder.add(queryControls, "row", 0, 500000, 1).name("Row");
        this.frustumFolder.add(queryControls, "column", 0, 500000, 1).name("Column");
        this.frustumFolder.add(queryControls, "testFrustumCulling").name("Test Frustum Culling");
    }
    /**
     * Display results in a modal with copy functionality
     */
    displayResults(results, projectionMatrix, viewMatrix) {
        // Format results for display
        let resultStr = "Frustum Culling Test Results:\n\n";
        // Add camera parameters
        resultStr += "Camera Parameters:\n";
        resultStr += "Projection Matrix:\n";
        const projArray = projectionMatrix.toArray();
        for (let i = 0; i < projArray.length; i += 4) {
            resultStr += `[${projArray[i].toFixed(8)}, ${projArray[i + 1].toFixed(8)}, ${projArray[i + 2].toFixed(8)}, ${projArray[i + 3].toFixed(8)}]\n`;
        }
        resultStr += "\nView Matrix (Camera Position/Orientation):\n";
        const viewArray = viewMatrix.toArray();
        for (let i = 0; i < viewArray.length; i += 4) {
            resultStr += `[${viewArray[i].toFixed(8)}, ${viewArray[i + 1].toFixed(8)}, ${viewArray[i + 2].toFixed(8)}, ${viewArray[i + 3].toFixed(8)}]\n`;
        }
        resultStr += "\n";
        resultStr += "Frustum Culling Results:\n";
        resultStr += "Level\tTileKey\t\tIntersects\tGeoBox [W,S,E,N,MinH,MaxH]\n";
        resultStr += "-----\t-------\t\t--------\t---------------------------\n";
        for (const result of results) {
            const intersectsStr = result.intersects ? "YES" : "NO";
            const geoBoxStr = `[${result.geoBox.west.toFixed(8)}, ${result.geoBox.south.toFixed(8)}, ${result.geoBox.east.toFixed(8)}, ${result.geoBox.north.toFixed(8)}, ${result.geoBox.minAltitude?.toFixed(6) ?? '0'}, ${result.geoBox.maxAltitude?.toFixed(6) ?? '0'}]`;
            resultStr += `${result.level}\t${result.tileKey.toArray().join(',')}\t${intersectsStr}\t\t${geoBoxStr}\n`;
        }
        // Create a modal to display results with copy functionality
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 1px solid #ccc; z-index: 10000; max-width: 800px; max-height: 80vh; overflow: auto;">
                <h4>Frustum Culling Test Results</h4>
                <pre style="white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; background: #f5f5f5; padding: 10px; margin: 10px 0;">${resultStr}</pre>
                <button id="copyFrustumResult" style="padding: 8px 16px; margin-right: 10px;">Copy Result</button>
                <button id="closeFrustumResult" style="padding: 8px 16px;">Close</button>
            </div>
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
        `;
        document.body.appendChild(resultDiv);
        // Add event listeners
        const copyBtn = document.getElementById('copyFrustumResult');
        const closeBtn = document.getElementById('closeFrustumResult');
        copyBtn?.addEventListener('click', () => {
            const tempTextArea = document.createElement('textarea');
            tempTextArea.value = resultStr;
            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            document.execCommand('copy');
            document.body.removeChild(tempTextArea);
            alert('Results copied to clipboard!');
        });
        closeBtn?.addEventListener('click', () => {
            document.body.removeChild(resultDiv);
        });
    }
    /**
     * Clean up resources
     */
    dispose() {
        this.frustumFolder.destroy();
        this.gui.destroy();
    }
    /**
     * Get the GUI instance
     */
    getGUI() {
        return this.gui;
    }
}
//# sourceMappingURL=FrustumCullingModule.js.map