/* Copyright (C) 2025 flywave.gl contributors */

import {
    type EnvironmentMapDefinition,
    type EquirectangularEnvironmentMapDefinition,
    type FlatTheme,
    type ImageDefinitions,
    type ImageTexture,
    type PoiTableRef,
    type Theme,
    PostEffects
} from "@flywave/flywave-datasource-protocol";
import { type UriResolver, LoggerManager } from "@flywave/flywave-utils";
import isEqual from "lodash.isequal";
import * as THREE from "three";

import { MapViewImageCache } from "./image/MapViewImageCache";
import { type MapView } from "./MapView";
import { ThemeLoader } from "./ThemeLoader";

const logger = LoggerManager.instance.create("MapViewThemeManager");

/**
 * Class handling theme updates for MapView
 */
export class MapViewThemeManager {
    private readonly m_imageCache: MapViewImageCache;
    private m_updatePromise: Promise<void> | undefined;
    private m_abortControllers: AbortController[] = [];
    private readonly m_theme: Theme = {};

    constructor(private readonly m_mapView: MapView, private readonly m_uriResolver?: UriResolver) {
        this.m_imageCache = new MapViewImageCache();
    }

    async setTheme(theme: Theme | FlatTheme | string): Promise<Theme> {
        if (this.isUpdating()) {
            logger.warn("Formerly set Theme is still updating, update will be canceled");
            this.cancelThemeUpdate();
        }

        this.m_updatePromise = this.loadTheme(theme).then(async theme => {
            await this.updateTheme(theme);
        });
        await this.m_updatePromise;
        this.m_updatePromise = undefined;
        return this.m_theme;
    }

    async getTheme(): Promise<Theme> {
        if (this.isUpdating()) {
            await this.m_updatePromise;
        }
        return this.m_theme;
    }

    isUpdating(): boolean {
        return this.m_updatePromise !== undefined;
    }

    /**
     * @deprecated
     * A helper for the deprecated MapView.theme getter, remove when
     * after deprecation
     */
    get theme() {
        return this.isUpdating() ? {} : this.m_theme;
    }

    private async loadTheme(theme: Theme | string | FlatTheme): Promise<Theme> {
        let loadedTheme: Theme = {};
        if (typeof theme === "string" || !ThemeLoader.isThemeLoaded(theme)) {
            try {
                loadedTheme = await ThemeLoader.load(theme, {
                    uriResolver: this.m_uriResolver,
                    signal: this.createAbortController().signal
                });
            } catch (error) {
                if (error.name === "AbortError") {
                    logger.warn(`theme loading was aborted due to: ${error}`);
                } else {
                    logger.error(`failed to load theme: ${error}`);
                }
            }
        } else {
            loadedTheme = theme as Theme;
        }
        return loadedTheme;
    }

    async updateTheme(theme: Theme): Promise<void> {
        const environment = this.m_mapView.sceneEnvironment;
        // Fog and sky.
        this.m_theme.fog = theme.fog;
        this.m_theme.sky = theme.sky;
        environment.updateSkyBackground(theme.sky);
        environment.fog.reset(theme.fog);

        this.m_theme.lights = theme.lights;
        environment.updateLighting(theme.lights);

        this.m_theme.celestia = theme.celestia;
        environment.updateCelestia(theme.celestia);

        if (theme.enableShadows || theme.celestia?.sunCastShadow) {
            this.m_mapView.shadowsEnabled = true;
        } else {
            this.m_mapView.shadowsEnabled = false;
        }

        // Clear color.
        this.m_theme.clearColor = theme.clearColor;
        this.m_theme.clearAlpha = theme.clearAlpha;
        environment.updateClearColor(theme.clearColor, theme.clearAlpha);

        // Post processing effects and tone mapping exposure
        if (theme.postEffects !== undefined) {
            this.m_theme.postEffects = theme.postEffects;
            this.m_mapView.postEffects = theme.postEffects;
        }

        if (theme.toneMappingExposure !== undefined) {
            this.m_theme.toneMappingExposure = theme.toneMappingExposure;
            this.m_mapView.renderer.toneMappingExposure = theme.toneMappingExposure;
        }

        // Handle tile3DRender configuration
        if (theme.tile3DRender !== undefined) {
            this.m_theme.tile3DRender = theme.tile3DRender;
            // Apply tile3DRender configuration to data sources
            this.applyTile3DRenderConfig(theme.tile3DRender);
        }

        // Images and environment map.
        if (
            !isEqual(this.m_theme.images, theme.images) ||
            !isEqual(this.m_theme.imageTextures, theme.imageTextures) ||
            !isEqual(this.m_theme.environment, theme.environment)
        ) {
            this.m_theme.images = theme.images;
            this.m_theme.imageTextures = theme.imageTextures;
            this.m_theme.environment = theme.environment;
            await this.updateImages(theme.images, theme.imageTextures, theme.environment);
        }

        // POI tables.
        if (!isEqual(this.m_theme.poiTables, theme.poiTables)) {
            this.m_theme.poiTables = theme.poiTables;
            await this.loadPoiTables(theme.poiTables);
        }
        // Text.

        if (
            !isEqual(this.m_theme.textStyles, theme.textStyles) ||
            !isEqual(this.m_theme.defaultTextStyle, theme.defaultTextStyle) ||
            !isEqual(this.m_theme.fontCatalogs, theme.fontCatalogs)
        ) {
            this.m_theme.textStyles = theme.textStyles;
            this.m_theme.defaultTextStyle = theme.defaultTextStyle;
            this.m_theme.fontCatalogs = theme.fontCatalogs;

            await this.m_mapView.resetTextRenderer(
                theme.fontCatalogs,
                theme.textStyles,
                theme.defaultTextStyle
            );
        }

        if (Array.isArray(theme.priorities)) {
            this.m_theme.priorities = theme.priorities;
        }
        this.m_mapView.mapAnchors.setPriorities(theme.priorities ?? []);

        if (Array.isArray(theme.labelPriorities)) {
            this.m_theme.labelPriorities = theme.labelPriorities;
        }

        if (this.m_theme.styles === undefined) {
            this.m_theme.styles = {};
        }

        this.m_theme.styles = theme.styles ?? {};
        this.m_theme.definitions = theme.definitions;

        environment.clearBackgroundDataSource();
        for (const dataSource of this.m_mapView.dataSources) {
            await dataSource.setThemeFromBase(this.m_theme);
        }
    }

    /**
     * Apply tile3DRender configuration to data sources
     */
    private applyTile3DRenderConfig(tile3DRender: Theme["tile3DRender"]): void {
        // This method can be extended to apply tile3DRender configuration to specific data sources
        // For now, we just store the configuration in the theme
        console.log("Applying tile3DRender configuration:", tile3DRender);
    }

    updateCache() {
        this.updateImages(
            this.m_theme.images,
            this.m_theme.imageTextures,
            this.m_theme.environment
        );
        this.m_mapView.sceneEnvironment.updateLighting(this.m_theme.lights);
        this.m_mapView.sceneEnvironment.updateSkyBackground(
            this.m_theme.sky,
            this.m_theme.clearColor
        );
    }

    get imageCache(): MapViewImageCache {
        return this.m_imageCache;
    }

    dispose() {
        this.m_imageCache.clear();
    }

    private async loadPoiTables(poiTables?: PoiTableRef[]) {
        this.m_mapView.poiTableManager.clear();

        // Add the POI tables defined in the theme.
        await this.m_mapView.poiTableManager.loadPoiTables(poiTables);
    }

    private cancelThemeUpdate() {
        for (let i = 0; i < this.m_abortControllers.length; i++) {
            try {
                this.m_abortControllers[i].abort();
            } catch (e) {}
        }

        this.m_abortControllers = [];
        this.m_imageCache.clear();
        this.m_mapView.poiManager.clear();
        this.m_mapView.poiTableManager.clear();
    }

    private createAbortController(): AbortController {
        this.m_abortControllers.push(new AbortController());
        return this.m_abortControllers[this.m_abortControllers.length - 1];
    }

    private async updateImages(
        images?: ImageDefinitions,
        imageTextures?: ImageTexture[],
        environmentMap?: EnvironmentMapDefinition | EquirectangularEnvironmentMapDefinition
    ) {
        this.m_imageCache.clear();
        this.m_mapView.poiManager.clear();

        if (images !== undefined) {
            for (const name of Object.keys(images)) {
                const image = images[name];
                this.m_imageCache.addImage(name, image.url, image.preload === true);
                if (typeof image.atlas === "string") {
                    await this.m_mapView.poiManager.addTextureAtlas(
                        name,
                        image.atlas,
                        this.createAbortController().signal
                    );
                }
            }
        }

        if (imageTextures !== undefined) {
            imageTextures.forEach((imageTexture: ImageTexture) => {
                this.m_mapView.poiManager.addImageTexture(imageTexture);
            });
        }

        // Handle environment map
        if (environmentMap !== undefined) {
            this.updateEnvironmentMap(environmentMap);
        }
    }

    private updateEnvironmentMap(
        environmentMap: EnvironmentMapDefinition | EquirectangularEnvironmentMapDefinition
    ) {
        // Check if it's a cube map (has urls array)
        if (Array.isArray((environmentMap as EnvironmentMapDefinition).urls)) {
            const cubeMap = environmentMap as EnvironmentMapDefinition;

            // Resolve the URLs for the environment map faces
            const resolvedUrls = cubeMap.urls.map(url => {
                if (this.m_uriResolver) {
                    return this.m_uriResolver.resolveUri(url);
                }
                return url;
            });

            // Load the cube texture and set it as the scene environment
            const cubeTextureLoader = new THREE.CubeTextureLoader();
            cubeTextureLoader.load(
                resolvedUrls,
                texture => {
                    // Success callback - set the cube texture as the environment map for the scene
                    this.m_mapView.scene.environment = texture;
                    this.m_mapView.update();
                },
                undefined,
                error => {
                    // Error callback - log the error but don't break the application
                    console.error("Failed to load environment map:", error);
                }
            );

            // Preload the texture if requested
            if (cubeMap.preload) {
                // The texture will be loaded immediately by the CubeTextureLoader
            }
        }
        // Check if it's an equirectangular map (has url property)
        else if ((environmentMap as EquirectangularEnvironmentMapDefinition).url) {
            const equirectMap = environmentMap as EquirectangularEnvironmentMapDefinition;

            // Resolve the URL for the equirectangular environment map
            const resolvedUrl = this.m_uriResolver
                ? this.m_uriResolver.resolveUri(equirectMap.url)
                : equirectMap.url;

            // Load the equirectangular texture
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(
                resolvedUrl,
                loadedTexture => {
                    // For equirectangular textures, we need to convert them properly
                    // Set the texture directly as environment map for now
                    loadedTexture.mapping = THREE.EquirectangularReflectionMapping;
                    this.m_mapView.scene.environment = loadedTexture;
                    this.m_mapView.update();
                },
                undefined,
                error => {
                    // Error callback - log the error but don't break the application
                    console.error("Failed to load equirectangular environment map:", error);
                }
            );

            // Preload the texture if requested
            if (equirectMap.preload) {
                // The texture will be loaded immediately by the TextureLoader
            }
        }

        // Optionally, also set it as the background if desired
        // this.m_mapView.scene.background = cubeTexture;
    }
}
