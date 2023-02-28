import { MaterialProvider } from "../material-provider";


export class OpenStreetMapMaterialProvider extends MaterialProvider {
    levelRange = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

    constructor(url) {
        super({ url: `https://a.tile.opentopomap.org/{z}/{x}/{y}.png` });
    }
}