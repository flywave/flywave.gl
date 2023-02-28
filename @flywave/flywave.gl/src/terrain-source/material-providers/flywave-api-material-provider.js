import {
    APIFormat,
    AuthenticationMethod,
} from "@flywave/flywave-vectortile-datasource";
import VectorMaterialProvider from "../vector-material-provider";

class HarpApiMaterialProvider extends VectorMaterialProvider {
    constructor(application) {
        super({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxDataLevel: 17,
            dataSourceOrder: 0,
            addGroundPlane: false,
            authenticationCode: "J0IJdYzKDYS3nHVDDEWETIqK3nAcxqW42vz7xeSq61M",
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
        },application)
    }

    makeMaterial(tile) {
        return new THREE.MeshLambertMaterial({ map: tile.material, wireframe: false, depthTest: true,transparent:true });
    }
}

export default HarpApiMaterialProvider;