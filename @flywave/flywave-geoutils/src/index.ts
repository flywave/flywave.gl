/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Utility classes for working with geospatial data.
 *
 * @remarks
 *
 * This module provides utility classes for working with geospatial data, including:
 * - Geospatial coordinates and shapes ({@link GeoCoordinates}, {@link GeoBox}, {@link GeoPolygon})
 * - Various map projections ({@link MercatorProjection}, {@link SphereProjection}, {@link EquirectangularProjection})
 * - Tiling schemes and tile management ({@link WebMercatorTilingScheme}, {@link TileKey})
 * - Mathematical utilities for geospatial calculations
 *
 * @packageDocumentation
 */

export * from "./coordinates/GeoCoordinates";
export * from "./coordinates/GeoCoordinatesLike";
export * from "./coordinates/GeoCoordLike";
export * from "./coordinates/GeoPointLike";
export * from "./coordinates/GeoBox";
export * from "./coordinates/GeoBoxExtentLike";
export * from "./coordinates/GeoPolygon";
export * from "./coordinates/GeoPolygonLike";
export * from "./coordinates/GeoLineString";
export * from "./coordinates/LatLngLike";
export * from "./projection/EarthConstants";
export * from "./projection/EastNorthUpToFixedFrame";
export * from "./projection/EquirectangularProjection";
export * from "./projection/IdentityProjection";
export * from "./projection/Projection";
export * from "./projection/MercatorProjection";
export * from "./projection/TransverseMercatorProjection";
export * from "./projection/SphericalEarthProjection";
export * from "./projection/SphereProjection";
export * from "./projection/EllipsoidProjection";
export * from "./tiling/FlatTileBoundingBoxGenerator";
export * from "./tiling/HalfQuadTreeSubdivisionScheme";
export * from "./tiling/QuadTreeSubdivisionScheme";
export * from "./tiling/QuadTree";
export * from "./tiling/SubTiles";
export * from "./tiling/SubdivisionScheme";
export * from "./tiling/TileKey";
export * from "./tiling/TileKeyUtils";
export * from "./tiling/TileTreeTraverse";
export * from "./tiling/TilingScheme";
export * from "./tiling/GeographicStandardTiling";
export * from "./tiling/WebMercatorTilingScheme";
export * from "./tiling/MercatorTilingScheme";
export * from "./tiling/PolarTilingScheme";
export * from "./math/Vector2Like";
export * from "./math/Vector3Like";
export * from "./math/Box3Like";
export * from "./math/OrientedBox3Like";
export * from "./math/OrientedBoxHelper";
export * from "./math/BoundingSphere";
// export * from "./math/MathUtils";
export * from "./math/TransformLike";
export * from "./math/OrientedBox3";
export * from "./math/AxisAlignedBox3";
export * from "./math/intersections";
export * from "./math/Plane";
export * from "./math/ConvertWebMercatorY";
export * from "./math/ConvertEllipsoidToProjection";
export * from "./math/FrustumGeoAreaTester";
export * from "./math/FrustumTester";
export * from "./math/TileAvailability";
