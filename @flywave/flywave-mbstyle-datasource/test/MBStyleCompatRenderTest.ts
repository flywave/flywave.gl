/**
 * Mapbox GL JS render-tests compatibility runner.
 *
 * Discovers compatible style.json files from test/render-tests/,
 * renders them using MBStyleDataSource, and compares with expected.png.
 *
 * To run: needs karma browser environment (WebGL + canvas)
 * Test styles that depend on terrain/globe/3d-models are pre-filtered.
 */
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
import * as fs from 'fs';
import * as path from 'path';

import { MBStyleDataSource } from '../src/MBStyleDataSource';

const INCOMPATIBLE_TYPES = new Set([
    'terrain', 'globe', 'model', 'model-layer', 'video', 'custom-layer',
    'raster-particle', 'raster-array', 'skybox', 'background',
    'heatmap', 'hillshade',
]);

interface TestEntry {
    name: string;
    stylePath: string;
    style: any;
}

function discoverTests(): TestEntry[] {
    const root = path.join(__dirname, '..', 'render-tests');
    const results: TestEntry[] = [];
    const props = fs.readdirSync(root, { withFileTypes: true });
    for (const prop of props) {
        if (!prop.isDirectory()) continue;
        const propDir = path.join(root, prop.name);
        const testDirs = fs.readdirSync(propDir, { withFileTypes: true });
        for (const td of testDirs) {
            if (!td.isDirectory()) continue;
            const stylePath = path.join(propDir, td.name, 'style.json');
            if (!fs.existsSync(stylePath)) continue;
            try {
                const style = JSON.parse(fs.readFileSync(stylePath, 'utf8'));
                const layers = style.layers ?? [];
                const skip = layers.some((l: any) => INCOMPATIBLE_TYPES.has(l.type));
                if (!skip) {
                    results.push({
                        name: `${prop.name}/${td.name}`,
                        stylePath,
                        style,
                    });
                }
            } catch {}
        }
    }
    return results;
}

const ALL_TESTS = discoverTests();
console.log(`[MBStyleCompat] ${ALL_TESTS.length} compatible tests loaded`);

function localizeTileUrls(style: any): any {
    const s = JSON.parse(JSON.stringify(style));
    for (const [id, src] of Object.entries(s.sources ?? {})) {
        const source = src as any;
        if (source.tiles) {
            source.tiles = source.tiles.map((t: string) => {
                return t.replace(/^local:\/\/tiles\//, '/base/test/rendering/tiles/');
            });
        }
        if (source.url) {
            source.url = source.url.replace(/^local:\/\//, '/base/test/rendering/');
        }
    }
    if (s.sprite) {
        s.sprite = s.sprite.replace(/^local:\/\//, '/base/test/rendering/');
    }
    if (s.glyphs) {
        s.glyphs = s.glyphs.replace(/^local:\/\//, '/base/test/rendering/');
    }
    return s;
}

describe('MBStyleDataSource render-tests compatibility', function () {
    // Limit to a subset for practical test runs
    const SUBSET = process.env.TEST_SUBSET ? ALL_TESTS.slice(0, parseInt(process.env.TEST_SUBSET)) : ALL_TESTS;

    for (const entry of SUBSET) {
        const metadata = entry.style.metadata?.test ?? {};
        const skipReasons = metadata['skip-test'] ?? [];
        const shouldSkip = skipReasons.some((r: any) => r['platform-tag-contains'] === '');

        const testFn = shouldSkip ? it.skip : it;

        testFn(entry.name, async function () {
            this.timeout(30000);
            let canvas: HTMLCanvasElement | undefined;

            try {
                const ibct = new RenderingTestHelper(this, { module: 'mbstyle-render' });

                canvas = document.createElement('canvas');
                canvas.width = metadata.width ?? 128;
                canvas.height = metadata.height ?? 128;

                const mapView = new MapView({
                    canvas,
                    theme: {},
                    preserveDrawingBuffer: true,
                    pixelRatio: metadata.pixelRatio ?? 1,
                    tileCacheSize: 0,
                });

                const style = localizeTileUrls(entry.style);
                const dataSource = new MBStyleDataSource({ style });

                await mapView.addDataSource(dataSource);

                await new Promise<void>(resolve => {
                    let frames = 0;
                    const handler = () => {
                        frames++;
                        if (frames >= 5) {
                            mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                            resolve();
                        }
                    };
                    mapView.addEventListener(MapViewEventNames.AfterRender, handler);
                    mapView.update();
                });

                await ibct.assertCanvasMatchesReference(canvas, entry.name);

                mapView.dispose();
            } finally {
                if (canvas) { canvas.width = 0; canvas.height = 0; canvas = undefined!; }
            }
        });
    }
});
