let three = require("./util/three.b.js");
self.THREE = three;

let QuantizedMeshTileDecoderService = require("./terrain-source/tin-terrain/tile-decoder-worker");
let CsgStratumDecoderService = require("./terrain-source/stratum/csg-worker");
let DemTileDecoderService = require("./terrain-source/height-map/dem/dem-decoder-worker");
let {
    GeoJsonTilerService,
    VectorTileDecoderService
} = require("@flywave/flywave-vectortile-datasource/index-worker");
// import ObjectDecoderService from "./objects/decoder/decoder";

VectorTileDecoderService.start();
GeoJsonTilerService.start();
QuantizedMeshTileDecoderService.default.start();
DemTileDecoderService.default.start();
CsgStratumDecoderService.default.start();
// ObjectDecoderService.start();

//Following code is only needed for datasource_custom example.
// snippet:custom_datasource_example_custom_decoder_service_start.ts
// CustomDecoderService.start();
// end:custom_datasource_example_custom_decoder_service_start.ts
