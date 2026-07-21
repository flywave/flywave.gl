import {
    MapView,
    GeoCoordinates,
    GeoBox,
    ellipsoidProjection,
    sphereProjection,
    MapControls,
    MapControlsUI,
    TileRenderDataSource,
    DEMTerrainSource,
    ArcGISTileProvider,
    type ProjectorOverlayManager,
    GUI
} from "@flywave/flywave.gl";
import { TextureLoader, ClampToEdgeWrapping } from "three";

const PROJECT_CONFIG = {
    PUMPED_STORAGE_3DTILES_URL: "/api/v1/tilesets/gkqj9pbfa7bt9dxex7t8hmp13a/tiles/tileset.json",
    TERRAIN_SOURCE_URL: "/api/v1/tilesets/pwobf37fk381ibm85id18xyq3a/tiles/source.json",
    OVERLAY_TEXTURE_URL: "/api/v1/files/856inaihqbfzmqt4po8uiho1nr"
};

interface TrenchPoint {
    lon: number;
    lat: number;
    depth: number;
}

const TRENCH_LINE: TrenchPoint[] = [
    { lon: 109.0245571318964, lat: 22.39665174276315, depth: 169.6220727660854 },
    { lon: 109.02386961666016, lat: 22.395966048611395, depth: 115.68896435800438 },
    { lon: 109.02215887096365, lat: 22.393656069574472, depth: 94.49990945006991 },
    { lon: 109.01567195892002, lat: 22.38557802837584, depth: 72.31713578282933 }
];

const TRENCH_WIDTH = 1200;
const TRENCH_HALF_WIDTH = TRENCH_WIDTH / 2;
const DEPTH_MULTIPLIER = 6;

function encodeMapboxHeight(height: number): [number, number, number] {
    let v = Math.floor((height + 10000) / 0.1);
    const b = v % 256;
    v = Math.floor(v / 256);
    const g = v % 256;
    v = Math.floor(v / 256);
    const r = v;
    return [r, g, b];
}

function createTrenchHeightmap(): { imageData: ImageData; geoBox: GeoBox } {
    const refLat = TRENCH_LINE.reduce((s, p) => s + p.lat, 0) / TRENCH_LINE.length;
    const refLon = TRENCH_LINE.reduce((s, p) => s + p.lon, 0) / TRENCH_LINE.length;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);

    const lineMeters = TRENCH_LINE.map(p => ({
        x: (p.lon - refLon) * mPerDegLon,
        y: (p.lat - refLat) * mPerDegLat,
        depth: p.depth
    }));

    const pStart = lineMeters[1];
    const pEnd = lineMeters[lineMeters.length - 1];
    const dirX = pEnd.x - pStart.x;
    const dirY = pEnd.y - pStart.y;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const ux = dirX / dirLen;
    const uy = dirY / dirLen;
    const fit = lineMeters.slice(1).map(p => ({
        t: (p.x - pStart.x) * ux + (p.y - pStart.y) * uy,
        d: p.depth
    }));
    const n = fit.length;
    const sumT = fit.reduce((s, p) => s + p.t, 0);
    const sumD = fit.reduce((s, p) => s + p.d, 0);
    const sumTT = fit.reduce((s, p) => s + p.t * p.t, 0);
    const sumTD = fit.reduce((s, p) => s + p.t * p.d, 0);
    const denom = n * sumTT - sumT * sumT;
    const slope = denom !== 0 ? (n * sumTD - sumT * sumD) / denom : 0;
    const intercept = (sumD - slope * sumT) / n;
    const t0 = (lineMeters[0].x - pStart.x) * ux + (lineMeters[0].y - pStart.y) * uy;
    lineMeters[0].depth = slope * t0 + intercept;

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const p of lineMeters) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    minX -= TRENCH_HALF_WIDTH;
    minY -= TRENCH_HALF_WIDTH;
    maxX += TRENCH_HALF_WIDTH;
    maxY += TRENCH_HALF_WIDTH;

    const minLon = refLon + minX / mPerDegLon;
    const maxLon = refLon + maxX / mPerDegLon;
    const minLat = refLat + minY / mPerDegLat;
    const maxLat = refLat + maxY / mPerDegLat;

    const geoBox = new GeoBox(
        new GeoCoordinates(minLat, minLon),
        new GeoCoordinates(maxLat, maxLon)
    );

    const widthM = maxX - minX;
    const heightM = maxY - minY;
    const resolution = 2;
    const hmWidth = Math.min(2048, Math.ceil(widthM / resolution));
    const hmHeight = Math.min(2048, Math.ceil(heightM / resolution));

    const canvas = document.createElement("canvas");
    canvas.width = hmWidth;
    canvas.height = hmHeight;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(hmWidth, hmHeight);
    const data = imageData.data;

    for (let py = 0; py < hmHeight; py++) {
        for (let px = 0; px < hmWidth; px++) {
            const mx = minX + ((px + 0.5) / hmWidth) * widthM;
            const my = maxY - ((py + 0.5) / hmHeight) * heightM;

            let minDist = Infinity;
            let closestDepth = 0;

            for (let i = 0; i < lineMeters.length - 1; i++) {
                const a = lineMeters[i];
                const b = lineMeters[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lenSq = dx * dx + dy * dy;
                let t = 0;
                if (lenSq > 0) {
                    t = ((mx - a.x) * dx + (my - a.y) * dy) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                }
                const projX = a.x + t * dx;
                const projY = a.y + t * dy;
                const dist = Math.sqrt((mx - projX) ** 2 + (my - projY) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closestDepth = a.depth + t * (b.depth - a.depth);
                }
            }

            const idx = (py * hmWidth + px) * 4;

            if (minDist < TRENCH_HALF_WIDTH) {
                const ratio = minDist / TRENCH_HALF_WIDTH;
                const edgeFalloff = 0.3;
                let alpha: number;
                if (ratio < edgeFalloff) {
                    alpha = 1.0;
                } else {
                    const t = (ratio - edgeFalloff) / (1 - edgeFalloff);
                    alpha = 0.5 * (1 + Math.cos(t * Math.PI));
                }

                const digDelta = -closestDepth * DEPTH_MULTIPLIER;
                const [r, g, b] = encodeMapboxHeight(digDelta);
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = Math.round(alpha * 255);
            } else {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 0;
            }
        }
    }

    return { imageData, geoBox };
}

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            "Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML"
        );
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const initialLocation = new GeoCoordinates(22.39665174276315, 109.0245571318964);

    return new MapView({
        projection: sphereProjection,
        target: initialLocation,
        zoomLevel: 15,
        tilt: 60,
        heading: 0,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            celestia: {
                sunTime: new Date().setHours(18),
                sunCastShadow: true,
                atmosphere: true
            }
        }
    });
};

const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const ui = new MapControlsUI(new MapControls(mapView));
    canvas.parentElement!.appendChild(ui.domElement);
};

const addPumpedStorageDataSource = (mapView: MapView): void => {
    const dataSource = new TileRenderDataSource({
        url: PROJECT_CONFIG.PUMPED_STORAGE_3DTILES_URL,
        castShadow: true
    });

    (window as any).dataSource = dataSource;

    mapView.addDataSource(dataSource);

    dataSource.getRootTile().then(tile => {
        mapView.lookAt({
            bounds: tile.cached.boundingVolume.region
        });
    });
};

const configureDEMTerrainSource = (mapView: MapView): DEMTerrainSource => {
    const demTerrain = new DEMTerrainSource({
        source: PROJECT_CONFIG.TERRAIN_SOURCE_URL
    });

    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    return demTerrain;
};

const addTrenchModifier = (demTerrain: DEMTerrainSource): GeoBox => {
    const manager = demTerrain.getGroundModificationManager();
    const { imageData, geoBox } = createTrenchHeightmap();

    manager.addModifier(
        "pumped-storage-trench",
        { type: "image", image: imageData },
        geoBox,
        "add"
    );

    console.log("Trench modifier added:", {
        width: TRENCH_WIDTH,
        geoBox: geoBox,
        depthProfile: TRENCH_LINE.map(p => ({ lat: p.lat, lon: p.lon, depth: p.depth }))
    });

    return geoBox;
};

const addTrenchOverlay = (geoBox: GeoBox, manager: ProjectorOverlayManager): void => {
    const textureLoader = new TextureLoader();
    textureLoader.load(PROJECT_CONFIG.OVERLAY_TEXTURE_URL, texture => {
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;

        manager.addLayer({
            texture,
            geoBox,
            opacity: 1,
            blendMode: "normal"
        });

        console.log("Projector layer added:", {
            center: [geoBox.center.latitude, geoBox.center.longitude]
        });
    });
};

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    initializeMapControls(mapView, canvas);
    addPumpedStorageDataSource(mapView);
    const demTerrain = configureDEMTerrainSource(mapView);
    const trenchGeoBox = addTrenchModifier(demTerrain);

    // The projector overlay manager is owned by the terrain source (per-source
    // state, auto-attached to the MapView for RTE correction during connect()).
    const overlayManager = demTerrain.getProjectorOverlayManager();

    addTrenchOverlay(trenchGeoBox, overlayManager);

    (window as any).mapView = mapView;
    (window as any).overlayManager = overlayManager;

    console.log("Pumped storage power station visualization example initialized successfully");
} catch (error) {
    console.error("Error initializing pumped storage power station visualization example:", error);
}
