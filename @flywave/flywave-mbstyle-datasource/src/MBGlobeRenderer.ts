import { MapView } from '@flywave/flywave-mapview';
import { sphereProjection, mercatorProjection, ProjectionType } from '@flywave/flywave-geoutils';

export function latLngToECEF(lat: number, lng: number, radius: number = 6378137): { x: number; y: number; z: number } {
    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;
    return {
        x: radius * Math.cos(phi) * Math.cos(lambda),
        y: radius * Math.sin(phi),
        z: radius * Math.cos(phi) * Math.sin(lambda),
    };
}

export function ecefToLatLng(x: number, y: number, z: number): { lat: number; lng: number } {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-6) return { lat: 0, lng: 0 };
    const lat = Math.asin(y / r) * 180 / Math.PI;
    const lng = Math.atan2(z, x) * 180 / Math.PI;
    return { lat, lng };
}

export function globeTransitionWeight(zoom: number): number {
    const t = Math.max(0, Math.min(1, (zoom - 5) / 1));
    return t * t * (3 - 2 * t);
}

export class MBGlobeController {
    constructor(private m_mapView: MapView) {}

    get isGlobe(): boolean {
        return this.m_mapView.projection?.type === ProjectionType.Spherical;
    }

    enableGlobe(): void {
        if (!this.isGlobe) {
            (this.m_mapView as any).projection = sphereProjection;
        }
    }

    enableMercator(): void {
        if (this.isGlobe) {
            (this.m_mapView as any).projection = mercatorProjection;
        }
    }

    setProjectionForZoom(zoom: number, threshold: number = 5): void {
        if (zoom < threshold) {
            this.enableGlobe();
        } else {
            this.enableMercator();
        }
    }

    dispose(): void {}
}
