export type ProjectionName = 'mercator' | 'equirectangular' | 'albers' | 'lambertConicConic' | 'equalEarth' | 'naturalEarth' | 'winkelTripel' | 'globe';
export interface ProjectionConfig {
    name: ProjectionName;
    center?: [number, number];
    parallels?: [number, number];
}
export interface ProjectedPoint {
    x: number;
    y: number;
}
export declare function project(lng: number, lat: number, config: ProjectionConfig): ProjectedPoint;
export declare function unproject(x: number, y: number, config: ProjectionConfig): {
    lng: number;
    lat: number;
};
export declare function parseProjection(styleProjection: any): ProjectionConfig;
//# sourceMappingURL=MBProjection.d.ts.map