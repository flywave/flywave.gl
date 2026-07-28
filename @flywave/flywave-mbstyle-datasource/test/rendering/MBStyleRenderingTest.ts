import {
    MapView,
    MapViewEventNames,
} from '@flywave/flywave-mapview';
import {
    getPlatform,
    RenderingTestHelper,
    TestOptions,
} from '@flywave/flywave-test-utils';

import { assert } from 'chai';

import { MBStyleDataSource } from '../../src/MBStyleDataSource';
import { StyleSpecification } from '../../src/MBStyleSpec';

interface RenderTestOptions extends TestOptions {
    width?: number;
    height?: number;
}

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 128;

function createRenderTest(
    name: string,
    style: StyleSpecification,
    options: RenderTestOptions = {},
) {
    const commonOptions = { module: 'flywave-mbstyle' };

    it(name, async function () {
        this.timeout(100000);
        let canvas: HTMLCanvasElement | undefined;

        try {
            const ibct = new RenderingTestHelper(this, commonOptions);

            canvas = document.createElement('canvas');
            canvas.width = options.width ?? DEFAULT_WIDTH;
            canvas.height = options.height ?? DEFAULT_HEIGHT;

            const mapView = new MapView({
                canvas,
                theme: {},
                preserveDrawingBuffer: true,
                pixelRatio: 1,
            });

            const dataSource = new MBStyleDataSource({
                style,
                storageLevelOffset: 0,
                minDisplayLevel: 1,
                maxDisplayLevel: 22,
            });

            await mapView.addDataSource(dataSource);

            // Wait for rendering
            await new Promise<void>(resolve => {
                let frames = 0;
                const handler = () => {
                    frames++;
                    if (frames >= 3) {
                        mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                        resolve();
                    }
                };
                mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                mapView.update();
            });

            await ibct.assertCanvasMatchesReference(canvas, name, options);

            mapView.dispose();
        } finally {
            if (canvas !== undefined) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = undefined!;
            }
        }
    });
}

describe('MBStyleDataSource rendering', () => {
    // ---- Fill tests ----
    createRenderTest('fill-color', {
        version: 8,
        name: 'fill-color',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
                        },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            { id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.8 } },
        ],
    });

    createRenderTest('fill-opacity', {
        version: 8,
        name: 'fill-opacity',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
                        },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            { id: 'fill', type: 'fill', source: 'geojson', paint: { 'fill-color': '#0000ff', 'fill-opacity': 0.5 } },
        ],
    });

    // ---- Line tests ----
    createRenderTest('line-color', {
        version: 8,
        name: 'line-color',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-10, -10], [10, 10], [20, -5]],
                        },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            { id: 'line', type: 'line', source: 'geojson', paint: { 'line-color': '#ff0000', 'line-width': 2, 'line-opacity': 1 } },
        ],
    });

    createRenderTest('line-width', {
        version: 8,
        name: 'line-width',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-10, 0], [0, 10], [10, 0]],
                        },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#000000' } },
            { id: 'line', type: 'line', source: 'geojson', paint: { 'line-color': '#ffffff', 'line-width': 5 } },
        ],
    });

    // ---- Circle tests ----
    createRenderTest('circle-color', {
        version: 8,
        name: 'circle-color',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'Point', coordinates: [0, 0] },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            { id: 'circle', type: 'circle', source: 'geojson', paint: { 'circle-color': '#00ff00', 'circle-radius': 30 } },
        ],
    });

    createRenderTest('circle-stroke', {
        version: 8,
        name: 'circle-stroke',
        sources: {
            geojson: {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'Point', coordinates: [0, 0] },
                    }],
                },
            },
        },
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
            {
                id: 'circle', type: 'circle', source: 'geojson',
                paint: {
                    'circle-color': '#ff0000',
                    'circle-radius': 20,
                    'circle-stroke-color': '#000000',
                    'circle-stroke-width': 4,
                },
            },
        ],
    });

    // ---- Background tests ----
    createRenderTest('background-color', {
        version: 8,
        sources: {},
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#ffcc00' } },
        ],
    });
});
