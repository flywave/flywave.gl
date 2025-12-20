/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Functionality needed to render a map.
 *
 * @remarks
 *
 * This module provides all the functionality needed to display a map, including:
 * - Map view management ({@link MapView})
 * - Data source handling ({@link DataSource})
 * - Camera utilities ({@link CameraUtils})
 * - Clipping planes evaluation ({@link ClipPlanesEvaluator})
 * - Text rendering capabilities
 * - Map anchors for overlaying objects
 * - Picking and interaction handling
 * - Theme management
 * - Tile management and rendering
 *
 * @packageDocumentation
 */

export * from "./AnimatedExtrusionHandler";
export * from "./BaseTileLoader";
export * from "./BoundsGenerator";
export * from "./CameraMovementDetector";
export * from "./CameraUtils";
export * from "./ClipPlanesEvaluator";
export * from "./ColorCache";
export * from "./composing";
export * from "./ConcurrentDecoderFacade";
export * from "./ConcurrentTilerFacade";
export * from "./copyrights/CopyrightElementHandler";
export * from "./copyrights/CopyrightInfo";
export * from "./copyrights/CopyrightProvider";
export * from "./copyrights/CopyrightCoverageProvider";
export * from "./copyrights/UrlCopyrightProvider";
export * from "./DataSource";
export * from "./EventDispatcher";
export * from "./FixedClipPlanesEvaluator";
export * from "./FovCalculation";
export * from "./PolarTileDataSource";
export * from "./DecodedTileHelpers";
export * from "./DisplacementMap";
export * from "./ElevationProvider";
export * from "./ElevationRangeSource";
export * from "./ITileLoader";
export * from "./image/Image";
export * from "./image/ImageCache";
export * from "./image/MapViewImageCache";
export * from "./MapAnchors";
export * from "./MapView";
export * from "./MapViewAtmosphere";
export * from "./MapViewFog";
export * from "./MapViewPoints";
export * from "./PickHandler";
export * from "./poi/PoiManager";
export * from "./poi/PoiTableManager";
export * from "./Statistics";
export * from "./text/TextElement";
export * from "./text/TextElementsRenderer";
export * from "./text/TextStyleCache";
export * from "./TextureLoader";
export * from "./ThemeLoader";
export * from "./Tile";
export * from "./geometry/TileDataAccessor";
export * from "./geometry/TileGeometry";
export * from "./geometry/AddGroundPlane";
export * from "./Utils";
export * from "./VisibleTileSet";
export * from "./WorkerBasedDecoder";
export * from "./WorkerBasedTiler";
export * from "./workers/WorkerLoader";
export * from "./MapViewEnvironment";
export * from "./MapViewThemeManager";
export * from "./BackgroundDataSource";
export { TileKeyEntry } from "./FrustumIntersection";
