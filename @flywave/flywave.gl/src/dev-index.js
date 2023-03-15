

import Application from "./application";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import {
    APIFormat,
} from "@flywave/flywave-vectortile-datasource";
import lineStringChunk from "./util/line-chunk";

import { randomPointInPolygon, polygonOutlinePoints, lineChunkPoints, gridPointInPolygon } from "./util/random-points";

export { randomPointInPolygon, polygonOutlinePoints, lineChunkPoints, gridPointInPolygon, lineStringChunk };
import { MapboxSatelliteMaterialProvider } from "./terrain-source";

import config from "./config";

config.ANCHOR_INFO_URL = "http://127.0.0.1:8000/api/v1/topo/{mesh_id}";
config.TOPO_MESH_URL = "http://127.0.0.1:8000/api/v1/topo";
config.BASE_PATH = "./dist";

var app = new Application({
    target: new GeoCoordinates(
        36.82749, 117.59765
    ),
    zoomLevel: 17,
    canvas: document.getElementById("container")
});
async function init() {

    await app.getReady();

    app.datasource.add(
        {
            "geometry": {
                "coordinates": [
                    [
                        [
                            117.6274872978156,
                            36.85555099532992
                        ],
                        [
                            117.63178575996352,
                            36.854560437274685
                        ],
                        [
                            117.63616159443262,
                            36.85589493609561
                        ]
                    ],
                    [
                        [
                            117.6273908408046,
                            36.85405305747015
                        ],
                        [
                            117.63103593670729,
                            36.85309687526967
                        ],
                        [
                            117.63617689743779,
                            36.85408745229047
                        ]
                    ]
                ],
                "type": "MultiLineString"
            },
            "type": "Feature",
            "properties": {
                "name":"avc文字测试"
            }
        }
    );
}
init();
window.app = app;

app.setHeightMapSource('https://api.mapbox.com/v4/mapbox.terrain-rgb.json?sku=1010P4cihgpwr&access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY5YzJzczA2ejIzM29hNGQ3emFsMXgifQ.az9JUrQP7klCgD3W-ueILQ');

window.bg = new MapboxSatelliteMaterialProvider("pk.eyJ1IjoidzEyNTk0ODIyIiwiYSI6IkVfSkVqMGMifQ.av8k0fqnXvMFo1ThyV9KMQ");
app.addMaterialProviders(window.bg);

export { APIFormat }