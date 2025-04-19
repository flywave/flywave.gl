import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";
import { TilesRenderer } from "./3dtiles-render/three/TilesRenderer";
import { Sphere, Box3 } from "three";
import { Vector3 } from "three";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { OrientedBox3 } from "@flywave/flywave-geoutils";
import { PriorityQueue } from "./3dtiles-render/utilities/PriorityQueue";

import { DRACOLoader } from "./loaders/DRACOLoader";
import config from "./config";
import SelectionEffect from "./3dtiles-render/selection";

export const F3dTilesRendererUpdateEvent = "update";

class F3dTilesRenderer extends TilesRenderer {
    constructor(url, mapView, DebugTilesRenderer, onLoaded) {
        super(url);
        this.mapView = mapView;
        this.onLoaded = onLoaded;

        this.mapView.addEventListener(MapViewEventNames.Render, this.update3DTileSource);

        this.lruCache.maxSize = 2200;
        this.lruCache.minSize = 2000;

        this.displayActiveTiles = true;

        this.object = new THREE.Object3D();
        this.selectionEffect = new SelectionEffect(this);

        this.object.add(this.group);
        this.loadSiblings = false;

        this.autoDisableRendererCulling = false;

        const parseQueue = new PriorityQueue();
        parseQueue.priorityCallback = (a, b) => {
            return b.__t - a.__t;
        };
        parseQueue.maxJobs = 100;

        this.manager.dracoLoader = new DRACOLoader(this.manager, parseQueue);
        this.manager.dracoLoader.setDecoderPath(config.DRACO_PATH);
        this.errorTarget = 16;

        this.DebugTilesRenderer = DebugTilesRenderer;
    }

    openDebug = debug => {
        this.debug = debug;

        if (this.debugRender) {
            this.debugRender.off();
            this.object.parent.remove(this.debugRender.object);
            delete this.debugRender;
        }

        if (debug) {
            this.debugRender = new this.DebugTilesRenderer(this.rootURL, this.mapView);
            this.debugRender.setCamera(this.mapView.camera);
            this.debugRender.setResolutionFromRenderer(this.mapView.camera, this.mapView.renderer);
            this.object.parent.add(this.debugRender.object);
        }
    };

    getB3dmIdByBatchId(batchId, object) {
        var classId = object.batchTable.header.HIERARCHY.classIds[batchId];
        var classes = object.batchTable.header.HIERARCHY.classes[classId];
        try {
            const {
                instances: {
                    id: [b3dmId]
                }
            } = classes;
            return b3dmId;
        } catch (e) {
            return "";
        }
    }

    setObserveTileChange = observeTileChange => {
        this.observeTileChange = observeTileChange;
    };

    setTileActive(tile, active) {
        super.setTileActive(tile, active);
        if (this.observeTileChange) {
            this.observeTileChange._watchTileChange(tile,this.activeTiles);
        }
    }

    raycast = (raycaster, intersects) => {
        var oldRayOrigin = new THREE.Vector3();
        // raycaster.far = this.mapView.camera.far * 0.3;
        oldRayOrigin.copy(raycaster.ray.origin);
        raycaster.ray.origin.copy(this.mapView.camera.position);
        // raycaster.firstHitOnly = true;
        this.object.position.add(this.mapView.camera.position);
        this.object.updateMatrixWorld();
        var _intersects = [];
        try {
            super.raycast(raycaster, _intersects);
        } catch (e) {
            console.log(e);
        }
        _intersects.forEach(e => {
            e.point.sub(this.mapView.camera.position);
            intersects.push(e);
            if (e.object.type == "b3dm" && e.object._batchid) {
                const { faceIndex, face } = e;
                var index = e.object._batchid[face.a];
                var classId = e.object.batchTable.header.HIERARCHY.classIds[index];
                var classes = e.object.batchTable.header.HIERARCHY.classes[classId];
                e.classes = classes;
                e.b3dmId = this.getB3dmIdByBatchId(index, e.object);
                e.tilesUrl = this.rootURL;
            } else {
                if (e.object.userData.i3dm) {
                    const { instanceId } = e;
                    var {
                        batchTable: {
                            header: { id }
                        }
                    } = e.object.userData.i3dm;

                    e.i3dmId = id[instanceId];
                    e.batchId = instanceId;
                    e.tilesUrl = this.rootURL;
                }
            }
        });

        raycaster.ray.origin.set(0, 0, 0);
        raycaster.ray.origin.copy(oldRayOrigin);
    };

    lastUpdateTime = Date.now();

    update3DTileSource = () => {
        if (this.debugRender && this.debug) {
            this.debugRender.update3DTileSource();
        }

        this.object.position.copy(this.mapView.camera.position.clone().multiplyScalar(-1));

        var laster = 0;
        if (this.mapView.cameraIsMoving) {
            this.parseQueue.maxJobs = 4;
            this.downloadQueue.maxJobs = 4;
            laster = 250;
        } else {
            this.parseQueue.maxJobs = 16;
            this.downloadQueue.maxJobs = 16;
            laster = 100;
        }
        if (window._a) return;
        // if (Date.now() - this.lastUpdateTime > laster) {
        // if (window.a) return;

        this.update();
        this.selectionEffect.onUpdate(this.object);
        this.dispatchEvent(F3dTilesRendererUpdateEvent, this.object);
        this.lastUpdateTime = Date.now();
        // }
    };

    onLoadModel = (scene, tile) => {
        scene.tile = tile;
        scene.traverse(m => {
            m.userData = { _3dtile: tile.content, ...m.userData };
        });
    };

    async flyTo(duration) {
        var tile = await this.getRootTile();
        if (!tile) return;
        const [milng, milat, mxlng, mxlat] = tile.boundingVolume.region;
        var toA = 180 / Math.PI;
        this.mapView.mapOrbitControl.flyToBox(
            GeoBox.fromCoordinates(
                new GeoCoordinates(milat * toA, milng * toA, 0),
                new GeoCoordinates(mxlat * toA, mxlng * toA, 0)
            ),
            duration
        );
    }

    readyPromise = null;
    readyPromiseResolve = null;

    getRootTile() {
        if (this.rootTile) {
            return Promise.resolve(this.rootTile);
        } else {
            if (!this.readyPromise) {
                this.readyPromise = new Promise(resolve => {
                    this.readyPromiseResolve = resolve;
                });
            } else {
                return this.readyPromise;
            }
        }
        return this.rootTile;
    }

    preprocessNode(tile, parentTile, tileSetDir) {
        if ("region" in tile.boundingVolume) {
            const [milng, milat, mxlng, mxlat, miAlt, mxAlt] = tile.boundingVolume.region;

            let box = new GeoBox(
                GeoCoordinates.fromRadians(milat, milng, miAlt),
                GeoCoordinates.fromRadians(mxlat, mxlng, mxAlt)
            );
            var boundingBox = new Box3();
            var center = new Vector3();
            this.mapView.projection.projectPoint(box.southWest, boundingBox.min);
            this.mapView.projection.projectPoint(box.northEast, boundingBox.max);
            this.mapView.projection.projectPoint(box.center, center);

            if (!parentTile) {
                //     this.group.anchor = box.center.clone();
                this.rootPosition = center.clone();
                if (this.onLoaded) {
                    this.onLoaded(tile);
                }
                this.rootTile = tile;
                // this.group.position.copy(this.rootPosition );

                //     // var bHelper = new THREE.Mesh(
                //     //     new THREE.SphereGeometry(100, 16, 8),
                //     //     new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
                //     // );
                //     // bHelper.anchor = box.center;
                //     // this.mapView.mapAnchors.add(bHelper);
            }

            var sphere = new Sphere();
            sphere.radius = boundingBox.min.distanceTo(boundingBox.max) * 0.5;
            sphere.center.copy(center);
            tile.boundingVolume["sphere"] = sphere.center.toArray().concat([sphere.radius]);
            // if(sphere.radius>10000){
            //     console.log(tile.boundingVolume['region'],tile);
            // }
            tile.boundingVolume["orientedBox"] = this.mapView.projection.projectBox(
                box,
                new OrientedBox3()
            );
            // tile.boundingVolume['_region'] = tile.boundingVolume['region'];
            // delete tile.boundingVolume['region'];

            // debug
            // if (!parentTile){
            // const frustum = this.mapView.visibleTileSet.m_frustumIntersection.m_frustum;
            // if (frustum.intersectsSphere(sphere)) {
            // var bHelper = new THREE.Mesh(
            //     new THREE.SphereGeometry(sphere.radius, 16, 8),
            //     new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
            // );
            // bHelper.anchor = box.center;
            // this.mapView.mapAnchors.add(bHelper);
            // }

            // var bHelper = new THREE.Mesh(
            //     new THREE.SphereGeometry(sphere.radius, 16, 8),
            //     new THREE.MeshBasicMaterial({ color: 0xfff000, wireframe: true })
            // );
            // bHelper.anchor = box.center;
            // tile.debugMesh = bHelper;
            // tile.debugMesh.visible = false;
            // this.mapView.mapAnchors.add(bHelper);
            // }
        }

        super.preprocessNode(tile, parentTile, tileSetDir);
    }

    debugCreateSphere(tile) {
        var sphere = tile.boundingVolume.sphere;
        var center = new Vector3().fromArray(sphere);
        var radio = sphere[3];
        var bHelper = new THREE.Mesh(
            new THREE.SphereGeometry(radio, 16, 8),
            new THREE.MeshBasicMaterial({ color: 0xfff000, wireframe: true })
        );
        bHelper.anchor = this.mapView.projection.unprojectPoint(center);
        this.mapView.mapAnchors.add(bHelper);
    }

    off() {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.update3DTileSource);
        if (this.debugRender) {
            this.debugRender.off();
        }
    }
}

export { F3dTilesRenderer };

export default F3dTilesRenderer;
