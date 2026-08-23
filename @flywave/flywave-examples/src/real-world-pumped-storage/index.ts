import {
    MapView,
    GeoCoordinates,
    GeoBox,
    sphereProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    QuantizedTerrainSource,
    ArcGISTileProvider,
    TileKey,
    TileKeyEntry,
    type ProjectorOverlayManager,
    type DEMTerrainSource as DEMTerrainSourceType,
    type TilingScheme
} from "@flywave/flywave.gl";
import {
    ClampToEdgeWrapping,
    Group,
    Mesh,
    MeshBasicMaterial,
    CylinderGeometry,
    Vector3,
    Texture
} from "three/webgpu";

/**
 * SINGLE-TILE UV CALIBRATION
 *
 * MapView's tile selection is overridden at its source: VisibleTileSet
 * .getVisibleTileKeysForDataSources() is monkey-patched to return ONE fixed
 * tile key for the terrain data source, so the system creates exactly ONE
 * terrain tile. The projector decal covers that tile's WEST HALF.
 *
 * Expected CORRECT result (top-down):
 *   - decal rectangle = west half of the tile;
 *   - red pillars exactly on the decal corners, green pillar at decal center;
 *   - quadrants: RED = north-west, GREEN = north-east, BLUE = south-west,
 *     YELLOW = south-east.
 */

const TILE_LEVEL = 13;
const SITE = { lat: 22.39665174276315, lon: 109.0245571318964 };
const TERRAIN_SOURCE_URL = "/api/v1/tilesets/pwobf37fk381ibm85id18xyq3a/tiles/source.json";
// Quantized (Cesium terrain) 数据源 —— 填入你的 quantized tileset URL 并把
// USE_QUANTIZED 改为 true，即可用同一套校准基准（四色象限 + 角柱 + 双瓦片）
// 验证 quantized 路径的 projector 支持。
const USE_QUANTIZED = false;
const QUANTIZED_TERRAIN_URL = "<你的 quantized tileset.json 地址>";

/**
 * Override VisibleTileSet so the terrain data source gets exactly ONE fixed
 * tile key every frame (other data sources, e.g. theme vector tiles, are
 * left untouched).
 */
const forceSingleTile = (mapView: MapView, terrainSourceName: string, tileKey: TileKey): void => {
    const vts: any = (mapView as any).m_visibleTiles;
    if (!vts) {
        console.error("[single-tile] VisibleTileSet not available yet");
        return;
    }
    const original = vts.getVisibleTileKeysForDataSources.bind(vts);
    vts.getVisibleTileKeysForDataSources = (
        zoomLevel: number,
        dataSources: any[],
        elevationRangeSource: any
    ) => {
        const result = original(zoomLevel, dataSources, elevationRangeSource);
        for (const entry of result.tileKeys) {
            if (entry.dataSource?.name === terrainSourceName) {
                // Entries are TileKeyEntry objects ({tileKey, offset, ...}),
                // NOT raw TileKeys — a raw key here crashes getTileImpl
                // ("Cannot read properties of undefined (reading 'mortonCode')").
                const existing = entry.visibleTileKeys[0];
                entry.visibleTileKeys = [
                    new TileKeyEntry(
                        tileKey,
                        existing?.area ?? 0,
                        existing?.offset ?? 0,
                        existing?.elevationRange
                    ),
                         new TileKeyEntry(
                        new TileKey(tileKey.row+1,tileKey.column,tileKey.level),
                        existing?.area ?? 0,
                        existing?.offset ?? 0,
                        existing?.elevationRange
                    )
                ];
            }
        }
        return result;
    };
    console.log("[single-tile] VisibleTileSet overridden →", `${tileKey.level}/${tileKey.column}/${tileKey.row}`);
};

const makeCalibrationTexture = (): Texture => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    // Quadrants (canvas top = image top).
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 256, 256); // top-left
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(256, 0, 256, 256); // top-right
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 256, 256, 256); // bottom-left
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(256, 256, 256, 256); // bottom-right
    // 25/50/75% crosshair.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    for (const p of [128, 256, 384]) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 512);
        ctx.moveTo(0, p);
        ctx.lineTo(512, p);
        ctx.stroke();
    }
    // Border.
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 500, 500);
    // Corner dots.
    ctx.fillStyle = "#000000";
    for (const [x, y] of [
        [16, 16],
        [496, 16],
        [16, 496],
        [496, 496]
    ]) {
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new Texture(c);
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
};

const addPillars = (
    mapView: MapView,
    demTerrain: DEMTerrainSourceType,
    geoBox: GeoBox
): void => {
    const corners: Array<[number, number]> = [
        [geoBox.southWest.latitude, geoBox.southWest.longitude],
        [geoBox.southWest.latitude, geoBox.northEast.longitude],
        [geoBox.northEast.latitude, geoBox.southWest.longitude],
        [geoBox.northEast.latitude, geoBox.northEast.longitude]
    ];

    const makePillar = (radius: number, color: number) => {
        const geometry = new CylinderGeometry(radius, radius, 3000, 12);
        geometry.translate(0, 750, 0);
        const mesh = new Mesh(geometry, new MeshBasicMaterial({ color, depthTest: false }));
        mesh.renderOrder = 999;
        return mesh;
    };

    const place = (lat: number, lon: number, radius: number, color: number, name: string) => {
        const geo = new GeoCoordinates(lat, lon);
        geo.altitude = demTerrain.getElevationProvider()?.getHeight(geo) ?? 0;
        const anchor: any = new Group();
        anchor.geoPosition = geo;
        const pillar = makePillar(radius, color);
        pillar.name = name;
        pillar.quaternion.setFromUnitVectors(
            new Vector3(0, 1, 0),
            sphereProjection.projectPoint(new GeoCoordinates(lat, lon), new Vector3()).normalize()
        );
        anchor.add(pillar);
        mapView.mapAnchors.add(anchor);
    };

    const tryPlace = (attempt: number) => {
        const heights = corners.map(([lat, lon]) =>
            demTerrain.getElevationProvider()?.getHeight(new GeoCoordinates(lat, lon))
        );
        if (heights.some(h => h === undefined)) {
            if (attempt < 60) setTimeout(() => tryPlace(attempt + 1), 500);
            return;
        }
        corners.forEach(([lat, lon], i) => place(lat, lon, 25, 0xff0000, `corner-${i}`));
        const center = geoBox.center;
        place(center.latitude, center.longitude, 45, 0x00ff00, "center");
    };
    tryPlace(0);
};

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found");
    }
    return canvas;
};

try {
    const canvas = getMapCanvas();
    const mapView = new MapView({
        projection: sphereProjection,
        target: new GeoCoordinates(SITE.lat, SITE.lon),
        zoomLevel: TILE_LEVEL,
        tilt: 0,
        heading: 0,
        canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            atmosphere: { enabled: false }
        }
    });
    new MapControlsUI(new MapControls(mapView));

    const demTerrain = USE_QUANTIZED
        ? new QuantizedTerrainSource({ url: QUANTIZED_TERRAIN_URL })
        : new DEMTerrainSource({ source: TERRAIN_SOURCE_URL });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // The ONE tile the system is allowed to create, and its west half decal.
    const scheme: TilingScheme = demTerrain.getTilingScheme();
    const tileKey = scheme.getTileKey(new GeoCoordinates(SITE.lat, SITE.lon), TILE_LEVEL) as TileKey;
    const tileBox = scheme.getGeoBox(tileKey);
    const halfBox = new GeoBox(
        new GeoCoordinates(tileBox.southWest.latitude-0.1, tileBox.southWest.longitude),
        new GeoCoordinates(
            tileBox.northEast.latitude-0.003,
            tileBox.northEast.longitude
        )
    );

    // ---- DEBUG: 强制固定瓦片（重载 VisibleTileSet 的瓦片选择）----
    // forceSingleTile(mapView, demTerrain.name, tileKey);
    // ---------------------------------------------------------------

    console.log("[single-tile] tileGeoBox:", tileBox);
    console.log("[single-tile] decalGeoBox (west half):", halfBox);
 

    const overlayManager: ProjectorOverlayManager = demTerrain.getProjectorOverlayManager();
    overlayManager.addLayer({
        texture: makeCalibrationTexture(),
        geoBox: halfBox,
        opacity: 1,
        blendMode: "normal"
    });

    addPillars(mapView, demTerrain, halfBox);

    (window as any).mapView = mapView;
    (window as any).overlayManager = overlayManager;
    (window as any).demTerrain = demTerrain;

    // ---- DEBUG: 每秒轮询场景内地形层网格状态 ----
    // let frame = 0;
    // setInterval(() => {
    //     const meshes: string[] = [];
    //     mapView.scene.traverse((o: any) => {
    //         if (o.isTerrainLayerMesh) {
    //             const tk = o.userData.tileKey;
    //             meshes.push(
    //                 `${o.layerKey}:${tk ? tk.level + "/" + tk.column + "/" + tk.row : "?"}:${
    //                     o.visible ? "v" : "h"
    //                 }`
    //             );
    //         }
    //     });
    //     console.log(`[poll ${frame++}]`, meshes.join(" | ") || "(no terrain meshes)");
    // }, 1000);
    // ---------------------------------------------

    console.log(
        "[single-tile] expected: quadrants RED=NW GREEN=NE BLUE=SW YELLOW=SE, border on pillars"
    );
} catch (error) {
    console.error("Error initializing single-tile calibration:", error);
}
