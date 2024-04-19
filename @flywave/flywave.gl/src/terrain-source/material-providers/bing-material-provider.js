import { MaterialProvider } from "../material-provider"; 
 
export class BingMaterialProvider extends MaterialProvider {
    levelRange = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];   

    constructor(){
        super({url:"https://ecn.t${server}.tiles.virtualearth.net/tiles/a{quadKey}.jpeg?n=z&g=11640"})
    }

    getTileTextureUrl(tileKey) { 
        const quadKey = tileKey.toQuadKey();
        return this.options.url.
            replace("{quadKey}", quadKey);
    }
}