// §885 终三十九g50m: offline mgl tile-cover probe driving the VENDORED
// Transform source directly (tsx — zero porting drift, unlike the hand
// ports lod-mirror-check.js / mgl-covering-tiles-ref.js). Computes the
// reference fetch set for an HD-road fixture camera: coveringTiles +
// extendTileCoverToNearPlane + extendTileCoverForTunnels, i.e. the
// source_cache.ts elevatedLayers branch.
//
// Usage:
//   mapbox-gl-js/node_modules/.bin/tsx ../scripts/mgl-cover-hd-probe.ts \
//     <lng> <lat> <zoom> <pitchDeg> <bearingDeg> [canvasSize=512] [maxzoom=18]
//
// Example (elevated-symbols):
//   ... mgl-cover-hd-probe.ts 139.7595 35.659 18.94 54.5 339.79
import Transform from '../mapbox-gl-js/src/geo/transform';
import LngLat from '../mapbox-gl-js/src/geo/lng_lat';

const [, , lngS, latS, zoomS, pitchS, bearingS, sizeS, maxzoomS] = process.argv;
const CENTER: [number, number] = [Number(lngS), Number(latS)];
const ZOOM = Number(zoomS);
const PITCH = Number(pitchS);
const BEARING = Number(bearingS);
const SIZE = Number(sizeS ?? 512);
const MAXZOOM = Number(maxzoomS ?? 18);

const tr: any = new (Transform as any)();
tr.resize(SIZE, SIZE);
tr.zoom = ZOOM;
tr.center = LngLat.convert(CENTER);
tr.pitch = PITCH;
tr.bearing = BEARING;

const opts = { tileSize: 512, maxzoom: MAXZOOM, roundZoom: false };
const covering: any[] = tr.coveringTiles(opts);
const coveringZoom: number = tr.coveringZoomLevel(opts);
const idealZoom = Math.min(coveringZoom, MAXZOOM);
const frustum = tr.getFrustum(idealZoom);
const near = tr.extendTileCoverToNearPlane(covering, frustum, idealZoom);
const tunnel = tr.extendTileCoverForTunnels(covering.concat(near), frustum, idealZoom, 20.0);

const all = new Map<string, any>();
for (const t of [...covering, ...near, ...tunnel]) all.set(t.key, t);
const tag = (t: any) => `${t.canonical.z}-${t.canonical.x}-${t.canonical.y}`;
console.log(`covering=${covering.length} nearPlane=+${near.length} tunnel=+${tunnel.length} FINAL=${all.size}`);
for (const id of [...all.values()].map(tag).sort()) console.log(' ', id);
