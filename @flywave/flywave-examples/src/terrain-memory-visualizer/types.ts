interface TileKeyLike {
    level: number;
    row: number;
    column: number;
    mortonCode(encoding?: unknown): string;
}

interface GeoBoxLike {
    southWest: { latitude: number; longitude: number };
    northEast: { latitude: number; longitude: number };
}

interface TileSnapshot {
    tileKey: TileKeyLike;
    geoBox: GeoBoxLike;
    hasMesh: boolean;
    isVisible: boolean;
    isUsed: boolean;
    bytes: number;
    mortonId: string;
}

interface TileEvent {
    frame: number;
    type: "create" | "reuse" | "evict";
    tileKey: TileKeyLike;
    geoBox: GeoBoxLike;
    bytes: number;
}

interface CameraInfo {
    latitude: number;
    longitude: number;
    altitude: number;
    heading: number;
    tilt: number;
    frustumCorners: { lat: number; lng: number }[];
}

interface SnapshotResult {
    tiles: Map<string, TileSnapshot>;
    events: TileEvent[];
    camera: CameraInfo;
    stats: {
        totalCached: number;
        withMesh: number;
        visible: number;
        evictedThisFrame: number;
        createdThisFrame: number;
    };
}

export type { TileKeyLike, GeoBoxLike, TileSnapshot, TileEvent, CameraInfo, SnapshotResult };
