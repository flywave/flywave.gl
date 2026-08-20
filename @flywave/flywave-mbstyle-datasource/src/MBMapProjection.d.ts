import { Projection, ProjectionType } from '@flywave/flywave-geoutils';
import { GeoBox } from '@flywave/flywave-geoutils';
import { GeoCoordinates } from '@flywave/flywave-geoutils';
import { Box3Like } from '@flywave/flywave-geoutils';
import { OrientedBox3Like } from '@flywave/flywave-geoutils';
import { Vector3Like } from '@flywave/flywave-geoutils';
import { ProjectionConfig } from './MBProjection';
export declare class MBMapProjection extends Projection {
    private m_config;
    private m_circumference;
    readonly mbCustomProjection = true;
    constructor(config: ProjectionConfig);
    get type(): ProjectionType;
    worldExtent<Bounds extends Box3Like>(minElevation: number, maxElevation: number, result?: Bounds): Bounds;
    projectPoint<WorldCoordinates extends Vector3Like>(geoPoint: any, result?: WorldCoordinates): WorldCoordinates;
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates;
    unprojectAltitude(worldPoint: Vector3Like): number;
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(geoBox: GeoBox, result?: WorldBoundingBox): WorldBoundingBox;
    unprojectBox(worldBox: Box3Like): GeoBox;
    getScaleFactor(_worldPoint: Vector3Like): number;
    surfaceNormal(_worldPoint: Vector3Like, normal?: any): any;
    groundDistance(worldPoint: Vector3Like): number;
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like;
}
export declare function createProjection(config: ProjectionConfig): Projection;
//# sourceMappingURL=MBMapProjection.d.ts.map