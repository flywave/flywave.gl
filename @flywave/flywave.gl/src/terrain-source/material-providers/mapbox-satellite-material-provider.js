import { MaterialProvider } from "../material-provider";

export class MapboxSatelliteMaterialProvider extends MaterialProvider {
  levelRange = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  ];
  constructor(token) {
    super({url:`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${token}`});
  }
}
