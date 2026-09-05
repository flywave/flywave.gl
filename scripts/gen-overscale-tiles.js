// §840 data engineering (run: node scripts/gen-overscale-tiles.js)
// Generates the pitch fixture's missing z6 overscale children
// (6/30-33 × 20-23) from the shipped z5 parents (5/15-16/10-11) by
// remapping parent features into each child quadrant (scale 2, unclipped —
// matching mgl's own overzoom rendering). Requires devDependencies of the
// vendored mapbox-gl-js checkout (@mapbox/vector-tile + pbf).
const fs = require("fs");
const path = require("path");
const { PbfReader, PbfWriter } = require(path.join(__dirname, "..", "mapbox-gl-js", "node_modules", "pbf"));
const { VectorTile } = require(path.join(__dirname, "..", "mapbox-gl-js", "node_modules", "@mapbox", "vector-tile"));

const TILES = path.join(__dirname, "..", "@flywave", "flywave-mbstyle-datasource", "test", "rendering", "integration", "tiles");
const EXT = 4096;

function readLayer(buf) {
    const tile = new VectorTile(new PbfReader(buf));
    const out = [];
    for (const name of Object.keys(tile.layers)) {
        const layer = tile.layers[name];
        const features = [];
        for (let i = 0; i < layer.length; i++) {
            const f = layer.feature(i);
            features.push({ type: f.type, properties: f.properties, geometry: f.loadGeometry() });
        }
        out.push({ name, extent: layer.extent, version: layer.version ?? 2, features });
    }
    return out;
}

// remap parent-extent coords into the child quadrant frame: x' = x*2 − qx*EXT
function remapGeometry(geom, qx, qy) {
    // loadGeometry() returns Point objects ({x, y}), not arrays
    return geom.map(ring =>
        ring.map(pt => {
            const x = pt.x ?? pt[0], y = pt.y ?? pt[1];
            return [x * 2 - qx * EXT, y * 2 - qy * EXT];
        })
    );
}

function zig(v) { return (v << 1) ^ (v >> 31); }

function encodeGeometry(type, rings) {
    const cmds = [];
    for (const ring of rings) {
        if (ring.length === 0) continue;
        let px = 0, py = 0;
        cmds.push((1 << 3) | 1);
        cmds.push(zig(ring[0][0] - px));
        cmds.push(zig(ring[0][1] - py));
        px = ring[0][0]; py = ring[0][1];
        const lineToCount = ring.length - 1 + (type === 3 ? 1 : 0);
        cmds.push((lineToCount << 3) | 2);
        for (let i = 1; i < ring.length; i++) {
            cmds.push(zig(ring[i][0] - px));
            cmds.push(zig(ring[i][1] - py));
            px = ring[i][0]; py = ring[i][1];
        }
        if (type === 3) {
            cmds.push(zig(ring[0][0] - px));
            cmds.push(zig(ring[0][1] - py));
        }
    }
    return cmds;
}

function zigzag(v) { return (v << 1) ^ (v >> 31); }

function encodeValue(p, v) {
    if (typeof v === "string") p.writeString(1, v);
    else if (typeof v === "number") p.writeDouble(3, v);
    else if (typeof v === "boolean") p.writeBoolean(7, v);
    else if (v === null || v === undefined) { /* skip */ }
    else p.writeString(1, String(v));
}

function writeLayer(pbf, layer) {
    // build keys/values tables
    const keys = [], values = [], keyIdx = new Map(), valIdx = new Map();
    const feats = [];
    for (const f of layer.features) {
        const tags = [];
        for (const [k, v] of Object.entries(f.properties)) {
            if (!keyIdx.has(k)) { keyIdx.set(k, keys.length); keys.push(k); }
            tags.push(keyIdx.get(k));
            let enc, vv = v;
            if (typeof v === "string") enc = "s";
            else if (typeof v === "boolean") { enc = "b"; vv = +v; }
            else if (Number.isInteger(v) && v >= 0) { enc = "u"; vv = v; }
            else if (Number.isInteger(v)) { enc = "i"; vv = v; }
            else { enc = "d"; vv = v; }
            const vs = enc + ":" + v;
            if (!valIdx.has(vs)) {
                valIdx.set(vs, values.length);
                values.push({ v: vv, enc });
            }
            tags.push(valIdx.get(vs));
        }
        const geom = encodeGeometry(f.type, f.geometry);
        if (geom.length === 0) continue;
        feats.push({ tags, type: f.type, geom });
    }
    // MVT layer schema: name=1, features=2, keys=3, values=4, extent=5, version=15
    pbf.writeStringField(1, layer.name);
    for (const f of feats) {
        pbf.writeMessage(2, (_obj, fp) => {
            fp.writePackedVarint(2, f.tags);
            fp.writeVarintField(3, f.type);
            fp.writePackedVarint(4, f.geom);
        });
    }
    for (const k of keys) pbf.writeStringField(3, k);
    for (const v of values) {
        pbf.writeMessage(4, (_obj, vp) => {
            if (v.enc === "s") vp.writeStringField(1, v.v);
            else if (v.enc === "u") vp.writeVarintField(5, v.v);
            else if (v.enc === "i") vp.writeSVarintField(6, v.v);
            else if (v.enc === "d") vp.writeDoubleField(3, v.v);
            else if (v.enc === "b") vp.writeBooleanField(7, v.v);
        });
    }
    pbf.writeVarintField(15, layer.version ?? 2);
    pbf.writeVarintField(5, layer.extent ?? 4096);
}

function encodeTile(layers) {
    const pbf = new PbfWriter();
    for (const l of layers) {
        pbf.writeMessage(3, (_obj, p) => writeLayer(p, l));
    }
    return pbf.finish();
}

// main: children of z5 parents 15-16/10-11 → 6/30-33/20-23
const parents = [[15, 10], [15, 11], [16, 10], [16, 11]];
const parentBufs = new Map();
for (const [px, py] of parents) {
    parentBufs.set(`${px}_${py}`, fs.readFileSync(path.join(TILES, `5-${px}-${py}.mvt`)));
}

let written = 0;
for (const [px, py] of parents) {
    const layers = readLayer(parentBufs.get(`${px}_${py}`));
    for (const qx of [0, 1]) {
        for (const qy of [0, 1]) {
            const cx = px * 2 + qx, cy = py * 2 + qy;
            const scaled = layers.map(l => ({
                ...l,
                features: l.features.map(f => ({ ...f, geometry: remapGeometry(f.geometry, qx, qy) }))
            }));
            const f0 = scaled[0].features[0];
            console.log("dbg", `6-${px*2+qx}-${py*2+qy}`, "first geom pt:", JSON.stringify(f0.geometry[0][0]));
            const bytes = encodeTile(scaled);
            const out = path.join(TILES, `6-${cx}-${cy}.mvt`);
            fs.writeFileSync(out, Buffer.from(bytes));
            written++;
            console.log("wrote", `6-${cx}-${cy}.mvt`, bytes.length, "bytes");
        }
    }
}
console.log("done,", written, "tiles");
