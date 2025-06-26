import path from "path-browserify";
import { urlJoin } from "../utilities/urlJoin";
import { getUrlExtension } from "../utilities/urlExtension";
import { LRUCache } from "../utilities/LRUCache";
import { PriorityQueue } from "../utilities/PriorityQueue";
import {
    determineFrustumSet,
    toggleTiles,
    skipTraversal,
    markUsedSetLeaves,
    traverseSet
} from "./traverseFunctions";
import { UNLOADED, LOADING, PARSING, LOADED, FAILED } from "./constants";
import * as THREE from "three";
import { Tile } from "./Tile";

interface TilesRendererStats {
    parsing: number;
    downloading: number;
    failed: number;
    inFrustum: number;
    used: number;
    active: number;
    visible: number;
}

interface TileSet {
    root: Tile;
    asset?: {
        version: string;
        gltfUpAxis?: string;
    };
}

/**
 * Function for provided to sort all tiles for prioritizing loading/unloading.
 */
const priorityCallback = (a: Tile, b: Tile): number => {
    if (a.__depth !== b.__depth) {
        return a.__depth > b.__depth ? -1 : 1;
    } else if (a.__inFrustum !== b.__inFrustum) {
        return a.__inFrustum ? 1 : -1;
    } else if (a.__used !== b.__used) {
        return a.__used ? 1 : -1;
    } else if (a.__error !== b.__error) {
        return a.__error > b.__error ? 1 : -1;
    } else if (a.__distanceFromCamera !== b.__distanceFromCamera) {
        return a.__distanceFromCamera > b.__distanceFromCamera ? -1 : 1;
    }
    return 0;
};

/**
 * Function for sorting the evicted LRU items.
 */
const lruPriorityCallback = (tile: Tile): number => 1 / (tile.__depthFromRenderedParent + 1);

export class TilesRendererBase extends THREE.EventDispatcher<{ [key: string]: any }> {
    private tileSets: Record<string, TileSet | Promise<TileSet> | Error>;
    public rootURL: string;
    public fetchOptions: RequestInit;
    public preprocessURL: ((url: string) => string) | null;

    public lruCache: LRUCache<Tile>;
    public downloadQueue: PriorityQueue<Tile>;
    public parseQueue: PriorityQueue<Tile>;
    public stats: TilesRendererStats;
    public frameCount: number;

    // Options
    public errorTarget: number;
    public errorThreshold: number;
    public loadSiblings: boolean;
    public displayActiveTiles: boolean;
    public maxDepth: number;
    public stopAtEmptyTiles: boolean;

    get rootTileSet(): TileSet | null {
        const tileSet = this.tileSets[this.rootURL];
        if (!tileSet || tileSet instanceof Promise || tileSet instanceof Error) {
            return null;
        } else {
            return tileSet;
        }
    }

    get root(): Tile | null {
        const tileSet = this.rootTileSet;
        return tileSet ? tileSet.root : null;
    }

    constructor(url: string) {
        super();
        this.tileSets = {};
        this.rootURL = url;
        this.fetchOptions = {};
        this.preprocessURL = null;

        this.lruCache = new LRUCache<Tile>();
        this.lruCache.unloadPriorityCallback = lruPriorityCallback;

        this.downloadQueue = new PriorityQueue<Tile>();
        this.downloadQueue.maxJobs = 16;
        this.downloadQueue.priorityCallback = priorityCallback;

        this.parseQueue = new PriorityQueue<Tile>();
        this.parseQueue.maxJobs = 10;
        this.parseQueue.priorityCallback = priorityCallback;

        this.stats = {
            parsing: 0,
            downloading: 0,
            failed: 0,
            inFrustum: 0,
            used: 0,
            active: 0,
            visible: 0
        };
        this.frameCount = 0;

        this.errorTarget = 6.0;
        this.errorThreshold = Infinity;
        this.loadSiblings = true;
        this.displayActiveTiles = false;
        this.maxDepth = Infinity;
        this.stopAtEmptyTiles = true;
    }

    traverse(
        beforecb: (node: Tile, parent: Tile | null) => void,
        aftercb?: (node: Tile, parent: Tile | null) => void
    ): void {
        const tileSets = this.tileSets;
        const rootTileSet = tileSets[this.rootURL];
        if (
            !rootTileSet ||
            rootTileSet instanceof Promise ||
            rootTileSet instanceof Error ||
            !rootTileSet.root
        ) {
            return;
        }

        traverseSet(rootTileSet.root, beforecb, aftercb);
    }

    update(): void {
        const stats = this.stats;
        const lruCache = this.lruCache;
        const tileSets = this.tileSets;
        const rootTileSet = tileSets[this.rootURL];

        if (!(this.rootURL in tileSets)) {
            this.loadRootTileSet(this.rootURL);
            return;
        } else if (
            !rootTileSet ||
            rootTileSet instanceof Promise ||
            rootTileSet instanceof Error ||
            !rootTileSet.root
        ) {
            return;
        }

        const root = rootTileSet.root;

        stats.inFrustum = 0;
        stats.used = 0;
        stats.active = 0;
        stats.visible = 0;
        this.frameCount++;

        determineFrustumSet(root, this);
        markUsedSetLeaves(root, this);
        skipTraversal(root, this);
        toggleTiles(root, this);

        lruCache.scheduleUnload();
    }

    parseTile(buffer: ArrayBuffer, tile: Tile, extension: string): Promise<void> {
        return Promise.resolve();
    }

    disposeTile(tile: Tile): void {}

    preprocessNode(tile: Tile, parentTile: Tile | null, tileSetDir: string): void {
        if (tile.content) {
            if (!("uri" in tile.content) && "url" in tile.content) {
                tile.content.uri = tile.content.url;
                delete tile.content.url;
            }

            if (tile.content.uri) {
                tile.content.uri = urlJoin(tileSetDir, tile.content.uri);
            }

            // if (
            //     tile.content.boundingVolume &&
            //     !(
            //         "box" in tile.content.boundingVolume ||
            //         "sphere" in tile.content.boundingVolume ||
            //         "region" in tile.content.boundingVolume
            //     )
            // ) {
            //     delete tile.content.boundingVolume;
            // }
        }

        tile.parent = parentTile;
        tile.children = tile.children || [];

        const uri = tile.content?.uri;
        if (uri) {
            const extension = getUrlExtension(tile.content.uri);
            const isExternalTileSet = Boolean(extension && extension.toLowerCase() === "json");
            tile.__externalTileSet = isExternalTileSet;
            tile.__contentEmpty = isExternalTileSet;
        } else {
            tile.__externalTileSet = false;
            tile.__contentEmpty = true;
        }

        tile.__distanceFromCamera = Infinity;
        tile.__error = Infinity;

        tile.__inFrustum = false;
        tile.__isLeaf = false;

        tile.__usedLastFrame = false;
        tile.__used = false;

        tile.__wasSetVisible = false;
        tile.__visible = false;
        tile.__childrenWereVisible = false;
        tile.__allChildrenLoaded = false;

        tile.__wasSetActive = false;
        tile.__active = false;

        tile.__loadingState = UNLOADED;
        tile.__loadIndex = 0;

        tile.__loadAbort = null;

        tile.__depthFromRenderedParent = -1;
        if (parentTile === null) {
            tile.__depth = 0;
            tile.refine = tile.refine || "REPLACE";
        } else {
            tile.__depth = parentTile.__depth + 1;
            tile.refine = tile.refine || parentTile.refine;
        }
    }

    setTileActive(tile: Tile, state: boolean): void {}

    setTileVisible(tile: Tile, state: boolean): void {}

    calculateError(tile: Tile): void | number {
        return 0;
    }

    tileInView(tile: Tile): boolean {
        return true;
    }

    fetchTileSet(
        url: string,
        fetchOptions: RequestInit,
        parent: Tile | null = null
    ): Promise<TileSet> {
        return fetch(url, fetchOptions)
            .then(res => {
                if (res.ok) {
                    return res.json();
                } else {
                    throw new Error(
                        `TilesRenderer: Failed to load tileset "${url}" with status ${res.status} : ${res.statusText}`
                    );
                }
            })
            .then((json: TileSet) => {
                const version = json.asset?.version;
                console.assert(
                    version === "1.0" || version === "0.0",
                    'asset.version is expected to be a string of "1.0" or "0.0"'
                );

                const basePath = path.dirname(url);

                traverseSet(
                    json.root,
                    (node: Tile, parent: Tile | null) =>
                        this.preprocessNode(node, parent, basePath),
                    null,
                    parent,
                    parent ? parent.__depth : 0
                );

                return json;
            });
    }

    loadRootTileSet(url: string): Promise<TileSet> {
        const tileSets = this.tileSets;
        if (!(url in tileSets)) {
            const pr = this.fetchTileSet(
                this.preprocessURL ? this.preprocessURL(url) : url,
                this.fetchOptions
            ).then(json => {
                tileSets[url] = json;
                return json;
            });

            pr.catch((err: Error) => {
                console.error(err);
                tileSets[url] = err;
            });

            tileSets[url] = pr;
            return pr;
        } else if (tileSets[url] instanceof Error) {
            return Promise.reject(tileSets[url]);
        } else if (tileSets[url] instanceof Promise) {
            return tileSets[url] as Promise<TileSet>;
        } else {
            return Promise.resolve(tileSets[url] as TileSet);
        }
    }

    requestTileContents(tile: Tile): void {
        if (tile.__loadingState !== UNLOADED) {
            return;
        }

        const stats = this.stats;
        const lruCache = this.lruCache;
        const downloadQueue = this.downloadQueue;
        const parseQueue = this.parseQueue;
        const isExternalTileSet = tile.__externalTileSet;

        lruCache.add(tile, (t: Tile) => {
            if (t.__loadingState === LOADING) {
                t.__loadAbort?.abort();
                t.__loadAbort = null;
            } else if (isExternalTileSet) {
                t.children.length = 0;
            } else {
                this.disposeTile(t);
            }

            if (t.__loadingState === LOADING) {
                stats.downloading--;
            } else if (t.__loadingState === PARSING) {
                stats.parsing--;
            }

            t.__loadingState = UNLOADED;
            t.__loadIndex++;

            parseQueue.remove(t);
            downloadQueue.remove(t);
        });

        tile.__loadIndex++;
        const loadIndex = tile.__loadIndex;
        const controller = new AbortController();
        const signal = controller.signal;

        stats.downloading++;
        tile.__loadAbort = controller;
        tile.__loadingState = LOADING;

        const errorCallback = (e: Error) => {
            if (tile.__loadIndex !== loadIndex) {
                return;
            }

            if (e.name !== "AbortError") {
                parseQueue.remove(tile);
                downloadQueue.remove(tile);

                if (tile.__loadingState === PARSING) {
                    stats.parsing--;
                } else if (tile.__loadingState === LOADING) {
                    stats.downloading--;
                }

                stats.failed++;

                console.error(`TilesRenderer : Failed to load tile at url "${tile.content?.uri}".`);
                console.error(e);
                tile.__loadingState = FAILED;
            } else {
                lruCache.remove(tile);
            }
        };

        if (isExternalTileSet) {
            downloadQueue
                .add(tile, (tileCb: Tile): Promise<TileSet | void> => {
                    if (tileCb.__loadIndex !== loadIndex) {
                        return Promise.resolve();
                    }

                    const uri = tileCb.content?.uri;
                    if (!uri) return Promise.reject(new Error("Tile content URI is missing"));

                    const processedUri = this.preprocessURL ? this.preprocessURL(uri) : uri;
                    return this.fetchTileSet(
                        processedUri,
                        Object.assign({ signal }, this.fetchOptions),
                        tileCb
                    );
                })
                .then(json => {
                    if (tile.__loadIndex !== loadIndex || !json) {
                        return;
                    }

                    stats.downloading--;
                    tile.__loadAbort = null;
                    tile.__loadingState = LOADED;

                    tile.children.push(json.root);
                })
                .catch(errorCallback);
        } else {
            downloadQueue
                .add(tile, (downloadTile: Tile): Promise<Response | undefined> => {
                    if (downloadTile.__loadIndex !== loadIndex) {
                        return Promise.resolve(undefined);
                    }

                    const uri = downloadTile.content?.uri;
                    if (!uri) return Promise.reject(new Error("Tile content URI is missing"));

                    const processedUri = this.preprocessURL ? this.preprocessURL(uri) : uri;
                    return fetch(processedUri, Object.assign({ signal }, this.fetchOptions));
                })
                .then(res => {
                    if (tile.__loadIndex !== loadIndex) {
                        return;
                    }

                    if (res.ok) {
                        return res.arrayBuffer();
                    } else {
                        throw new Error(`Failed to load model with error code ${res.status}`);
                    }
                })
                .then((buffer: ArrayBuffer | undefined) => {
                    if (tile.__loadIndex !== loadIndex || !buffer) {
                        return;
                    }

                    stats.downloading--;
                    stats.parsing++;
                    tile.__loadAbort = null;
                    tile.__loadingState = PARSING;

                    return parseQueue.add(tile, (parseTile: Tile) => {
                        if (parseTile.__loadIndex !== loadIndex) {
                            return Promise.resolve();
                        }

                        const uri = parseTile.content?.uri;
                        if (!uri) return Promise.reject(new Error("Tile content URI is missing"));

                        const extension = getUrlExtension(uri);
                        return this.parseTile(buffer, parseTile, extension);
                    });
                })
                .then(() => {
                    if (tile.__loadIndex !== loadIndex) {
                        return;
                    }

                    stats.parsing--;
                    tile.__loadingState = LOADED;

                    if (tile.__wasSetVisible) {
                        this.setTileVisible(tile, true);
                    }

                    if (tile.__wasSetActive) {
                        this.setTileActive(tile, true);
                    }
                })
                .catch(errorCallback);
        }
    }

    dispose(): void {
        const lruCache = this.lruCache;
        this.traverse(tile => {
            lruCache.remove(tile);
        });
    }
}
