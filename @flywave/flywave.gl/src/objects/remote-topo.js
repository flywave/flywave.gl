import * as THREE from "three";
import GLTFLoader from "../loaders/gltf-loader";
import LoadingSprite from "./loading-sprite";
import config from "../config";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import { Object3D, Vector2 } from "three";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { PointMaterial } from "./default-point";

const HEADER_X_CSRF_TOKEN = "X-CSRF-Token";

var downloadManager = TransferManager.instance();

class MeshCache {

    map = new Map();

    set(key, promise) {
        return this.map.set(key, promise.then((data) => {
            promise.ready = true;
            promise.data = data;
            return data;
        }));
    }

    has(key) {
        return this.map.has(key);
    }

    get(key) {
        if (!this.has(key)) {
            return;
        }
        var p = this.map.get(key);
        if (p.ready) {
            return Promise.resolve(p.data);
        }
        return p;
    }
}

var meshCache = new MeshCache();
class RemoteTopo extends THREE.Object3D {

    anchor = new GeoCoordinates(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);

    constructor(application) {
        super();

        this.application = application;
        this.waiting = new LoadingSprite();

        this.defaultSprite = new THREE.Sprite(PointMaterial);
        this.defaultSprite.scale.set(.02, .02, .02);

        this.readyPromise = new Promise((reslove, reject) => {
            this.reslove = () => reslove(this);
            this.reject = reject;
        });
    }

    loadDeptend(feature) {
        var ret = [];
        return this.makeLinks(feature, ret).then(() => {
            return ret;
        });
    }

    getReady() {
        if (this.ready) {
            return Promise.resolve(this);
        }
        else {
            return this.readyPromise;
        }
    }

    makeLinks(feature, ret) {
        const { topology, topology: { type, anchors, links } } = feature;

        var linkFeatures;
        if (type == "pipe") {
            linkFeatures = anchors;
        }
        if (type == "cross-point") {
            linkFeatures = links;
        }

        if (type == "custom") {
            linkFeatures = topology["in-pipe-ids"].map(link => { return { link } }).concat(topology["out-pipe-ids"].map(link => { return { link } }));
        }

        var reqRemote = [];
        (linkFeatures || []).filter(an => an).forEach(an => {
            var feature = this.application.history.get(an.link);
            if (!feature) { reqRemote.push(an.link); return; }
            ret.push({
                id: feature.id.trim(),
                srid: feature.geometry.srid || 4326,
                geometry: { ...feature.geometry },
                topology: feature.topology,
                version: feature.version
            });
        });

        if (reqRemote.length) {
            return Promise.all(reqRemote.map(e => this.dependRemoteFeature(e, ret))).then(() => {
                return ret;
            });
        }

        return Promise.resolve(ret);
    }

    dependRemoteFeature(id, ret) {
        return this.application.dataProvider.loadFeatureById(id).then((feature) => {
            if (!feature) return;
            const { topology } = feature;
            ret.push(feature);
            if (topology && topology.type == "cross-point") {
                return this.makeLinks(feature, ret)
            }
        });
    }

    processGltfInstance(scene) {
        const instanceMap = new Map();
        var object = new Object3D();
        scene.traverse(child => {
            if (child.isMesh) {
                const { geometry, material } = child;
                child.updateMatrixWorld();
                if (!instanceMap.has(geometry.uuid)) {
                    instanceMap.set(geometry.uuid, { material, geometry, instances: [] });
                }
                instanceMap.get(geometry.uuid).instances.push(child.matrixWorld);
            }
            else {
                if (child.isLine)
                    object.add(child);
            }
        });

        instanceMap.forEach(({ instances, geometry, material }) => {
            if (instances.length == 1) {
                const [instanceMat] = instances;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = false;
                instanceMat.decompose(mesh.position, mesh.quaternion, mesh.scale);
                object.add(mesh);
            } else {
                const _sphere = new THREE.Sphere();
                geometry.computeBoundingSphere();
                _sphere.copy(geometry.boundingSphere);
                const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length);
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = false;
                instancedMesh.frustumCulled = true;
                scene.add(instancedMesh);
                for (let j = 0, l = instances.length; j < l; j++) {
                    const instanceMat = instances[j];
                    instancedMesh.setMatrixAt(j, instanceMat);
                    _sphere.union(geometry.boundingSphere.clone().applyMatrix4(instanceMat));
                }
                geometry.boundingSphere.copy(_sphere);
                object.add(instancedMesh);
            }
        });

        return object;
    }

    getCSRF() {
        var x_csrf_token;

        if (typeof document !== "undefined" && typeof document.cookie !== "undefined") {
            const cookies = document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.startsWith("FWCSRF=")) {
                    x_csrf_token = cookie.replace("FWCSRF=", "");
                    break;
                }
            }
        }
        return x_csrf_token;
    }

    makeRequest(feature) {
        return this.loadDeptend(feature).then(async (dept) => {
            return new Promise(async (reslove, reject) => {
                var ret = await downloadManager.download(config.formatGlobeVariableUrl(config.TOPO_MESH_URL), {
                    method: "post",
                    headers: { "Content-Type": 'application/json', [HEADER_X_CSRF_TOKEN]: this.getCSRF() },
                    body: JSON.stringify({
                        topo: {
                            id: feature.id,
                            srid: feature.geometry.srid || 4326,
                            geometry: { ...feature.geometry },
                            topology: feature.topology,
                            version: feature.version
                        },
                        links: dept
                    })
                });

                const { topology: { type, model } } = feature;

                var buffer = await ret.arrayBuffer();
                if ((type == "symbol" || type == "cross-point")) {
                    return reslove({ position: new Float64Array(buffer.slice(0, 152)) });
                }

                return new GLTFLoader().parse(buffer.slice(152), '', (gltf) => reslove({ gltf, position: new Float64Array(buffer.slice(0, 152)) },));
            });
        });
    }


    markMeshData(feature) {
        this.gltfScene.traverse(object => {
            if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
                object.castShadow = true;
                object.renderOrder = Number.MAX_SAFE_INTEGER;
                object.userData = {
                    feature: {
                        geometryType: "topo",
                        id: feature.id
                    }
                };
            }
        });
    }

    flush(feature) {
        return this._flush(feature).then(this.reslove, this.reject).then(() => {
            this.ready = true;
        })
    }

    _flush(feature) {
        const { topology: { type, model } } = feature;

        var { geometry: { coordinates, type: geoType }, } = feature;

        if (geoType == "Point") {
            this.anchor = GeoCoordinates.fromGeoPoint(coordinates);

            this.waiting.userData = {
                feature: {
                    geometryType: "topo",
                    id: feature.id
                }
            };

            this.defaultSprite.userData = {
                feature: {
                    geometryType: "topo",
                    id: feature.id
                }
            };
            this.add(this.defaultSprite);
        }

        if (type == "cross-point" && !model) {
            return Promise.resolve();
        }

        if (type == "symbol" && !model) {
            return Promise.resolve();
        }

        if (type == "prism" && !model) {
            return Promise.resolve();
        }

        this.add(this.waiting);
        this.remove(this.defaultSprite);
        return this.makeRequest(feature).then(async ({ gltf, position }) => {
            if (this.premesh) {
                this.remove(this.premesh);
            }
            this.remove(this.waiting);
            this.remove(this.defaultSprite);

            if ((type == "symbol" || type == "cross-point")) {
                if (!meshCache.has(model)) {
                    meshCache.set(model, new Promise(async (reslove) => {
                        var array = await downloadManager.download(config.formatVariableUrl(config.RESOUCE_MESH_URL, { 'mesh_id': model }), {
                            method: "get",
                            headers: { [HEADER_X_CSRF_TOKEN]: this.getCSRF() }
                        });

                        new GLTFLoader().parse(await array.arrayBuffer(), '', reslove);
                    }))
                }

                gltf = await meshCache.get(model);
            }

            this.premesh = this.processGltfInstance(gltf.scene.clone());
            this.computeCurrent(feature);
            this.updateScene(this.premesh, feature, position);
        });
    }

    computeCurrent(feature) {
        const { topology } = feature;
        const transform = topology.transform || {};
        if (transform.scale) {
            const { scale } = transform;
            this.scale.fromArray(scale)
        }

        if (transform.rotation) {
            const { rotation } = transform;
            this.quaternion.fromArray(rotation)
        }
    }

    updateScene(scene, feature, position) {
        var [lng, lat, alt] = position;
        var mat = new THREE.Matrix4;
        mat.elements = position.slice(3);
        if (this.anchor.latitude == Number.MIN_SAFE_INTEGER)
            this.anchor.copy(new GeoCoordinates(lat, lng, alt));
        this.gltfScene = scene;
        var object = new Object3D();
        object.add(scene);
        this.scene = object;
        mat.decompose(this.scene.position, this.scene.quaternion, this.scene.scale);

        object.updateMatrixWorld();
        this.add(object);
        this.markMeshData(feature);
        this.application.mapView.update();
        this.position.set(0, 0, 0);
    }

    abort() {
        if (this.req) {
            this.req.abort();
            delete this.req;
        }
    }
}

export default RemoteTopo;