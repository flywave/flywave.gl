// §885 g67: project z18 tile corners into esl fixture screen space with the
// VENDORED Transform (same drive as mgl-cover-hd-probe.ts) to locate which
// tile paints the expected top-right road region.
//
// Usage: mapbox-gl-js/node_modules/.bin/tsx ../scripts/tile-screen-probe.ts
import Transform from '../mapbox-gl-js/src/geo/transform';
import LngLat from '../mapbox-gl-js/src/geo/lng_lat';

const CENTER: [number, number] = [139.7617, 35.662];
const ZOOM = 19.11;
const PITCH = 47.5;
const BEARING = 153.6;
const SIZE = 512;

const tr: any = new (Transform as any)();
tr.resize(SIZE, SIZE);
tr.zoom = ZOOM;
tr.center = LngLat.convert(CENTER);
tr.pitch = PITCH;
tr.bearing = BEARING;

const n = Math.pow(2, 18);
const corner = (x: number, y: number): [number, number] => [
    x / n * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI,
];

function proj(lng: number, lat: number): [number, number] | string {
    try {
        const p = tr.locationPoint(LngLat.convert([lng, lat]));
        return [Math.round(p.x), Math.round(p.y)];
    } catch (e: any) { return 'ERR ' + e.message; }
}

// The tiles in play (mgl cover + our hits + south/east neighbors)
const tiles: Array<[string, number, number]> = [
    ['18-232843-103243 (corpus HIT)', 232843, 103243],
    ['18-232843-103244 (404)', 232843, 103244],
    ['18-232844-103244 (404)', 232844, 103244],
    ['18-232843-103242 (corpus HIT)', 232843, 103242],
    ['18-232844-103242 (corpus HIT)', 232844, 103242],
    ['18-232844-103243 (404)', 232844, 103243],
];

for (const [name, x, y] of tiles) {
    const nw = proj(...corner(x, y));
    const ne = proj(...corner(x + 1, y));
    const sw = proj(...corner(x, y + 1));
    const se = proj(...corner(x + 1, y + 1));
    const c = proj(...corner(x + 0.5, y + 0.5));
    console.log(name);
    console.log('  NW', nw, ' NE', ne);
    console.log('  SW', sw, ' SE', se, ' C', c);
}
// sanity: where does the fixture center land?
console.log('center screen:', proj(CENTER[0], CENTER[1]), '(expect ~256,256)');
