
import Application from "./application";
export { Application };

//topo creators
import TopoServerPipe from "./topo/server-pipe";
import TopoPrism from "./topo/prism";
import TopoCrossPoint from "./topo/cross-point";
import TopoDefault from "./topo/default";
import TopoDefaultLine from "./topo/default-line";
import TopoCustomTopoDefault from "./topo/custom-point";
import TopoDefaultPoint from "./topo/default-point";
import TopoDefaultPolygon from "./topo/default-polygon";
import TopoMultiPoint from "./topo/multi-point";
import TopoCatenary from "./topo/catenary";
import TopoBoard from "./topo/board-point";
import TopoDecal from "./topo/decal-point";
import TopoDecalLine from "./topo/decal-line";
import TopoDefaultMulitiLine from "./topo/default-multi-line";
import TopoSweepPath from "./topo/sweep-path";
import TopoSymbolPath from "./topo/symbol-path";
import TopoGroundHole from "./topo/ground-hole";
import TopoSurfacePolygon from "./topo/surface-polygon";
import TopoParticle from "./topo/particle";

export {
    TopoServerPipe, TopoPrism, TopoCrossPoint,
    TopoDefault, TopoDefaultLine, TopoCustomTopoDefault,
    TopoDefaultPoint, TopoDefaultPolygon, TopoMultiPoint,
    TopoCatenary, TopoBoard, TopoDecal, TopoDecalLine, TopoDefaultMulitiLine,
    TopoSweepPath, TopoSymbolPath, TopoGroundHole, TopoSurfacePolygon,
    TopoParticle
};

//objects
import Line2 from "./objects/line2";
import Water from "./objects/water";
import DefaultLine from "./objects/default-line";
export { Line2, Water, DefaultLine };

//loader
import GLTFLoader from "./loaders/gltf-loader";

export { GLTFLoader };

//image layers
import {
    MapboxSatelliteMaterialProvider,
    BingMaterialProvider,
    OpenStreetMapMaterialProvider,
    HarpApiMaterialProvider,
    MapboxMvtMaterialProvider,
    MaterialProvider
} from "./terrain-source";

export {
    MapboxSatelliteMaterialProvider,
    BingMaterialProvider,
    OpenStreetMapMaterialProvider,
    HarpApiMaterialProvider,
    MapboxMvtMaterialProvider,
    MaterialProvider
};

//utils
import { SnapshotGltf } from "./util/snapshot";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import {
    APIFormat,
} from "@flywave/flywave-vectortile-datasource";

export {
    SnapshotGltf,
    GeoCoordinates,
    MapViewEventNames,
    TransferManager,
    APIFormat
};

import { randomPointInPolygon, polygonOutlinePoints, lineChunkPoints } from "./util/random-points";
import lineStringChunk from "./util/line-chunk";
import PickRangeHandler from "./pick-range-handler";

export { PickRangeHandler,randomPointInPolygon, polygonOutlinePoints, lineChunkPoints, lineStringChunk };


import config from "./config";
export default {

    setGlobeUrlVariable(key, value) {
        config.GLOBEVARIABLE[key] = value;
    },

    get anchorInfoUrl(): ?string {
        return config.ANCHOR_INFO_URL;
    },

    set anchorInfoUrl(url: string) {
        config.ANCHOR_INFO_URL = url;
    },

    get topoMeshUrl(): ?string {
        return config.TOPO_MESH_URL;
    },

    set topoMeshUrl(url: string) {
        config.TOPO_MESH_URL = url;
    },

    get topoTextureUrl(): ?string {
        return config.TOPO_TEXTURE_URL;
    },

    set resourceMeshUrl(url: string) {
        config.RESOUCE_MESH_URL = url;
    },

    get resourceMeshUrl() {
        return config.RESOUCE_MESH_URL;
    },

    set topoTextureUrl(url: string) {
        config.TOPO_TEXTURE_URL = url;
    },

    set baseUrl(url: string) {
        config.BASE_PATH = url;
    },

    get decoderUrl(): ?string {
        return config.DECODER_URL;
    }
}