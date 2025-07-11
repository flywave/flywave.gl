import {
    Box3Helper,
    Group,
    MeshStandardMaterial,
    PointsMaterial,
    Color,
    Object3D,
    Material
} from "three";
import { TilesRenderer, TilesRendererOptions } from "../TilesRenderer";
import { SphereHelper } from "./SphereHelper";
import { Tile, TileCache } from "../base/Tile";
import { Tiles3DTileContent } from "../next";

// 符号常量定义
const ORIGINAL_MATERIAL = Symbol("ORIGINAL_MATERIAL");
const HAS_RANDOM_COLOR = Symbol("HAS_RANDOM_COLOR");
const HAS_RANDOM_NODE_COLOR = Symbol("HAS_RANDOM_NODE_COLOR");

// 空射线检测函数
function emptyRaycast() {}

// 调试颜色模式枚举
export enum DebugColorMode {
    NONE = 0,
    SCREEN_ERROR = 1,
    GEOMETRIC_ERROR = 2,
    DISTANCE = 3,
    DEPTH = 4,
    RELATIVE_DEPTH = 5,
    IS_LEAF = 6,
    RANDOM_COLOR = 7,
    RANDOM_NODE_COLOR = 8,
    CUSTOM_COLOR = 9
}

// 瓦片信息接口
interface TileInformation {
    distanceToCamera: number;
    geometricError: number;
    screenSpaceError: number;
    depth: number;
    isLeaf: boolean;
}

// 自定义颜色回调类型
type CustomColorCallback = (tile: Tile, object: Object3D) => void;

// 调试颜色获取函数类型
type DebugColorGetter = (value: number, target: Color) => void;

export class DebugTilesRenderer extends TilesRenderer {
    // 公共属性
    public displayBoxBounds: boolean;
    public displaySphereBounds: boolean;
    public colorMode: DebugColorMode;
    public customColorCallback: CustomColorCallback | null;
    public boxGroup: Group;
    public sphereGroup: Group;
    public maxDebugDepth: number;
    public maxDebugDistance: number;
    public maxDebugError: number;
    public getDebugColor: DebugColorGetter;
    public extremeDebugDepth: number;
    public extremeDebugError: number;

    constructor(options: TilesRendererOptions) {
        super(options);

        const tilesGroup = this.group;
        const boxGroup = new Group();
        boxGroup.name = "DebugTilesRenderer.boxGroup";
        tilesGroup.add(boxGroup);

        const sphereGroup = new Group();
        sphereGroup.name = "DebugTilesRenderer.sphereGroup";
        tilesGroup.add(sphereGroup);

        // 初始化属性
        this.displayBoxBounds = false;
        this.displaySphereBounds = false;
        this.colorMode = DebugColorMode.NONE;
        this.customColorCallback = null;
        this.boxGroup = boxGroup;
        this.sphereGroup = sphereGroup;
        this.maxDebugDepth = -1;
        this.maxDebugDistance = -1;
        this.maxDebugError = -1;
        this.extremeDebugDepth = -1;
        this.extremeDebugError = -1;

        // 默认调试颜色获取函数
        this.getDebugColor = (value: number, target: Color) => {
            target.setRGB(value, value, value);
        };
    }

    initExtremes(): void {
        // 初始化层次结构的极值
        let maxDepth = -1;
        this.traverse((tile: Tile) => {
            maxDepth = Math.max(maxDepth, tile.__depth);
        });

        let maxError = -1;
        this.traverse((tile: Tile) => {
            maxError = Math.max(maxError, tile.geometricError);
        });

        this.extremeDebugDepth = maxDepth;
        this.extremeDebugError = maxError;
    }

    fetchTileSet(url: string, fetchOptions: RequestInit, parent: Tile = null): Promise<any> {
        const pr = super.fetchTileSet(url, fetchOptions, parent);
        pr.then(() => {
            Promise.resolve().then(() => {
                this.initExtremes();
            });
        }).catch(() => {});

        return pr;
    }

    getTileInformationFromActiveObject(object: Object3D): TileInformation | null {
        let targetTile: Tile | null = null;
        const activeTiles = this.activeTiles;

        activeTiles.forEach((tile: Tile) => {
            if (targetTile) {
                return;
            }

            const scene = tile.cached?.scene;
            if (scene) {
                scene.traverse((c: Object3D) => {
                    if (c === object) {
                        targetTile = tile;
                    }
                });
            }
        });

        if (targetTile) {
            return {
                distanceToCamera: targetTile.__distanceFromCamera,
                geometricError: targetTile.geometricError,
                screenSpaceError: targetTile.__error,
                depth: targetTile.__depth,
                isLeaf: targetTile.__isLeaf
            };
        } else {
            return null;
        }
    }

    update(): void {
        super.update();

        if (!this.root) {
            return;
        }

        this.boxGroup.visible = this.displayBoxBounds;
        this.sphereGroup.visible = this.displaySphereBounds;

        let maxDepth = this.maxDebugDepth === -1 ? this.extremeDebugDepth : this.maxDebugDepth;
        let maxError = this.maxDebugError === -1 ? this.extremeDebugError : this.maxDebugError;
        let maxDistance =
            this.maxDebugDistance === -1 ? this.root.cached.sphere.radius : this.maxDebugDistance;

        const errorTarget = this.errorTarget;
        const colorMode = this.colorMode;
        const visibleTiles = this.visibleTiles;

        visibleTiles.forEach((tile: Tile) => {
            const scene = tile.cached?.scene;
            if (!scene) return;

            let h: number, s: number, l: number;
            if (colorMode === DebugColorMode.RANDOM_COLOR) {
                h = Math.random();
                s = 0.5 + Math.random() * 0.5;
                l = 0.375 + Math.random() * 0.25;
            }

            scene.traverse((c: Object3D & { material?: Material & { color: Color } }) => {
                if (colorMode === DebugColorMode.RANDOM_NODE_COLOR) {
                    h = Math.random();
                    s = 0.5 + Math.random() * 0.5;
                    l = 0.375 + Math.random() * 0.25;
                }

                const currMaterial = c.material;
                if (currMaterial) {
                    const originalMaterial = c[ORIGINAL_MATERIAL as any];

                    if (colorMode === DebugColorMode.NONE && currMaterial !== originalMaterial) {
                        c.material.dispose();
                        c.material = originalMaterial;
                    } else if (
                        colorMode !== DebugColorMode.NONE &&
                        currMaterial === originalMaterial
                    ) {
                        if ((c as any).isPoints) {
                            const pointsMaterial = new PointsMaterial();
                            pointsMaterial.size = (originalMaterial as PointsMaterial).size;
                            pointsMaterial.sizeAttenuation = (
                                originalMaterial as PointsMaterial
                            ).sizeAttenuation;
                            c.material = pointsMaterial;
                        } else {
                            const standardMaterial = new MeshStandardMaterial();
                            standardMaterial.flatShading = true;
                            c.material = standardMaterial;
                        }
                    }

                    if (colorMode !== DebugColorMode.RANDOM_COLOR) {
                        delete c.material[HAS_RANDOM_COLOR];
                    }

                    if (colorMode !== DebugColorMode.RANDOM_NODE_COLOR) {
                        delete c.material[HAS_RANDOM_NODE_COLOR];
                    }

                    // 在基础材质上设置颜色
                    switch (colorMode) {
                        case DebugColorMode.DEPTH: {
                            const val = tile.__depth / maxDepth;
                            this.getDebugColor(val, c.material.color);
                            break;
                        }
                        case DebugColorMode.RELATIVE_DEPTH: {
                            const val = tile.__depthFromRenderedParent / maxDepth;
                            this.getDebugColor(val, c.material.color);
                            break;
                        }
                        case DebugColorMode.SCREEN_ERROR: {
                            const val = tile.__error / errorTarget;
                            if (val > 1.0) {
                                c.material.color.setRGB(1.0, 0.0, 0.0);
                            } else {
                                this.getDebugColor(val, c.material.color);
                            }
                            break;
                        }
                        case DebugColorMode.GEOMETRIC_ERROR: {
                            const val = Math.min(tile.geometricError / maxError, 1);
                            this.getDebugColor(val, c.material.color);
                            break;
                        }
                        case DebugColorMode.DISTANCE: {
                            const val = Math.min(tile.__distanceFromCamera / maxDistance, 1);
                            this.getDebugColor(val, c.material.color);
                            break;
                        }
                        case DebugColorMode.IS_LEAF: {
                            if (!tile.children || tile.children.length === 0) {
                                this.getDebugColor(1.0, c.material.color);
                            } else {
                                this.getDebugColor(0.0, c.material.color);
                            }
                            break;
                        }
                        case DebugColorMode.RANDOM_NODE_COLOR: {
                            if (!c.material[HAS_RANDOM_NODE_COLOR]) {
                                c.material.color.setHSL(h, s, l);
                                c.material[HAS_RANDOM_NODE_COLOR] = true;
                            }
                            break;
                        }
                        case DebugColorMode.RANDOM_COLOR: {
                            if (!c.material[HAS_RANDOM_COLOR]) {
                                c.material.color.setHSL(h, s, l);
                                c.material[HAS_RANDOM_COLOR] = true;
                            }
                            break;
                        }
                        case DebugColorMode.CUSTOM_COLOR: {
                            if (this.customColorCallback) {
                                this.customColorCallback(tile, c);
                            } else {
                                console.warn("DebugTilesRenderer: customColorCallback not defined");
                            }
                            break;
                        }
                    }
                }
            });
        });
    }

    setTileVisible(tile: Tile, visible: boolean): void {
        super.setTileVisible(tile, visible);

        const cached = tile.cached as TileCache & {
            boxHelperGroup?: Group;
            sphereHelper?: SphereHelper;
        };
        const sphereGroup = this.sphereGroup;
        const boxGroup = this.boxGroup;
        const boxHelperGroup = cached?.boxHelperGroup;
        const sphereHelper = cached?.sphereHelper;

        if (!visible) {
            if (boxHelperGroup) {
                boxGroup.remove(boxHelperGroup);
            }

            if (sphereHelper) {
                sphereGroup.remove(sphereHelper);
            }
        } else {
            if (boxHelperGroup) {
                boxGroup.add(boxHelperGroup);
                boxHelperGroup.updateMatrixWorld(true);
            }

            if (sphereHelper) {
                sphereGroup.add(sphereHelper);
                sphereHelper.updateMatrixWorld(true);
            }
        }
    }

    parseTile(buffer: Tiles3DTileContent, tile: Tile, extension: string): Promise<void> {
        return super.parseTile(buffer, tile, extension).then(() => {
            const cached = tile.cached as TileCache & {
                boxHelperGroup?: Group;
                sphereHelper?: SphereHelper;
            };
            const scene = cached?.scene;
            if (!scene) return;

            if (cached.sphere) {
                // 创建调试边界球体
                const cachedSphere = cached.sphere;
                const sphereHelper = new SphereHelper(cachedSphere);
                (sphereHelper as any).raycast = emptyRaycast;
                cached.sphereHelper = sphereHelper;

                if (this.visibleTiles.has(tile) && this.displaySphereBounds) {
                    this.sphereGroup.add(sphereHelper);
                    sphereHelper.updateMatrixWorld(true);
                }
            }

            // 缓存原始材质
            scene.traverse((c: Object3D & { material?: Material }) => {
                const material = c.material;
                if (material) {
                    c[ORIGINAL_MATERIAL as any] = material;
                }
            });
        });
    }

    disposeTile(tile: Tile): void {
        super.disposeTile(tile);

        const cached = tile.cached as TileCache & {
            boxHelperGroup?: Group;
            sphereHelper?: SphereHelper;
        };
        if (cached?.boxHelperGroup) {
            (cached.boxHelperGroup.children[0] as any).geometry.dispose();
            delete cached.boxHelperGroup;
        }

        if (cached?.sphereHelper) {
            cached.sphereHelper.geometry.dispose();
            delete cached.sphereHelper;
        }
    }
}
