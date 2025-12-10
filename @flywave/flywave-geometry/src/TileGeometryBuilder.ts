/* Copyright (C) 2025 flywave.gl contributors */

// SphereTileGeometry.ts - Refactored Version
import {
    type Projection,
    type TilingScheme,
    ConvertWebMercatorY,
    GeoCoordinates,
    geographicStandardTiling,
    TileKey,
    webMercatorTilingScheme,
    mercatorProjection,
    SphereProjection
} from "@flywave/flywave-geoutils";
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from "three";

// Extend Three.js BufferGeometry type with our custom mode property
declare module "three" {
    interface BufferGeometry {
        mode?: GeometryMode;
    }
}


function getEstimatedLevelZeroGeometricError(projection: Projection, gridImageWidth: number, numberOfTilesAtLevelZero: number) {
    return (projection.unitScale * 2 * Math.PI * 0.25) / (gridImageWidth * numberOfTilesAtLevelZero);
}


/**
 * Interface representing the geometry mode configuration
 */
interface GeometryMode {
    is_simple_patch?: boolean;
    materials: Array<{
        indices_uint: BufferAttribute;
        bucket_levels?: number;
        bucket_count?: number;
        bucket_offsets?: Uint16Array;
        number_of_tris?: number;
        source_index?: number;
    }>;
    sources: Array<{
        xyz_coords_float: BufferAttribute;
        uv_coords_float: BufferAttribute;
        webMercatorY?: BufferAttribute;
        mercator_coords_float?: BufferAttribute; // Added: Mercator plane coordinates
        xyz_has_skirt?: any[];
        number_of_verts?: number;
    }>;
    number_of_sources?: number;
    number_of_materials?: number;
    bucket_levels?: number;
    skritMap?: any[];
    skritOffset?: number;
}

/**
 * Class representing transformation between sphere and mercator projections
 */
export class TileTransformation {
    public readonly spherePosition: Vector3;
    public readonly sphereRotation: Matrix4 | false;
    public readonly mercatorPosition: Vector3;
    public readonly mercatorRotation: Matrix4 | false;

    constructor(
        spherePosition: Vector3,
        sphereRotation: Matrix4 | false,
        mercatorPosition: Vector3,
        mercatorRotation: Matrix4 | false
    ) {
        this.spherePosition = spherePosition.clone();
        this.sphereRotation = sphereRotation ? sphereRotation.clone() : false;
        this.mercatorPosition = mercatorPosition.clone();
        this.mercatorRotation = mercatorRotation ? mercatorRotation.clone() : false;
    }

    /**
     * Interpolates between sphere and mercator transformations
     * @param t Interpolation factor (0 = sphere, 1 = mercator)
     * @returns Interpolated transformation
     */
    interpolate(t: number): {
        position: Vector3;
        rotation: Matrix4 | false;
    } {
        // Clamp t to [0, 1]
        t = Math.max(0, Math.min(1, t));

        // Interpolate position
        const position = new Vector3();
        position.lerpVectors(this.spherePosition, this.mercatorPosition, t);

        // Handle rotation interpolation
        let rotation: Matrix4 | false = false;

        if (this.sphereRotation && this.mercatorRotation) {
            // Both rotations available - interpolate between them
            rotation = new Matrix4();
            this.interpolateMatrices(this.sphereRotation, this.mercatorRotation, rotation, t);
        } else if (this.sphereRotation) {
            // Only sphere rotation available
            rotation = t < 0.5 ? this.sphereRotation.clone() : false;
        } else if (this.mercatorRotation) {
            // Only mercator rotation available
            rotation = t > 0.5 ? this.mercatorRotation.clone() : false;
        }
        // If neither rotation is available, rotation remains false

        return { position, rotation };
    }

    /**
     * Interpolates between two matrices
     */
    private interpolateMatrices(
        matrixA: Matrix4,
        matrixB: Matrix4,
        result: Matrix4,
        t: number
    ): void {
        const elementsA = matrixA.elements;
        const elementsB = matrixB.elements;
        const elementsResult = result.elements;

        for (let i = 0; i < 16; i++) {
            elementsResult[i] = elementsA[i] + (elementsB[i] - elementsA[i]) * t;
        }
    }

    /**
     * Creates a clone of this transformation
     */
    clone(): TileTransformation {
        return new TileTransformation(
            this.spherePosition,
            this.sphereRotation,
            this.mercatorPosition,
            this.mercatorRotation
        );
    }

    /**
     * Checks if this transformation equals another
     */
    equals(other: TileTransformation): boolean {
        return (
            this.spherePosition.equals(other.spherePosition) &&
            ((!this.sphereRotation && !other.sphereRotation) ||
                (this.sphereRotation && other.sphereRotation && this.sphereRotation.equals(other.sphereRotation))) &&
            this.mercatorPosition.equals(other.mercatorPosition) &&
            ((!this.mercatorRotation && !other.mercatorRotation) ||
                (this.mercatorRotation && other.mercatorRotation && this.mercatorRotation.equals(other.mercatorRotation)))
        );
    }
}

/**
 * Interface for tile geometry with transformation
 */
export interface TileGeometryWithTransform {
    geometry: BufferGeometry;
    transformation: TileTransformation;
    skirtHeight: number;
}

/**
 * Class for generating and managing sphere tile grids for geographic visualization
 */
class TileGeometryBuilder {
    // Geometry caching
    private readonly geometryCache = new Map<string, BufferGeometry>();
    private readonly models = new Map<string, GeometryMode>();

    // Tile level configuration
    private readonly minDetailLevel: number = 4;
    private readonly maxDetailLevel: number = 8;

    // Skirt configuration
    private readonly simple_skirt_depth: number = 100;

    // Subdivision scheme and projection
    private readonly tileScheme: TilingScheme;
    private readonly uvWebMercator: boolean;

    constructor(tileScheme: TilingScheme, public sphereProjection: SphereProjection) {
        this.tileScheme = tileScheme;
        this.uvWebMercator = this.tileScheme.projection !== webMercatorTilingScheme.projection;
    }

    public getTilingScheme() {
        return this.tileScheme;
    }

    /**
     * Determines the Y-axis orientation for a given tiling scheme.
     */
    isYAxisDown(tilingScheme: TilingScheme = this.getTilingScheme()): boolean {
        const tileKeyRow0 = TileKey.fromRowColumnLevel(0, 0, 1);
        const tileKeyRow1 = TileKey.fromRowColumnLevel(1, 0, 1);

        const geoBoxRow0 = tilingScheme.getGeoBox(tileKeyRow0);
        const geoBoxRow1 = tilingScheme.getGeoBox(tileKeyRow1);

        return geoBoxRow0.north > geoBoxRow1.north;
    }

    /**
     * Computes tangent vectors for a patch on the sphere
     */
    private computePatchTangents(tangentArray: number[], tileKey: TileKey, projection: Projection): void {
        tangentArray.fill(0, 0, 12);

        const geoBox = this.tileScheme.getGeoBox(tileKey);

        const corners = [
            { lat: geoBox.south, lon: geoBox.west },
            { lat: geoBox.south, lon: geoBox.east },
            { lat: geoBox.north, lon: geoBox.west },
            { lat: geoBox.north, lon: geoBox.east }
        ];

        for (let i = 0; i < 4; i++) {
            const geoCoord = GeoCoordinates.fromDegrees(corners[i].lat, corners[i].lon);
            const worldPos = new Vector3();
            projection.projectPoint(geoCoord, worldPos);

            const index = i * 3;
            tangentArray[index] = worldPos.x;
            tangentArray[index + 1] = worldPos.y;
            tangentArray[index + 2] = worldPos.z;
        }
    }

    /**
     * Computes a rotation matrix for a tile
     */
    private computeTileRotationMatrix(
        tileKey: TileKey,
        tilePosition: Vector3,
        projection: Projection,
        childTileKey?: TileKey
    ): Matrix4 | false {
        if (tileKey.level < this.maxDetailLevel) {
            return false;
        }

        const tangentVectors = new Array(12).fill(0);
        let level = tileKey.level;
        let row = tileKey.row;
        let column = tileKey.column;
        let childX = 0;
        let childY = 0;
        let scaleFactor = 1;

        if (childTileKey) {
            const levelDiff = childTileKey.level - tileKey.level;
            const xOffset = (1 << levelDiff) - 1 - (childTileKey.row - (tileKey.row << levelDiff));
            const yOffset = childTileKey.column - (tileKey.column << levelDiff);
            level += levelDiff;
            childY = yOffset;
            childX = (1 << levelDiff) - 1 - xOffset;
            row = (row << levelDiff) + childX;
            column = (column << levelDiff) + childY;
            scaleFactor = 1 / (1 << levelDiff);
            childY *= scaleFactor;
            childX *= scaleFactor;
        }

        const { x: posX, y: posY, z: posZ } = tilePosition;
        this.computePatchTangents(tangentVectors, TileKey.fromRowColumnLevel(row, column, level), projection);

        const matrix = new Matrix4();
        const elements = matrix.elements;

        elements[0] = tangentVectors[0] - posX;
        elements[1] = tangentVectors[1] - posY;
        elements[2] = tangentVectors[2] - posZ;
        elements[3] = scaleFactor;

        elements[4] = tangentVectors[3] - tangentVectors[0];
        elements[5] = tangentVectors[4] - tangentVectors[1];
        elements[6] = tangentVectors[5] - tangentVectors[2];
        elements[7] = 0;

        elements[8] = tangentVectors[6] - posX;
        elements[9] = tangentVectors[7] - posY;
        elements[10] = tangentVectors[8] - posZ;
        elements[11] = childY;

        elements[12] = tangentVectors[9] - tangentVectors[6];
        elements[13] = tangentVectors[10] - tangentVectors[7];
        elements[14] = tangentVectors[11] - tangentVectors[8];
        elements[15] = childX;

        return matrix;
    }

    /**
     * Computes the base position of a tile on the sphere or mercator
     */
    private computeTileBasePosition(tileKey: TileKey, projection: Projection): Vector3 {
        if (tileKey.level < 7) {
            if (tileKey.level == 0) return new Vector3(0, 0, 0);
            return this.createBoundingSpherePosition(tileKey, projection);
        }

        const geoBox = this.tileScheme.getGeoBox(tileKey);
        const center = geoBox.center;
        const worldPosition = new Vector3();
        const geoCoords = GeoCoordinates.fromDegrees(center.latitude, center.longitude);
        const projected = projection.projectPoint(geoCoords);

        worldPosition.x = projected.x;
        worldPosition.y = projected.y;
        worldPosition.z = projected.z;

        return worldPosition;
    }

    private createBoundingSpherePosition(tileKey: TileKey, projection: Projection): Vector3 {
        return projection.projectPoint(
            this.tileScheme.getGeoBox(tileKey).center,
            new Vector3()
        );
    }

    /**
     * Computes vertex normals for a geometry
     */
    private computeVertexNormals(geometry: BufferGeometry, skritMap?: any[]): void {
        const index = geometry.index;
        const positionAttribute = geometry.getAttribute("position");

        if (!positionAttribute) return;

        let normalAttribute = geometry.getAttribute("normal");
        if (!normalAttribute) {
            normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
            geometry.setAttribute("normal", normalAttribute);
        } else {
            for (let i = 0, il = normalAttribute.count; i < il; i++) {
                normalAttribute.setXYZ(i, 0, 0, 0);
            }
        }

        const vertexA = new Vector3();
        const vertexB = new Vector3();
        const vertexC = new Vector3();
        const normalA = new Vector3();
        const normalB = new Vector3();
        const normalC = new Vector3();
        const cb = new Vector3();
        const ab = new Vector3();

        if (index) {
            for (let i = 0, il = index.count; i < il; i += 3) {
                const indexA = index.getX(i + 0);
                const indexB = index.getX(i + 1);
                const indexC = index.getX(i + 2);

                vertexA.fromBufferAttribute(positionAttribute, indexA);
                vertexB.fromBufferAttribute(positionAttribute, indexB);
                vertexC.fromBufferAttribute(positionAttribute, indexC);

                if (skritMap) {
                    if (skritMap[indexA * 3] !== false) {
                        vertexA.fromArray(skritMap[indexA * 3]);
                    }
                    if (skritMap[indexB * 3] !== false) {
                        vertexB.fromArray(skritMap[indexB * 3]);
                    }
                    if (skritMap[indexC * 3] !== false) {
                        vertexC.fromArray(skritMap[indexC * 3]);
                    }
                }

                cb.subVectors(vertexC, vertexB);
                ab.subVectors(vertexA, vertexB);
                cb.cross(ab);

                normalA.fromBufferAttribute(normalAttribute, indexA);
                normalB.fromBufferAttribute(normalAttribute, indexB);
                normalC.fromBufferAttribute(normalAttribute, indexC);

                normalA.add(cb);
                normalB.add(cb);
                normalC.add(cb);

                normalAttribute.setXYZ(indexA, normalA.x, normalA.y, normalA.z);
                normalAttribute.setXYZ(indexB, normalB.x, normalB.y, normalB.z);
                normalAttribute.setXYZ(indexC, normalC.x, normalC.y, normalC.z);
            }
        } else {
            for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
                vertexA.fromBufferAttribute(positionAttribute, i + 0);
                vertexB.fromBufferAttribute(positionAttribute, i + 1);
                vertexC.fromBufferAttribute(positionAttribute, i + 2);

                cb.subVectors(vertexC, vertexB);
                ab.subVectors(vertexA, vertexB);
                cb.cross(ab);

                normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
                normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
                normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
            }
        }

        geometry.normalizeNormals();
        normalAttribute.needsUpdate = true;
    }

    /**
     * Gets the geometry model for a tile
     */
    private generateTileGeometry(tileKey: TileKey): BufferGeometry {
        const row = tileKey.row;
        const level = tileKey.level;
        const { maxDetailLevel, minDetailLevel } = this;

        const subdivision = Math.max(7 - level, 4);
        const tileCount = 1 << level;
        let cacheKey: string;

        let mode: GeometryMode;
        let needsNormalCalculation = false;

        cacheKey = level >= maxDetailLevel ? `simple.patch/${subdivision}` : `${level}/${row}/patch`;

        if (!this.models.has(cacheKey)) {
            if (level >= maxDetailLevel) {
                const size = (1 << subdivision) + 1;


                mode = this.generateSimplePatchWithSkirt(
                    size*2,
                    size*2,
                    0,
                    0,
                    1,
                    1, 
                    true
                );
                mode.is_simple_patch = true;
            } else {
                needsNormalCalculation = true;
                mode =
                    level >= minDetailLevel
                        ? this.generatePatchWithBucketsAndSkirt(
                            subdivision,
                            level,
                            row,
                            0,
                            tileCount,
                            tileCount,
                            true
                        )
                        : this.generatePatchWithBuckets(
                            subdivision,
                            level,
                            row,
                            0,
                            tileCount,
                            tileCount,
                            true
                        );
                mode.is_simple_patch = false;
            }
            this.models.set(cacheKey, mode);
        } else {
            mode = this.models.get(cacheKey)!;
        }

        const geometry = new BufferGeometry();
        geometry.mode = mode;
        geometry.setIndex(mode.materials[0].indices_uint);
        geometry.setAttribute("uv", mode.sources[0].uv_coords_float);
        geometry.setAttribute("position", mode.sources[0].xyz_coords_float);
        geometry.setAttribute("webMercatorY", mode.sources[0].webMercatorY);

        // Added: Set Mercator coordinate attribute
        if (mode.sources[0].mercator_coords_float) {
            geometry.setAttribute("mercatorPosition", mode.sources[0].mercator_coords_float);
        }

        if (needsNormalCalculation) {
            this.computeVertexNormals(geometry, mode.skritMap);
        }

        return geometry;
    }

    /**
     * Gets a tile model with its transformation from cache or creates a new one
     */
    getTileGeometryWithTransform(tileKey: TileKey): TileGeometryWithTransform {
        const row = tileKey.row;
        const level = tileKey.level;
        const subdivision = Math.max(7 - level, 4);

        const cacheKey = level >= this.maxDetailLevel ? `simple.patch/${subdivision}` : `${level}/${row}/patch`;

        if (!this.geometryCache.has(cacheKey)) {
            const model = this.generateTileGeometry(tileKey);
            this.geometryCache.set(cacheKey, model);
        }

        const geometry = this.geometryCache.get(cacheKey)!;

        // Calculate sphere transformation
        const spherePosition = this.computeTileBasePosition(tileKey, this.sphereProjection);
        const sphereRotation = this.computeTileRotationMatrix(tileKey, spherePosition, this.sphereProjection);

        // Calculate Mercator transformation
        const mercatorPosition = this.computeTileBasePosition(tileKey, mercatorProjection);
        const mercatorRotation = this.computeTileRotationMatrix(tileKey, mercatorPosition, mercatorProjection);

        // Create transformation object
        const transformation = new TileTransformation(
            spherePosition,
            sphereRotation,
            mercatorPosition,
            mercatorRotation
        );

        let skirtHeight = Math.min((getEstimatedLevelZeroGeometricError(
            this.sphereProjection,
            (1 << subdivision) + 1,
            this.tileScheme.subdivisionScheme.getSubdivisionX(0)
        ) / (1 << tileKey.level)) * 4.0, 1000);

        return {
            geometry,
            transformation,
            skirtHeight
        };
    }

    /**
     * Generates a simple patch geometry with skirt
     */
    private generateSimplePatchWithSkirt(
        segmentsX: number,
        segmentsY: number,
        offsetX: number,
        offsetY: number,
        paddingX: number,
        paddingY: number, 
        centered: boolean,
        skirtOffset?: number
    ): GeometryMode {
        let width = segmentsX;
        let height = segmentsY;
        const xOffset = offsetX;
        const yOffset = offsetY;
        const xPadding = paddingX;
        const yPadding = paddingY;
        const isCentered = centered;

        if (skirtOffset !== 0) {
            width += 2;
            height += 2;
        }

        const vertexCount = width * height;
        const triangleCount = (width - 1) * (height - 1) * 2 - 8;

        const geometryMode: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: vertexCount,
                    xyz_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(vertexCount * 2), 2),
                    webMercatorY: new BufferAttribute(new Float32Array(vertexCount), 1),
                    mercator_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3) // Added Mercator coordinates
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: triangleCount,
                    indices_uint: new BufferAttribute(new Uint16Array(triangleCount * 3), 1)
                }
            ]
        };

        const source = geometryMode.sources[0];
        const positionArray = source.xyz_coords_float.array;
        const uvArray = source.uv_coords_float.array;
        const webMercatorY = source.webMercatorY.array;
        const mercatorArray = source.mercator_coords_float!.array;
        const indexArray = geometryMode.materials[0].indices_uint.array;

        let positionIndex = 0;
        let uvIndex = 0;
        let webMercatorYIndex = 0;
        let mercatorIndex = 0;
        let triangleIndex = 0;

        let centerOffsetX: number, centerOffsetY: number, centerOffsetZ: number;

        if (isCentered && (xPadding > 1 || yPadding > 1)) {
            centerOffsetX = 0.5;
            centerOffsetY = 0.5;
            centerOffsetZ = 0;
        } else {
            centerOffsetX = 0;
            centerOffsetY = 0;
            centerOffsetZ = 0;
        }

        const skirtValue = -1;

        const isYAxisDown = this.isYAxisDown(this.getTilingScheme());
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++, positionIndex += 3, uvIndex += 2, webMercatorYIndex++, mercatorIndex += 3) {
                let zValue = 0;
                let u = (x - 1) / (width - 3);
                let v = (y - 1) / (height - 3);

                if (u < 0) {
                    u = 0;
                    zValue = skirtValue;
                } else if (u > 1) {
                    u = 1;
                    zValue = skirtValue;
                }

                if (v < 0) {
                    v = 0;
                    zValue = skirtValue;
                } else if (v > 1) {
                    v = 1;
                    zValue = skirtValue;
                }

                const normalizedU = (yOffset + u) / yPadding;
                const normalizedV = (xOffset + v) / xPadding;

                // Sphere coordinates and Mercator coordinates use the same planar coordinates (because simple patch is planar)?
                positionArray[positionIndex] = normalizedU - centerOffsetX;
                positionArray[positionIndex + 1] = normalizedV - centerOffsetY;
                positionArray[positionIndex + 2] = zValue - centerOffsetZ;

                mercatorArray[mercatorIndex] = normalizedU - centerOffsetX;
                mercatorArray[mercatorIndex + 1] = normalizedV - centerOffsetY;
                mercatorArray[mercatorIndex + 2] = zValue - centerOffsetZ;

                uvArray[uvIndex] = u;
                uvArray[uvIndex + 1] = v;

                webMercatorY[webMercatorYIndex] = isYAxisDown ? v : 1 - v;

                if (
                    x > 0 &&
                    y > 0 &&
                    ((x - 1) % (width - 2) !== 0 || (y - 1) % (height - 2) !== 0)
                ) {
                    indexArray[triangleIndex] = (y - 1) * width + (x - 1);
                    indexArray[triangleIndex + 1] = (y - 1) * width + x;
                    indexArray[triangleIndex + 2] = y * width + (x - 1);
                    indexArray[triangleIndex + 3] = (y - 1) * width + x;
                    indexArray[triangleIndex + 4] = y * width + x;
                    indexArray[triangleIndex + 5] = y * width + (x - 1);
                    triangleIndex += 6;
                }
            }
        }

        return geometryMode;
    }

    /**
     * Generates a patch with buckets and skirt
     */
    private generatePatchWithBucketsAndSkirt(
        subdivision: number,
        level: number,
        row: number,
        columnOffset: number,
        countX: number,
        countY: number,
        centered: boolean
    ): GeometryMode {
        const detailLevel = subdivision;
        const tileRow = row;
        const column = columnOffset;
        const tileCountX = countX;
        const tileCountY = countY;
        const isCentered = centered;

        let segments = (1 << detailLevel) + 1;
        let height = segments;
        segments += 2;
        height += 2;

        const bucketCount = 1 << (detailLevel << 1);
        const vertexCount = segments * height;
        const triangleCount = (segments - 1) * (height - 1) * 2;

        const geometryMode: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: vertexCount,
                    xyz_has_skirt: [],
                    xyz_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(vertexCount * 2), 2),
                    webMercatorY: new BufferAttribute(new Float32Array(vertexCount), 1),
                    mercator_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3) // Added Mercator coordinates
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: triangleCount,
                    indices_uint: new BufferAttribute(new Uint16Array(triangleCount * 3), 1),
                    bucket_levels: detailLevel,
                    bucket_count: bucketCount,
                    bucket_offsets: new Uint16Array(bucketCount + 1)
                }
            ],
            bucket_levels: detailLevel,
            skritMap: [],
            skritOffset: 0.2 / tileCountX
        };

        const source = geometryMode.sources[0];
        const positionArray = source.xyz_coords_float.array;
        const uvArray = source.uv_coords_float.array;
        const webMercatorY = source.webMercatorY.array;
        const mercatorArray = source.mercator_coords_float!.array;

        const indexArray = geometryMode.materials[0].indices_uint.array;
        const bucketOffsets = geometryMode.materials[0].bucket_offsets;

        let positionIndex = 0;
        let uvIndex = 0;
        let webMercatorYIndex = 0;
        let mercatorIndex = 0;
        let bucketIndex = 0;

        let centerX: number, centerY: number, centerZ: number;
        let mercatorCenterX: number, mercatorCenterY: number, mercatorCenterZ: number;

        const box = this.tileScheme.getGeoBox(new TileKey(tileRow, column, level));

        const convertWebMercatorY = new ConvertWebMercatorY(
            box.southWest.latitudeInRadians,
            box.northEast.latitudeInRadians
        );

        if (isCentered && (tileCountX > 1 || tileCountY > 1)) {
            const centerGeo = box.center;

            // Sphere center
            const centerPos = this.sphereProjection.projectPoint(centerGeo, new Vector3());
            centerX = centerPos.x;
            centerY = centerPos.y;
            centerZ = centerPos.z;

            // Mercator center?
            const mercatorCenterPos = mercatorProjection.projectPoint(centerGeo, new Vector3());
            mercatorCenterX = mercatorCenterPos.x;
            mercatorCenterY = mercatorCenterPos.y;
            mercatorCenterZ = mercatorCenterPos.z;
        } else {
            centerX = centerY = centerZ = 0;
            mercatorCenterX = mercatorCenterY = mercatorCenterZ = 0;
        }

        // Initialize bucket offsets
        for (let i = 0; i < bucketCount; i++) {
            bucketOffsets[i] = 0;
        }

        // Calculate triangle count for each bucket
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < segments; x++) {
                if (x > 0 && y > 0) {
                    let bucketX = x - 2;
                    if (bucketX < 0) bucketX = 0;
                    else if (bucketX > segments - 4) bucketX = segments - 4;

                    let bucketY = height - 2 - y;
                    if (bucketY < 0) bucketY = 0;
                    else if (bucketY > height - 4) bucketY = height - 4;

                    // Calculate morton code
                    bucketX = (bucketX & 255) + ((bucketX & 65280) << 8);
                    bucketX = (bucketX & 252645135) + ((bucketX & 4042322160) << 4);
                    bucketX = (bucketX & 858993459) + ((bucketX & 3435973836) << 2);
                    bucketX = (bucketX & 1431655765) + ((bucketX & 2863311530) << 1);

                    bucketY = (bucketY & 255) + ((bucketY & 65280) << 8);
                    bucketY = (bucketY & 252645135) + ((bucketY & 4042322160) << 4);
                    bucketY = (bucketY & 858993459) + ((bucketY & 3435973836) << 2);
                    bucketY = (bucketY & 1431655765) + ((bucketY & 2863311530) << 1);

                    bucketIndex = (bucketX << 1) + bucketY;
                    bucketOffsets[bucketIndex] += 2;
                }
            }
        }

        // Calculate bucket offset?
        let currentOffset = 0;
        let totalTriangles = 0;
        for (let i = 0; i < bucketCount; i++) {
            const trianglesInBucket = bucketOffsets[i];
            totalTriangles += currentOffset;
            bucketOffsets[i] = totalTriangles + trianglesInBucket;
            currentOffset = trianglesInBucket;
        }

        totalTriangles += currentOffset;
        bucketOffsets[bucketCount] = totalTriangles;

        const skirtOffset = geometryMode.skritOffset!;
        const skritMap = geometryMode.skritMap!;

        const subLevel = 1 << detailLevel;

        const isYAxisDown = this.isYAxisDown(this.getTilingScheme());

        // Generate vertices and triangles
        for (let y = 0; y < height; y++) {
            for (
                let x = 0;
                x < segments;
                x++, positionIndex += 3, uvIndex += 2, webMercatorYIndex++, mercatorIndex += 3
            ) {
                let zValue = 0;
                let u = (x - 1) / (segments - 3);
                let v = (y - 1) / (height - 3);

                let tileColumn = column * subLevel + (x - 1);
                let tileRow = row * subLevel + (y - 1);

                // Handle boundary
                if (u < 0) {
                    u = 0;
                    tileColumn = column * subLevel;
                    zValue = skirtOffset;
                } else if (u > 1) {
                    u = 1;
                    tileColumn = column * subLevel + x - 2;
                    zValue = skirtOffset;
                }

                if (v < 0) {
                    v = 0;
                    tileRow = row * subLevel;
                    zValue = skirtOffset;
                } else if (v > 1) {
                    v = 1;
                    tileRow = row * subLevel + y - 2;
                    zValue = skirtOffset;
                }

                const geoPos = this.tileScheme.getTileKeyGeoOrigin(
                    new TileKey(tileRow, tileColumn, detailLevel + level)
                ) as GeoCoordinates;
                geoPos.altitude = -zValue * this.sphereProjection.unitScale;

                // Sphere coordinates
                const worldPos = this.sphereProjection.projectPoint(geoPos, new Vector3());

                // Mercator coordinates?
                const mercatorPos = mercatorProjection.projectPoint(geoPos, new Vector3());

                // Store Sphere coordinates
                positionArray[positionIndex] = worldPos.x - centerX;
                positionArray[positionIndex + 1] = worldPos.y - centerY;
                positionArray[positionIndex + 2] = worldPos.z - centerZ;

                // Store Mercator coordinates?
                mercatorArray[mercatorIndex] = mercatorPos.x - mercatorCenterX;
                mercatorArray[mercatorIndex + 1] = mercatorPos.y - mercatorCenterY;
                mercatorArray[mercatorIndex + 2] = mercatorPos.z - mercatorCenterZ;

                webMercatorY[webMercatorYIndex] = this.uvWebMercator
                    ? isYAxisDown
                        ? convertWebMercatorY.convert(geoPos.latitudeInRadians)
                        : 1 - convertWebMercatorY.convert(geoPos.latitudeInRadians)
                    : isYAxisDown
                        ? 1 - v
                        : v;

                // Store original position to skritMap
                {
                    geoPos.altitude = 0;
                    const worldPos = this.sphereProjection.projectPoint(geoPos, new Vector3());
                    skritMap[positionIndex] =
                        zValue !== 0
                            ? [worldPos.x - centerX, worldPos.y - centerY, worldPos.z - centerZ]
                            : false;
                }

                // Store UV coordinates
                uvArray[uvIndex] = u;
                uvArray[uvIndex + 1] = isYAxisDown ? 1 - v : v;

                // Create triangles and assign to buckets
                if (x > 0 && y > 0) {
                    let bucketX = x - 2;
                    if (bucketX < 0) bucketX = 0;
                    else if (bucketX > segments - 4) bucketX = segments - 4;

                    let bucketY = height - 2 - y;
                    if (bucketY < 0) bucketY = 0;
                    else if (bucketY > height - 4) bucketY = height - 4;

                    // Calculate morton code
                    bucketX = (bucketX & 255) + ((bucketX & 65280) << 8);
                    bucketX = (bucketX & 252645135) + ((bucketX & 4042322160) << 4);
                    bucketX = (bucketX & 858993459) + ((bucketX & 3435973836) << 2);
                    bucketX = (bucketX & 1431655765) + ((bucketX & 2863311530) << 1);

                    bucketY = (bucketY & 255) + ((bucketY & 65280) << 8);
                    bucketY = (bucketY & 252645135) + ((bucketY & 4042322160) << 4);
                    bucketY = (bucketY & 858993459) + ((bucketY & 3435973836) << 2);
                    bucketY = (bucketY & 1431655765) + ((bucketY & 2863311530) << 1);

                    bucketIndex = (bucketX << 1) + bucketY;
                    bucketOffsets[bucketIndex] -= 2;
                    const triangleOffset = bucketOffsets[bucketIndex] * 3;

                    if (isYAxisDown) {
                        indexArray[triangleOffset] = y * segments + (x - 1);
                        indexArray[triangleOffset + 1] = (y - 1) * segments + x;
                        indexArray[triangleOffset + 2] = (y - 1) * segments + (x - 1);
                        indexArray[triangleOffset + 3] = y * segments + (x - 1);
                        indexArray[triangleOffset + 4] = y * segments + x;
                        indexArray[triangleOffset + 5] = (y - 1) * segments + x;
                    } else {
                        indexArray[triangleOffset] = (y - 1) * segments + (x - 1);
                        indexArray[triangleOffset + 1] = (y - 1) * segments + x;
                        indexArray[triangleOffset + 2] = y * segments + (x - 1);
                        indexArray[triangleOffset + 3] = (y - 1) * segments + x;
                        indexArray[triangleOffset + 4] = y * segments + x;
                        indexArray[triangleOffset + 5] = y * segments + (x - 1);
                    }
                }
            }
        }

        return geometryMode;
    }

    /**
     * Generates a patch with buckets
     */
    private generatePatchWithBuckets(
        subdivision: number,
        level: number,
        row: number,
        columnOffset: number,
        countX: number,
        countY: number,
        centered: boolean,
        offset: number = 0
    ): GeometryMode {
        const detailLevel = subdivision;
        const tileRow = row;
        const column = columnOffset;
        const tileCountX = countX;
        const tileCountY = countY;
        const isCentered = centered;

        const segments = (1 << detailLevel) + 1;
        const height = segments;
        const bucketCount = 1 << (detailLevel << 1);
        const vertexCount = segments * height;
        const triangleCount = (segments - 1) * (height - 1) * 2;

        const geometryMode: GeometryMode = {
            number_of_sources: 1,
            sources: [
                {
                    number_of_verts: vertexCount,
                    xyz_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3),
                    uv_coords_float: new BufferAttribute(new Float32Array(vertexCount * 2), 2),
                    webMercatorY: new BufferAttribute(new Float32Array(vertexCount), 1),
                    mercator_coords_float: new BufferAttribute(new Float32Array(vertexCount * 3), 3) // Added Mercator coordinates
                }
            ],
            number_of_materials: 1,
            materials: [
                {
                    source_index: 0,
                    number_of_tris: triangleCount,
                    indices_uint: new BufferAttribute(new Uint16Array(triangleCount * 3), 1),
                    bucket_levels: detailLevel,
                    bucket_count: bucketCount,
                    bucket_offsets: new Uint16Array(bucketCount + 1)
                }
            ],
            bucket_levels: detailLevel
        };

        const source = geometryMode.sources[0];
        const positionArray = source.xyz_coords_float.array;
        const uvArray = source.uv_coords_float.array;
        const webMercatorYArray = source.webMercatorY.array;
        const mercatorArray = source.mercator_coords_float!.array;

        const indexArray = geometryMode.materials[0].indices_uint.array;
        const bucketOffsets = geometryMode.materials[0].bucket_offsets;

        let positionIndex = 0;
        let uvIndex = 0;
        let webMercatorYIndex = 0;
        let mercatorIndex = 0;
        let bucketIndex = 0;

        let centerX = 0;
        let centerY = 0;
        let centerZ = 0;
        let mercatorCenterX = 0;
        let mercatorCenterY = 0;
        let mercatorCenterZ = 0;

        const geoBox = this.tileScheme.getGeoBox(new TileKey(tileRow, column, level));

        const convertWebMercatorY = new ConvertWebMercatorY(
            geoBox.southWest.latitudeInRadians,
            geoBox.northEast.latitudeInRadians
        );

        if (isCentered && (tileCountX > 1 || tileCountY > 1)) {
            const centerGeo = geoBox.center;

            // Sphere center
            const centerPos = this.sphereProjection.projectPoint(centerGeo, new Vector3());
            centerX = centerPos.x;
            centerY = centerPos.y;
            centerZ = centerPos.z;

            // Mercator center?
            const mercatorCenterPos = mercatorProjection.projectPoint(centerGeo, new Vector3());
            mercatorCenterX = mercatorCenterPos.x;
            mercatorCenterY = mercatorCenterPos.y;
            mercatorCenterZ = mercatorCenterPos.z;
        }

        const isYAxisDown = this.isYAxisDown(this.getTilingScheme());

        // Generate vertices
        for (let y = 0; y < height; y++) {
            for (
                let x = 0;
                x < segments;
                x++, positionIndex += 3, uvIndex += 2, webMercatorYIndex++, mercatorIndex += 3
            ) {
                const u = x / (segments - 1);
                const v = isYAxisDown ? 1 - y / (height - 1) : y / (height - 1);

                const subLevel = 1 << detailLevel;

                // Project to world coordinates
                const geoPos = this.tileScheme.getTileKeyGeoOrigin(
                    new TileKey(tileRow * subLevel + y, column * subLevel + x, detailLevel + level)
                ) as GeoCoordinates;

                // Sphere coordinates
                const worldPos = this.sphereProjection.projectPoint(geoPos, new Vector3());

                // Mercator coordinates?
                const mercatorPos = mercatorProjection.projectPoint(geoPos, new Vector3());

                // Apply optional offset along the normal direction
                if (offset !== 0) {
                    const normal = this.sphereProjection.surfaceNormal(worldPos);
                    worldPos.x += normal.x * offset;
                    worldPos.y += normal.y * offset;
                    worldPos.z += normal.z * offset;
                }

                // Store sphere position relative to center
                positionArray[positionIndex] = worldPos.x - centerX;
                positionArray[positionIndex + 1] = worldPos.y - centerY;
                positionArray[positionIndex + 2] = worldPos.z - centerZ;

                // Store mercator position relative to center
                mercatorArray[mercatorIndex] = mercatorPos.x - mercatorCenterX;
                mercatorArray[mercatorIndex + 1] = mercatorPos.y - mercatorCenterY;
                mercatorArray[mercatorIndex + 2] = mercatorPos.z - mercatorCenterZ;

                // Store UV coordinates
                uvArray[uvIndex] = u;
                uvArray[uvIndex + 1] = v;

                // Store webMercatorY
                webMercatorYArray[webMercatorYIndex] = this.uvWebMercator
                    ? isYAxisDown
                        ? convertWebMercatorY.convert(geoPos.latitudeInRadians)
                        : 1 - convertWebMercatorY.convert(geoPos.latitudeInRadians)
                    : v;

                // Create triangles and assign to buckets
                if (x > 0 && y > 0) {
                    let bucketX = x - 1;
                    let bucketY = height - 1 - y;

                    // Compute morton code for bucket
                    bucketX = (bucketX & 255) + ((bucketX & 65280) << 8);
                    bucketX = (bucketX & 252645135) + ((bucketX & 4042322160) << 4);
                    bucketX = (bucketX & 858993459) + ((bucketX & 3435973836) << 2);
                    bucketX = (bucketX & 1431655765) + ((bucketX & 2863311530) << 1);

                    bucketY = (bucketY & 255) + ((bucketY & 65280) << 8);
                    bucketY = (bucketY & 252645135) + ((bucketY & 4042322160) << 4);
                    bucketY = (bucketY & 858993459) + ((bucketY & 3435973836) << 2);
                    bucketY = (bucketY & 1431655765) + ((bucketY & 2863311530) << 1);

                    bucketIndex = ((bucketX << 1) + bucketY) * 6;

                    if (isYAxisDown) {
                        // Create two triangles (one quad)
                        indexArray[bucketIndex] = y * segments + (x - 1);
                        indexArray[bucketIndex + 1] = (y - 1) * segments + x;
                        indexArray[bucketIndex + 2] = (y - 1) * segments + (x - 1);
                        indexArray[bucketIndex + 3] = y * segments + (x - 1);
                        indexArray[bucketIndex + 4] = y * segments + x;
                        indexArray[bucketIndex + 5] = (y - 1) * segments + x;
                    } else {
                        indexArray[bucketIndex] = (y - 1) * segments + (x - 1);
                        indexArray[bucketIndex + 1] = (y - 1) * segments + x;
                        indexArray[bucketIndex + 2] = y * segments + (x - 1);
                        indexArray[bucketIndex + 3] = (y - 1) * segments + x;
                        indexArray[bucketIndex + 4] = y * segments + x;
                        indexArray[bucketIndex + 5] = y * segments + (x - 1);
                    }
                }
            }
        }

        // Initialize bucket offsets
        bucketOffsets[0] = 0;
        for (let i = 0; i < bucketCount; i++) {
            bucketOffsets[i + 1] = bucketOffsets[i] + 2;
        }

        return geometryMode;
    }
}

export class WebMercatorTileGeometryBuilder extends TileGeometryBuilder {
    constructor(sphereProjection: SphereProjection) {
        super(webMercatorTilingScheme, sphereProjection);
    }
}

export class GeographicStandardTilingTileGeometryBuilder extends TileGeometryBuilder {
    constructor(sphereProjection: SphereProjection) {
        super(geographicStandardTiling, sphereProjection);
    }
}

export type {
    TileGeometryBuilder
}
