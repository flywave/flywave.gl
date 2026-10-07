/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FlatTheme,
    type Style,
    type StyleSet,
    type Technique,
    type Theme,
    StandardGeometryKind
} from "@flywave/flywave-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@flywave/flywave-datasource-protocol/index-decoder";
import {
    type TileKey,
    type TilingScheme,
    GeoCoordinates,
    MercatorConstants,
    polarTilingScheme,
    TransverseMercatorUtils
} from "@flywave/flywave-geoutils";
import { LoggerManager } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { type DataSourceOptions, DataSource } from "./DataSource";
import { createMaterial } from "./DecodedTileHelpers";
import { MapObjectAdapter } from "./MapObjectAdapter";
import { ThemeLoader } from "./ThemeLoader";
import { Tile } from "./Tile";

const logger = LoggerManager.instance.create("PolarTileDataSource");

/**
 * Bundled polar cap imagery shipped in `@flywave/flywave-map-theme/resources/polar`
 * (and copied to `resources/polar` of the aggregate package dist). NASA Blue Marble
 * shaded relief with bathymetry, public domain. Polar-aspect discs: pole at the
 * center, Web Mercator latitude limit (~85.0511°) at the rim, oriented like
 * EPSG:3413 (north: prime meridian pointing down) / EPSG:3031 (south: pointing up).
 */
const DEFAULT_NORTH_POLE_TEXTURE_URL = "resources/polar/north_pole.jpg";
const DEFAULT_SOUTH_POLE_TEXTURE_URL = "resources/polar/south_pole.jpg";

/**
 * Fallback styles used when the map theme does not define a `polar` styleSet (e.g.
 * minimal inline themes), so the caps always render. The `standard` (lit) technique
 * matches the terrain materials' response to scene lighting; colors mirror the
 * definitions of the bundled globe theme and are untinted once the bundled
 * imagery loads.
 */
const DEFAULT_POLAR_STYLES: Style[] = [
    {
        when: ["==", ["get", "kind"], "north_pole"],
        technique: "standard",
        attr: { color: "#436981", renderOrder: 5 },
        styleSet: "polar"
    },
    {
        when: ["==", ["get", "kind"], "south_pole"],
        technique: "standard",
        attr: { color: "#87959a", renderOrder: 5 },
        styleSet: "polar"
    }
];

export interface PolarTileDataSourceOptions extends DataSourceOptions {
    /**
     * Optional level offset of regular tiles from reference datasource to align tiles to.
     * Default is -1.
     */
    geometryLevelOffset?: number;

    /**
     * Enable debug display for generated tiles.
     * Default is false.
     */
    debugTiles?: boolean;
}

interface TechniqueEntry {
    technique: Technique;
    material: THREE.Material;
}

/**
 * {@link DataSource} providing geometry for poles
 */
export class PolarTileDataSource extends DataSource {
    private readonly m_tilingScheme: TilingScheme = polarTilingScheme;
    private readonly m_maxLatitude = THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE);
    private m_geometryLevelOffset: number;
    private readonly m_debugTiles: boolean;

    private m_styleSetEvaluator?: StyleSetEvaluator;
    private m_northPoleEntry?: TechniqueEntry;
    private m_southPoleEntry?: TechniqueEntry;
    private m_disposed: boolean = false;

    private m_northPoleTexture?: Promise<THREE.Texture>;
    private m_southPoleTexture?: Promise<THREE.Texture>;
    private readonly m_textureLoader = new THREE.TextureLoader();

    constructor({
        name = "polar",
        styleSetName = "polar",
        minDataLevel,
        maxDataLevel,
        minDisplayLevel,
        maxDisplayLevel,
        storageLevelOffset = -2,
        geometryLevelOffset = 1,
        debugTiles = false
    }: PolarTileDataSourceOptions) {
        super({
            name,
            styleSetName,
            minDataLevel,
            maxDataLevel,
            minDisplayLevel,
            maxDisplayLevel,
            storageLevelOffset
        });

        this.m_geometryLevelOffset = geometryLevelOffset;
        this.m_debugTiles = debugTiles;
        this.cacheable = true;
        this.enablePicking = false;
    }

    /** @override */
    dispose() {
        this.m_disposed = true;
        for (const texturePromise of [this.m_northPoleTexture, this.m_southPoleTexture]) {
            texturePromise
                ?.then(texture => {
                    texture.dispose();
                })
                .catch(() => {
                    /* texture never loaded */
                });
        }
        this.m_northPoleTexture = undefined;
        this.m_southPoleTexture = undefined;
        if (this.m_northPoleEntry) {
            this.m_northPoleEntry.material.dispose();
            delete this.m_northPoleEntry;
        }
        if (this.m_southPoleEntry) {
            this.m_southPoleEntry.material.dispose();
            delete this.m_southPoleEntry;
        }
        if (this.m_styleSetEvaluator) {
            delete this.m_styleSetEvaluator;
        }
    }

    createTechiqueEntry(kind: string): TechniqueEntry | undefined {
        if (!this.m_styleSetEvaluator) {
            return undefined;
        }
        const env = new MapEnv({
            $geometryType: "polygon",
            $layer: "earth",
            kind
        });
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);

        if (techniques.length === 0) {
            return undefined;
        }
        const technique = techniques[0];
        const material = createMaterial(this.mapView.capabilities, {
            technique,
            env: this.mapView.env
        });
        material.depthTest = true;
        if (!material) {
            return undefined;
        }
        return { material, technique };
    }

    /** @override */
    async setTheme(theme: Theme | FlatTheme): Promise<void> {
        // Seems superfluent, but the call to  ThemeLoader.load will resolve extends etc.
        theme = await ThemeLoader.load(theme);
        let styleSet: StyleSet | undefined;

        if (this.styleSetName !== undefined && theme.styles !== undefined) {
            styleSet = theme.styles[this.styleSetName];
        }

        if (styleSet === undefined || styleSet.length === 0) {
            styleSet = DEFAULT_POLAR_STYLES;
        }

        this.m_styleSetEvaluator = new StyleSetEvaluator({
            styleSet: styleSet ?? [],
            definitions: theme.definitions,
            priorities: theme.priorities,
            labelPriorities: theme.labelPriorities
        });

        this.m_northPoleEntry = this.createTechiqueEntry("north_pole");
        this.m_southPoleEntry = this.createTechiqueEntry("south_pole");

        this.applyPoleTexture(this.m_northPoleEntry, true);
        this.applyPoleTexture(this.m_southPoleEntry, false);

        this.mapView.markTilesDirty(this);
    }

    /**
     * Kicks off (once) and attaches the bundled pole imagery texture to the technique
     * material. The theme fill color is untinted only when the imagery actually shows;
     * if the texture fails to load, the flat theme color stays as fallback.
     */
    private applyPoleTexture(entry: TechniqueEntry | undefined, isNorth: boolean): void {
        if (entry === undefined) {
            return;
        }
        const material = entry.material as THREE.MeshBasicMaterial;
        this.getOrCreatePoleTexture(isNorth)
            .then(texture => {
                // Skip if the datasource was disposed or the theme (and thus the entry)
                // was replaced while loading.
                if (
                    this.m_disposed ||
                    (isNorth ? entry !== this.m_northPoleEntry : entry !== this.m_southPoleEntry)
                ) {
                    return;
                }
                // Untint the theme fill color only once imagery is actually showing,
                // so a failed load keeps the flat theme color as fallback.
                material.color?.set("#ffffff");
                material.map = texture;
                material.needsUpdate = true;
                this.mapView.markTilesDirty(this);
                this.mapView.update();
            })
            .catch(error => {
                logger.warn(`Failed to load polar cap texture: ${error}`);
            });
    }

    private getOrCreatePoleTexture(isNorth: boolean): Promise<THREE.Texture> {
        let texturePromise = isNorth ? this.m_northPoleTexture : this.m_southPoleTexture;
        if (texturePromise === undefined) {
            const url = this.resolveResourceUrl(
                isNorth ? DEFAULT_NORTH_POLE_TEXTURE_URL : DEFAULT_SOUTH_POLE_TEXTURE_URL
            );
            texturePromise = this.m_textureLoader.loadAsync(url).then(texture => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                return texture;
            });
            if (isNorth) {
                this.m_northPoleTexture = texturePromise;
            } else {
                this.m_southPoleTexture = texturePromise;
            }
        }
        return texturePromise;
    }

    /**
     * Resolves a bundled resource path the same way as the aggregate package's
     * `mapAssetsUriResolver`: via the MapView uriResolver when one is injected,
     * else `window.FLYWAVE_BASE_URL`, else page-relative.
     */
    private resolveResourceUrl(path: string): string {
        const resolver = this.mapView.uriResolver;
        if (resolver !== undefined) {
            return resolver.resolveUri(path);
        }
        const baseUrl =
            typeof window !== "undefined"
                ? (window as { FLYWAVE_BASE_URL?: string }).FLYWAVE_BASE_URL
                : undefined;
        if (baseUrl) {
            const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
            return base + path;
        }
        return path;
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (zoomLevel !== tileKey.level || tileKey.level < 1) {
            return false;
        }

        const { north, south } = this.m_tilingScheme.getGeoBox(tileKey);

        return north > this.m_maxLatitude || south < -this.m_maxLatitude;
    }

    /** @override */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean {
        if (zoomLevel <= tileKey.level) {
            return false;
        }

        const { north, south } = this.m_tilingScheme.getGeoBox(tileKey);

        return north > this.m_maxLatitude || south < -this.m_maxLatitude;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);

        this.createTileGeometry(tile);

        return tile;
    }

    get geometryLevelOffset(): number {
        return this.m_geometryLevelOffset;
    }

    set geometryLevelOffset(geometryLevelOffset: number) {
        this.m_geometryLevelOffset = geometryLevelOffset;
    }

    private intersectEdge(latitude: number, a: GeoCoordinates, b: GeoCoordinates): GeoCoordinates {
        const latA = a.latitude;
        const latB = b.latitude;

        let lonA = a.longitude;
        let lonB = b.longitude;

        if (Math.abs(latA) === 90) {
            lonA = lonB;
        }
        if (Math.abs(latB) === 90) {
            lonB = lonA;
        }
        const deltaLat = latB - latA;
        const deltaLon = lonB - lonA;
        const scale = (latitude - latA) / deltaLat;

        return new GeoCoordinates(latitude, lonA + deltaLon * scale, 0);
    }

    private createTileGeometry(tile: Tile): void {
        const { north, south } = tile.geoBox;

        const isNorthPole = north > 0 && south >= 0;
        const techniqueEntry = isNorthPole ? this.m_northPoleEntry : this.m_southPoleEntry;
        if (techniqueEntry === undefined) {
            tile.forceHasGeometry(true);
            return;
        }

        const srcProjection = this.m_tilingScheme.projection;
        const dstProjection = this.projection;

        const maxLat = this.m_maxLatitude;
        const poleLat = isNorthPole ? maxLat : -maxLat;

        const box = this.m_tilingScheme.boundingBoxGenerator.getWorldBox(tile.tileKey);

        const pBL = srcProjection.unprojectPoint(new THREE.Vector3(box.min.x, box.min.y, 0));
        const pBR = srcProjection.unprojectPoint(new THREE.Vector3(box.max.x, box.min.y, 0));
        const pTR = srcProjection.unprojectPoint(new THREE.Vector3(box.max.x, box.max.y, 0));
        const pTL = srcProjection.unprojectPoint(new THREE.Vector3(box.min.x, box.max.y, 0));

        let points: GeoCoordinates[];
        let needsGeometryCut = false;

        // special case where tile contains half of the hemisphere
        if (tile.tileKey.level === 1) {
            const isLeftHalf = box.min.x === 0;

            const poleX = isLeftHalf ? box.max.x : box.min.x;
            const poleY = (box.max.y + box.min.y) / 2;
            const pPole = srcProjection.unprojectPoint(new THREE.Vector3(poleX, poleY, 0));

            // coordinates are not used, needed for right position
            const pXX = isLeftHalf ? pBL : pBR;

            points = isNorthPole
                ? isLeftHalf
                    ? [pPole, pTR, pXX, pBR]
                    : [pPole, pBL, pXX, pTL]
                : isLeftHalf
                ? [pPole, pBR, pXX, pTR]
                : [pPole, pTL, pXX, pBL];

            needsGeometryCut = true;
        } else {
            // ccw for north, cw for south
            points = isNorthPole ? [pBL, pBR, pTR, pTL] : [pBL, pTL, pTR, pBR];

            const lats = points.map(p => p.latitude);
            const lmax = Math.max(...lats);
            const lmin = Math.min(...lats);

            const isAllPointsOut = isNorthPole ? lmax < poleLat : lmin > poleLat;
            if (isAllPointsOut) {
                return;
            }

            const isSomePointsOut = isNorthPole ? lmin < poleLat : lmax > poleLat;
            needsGeometryCut = isSomePointsOut;

            if (needsGeometryCut) {
                const nearest = lats.indexOf(isNorthPole ? lmax : lmin);
                if (nearest !== 0) {
                    for (let i = 0; i < nearest; i++) {
                        points.push(points.shift() as GeoCoordinates);
                    }
                }
            }
        }

        if (needsGeometryCut) {
            const centerX = (box.min.x + box.max.x) / 2;
            const centerY = (box.min.y + box.max.y) / 2;
            const center = srcProjection.unprojectPoint(new THREE.Vector3(centerX, centerY, 0));

            TransverseMercatorUtils.alignLongitude(points, center);

            // points aligned as follows:
            // a - nearest to the pole, always in
            // b - next to nearest
            // c - farthes from the pole, always out
            // d - prev from nearest
            const a = points[0];
            const b = points[1];
            const c = points[2];
            const d = points[3];

            const inPointB = Math.abs(b.latitude) >= maxLat;
            const inPointD = Math.abs(d.latitude) >= maxLat;

            const cutStart = inPointB
                ? this.intersectEdge(poleLat, b, c)
                : this.intersectEdge(poleLat, a, b);

            const cutEnd = inPointD
                ? this.intersectEdge(poleLat, d, c)
                : this.intersectEdge(poleLat, a, d);

            points.splice(inPointB ? 2 : 1, 4, cutStart);

            const level = tile.tileKey.level - this.storageLevelOffset + this.m_geometryLevelOffset;
            const subdivisions = 1 << Math.max(0, level);
            const step = 360 / subdivisions;

            const cutIndexStart = Math.floor((cutStart.longitude + 180) / step);
            const cutIndexEnd = Math.ceil((cutEnd.longitude + 180) / step);

            for (let i = cutIndexStart + 1; i < cutIndexEnd; i++) {
                points.push(new GeoCoordinates(poleLat, i * step - 180, 0));
            }

            points.push(cutEnd);
            if (inPointD) {
                points.push(d);
            }
        }

        const geometry = new THREE.BufferGeometry();

        const normals: number[] = [];
        const vertices: THREE.Vector3[] = points.map(point => {
            const projected = dstProjection.projectPoint(point, new THREE.Vector3());
            // Radial normal (captured before removing the tile center offset) so lit
            // standard materials shade the cap like the sphere it closes.
            const normal = projected.clone().normalize();
            normals.push(normal.x, normal.y, normal.z);
            projected.sub(tile.center);
            return projected;
        });
        geometry.setFromPoints(vertices);
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));

        // Disc UV mapping over the cap: r=0 at the pole, r=1 at the Web Mercator
        // latitude limit. Oriented like EPSG:3413 (north: prime meridian down, 90°E
        // right) and EPSG:3031 (south: prime meridian up, 90°E right), so imagery
        // exported from GIBS/Worldview polar views maps 1:1. Derived from lon/lat
        // (not tile-local coords) to stay continuous across tiles.
        const capSpan = 90 - maxLat;
        const uvs: number[] = [];
        for (const point of points) {
            const radius = THREE.MathUtils.clamp((90 - Math.abs(point.latitude)) / capSpan, 0, 1);
            const angle = THREE.MathUtils.degToRad(point.longitude);
            const dx = Math.sin(angle) * radius * 0.5;
            const dy = Math.cos(angle) * radius * 0.5;
            if (isNorthPole) {
                uvs.push(0.5 + dx, 0.5 - dy);
            } else {
                uvs.push(0.5 + dx, 0.5 + dy);
            }
        }
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

        const indices: number[] = [];
        for (let i = 1; i < vertices.length - 1; i++) {
            isNorthPole ? indices.push(0, i, i + 1) : indices.push(0, i + 1, i);
        }
        geometry.setIndex(indices);

        const mesh = new THREE.Mesh(geometry, techniqueEntry.material);
        mesh.userData = {
            dataSource: this.name,
            tileKey: tile.tileKey
        };

        if (this.m_debugTiles) {
            const color = Math.round(Math.abs(Math.sin(11 * tile.tileKey.mortonCode())) * 0xffffff);
            mesh.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });

            tile.objects.push(
                new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true }))
            );
        }

        MapObjectAdapter.create(mesh, {
            dataSource: this,
            technique: techniqueEntry.technique,
            kind: [isNorthPole ? StandardGeometryKind.Water : StandardGeometryKind.Background]
        });

        tile.objects.push(mesh);
    }
}
