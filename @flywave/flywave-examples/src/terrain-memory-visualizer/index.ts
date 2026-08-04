import {
    MapView,
    MapViewEventNames,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapControlsUI
} from "@flywave/flywave.gl";
import { TileSnapshotCollector } from "./TileSnapshotCollector";
import { TileOverviewCanvas } from "./TileOverviewCanvas";
import { EventLog } from "./EventLog";

const CANVAS_ID = "mapCanvas";

function createLayout(): { sidebar: HTMLElement } {

    const sidebar = document.createElement("div");
    sidebar.style.cssText =
        "position:absolute;right:0;top:0;width:40%;height:100%;display:flex;flex-direction:column;background:#111;";
    document.body.appendChild(sidebar);

    const overviewWrapper = document.createElement("div");
    overviewWrapper.style.cssText =
        "flex:1 1 50%;min-height:0;position:relative;border-bottom:1px solid #333;";
    sidebar.appendChild(overviewWrapper);

    overviewWrapper.dataset.role = "overview";

    const logWrapper = document.createElement("div");
    logWrapper.style.cssText = "flex:1 1 50%;min-height:0;";
    sidebar.appendChild(logWrapper);
    logWrapper.dataset.role = "log";

    return { sidebar };
}

async function main() {
    const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
    if (!canvas) throw new Error("Canvas not found");

    const { sidebar } = createLayout();

    const initialLocation = new GeoCoordinates(36.48619699228674, 118.17270928364879);

    const mapView = new MapView({
        projection: ellipsoidProjection,
        target: initialLocation,
        enablePolarDataSource: false,
        zoomLevel: 15,
        tilt: 71.43670140369471,
        heading: -89.40263147840845,
        canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: { enabled: true }
        }
    });

    mapView.beginAnimation();

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls, { screenshotButton: undefined as never });
    canvas.parentElement!.appendChild(ui.domElement);

    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json"
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    await new Promise(resolve => setTimeout(resolve, 2000));

    const collector = new TileSnapshotCollector(mapView as unknown as Record<string, unknown>);

    const overviewWrapper = sidebar.querySelector('[data-role="overview"]') as HTMLElement;
    const logWrapper = sidebar.querySelector('[data-role="log"]') as HTMLElement;

    const overview = new TileOverviewCanvas(overviewWrapper);
    const eventLog = new EventLog(logWrapper);

    let collectInterval = 0;
    mapView.addEventListener(MapViewEventNames.AfterRender, () => {
        collectInterval++;
        if (collectInterval % 10 !== 0) return;

        const result = collector.collect();
        overview.update(result);
        eventLog.addEvents(result.events);
    });

    console.log("Terrain memory visualizer initialized");
}

main().catch(console.error);
