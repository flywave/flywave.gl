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
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { APIFormat, VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

export { MapViewEventNames, TransferManager, APIFormat, VectorTileDataSource };

import { makeMapTheme } from "./make-theme";

export { makeMapTheme };

import config from "./config";

export default {
    setGlobeUrlVariable(key, value) {
        config.GLOBEVARIABLE[key] = value;
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
