/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    GeoBox,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    HeightMapBlendMode,
    ArcGISTileProvider
} from "@flywave/flywave.gl";
import { CESIUM_ION_TOKEN } from "../token-config";

const CONFIG = {
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17
};

const getMapCanvas = id => {
    const canvas = document.getElementById(id);
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`
        );
    }
    return canvas;
};

const initializeMapView = canvas => {
    const map = new MapView({
        target: CONFIG.INITIAL_COORDINATES,
        zoomLevel: CONFIG.ZOOM_LEVEL,
        projection: ellipsoidProjection,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base.json"
        }
    });

    const controls = new MapControls(map);
    const ui = new MapControlsUI(controls, { zoomLevel: "input" });
    canvas.parentElement.appendChild(ui.domElement);

    return map;
};

/**
 * 创建径向渐变高度图（模拟 RAISE/LOWER 效果）
 */
function createRadialGradientMap(size: number = 256, radius: number, strength: number): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const centerX = size / 2;
    const centerY = size / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

    // 从中心（白色=高）到边缘（黑色=低）的渐变
    const intensity = Math.floor(strength * 255);
    gradient.addColorStop(0, `rgb(${intensity}, ${intensity}, ${intensity})`);
    gradient.addColorStop(1, "rgb(0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return ctx.getImageData(0, 0, size, size);
}

/**
 * 创建噪声高度图（模拟 NOISE 效果）
 */
function createNoiseMap(size: number = 256, scale: number, strength: number): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // 简单的噪声生成
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4;

            // 使用多个频率的噪声叠加
            let noise = 0;
            noise += Math.sin(x * scale * 0.1) * Math.cos(y * scale * 0.1);
            noise += Math.sin(x * scale * 0.05 + 1.5) * Math.cos(y * scale * 0.05 + 2.3) * 0.5;
            noise += Math.random() * 0.3; // 添加随机噪声

            // 归一化到 0-1
            noise = (noise + 1.5) / 3.0;
            noise = Math.max(0, Math.min(1, noise)) * strength;

            const value = Math.floor(noise * 255);
            data[index] = value; // R
            data[index + 1] = value; // G
            data[index + 2] = value; // B
            data[index + 3] = 255; // A
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return imageData;
}

/**
 * 创建带状墙体高度图（支持阶梯效果）
 */
function createWallMap(
    width: number = 256,
    height: number = 256,
    wallWidthRatio: number = 0.3,
    strength: number = 1.0,
    steps: number = 1
): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const wallWidth = Math.floor(width * wallWidthRatio);
    const wallLeft = (width - wallWidth) / 2;
    const wallRight = wallLeft + wallWidth;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;

            if (x >= wallLeft && x <= wallRight) {
                // 计算阶梯效果
                let stepFactor = 1.0;
                if (steps > 1) {
                    // 沿着y方向创建阶梯
                    const stepSize = height / steps;
                    const currentStep = Math.floor(y / stepSize);
                    // 阶梯从0.2到1.0变化，高度差更大
                    stepFactor = 0.2 + (currentStep / (steps - 1)) * 0.8;
                }

                const intensity = Math.floor(strength * 255 * stepFactor);
                data[index] = intensity;
                data[index + 1] = intensity;
                data[index + 2] = intensity;
                data[index + 3] = 255;
            } else {
                data[index] = 0;
                data[index + 1] = 0;
                data[index + 2] = 0;
                data[index + 3] = 255;
            }
        }
    }

    return imageData;
}

/**
 * 创建水平墙体高度图（用于横向墙体段）
 */
function createHorizontalWallMap(
    width: number = 256,
    height: number = 256,
    wallWidthRatio: number = 0.3,
    strength: number = 1.0,
    steps: number = 1
): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const wallWidth = Math.floor(height * wallWidthRatio);
    const wallTop = (height - wallWidth) / 2;
    const wallBottom = wallTop + wallWidth;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;

            if (y >= wallTop && y <= wallBottom) {
                // 计算阶梯效果（沿x方向）
                let stepFactor = 1.0;
                if (steps > 1) {
                    const stepSize = width / steps;
                    const currentStep = Math.floor(x / stepSize);
                    // 阶梯从0.2到1.0变化，高度差更大
                    stepFactor = 0.2 + (currentStep / (steps - 1)) * 0.8;
                }

                const intensity = Math.floor(strength * 255 * stepFactor);
                data[index] = intensity;
                data[index + 1] = intensity;
                data[index + 2] = intensity;
                data[index + 3] = 255;
            } else {
                data[index] = 0;
                data[index + 1] = 0;
                data[index + 2] = 0;
                data[index + 3] = 255;
            }
        }
    }

    return imageData;
}

/**
 * 创建高斯模糊高度图（模拟 SMOOTH 效果）
 */
function createGaussianBlurMap(size: number = 256, radius: number): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // 先创建一个径向渐变作为基础
    const centerX = size / 2;
    const centerY = size / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, "rgb(200, 200, 200)");
    gradient.addColorStop(0.5, "rgb(128, 128, 128)");
    gradient.addColorStop(1, "rgb(64, 64, 64)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // 应用模糊（通过多次缩放实现）
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCanvas.width = size / 4;
    tempCanvas.height = size / 4;

    // 缩小
    tempCtx.drawImage(canvas, 0, 0, size, size, 0, 0, size / 4, size / 4);

    // 放大回原尺寸（产生模糊效果）
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tempCanvas, 0, 0, size / 4, size / 4, 0, 0, size, size);

    return ctx.getImageData(0, 0, size, size);
}

/**
 * 创建侵蚀高度图（模拟 ERODE 效果）
 */
function createErosionMap(size: number = 256, radius: number): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const centerX = size / 2;
    const centerY = size / 2;

    // 创建一个反向的径向渐变（边缘低，中心高）
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, "rgb(180, 180, 180)");
    gradient.addColorStop(0.7, "rgb(100, 100, 100)");
    gradient.addColorStop(1, "rgb(40, 40, 40)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return ctx.getImageData(0, 0, size, size);
}

/**
 * 添加高度图修改器（新 API）
 */
const addHeightMapModifiers = async demTerrain => {
    const manager = demTerrain.getGroundModificationManager();
    const modifierIds = [];

    const centerLat = 36.398;
    const centerLon = 118.099;
    const spacing = 0.003;
    const gridSize = 3;
    const totalSpan = spacing * (gridSize - 1);

    console.log("=".repeat(70));
    console.log("ADDING SINGLE WALL WITH 3 STEPS");
    console.log("=".repeat(70));
    console.log("");

    const wallWidthLon = 0.004;
    const wallLengthLat = totalSpan;
    const numSteps = 3;
    const minHeight = 200;
    const maxHeight = 1000;

    const halfSpan = totalSpan / 2;

    // 创建一个长的带状墙体（南北向，带3级阶梯）
    const geoBox = new GeoBox(
        new GeoCoordinates(centerLat - halfSpan, centerLon - wallWidthLon / 2),
        new GeoCoordinates(centerLat + halfSpan, centerLon + wallWidthLon / 2)
    );

    const heightMap = createWallMap(256, 512, 0.4, 1.0, numSteps);

    const modifierId = manager.addModifier(
        { type: "image", image: heightMap },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: minHeight, max: maxHeight }
    );
    modifierIds.push(modifierId);

    console.log(`Wall Modifier: ${modifierId}`);
    console.log(`  Position: ${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}`);
    console.log(`  Size: ${wallLengthLat.toFixed(4)}° × ${wallWidthLon.toFixed(4)}°`);
    console.log(`  Height: ${minHeight}m ~ ${maxHeight}m`);
    console.log(`  Steps: ${numSteps}`);
    console.log(`  Height Difference: ${maxHeight - minHeight}m`);
    console.log("");

    console.log("=".repeat(70));
    console.log(`TOTAL MODIFIERS: ${modifierIds.length}`);
    console.log("=".repeat(70));

    return modifierIds;
};

const configureDEMTerrainSource = mapView => {
    const cesiumTerrain = new CesiumWorldTerrainSource({
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1
    });

    const modifierIds = addHeightMapModifiers(cesiumTerrain);

    mapView.setElevationSource(cesiumTerrain);

    cesiumTerrain.addWebTileDataSource(
        new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
    );

    return { cesiumTerrain, modifierIds };
};

try {
    console.log("");
    console.log("█".repeat(70));
    console.log("█" + " ".repeat(68) + "█");
    console.log("█  SINGLE WALL WITH 3 STEPS - LARGE HEIGHT DIFFERENCE" + " ".repeat(18) + "█");
    console.log("█" + " ".repeat(68) + "█");
    console.log("█".repeat(70));
    console.log("");

    const canvas = getMapCanvas("mapCanvas");
    const mapView = initializeMapView(canvas);
    const { cesiumTerrain, modifierIds } = configureDEMTerrainSource(mapView);

    console.log("=".repeat(70));
    console.log("SINGLE WALL WITH 3 STEPS");
    console.log("=".repeat(70));
    console.log(`Features:`);
    console.log(`  • Single long wall structure`);
    console.log(`  • 3 distinct height steps (200m, 600m, 1000m)`);
    console.log(`  • Large height difference (800m total)`);
    console.log(`  • ADD blend mode for elevation`);
    console.log(`  • Custom wall-shaped height map`);
    console.log("");
    console.log("Input Formats:");
    console.log(`  • ImageData, HTMLImageElement, HTMLCanvasElement`);
    console.log(`  • URL to image`);
    console.log(`  • Raw data arrays (Float32Array, Uint8Array)`);
    console.log("");
    console.log("Advantages over Old Design:");
    console.log(`  ✓ Flexible image input (any grayscale image)`);
    console.log(`  ✓ Standard blend modes (GIS + image processing)`);
    console.log(`  ✓ GeoBox-based (industry standard)`);
    console.log(`  ✓ Batch processing support`);
    console.log(`  ✓ No legacy code, clean architecture`);
    console.log("");
    console.log("Verification Checklist:");
    console.log(`  [ ] Visible single wall structure`);
    console.log(`  [ ] 3 distinct height steps visible`);
    console.log(`  [ ] Large height difference (800m)`);
    console.log(`  [ ] No performance degradation`);
    console.log(`  [ ] Proper GeoBox boundaries`);
    console.log("=".repeat(70));
    console.log("");

    console.log("To verify:");
    console.log("1. Open browser DevTools (F12)");
    console.log("2. Check console for modifier logs");
    console.log("3. Observe the wall with 3 height steps");
    console.log("4. Note the large height difference");
    console.log("");
} catch (error) {
    console.error("".repeat(70));
    console.error("ERROR INITIALIZING EXAMPLE:");
    console.error("".repeat(70));
    console.error(error);
    console.error("".repeat(70));
}
