import * as THREE from "three";
import { Feature, GeoCoordinates } from "@flywave/flywave.gl";
interface Projection {
    projectPoint(coord: GeoCoordinates, target?: THREE.Vector3): THREE.Vector3;
}
export declare class PolygonMesh extends THREE.Mesh {
    private feature;
    private projection;
    constructor(feature: Feature, projection: Projection, material: THREE.Material);
    updateFeature(feature: Feature): void;
    getFeature(): Feature;
    private updateGeometry;
    dispose(): void;
}
export {};
