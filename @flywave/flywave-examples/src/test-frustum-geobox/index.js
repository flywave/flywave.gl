import * as THREE from 'three';
import { geographicTerrainStandardTiling, GeoBox, TileKey, OrientedBox3, normalizedEquirectangularProjection, GeoCoordinates } from "@flywave/flywave.gl";
// Define camera parameters
const worldMatrix = new THREE.Matrix4().fromArray([
    0.5432974135116533, 0.6898197582194543, -0.4785150171536949, 0,
    -0.6493203781569559, 0.7065619533364914, 0.2813418785168874, 0,
    0.5321756918364856, 0.1578572369812847, 0.831787308000653, 0,
    -2425041.7472774643, 4526239.929326517, 3771607.494102686, 1
]);
const projectionMatrix = new THREE.Matrix4().fromArray([
    1.4376083581701098, 0, 0, 0,
    0, 2.7474774194546225, 0, 0,
    0, 0, -1.6448979591836732, -1,
    0, 0, -811.4811041403531, 0
]);
// Create camera and set parameters
const camera = new THREE.PerspectiveCamera();
camera.matrixWorld.copy(worldMatrix);
camera.projectionMatrix.copy(projectionMatrix);
camera.updateMatrixWorld();
// Create frustum
const viewProjectionMatrix = new THREE.Matrix4();
viewProjectionMatrix.multiplyMatrices(projectionMatrix, worldMatrix.clone().invert());
const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjectionMatrix);
// Extract camera position and direction from world matrix
function extractCameraParams(matrix) {
    const position = new THREE.Vector3();
    const rotation = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), scale);
    // Calculate camera forward vector (is [0, 0, -1] in camera local coordinates)
    const forward = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix);
    const lookAt = new THREE.Vector3().addVectors(position, forward);
    // Calculate camera up vector (is [0, 1, 0] in camera local coordinates)
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
    return { position, lookAt, up };
}
// Create UI elements
function createUI() {
    // Create main container using flex layout for horizontal arrangement
    const mainContainer = document.createElement('div');
    mainContainer.id = 'test-container';
    mainContainer.style.position = 'absolute';
    mainContainer.style.top = '10px';
    mainContainer.style.left = '10px';
    mainContainer.style.width = 'calc(100% - 20px)';
    mainContainer.style.height = 'calc(100vh - 20px)';
    mainContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    mainContainer.style.padding = '10px';
    mainContainer.style.border = '1px solid #ccc';
    mainContainer.style.borderRadius = '5px';
    mainContainer.style.zIndex = '1000';
    mainContainer.style.fontFamily = 'monospace';
    mainContainer.style.fontSize = '12px';
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'row';
    mainContainer.style.gap = '10px';
    document.body.appendChild(mainContainer);
    // Left: Control panel
    const controlPanel = document.createElement('div');
    controlPanel.style.flex = '0 0 300px';
    controlPanel.style.display = 'flex';
    controlPanel.style.flexDirection = 'column';
    controlPanel.style.minWidth = '280px';
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Frustum Culling GeoBox Test';
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '14px';
    controlPanel.appendChild(title);
    // TileKey input area
    const inputContainer = document.createElement('div');
    inputContainer.style.marginBottom = '15px';
    const label = document.createElement('label');
    label.textContent = 'Enter TileKey (format: l/r/c): ';
    label.style.display = 'block';
    label.style.marginBottom = '3px';
    label.style.fontSize = '12px';
    inputContainer.appendChild(label);
    const tileKeyInput = document.createElement('input');
    tileKeyInput.type = 'text';
    tileKeyInput.id = 'tilekey-input';
    tileKeyInput.value = '16/46048/108566'; // Default value
    tileKeyInput.style.width = '100%';
    tileKeyInput.style.padding = '4px';
    tileKeyInput.style.marginBottom = '5px';
    inputContainer.appendChild(tileKeyInput);
    // Add minimum altitude input
    const minAltitudeLabel = document.createElement('label');
    minAltitudeLabel.textContent = 'Minimum Altitude: ';
    minAltitudeLabel.style.display = 'block';
    minAltitudeLabel.style.marginTop = '3px';
    minAltitudeLabel.style.marginBottom = '3px';
    minAltitudeLabel.style.fontSize = '12px';
    inputContainer.appendChild(minAltitudeLabel);
    const minAltitudeInput = document.createElement('input');
    minAltitudeInput.type = 'number';
    minAltitudeInput.id = 'min-altitude-input';
    minAltitudeInput.value = '0'; // Default value
    minAltitudeInput.style.width = '100%';
    minAltitudeInput.style.padding = '4px';
    minAltitudeInput.style.marginBottom = '5px';
    inputContainer.appendChild(minAltitudeInput);
    // Add maximum altitude input
    const maxAltitudeLabel = document.createElement('label');
    maxAltitudeLabel.textContent = 'Maximum Altitude: ';
    maxAltitudeLabel.style.display = 'block';
    maxAltitudeLabel.style.marginTop = '3px';
    maxAltitudeLabel.style.marginBottom = '3px';
    maxAltitudeLabel.style.fontSize = '12px';
    inputContainer.appendChild(maxAltitudeLabel);
    const maxAltitudeInput = document.createElement('input');
    maxAltitudeInput.type = 'number';
    maxAltitudeInput.id = 'max-altitude-input';
    maxAltitudeInput.value = '100'; // Default value
    maxAltitudeInput.style.width = '100%';
    maxAltitudeInput.style.padding = '4px';
    maxAltitudeInput.style.marginBottom = '5px';
    inputContainer.appendChild(maxAltitudeInput);
    const button = document.createElement('button');
    button.textContent = 'Run Test';
    button.style.width = '100%';
    button.style.padding = '6px';
    button.style.marginTop = '5px';
    button.onclick = () => {
        const tileKeyVal = document.getElementById('tilekey-input').value;
        const minAltVal = document.getElementById('min-altitude-input').value;
        const maxAltVal = document.getElementById('max-altitude-input').value;
        runTestWithTileKeyAndAltitudes(tileKeyVal, parseFloat(minAltVal), parseFloat(maxAltVal));
    };
    inputContainer.appendChild(button);
    controlPanel.appendChild(inputContainer);
    // Camera parameters information
    const cameraParams = extractCameraParams(worldMatrix);
    const cameraInfo = document.createElement('div');
    cameraInfo.id = 'camera-info';
    cameraInfo.style.flex = '1';
    cameraInfo.style.overflowY = 'auto';
    cameraInfo.style.padding = '8px';
    cameraInfo.style.backgroundColor = '#f9f9f9';
    cameraInfo.style.border = '1px solid #eee';
    cameraInfo.style.borderRadius = '3px';
    cameraInfo.style.fontSize = '11px';
    cameraInfo.style.minHeight = '0'; /* Allow flex item to shrink */
    // Calculate near and far planes from projection matrix
    const near = projectionMatrix.elements[14] / (projectionMatrix.elements[10] - 1);
    const far = projectionMatrix.elements[14] / (projectionMatrix.elements[10] + 1);
    cameraInfo.innerHTML = `
        <strong>Camera Parameters:</strong><br>
        <strong>Position:</strong> [${cameraParams.position.x.toFixed(2)}, ${cameraParams.position.y.toFixed(2)}, ${cameraParams.position.z.toFixed(2)}]<br>
        <strong>Look At:</strong> [${cameraParams.lookAt.x.toFixed(2)}, ${cameraParams.lookAt.y.toFixed(2)}, ${cameraParams.lookAt.z.toFixed(2)}]<br>
        <strong>Up Direction:</strong> [${cameraParams.up.x.toFixed(2)}, ${cameraParams.up.y.toFixed(2)}, ${cameraParams.up.z.toFixed(2)}]<br><br>
        <strong>FOV:</strong> ${(2 * Math.atan(1 / projectionMatrix.elements[5]) * 180 / Math.PI).toFixed(2)}°<br>
        <strong>Aspect Ratio:</strong> ${(projectionMatrix.elements[5] / projectionMatrix.elements[0]).toFixed(2)}<br>
        <strong>Near:</strong> ${Math.abs(near).toFixed(2)}<br>
        <strong>Far:</strong> ${Math.abs(far).toFixed(2)}
    `;
    controlPanel.appendChild(cameraInfo);
    mainContainer.appendChild(controlPanel);
    // Right: Results display area
    const resultsDiv = document.createElement('div');
    resultsDiv.id = 'test-results';
    resultsDiv.style.flex = '1';
    resultsDiv.style.display = 'flex';
    resultsDiv.style.flexDirection = 'column';
    resultsDiv.style.overflowY = 'auto';
    resultsDiv.style.border = '1px solid #eee';
    resultsDiv.style.borderRadius = '3px';
    resultsDiv.style.padding = '8px';
    mainContainer.appendChild(resultsDiv);
}
// Test TileKey to GeoBox conversion
function tileKeyToGeoBox(tileKey) {
    return geographicTerrainStandardTiling.getGeoBox(tileKey);
}
// Test GeoBox to OrientedBox3 projection conversion
function geoBoxToOrientedBox3(geoBox) {
    return normalizedEquirectangularProjection.projectBox(geoBox, new OrientedBox3());
}
// Test frustum culling
function testFrustumCulling(orientedBox) {
    return orientedBox.intersects(frustum);
}
// Create GeoBox with specified altitude
function createGeoBoxWithAltitudes(tileKey, minAltitude, maxAltitude) {
    const geoBox = tileKeyToGeoBox(tileKey);
    // Create new GeoCoordinates with altitude information
    const southWest = new GeoCoordinates(geoBox.southWest.latitude, geoBox.southWest.longitude, minAltitude);
    const northEast = new GeoCoordinates(geoBox.northEast.latitude, geoBox.northEast.longitude, maxAltitude);
    return new GeoBox(southWest, northEast);
}
// Function to execute test
function runTestWithTileKeyAndAltitudes(tileKeyStr, minAltitude, maxAltitude) {
    try {
        // Parse input TileKey
        let tileKey;
        if (tileKeyStr.includes('/')) {
            const [level, row, column] = tileKeyStr.split('/').map(Number);
            tileKey = TileKey.fromRowColumnLevel(row, column, level);
        }
        else {
            // If numbers are entered directly, assume row-column-level format
            const [row, column, level] = tileKeyStr.split('-').map(Number);
            tileKey = TileKey.fromRowColumnLevel(row, column, level);
        }
        const resultsDiv = document.getElementById('test-results');
        resultsDiv.innerHTML = `<h4>Test Results - TileKey: ${tileKey.toString()}</h4>`;
        // Create GeoBox with specified altitude
        const geoBox = createGeoBoxWithAltitudes(tileKey, minAltitude, maxAltitude);
        // Convert GeoBox to OrientedBox3
        const orientedBox = geoBoxToOrientedBox3(geoBox);
        // Use OrientedBox3 for frustum culling check
        const isIntersecting = testFrustumCulling(orientedBox);
        // Add a table to display results
        let tableHTML = '<table style="width:100%; border-collapse: collapse; font-size: 10px;">';
        tableHTML += '<tr><th style="border: 1px solid #ddd; padding: 3px;">Level</th><th style="border: 1px solid #ddd; padding: 3px;">TileKey</th><th style="border: 1px solid #ddd; padding: 3px;">Intersection</th><th style="border: 1px solid #ddd; padding: 3px;">Status</th><th style="border: 1px solid #ddd; padding: 3px;">GeoBox [W,S,E,N,MinH,MaxH]</th></tr>';
        // Only test the current TileKey
        const status = isIntersecting ? 'Needs Rendering' : 'Can Be Culled';
        const color = isIntersecting ? '#e6f3e6' : '#fae6e6';
        tableHTML += `<tr style="background-color: ${color};">
            <td style="border: 1px solid #ddd; padding: 3px;">${tileKey.level}</td>
            <td style="border: 1px solid #ddd; padding: 3px; font-family: monospace;">${tileKey.toString()}</td>
            <td style="border: 1px solid #ddd; padding: 3px;">${isIntersecting ? 'Intersecting' : 'Not Intersecting'}</td>
            <td style="border: 1px solid #ddd; padding: 3px;">${status}</td>
            <td style="border: 1px solid #ddd; padding: 3px; font-size: 9px;">[${geoBox.west.toFixed(4)}, ${geoBox.south.toFixed(4)}, ${geoBox.east.toFixed(4)}, ${geoBox.north.toFixed(4)}, ${geoBox.minAltitude?.toFixed(2) ?? '0'}, ${geoBox.maxAltitude?.toFixed(2) ?? '0'}]</td>
        </tr>`;
        tableHTML += '</table>';
        resultsDiv.innerHTML += tableHTML;
        // Add detailed information
        const detailsDiv = document.createElement('div');
        detailsDiv.style.marginTop = '10px';
        detailsDiv.style.padding = '8px';
        detailsDiv.style.backgroundColor = '#f0f8ff';
        detailsDiv.style.border = '1px solid #cce5ff';
        detailsDiv.style.borderRadius = '3px';
        detailsDiv.style.fontSize = '10px';
        detailsDiv.innerHTML = `
            <strong>Detailed Information (Level ${tileKey.level}):</strong><br>
            TileKey: ${tileKey.toString()}<br>
            GeoBox: [${geoBox.west.toFixed(6)}, ${geoBox.south.toFixed(6)}, ${geoBox.east.toFixed(6)}, ${geoBox.north.toFixed(6)}, ${geoBox.minAltitude?.toFixed(2) ?? '0'}, ${geoBox.maxAltitude?.toFixed(2) ?? '0'}]<br>
            OrientedBox3 Position: [${orientedBox.position.x.toFixed(6)}, ${orientedBox.position.y.toFixed(6)}, ${orientedBox.position.z.toFixed(6)}]<br>
            OrientedBox3 Extents: [${orientedBox.extents.x.toFixed(6)}, ${orientedBox.extents.y.toFixed(6)}, ${orientedBox.extents.z.toFixed(6)}]<br>
            Frustum Culling Result: ${isIntersecting ? 'Intersecting (Needs Rendering)' : 'Not Intersecting (Can Be Culled)'}<br>
            Minimum Altitude: ${minAltitude}m, Maximum Altitude: ${maxAltitude}m
        `;
        resultsDiv.appendChild(detailsDiv);
    }
    catch (error) {
        const resultsDiv = document.getElementById('test-results');
        resultsDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        console.error('Test execution error:', error);
    }
}
// Old function, kept for compatibility
function runTestWithTileKey(tileKeyStr) {
    runTestWithTileKeyAndAltitudes(tileKeyStr, 0, 100); // Default altitude range
}
// Create UI after page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
}
else {
    createUI();
}
// Execute initial test
setTimeout(() => {
    runTestWithTileKeyAndAltitudes('16/46048/108566', 0, 100);
}, 100);
