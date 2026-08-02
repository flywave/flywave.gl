import { Projection, ProjectionType } from '@flywave/flywave-geoutils';
import { GeoBox } from '@flywave/flywave-geoutils';
import { GeoCoordinates } from '@flywave/flywave-geoutils';
import { Box3Like } from '@flywave/flywave-geoutils';
import { OrientedBox3Like } from '@flywave/flywave-geoutils';
import { Vector3Like } from '@flywave/flywave-geoutils';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { project, unproject, ProjectionConfig } from './MBProjection';

const degToRad = (d: number) => (d * Math.PI) / 180;
const radToDeg = (r: number) => (r * 180) / Math.PI;

export class MBMapProjection extends Projection {
    private m_config: ProjectionConfig;
    private m_circumference: number;
    /**
     * Marker consulted by `MBTileDataEmitter.tile2world` to decide whether
     * tile-local points must be re-projected through `projectPoint` (Albers,
     * EqualEarth, etc.) or whether they can stay in plain Web-Mercator world
     * coordinates (the engine reprojects mercator→sphere itself for globe).
     */
    readonly mbCustomProjection = true;

    constructor(config: ProjectionConfig) {
        super(EarthConstants.EQUATORIAL_CIRCUMFERENCE);
        this.m_config = config;
        this.m_circumference = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
    }

    get type(): ProjectionType {
        return ProjectionType.Planar;
    }

    worldExtent<Bounds extends Box3Like>(
        minElevation: number,
        maxElevation: number,
        result?: Bounds,
    ): Bounds {
        const ext = this.m_circumference;
        if (!result) {
            return {
                min: { x: 0, y: 0, z: minElevation },
                max: { x: ext, y: ext, z: maxElevation },
            } as Bounds;
        }
        (result as any).min.x = 0;
        (result as any).min.y = 0;
        (result as any).min.z = minElevation;
        (result as any).max.x = ext;
        (result as any).max.y = ext;
        (result as any).max.z = maxElevation;
        return result;
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: any,
        result?: WorldCoordinates,
    ): WorldCoordinates {
        const lng = geoPoint.longitude ?? geoPoint.lng ?? 0;
        const lat = geoPoint.latitude ?? geoPoint.lat ?? 0;
        const alt = geoPoint.altitude ?? 0;

        const p = project(lng, lat, this.m_config);
        const worldX = p.x * this.m_circumference;
        const worldY = (1 - p.y) * this.m_circumference;

        if (!result) {
            return { x: worldX, y: worldY, z: alt } as WorldCoordinates;
        }
        result.x = worldX;
        result.y = worldY;
        (result as any).z = alt;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const px = worldPoint.x / this.m_circumference;
        const py = 1 - worldPoint.y / this.m_circumference;
        const result = unproject(px, py, this.m_config);
        return new GeoCoordinates(result.lat, result.lng, (worldPoint as any).z ?? 0);
    }

    unprojectAltitude(worldPoint: Vector3Like): number {
        return (worldPoint as any).z ?? 0;
    }

    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox,
    ): WorldBoundingBox {
        const sw = this.projectPoint({ longitude: geoBox.southWest.longitude, latitude: geoBox.southWest.latitude });
        const ne = this.projectPoint({ longitude: geoBox.northEast.longitude, latitude: geoBox.northEast.latitude });
        if (!result) {
            return {
                min: { x: Math.min(sw.x, ne.x), y: Math.min(sw.y, ne.y), z: 0 },
                max: { x: Math.max(sw.x, ne.x), y: Math.max(sw.y, ne.y), z: 0 },
            } as WorldBoundingBox;
        }
        (result as any).min.x = Math.min(sw.x, ne.x);
        (result as any).min.y = Math.min(sw.y, ne.y);
        (result as any).max.x = Math.max(sw.x, ne.x);
        (result as any).max.y = Math.max(sw.y, ne.y);
        return result;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const sw = this.unprojectPoint(worldBox.min);
        const ne = this.unprojectPoint(worldBox.max);
        return new GeoBox(sw, ne);
    }

    getScaleFactor(_worldPoint: Vector3Like): number {
        return 1.0;
    }

    surfaceNormal(_worldPoint: Vector3Like, normal?: any): any {
        if (!normal) return { x: 0, y: 0, z: 1 };
        normal.x = 0; normal.y = 0; normal.z = 1;
        return normal;
    }

    groundDistance(worldPoint: Vector3Like): number {
        return (worldPoint as any).z ?? 0;
    }

    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        (worldPoint as any).z = 0;
        return worldPoint;
    }
}

export function createProjection(config: ProjectionConfig): Projection {
    if (config.name === 'globe') {
        const { sphereProjection } = require('@flywave/flywave-geoutils');
        return sphereProjection as Projection;
    }
    if (config.name === 'mercator') {
        const { mercatorProjection } = require('@flywave/flywave-geoutils');
        return mercatorProjection as Projection;
    }
    return new MBMapProjection(config);
}
