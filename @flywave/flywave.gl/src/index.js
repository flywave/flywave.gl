import Application from "./application";
export { Application };
import {
    MapView
} from "@flywave/flywave-mapview";

export { MapView }

//camera control
import { EarthFreeControl } from "./map-controls/earth-free-control";
export { EarthFreeControl };

//objects
import GroundHole from "./objects/ground-hole";
import SurfacePolygon from "./objects/surface-polygon";

export { GroundHole, SurfacePolygon };

//image layers
export * from "./terrain-source";

import { TileDataSource } from "@flywave/flywave-mapview-decoder";

import { TiltViewClipPlanesEvaluator } from "@flywave/flywave-mapview";

export { TiltViewClipPlanesEvaluator };
//utils
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { APIFormat, VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

export { MapViewEventNames, TransferManager, APIFormat, VectorTileDataSource, TileDataSource };

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

//utils
import { makeGeoBox } from "./util/make-geobox-mesh";

export { makeGeoBox };

THREE.Vector3.prototype.fromBufferAttribute=function (attribute,index){
    this.x = attribute.getX( index );
    this.y = attribute.getY( index );
    this.z = attribute.getZ( index )||0;

    return this;
}
