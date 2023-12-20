import "./util/import_threejs";

import QuantizedMeshTileDecoderService from "./terrain-source/tin-terrain/tile-decoder-worker";
import CsgStratumDecoderService from "./terrain-source/stratum/csg-worker";
import DemTileDecoderService from "./terrain-source/height-map/dem/dem-decoder-worker";
import {
  GeoJsonTilerService,
  VectorTileDecoderService,
} from "@flywave/flywave-vectortile-datasource/index-worker";
// import ObjectDecoderService from "./objects/decoder/decoder";

VectorTileDecoderService.start();
GeoJsonTilerService.start();
QuantizedMeshTileDecoderService.start();
DemTileDecoderService.start();
CsgStratumDecoderService.start();
// ObjectDecoderService.start();

//Following code is only needed for datasource_custom example.
// snippet:custom_datasource_example_custom_decoder_service_start.ts
// CustomDecoderService.start();
// end:custom_datasource_example_custom_decoder_service_start.ts
