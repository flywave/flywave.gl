import * as THREE from "three";
import { DecalGeometry } from "../geometries/DecalGeometry";
import config from "../../config";

var decalTexture = new THREE.TextureLoader();

class DecalMesh extends THREE.Object3D { 
    
    descalMeshes = [];

    constructor(id,rotation) {
        super();
        this.featureId = id;
        this.directRotation = rotation;
    }

    updateTopoData = (topoData) => {
        this.buildTopoData(topoData);
    }

    buildTopoData = (topoData) => {
        this.topoData = topoData;

        if (topoData.transform&&!this.directRotation) {
            const { transform: { translate, rotation } } = topoData;

            if (translate) {
                this.position.fromArray(translate);
            }
            if (rotation) {
                this.decalEuler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(rotation));
            }
        }
        if(this.directRotation){
            this.decalEuler = new THREE.Euler().setFromQuaternion(this.directRotation.clone().normalize());
        }

        const [w, h] = topoData.size || [1, 1];
        this.size = new THREE.Vector3(w, h, topoData.depth || 1);

        this.decalMaterial = new THREE.MeshStandardMaterial({
            map: decalTexture.load(config.formatTopoTextureUrl(topoData.texture)),
            transparent: true, 
            polygonOffset: true,
            depthTest: false,
            polygonOffsetFactor: - 4,
        });


        this.sphere = new THREE.Sphere()
        this.sphere.radius = this.size.length();
    }

    disposeAll() {
        this.descalMeshes.forEach(decal => {
            decal.removeFromParent();
            decal.geometry.dispose();
        });
        this.descalMeshes = [];
    }

    isIntersect = (object) => {
        var sp = new THREE.Box3();
        sp.setFromObject(object);
        return this.sphere.intersectsBox(sp);
    }

    draw = (object) => {
        this.sphere.center.copy(this.position);
        if (this.isIntersect(object)) {
            object.traverseVisible(this._decalMesh);
        }
    }

    _decalMesh = (object) => {
        if (!object.isMesh||object.isLine2) {
            return;
        }
        object.updateMatrixWorld();
        this.updateMatrixWorld();

        const p1 = new THREE.Vector3().fromArray(object.matrixWorld.elements.slice(12));
        const p2 = new THREE.Vector3().fromArray(this.matrixWorld.elements.slice(12));

        var translation = new THREE.Vector3(),
            rotation = new THREE.Quaternion(),
            scale = new THREE.Vector3();

        object.matrixWorld.decompose(translation, rotation, scale);

        var col = object.clone();
        col.position.copy(p1.sub(p2));
        col.quaternion.copy(rotation);
        col.scale.copy(scale);
        col.updateMatrixWorld();

        const m = new THREE.Mesh(new DecalGeometry(col, new THREE.Vector3(), this.decalEuler, this.size), this.decalMaterial);
        if (m.geometry.getAttribute("position").count !== 0) {
            this.add(m);
            m.userData = {
                feature: {
                    geometryType: "topo",
                    id: this.featureId
                }
            }
            m.updateMatrixWorld();
            this.descalMeshes.push(m);
        }
    }
}

export { DecalMesh };
