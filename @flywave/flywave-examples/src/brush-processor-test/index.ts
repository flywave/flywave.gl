/* Copyright (C) 2025 flywave.gl contributors */

import { BrushProcessor, BrushType, GeoBox, GeoCoordinates } from "@flywave/flywave.gl";

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const brushProcessor = new BrushProcessor();

const operations = [
    {
        position: new GeoCoordinates(0.0005, 0.001),
        settings: {
            type: BrushType.RAISE,
            size: 80,
            strength: 0.8,
            hardness: 0.5
        }
    },
    {
        position: new GeoCoordinates(0.001, 0.001),
        settings: {
            type: BrushType.RAISE,
            size: 100,
            strength: 1.0,
            hardness: 0.7
        }
    },
    {
        position: new GeoCoordinates(0.0015, 0.001),
        settings: {
            type: BrushType.RAISE,
            size: 120,
            strength: 0.6,
            hardness: 0.3
        }
    },
    {
        position: new GeoCoordinates(0.0018, 0.0012),
        settings: {
            type: BrushType.LOWER,
            size: 60,
            strength: 0.5,
            hardness: 0.8
        }
    },
    {
        position: new GeoCoordinates(0.0008, 0.0005),
        settings: {
            type: BrushType.NOISE,
            size: 90,
            strength: 0.7,
            hardness: 0.4,
            noiseScale: 8,
            noisePersistence: 0.6
        }
    }
];

const tileGeoBox = new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0.002, 0.002));

const brushWeights = brushProcessor.applyBrushOperations(operations, tileGeoBox, 512, 512);

const testCanvas = document.createElement("canvas");
testCanvas.width = 512;
testCanvas.height = 512;
const testCtx = testCanvas.getContext("2d")!;

const imageData = testCtx.createImageData(512, 512);
const data = imageData.data;

for (let i = 0; i < brushWeights.length; i++) {
    const value = brushWeights[i];
    const intensity = Math.floor(value * 255);
    data[i * 4] = intensity;
    data[i * 4 + 1] = intensity;
    data[i * 4 + 2] = intensity;
    data[i * 4 + 3] = 255;
}

testCtx.putImageData(imageData, 0, 0);

ctx.fillStyle = "#000";
ctx.fillRect(0, 0, canvas.width, canvas.height);

const x = (canvas.width - 512) / 2;
const y = (canvas.height - 512) / 2;
ctx.drawImage(testCanvas, x, y);

console.log("Brush processor test rendered");
