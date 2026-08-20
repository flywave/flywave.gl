import { MapView } from '@flywave/flywave-mapview';
export declare function latLngToECEF(lat: number, lng: number, radius?: number): {
    x: number;
    y: number;
    z: number;
};
export declare function ecefToLatLng(x: number, y: number, z: number): {
    lat: number;
    lng: number;
};
export declare function globeTransitionWeight(zoom: number): number;
export declare class MBGlobeController {
    private m_mapView;
    constructor(m_mapView: MapView);
    get isGlobe(): boolean;
    enableGlobe(): void;
    enableMercator(): void;
    setProjectionForZoom(zoom: number, threshold?: number): void;
    dispose(): void;
}
//# sourceMappingURL=MBGlobeRenderer.d.ts.map