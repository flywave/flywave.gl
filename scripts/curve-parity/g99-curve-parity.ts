/**
 * §885 g99: point-by-point curve height parity probe.
 * Parses the same fixture MVT with the vendored mgl elevation pipeline AND our
 * port, then samples pointElevation on identical grids to localize the
 * systematic height delta that the deck level-comp currently absorbs.
 *
 * Run: node --import tsx tmp/g99-curve-parity.ts <tile.mvt> [z x y]
 */
import fs from 'fs';
import path from 'path';

const MGL = path.resolve(__dirname, '..', 'mapbox-gl-js');
const OURS = path.resolve(__dirname, '..', '@flywave/flywave-mbstyle-datasource/src/3d-style/elevation');

const tilePath = process.argv[2];
const [z, x, y] = (process.argv[3] ? process.argv[3].split('/') : ['18', '0', '0']).map(Number);

async function main() {
    // ---- mgl side ----
    const {createRequire} = await import('module');
    const require2 = createRequire(path.join(MGL, 'package.json'));
    const Pbf = require2('pbf').PbfReader ?? require2('pbf');
    const VT = require2('@mapbox/vector-tile');
    const data = fs.readFileSync(tilePath);
    const vtMgl = new VT.VectorTile(new Pbf(data));
    const layerName = 'hd_road_elevation';
    if (!vtMgl.layers[layerName]) { console.log('no elevation layer'); return; }
    const {parseElevationFeatures} = await import(path.join(MGL, '3d-style/elevation/parse_elevation_features.ts'));
    const canonical = {z, x, y} as any;
    const mglFeatures = parseElevationFeatures(vtMgl, canonical) ?? [];
    console.log(`mgl features: ${mglFeatures.length}`);

    // ---- our side: extract raw features from the SAME VectorTile ----
    const layer = vtMgl.layers[layerName];
    const layerExtent = layer.extent;
    console.log('layer extent', layerExtent, 'length', layer.length);
    const raws: any[] = [];
    for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const geom = f.loadGeometry() as any[];
        if (!geom.length || !geom[0].length) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const ring of geom) {
            for (const p of ring) {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            }
        }
        const geomType = (require2('@mapbox/vector-tile').VectorTileFeature.types as string[])[f.type];
        raws.push({
            type: geomType,
            properties: f.properties,
            x: geom[0][0].x,
            y: geom[0][0].y,
            bounds: [minX, minY, maxX, maxY],
            layerExtent,
        });
    }
    const oursParser = await import(path.join(OURS, 'MBElevationFeatureParser.ts'));
    const curveVertices: any[] = [];
    const metas: any[] = [];
    for (const raw of raws) {
        const v = oursParser.parseElevationVertex(raw);
        if (v) curveVertices.push(v);
        const m = oursParser.parseElevationMeta(raw);
        if (m) metas.push(m);
    }
    const {assembleElevationFeatures} = await import(path.join(OURS, 'MBElevationFeature.ts'));
    const {tileToMeter} = await import(path.join(MGL, 'src/geo/mercator_coordinate.ts'));
    const metersToTile = 1.0 / tileToMeter(canonical);
    const ourFeatures = assembleElevationFeatures(metas, curveVertices, metersToTile);
    console.log(`our features: ${ourFeatures.length}`);

    // ---- sample and compare on a grid over each mgl feature's bounds ----
    const oursById = new Map(ourFeatures.map((f: any) => [f.id ?? f.m_id, f]));
    // mgl positions live in RAW layer-extent units (8192); our port
    // normalizes to ELEVATION_EXTENT (4096) — map query coords accordingly.
    const qScale = 4096 / layerExtent;
    let n = 0, worst = 0, sumDelta = 0, sumAbs = 0;
    const rows: string[] = [];
    for (const ef of mglFeatures as any[]) {
        const ours = oursById.get(ef.id);
        const b = ef.safeArea;
        const [minX, minY, maxX, maxY] = [b.min.x, b.min.y, b.max.x, b.max.y];
        for (let gx = 0; gx <= 6; gx++) {
            for (let gy = 0; gy <= 6; gy++) {
                const px = minX + (maxX - minX) * gx / 6;
                const py = minY + (maxY - minY) * gy / 6;
                const hm = ef.pointElevation({x: px, y: py} as any);
                const ho = ours ? ours.pointElevation(px * qScale, py * qScale) : NaN;
                const d = ho - hm;
                n++; sumDelta += (isFinite(d) ? d : 0); sumAbs += Math.abs(isFinite(d) ? d : 0);
                if (Math.abs(d) > Math.abs(worst)) worst = d;
                if (rows.length < 40 && Math.abs(d) > 0.05) rows.push(`id=${ef.id} (${px.toFixed(0)},${py.toFixed(0)}) mgl=${hm.toFixed(3)} ours=${ho.toFixed(3)} d=${d.toFixed(3)}`);
            }
        }
    }
    console.log(`samples=${n} meanDelta=${(sumDelta / n).toFixed(4)} meanAbs=${(sumAbs / n).toFixed(4)} worst=${worst.toFixed(3)}`);
    console.log(rows.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
