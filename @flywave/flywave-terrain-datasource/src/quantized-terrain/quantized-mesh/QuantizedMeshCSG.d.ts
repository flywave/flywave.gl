import { type GeoBox, type Projection, GeoCoordinates } from "@flywave/flywave-geoutils";
import { BufferGeometry, Vector3 } from "three";
interface QuantizedAreaCliper {
    geoArea: GeoBox | GeoCoordinates[];
    topAltitude: number;
    bottomAltitude: number;
}
declare function clipTerrainMesh(quantizedAreaCliper: QuantizedAreaCliper[], geometry: BufferGeometry, projection: Projection, center: Vector3): BufferGeometry;
export { clipTerrainMesh, type QuantizedAreaCliper };
