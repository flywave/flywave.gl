
import Application from "./application";
export * from "./feature_datasource";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { SnapshotGltf } from "./util/snapshot";
import { randomPointInPolygon, polygonOutlinePoints,lineChunkPoints } from "./util/random-points";
import TopoWater from "./objects/water";
import TopoDefaultLine from "./objects/default-line";
import lineStringChunk from "./util/line-chunk";

import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TransferManager } from "@flywave/flywave-transfer-manager";

import {
    APIFormat,
} from "@flywave/flywave-vectortile-datasource";

import GLTFLoader from "./loaders/gltf-loader";
import {
    MapboxSatelliteMaterialProvider,
    BingMaterialProvider,
    OpenStreetMapMaterialProvider,
    HarpApiMaterialProvider,
    MapboxMvtMaterialProvider,
    MaterialProvider
} from "./terrain-source";

import config from "./config";
 

export default {

    Application,

    TopoWater,
    TopoDefaultLine,
    
    TransferManager,
    GeoCoordinates,
    APIFormat,
    GLTFLoader,
    SnapshotGltf, 
    randomPointInPolygon,
    polygonOutlinePoints,

    lineChunkPoints,
    lineStringChunk, 

    MaterialProvider,
    MapboxSatelliteMaterialProvider,
    BingMaterialProvider,
    OpenStreetMapMaterialProvider,
    HarpApiMaterialProvider,
    MapboxMvtMaterialProvider,

    config,

    MapViewEventNames,


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