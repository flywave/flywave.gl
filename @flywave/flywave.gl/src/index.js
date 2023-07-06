import Application from "./application";
export { Application };

//objects
import GroundHole from "./objects/ground-hole";
import SurfacePolygon from "./objects/surface-polygon";

export { GroundHole, SurfacePolygon };

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
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { APIFormat, VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

export { SnapshotGltf, MapViewEventNames, TransferManager, APIFormat, VectorTileDataSource };

import { randomPointInPolygon, polygonOutlinePoints, lineChunkPoints } from "./util/random-points";
import lineStringChunk from "./util/line-chunk";
import { makeMapTheme } from "./theme/make-theme";

export {
    makeMapTheme,
    randomPointInPolygon,
    polygonOutlinePoints,
    lineChunkPoints,
    lineStringChunk
};

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
};

//mapview
import { SphericalGeometrySubdivisionModifier } from "@flywave/flywave-geometry/lib/SphericalGeometrySubdivisionModifier";
export { SphericalGeometrySubdivisionModifier };
export * from "@flywave/flywave-geoutils";
