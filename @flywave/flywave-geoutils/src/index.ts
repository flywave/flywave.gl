/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility classes for working with geospatial data.
 *
 * @remarks
 *
 * @packageDocumentation
 */

export * from "./coordinates/GeoBox";
export * from "./coordinates/GeoBoxExtentLike";
export * from "./coordinates/GeoCoordinatesLike";
export * from "./coordinates/GeoCoordinates";
export * from "./coordinates/GeoPointLike";
export * from "./coordinates/GeoPolygonLike";
export * from "./coordinates/GeoPolygon";
export * from "./coordinates/LatLngLike";
export * from "./projection/EarthConstants";
export * from "./projection/EastNorthUpToFixedFrame";
export * from "./projection/EquirectangularProjection";
export * from "./projection/IdentityProjection";
export * from "./projection/Projection";
export * from "./projection/MercatorProjection";
export * from "./projection/TransverseMercatorProjection";
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
export * from "./tiling/HereTilingScheme";
export * from "./tiling/WebMercatorTilingScheme";
export * from "./tiling/MercatorTilingScheme";
export * from "./tiling/PolarTilingScheme";
export * from "./math/Vector2Like";
export * from "./math/Vector3Like";
export * from "./math/Box3Like";
export * from "./math/OrientedBox3Like";
export * from "./math/BoundingSphere";
export * from "./math/MathUtils";
export * from "./math/TransformLike";
export * from "./math/OrientedBox3";
export * from "./math/AxisAlignedBox3";
export * from "./math/intersections";
export * from "./math/Plane";
