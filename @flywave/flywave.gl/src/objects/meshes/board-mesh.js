import * as THREE from "three";
import config from "../../config";

var boardTexture = new THREE.TextureLoader();

class BoardMesh extends THREE.Object3D {

    constructor(topoData, featureId) {
        super();
        this.featureId = featureId; 
        this.createMesh(topoData);
        this.up.set(0,0,1)
    }
 
    disposeBoard = () => {
        if (this.boardMesh) {
            this.boardMesh.geometry.dispose();
            this.boardMesh.material.forEach(e => e.dispose());
        }
    }

    createMesh = (topoData) => {
        this.boardMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.createMaterials(topoData.texture));
        this.boardMesh.userData = {
            feature: {
                geometryType: "topo",
                id: this.featureId
            }
        };
        this.boardMesh.castShadow = true;
        this.add(this.boardMesh);
    }


    createMaterials = (texture) => {
        texture = config.formatTopoTextureUrl(texture);
        var backTexure = boardTexture.load(texture);
        backTexure.offset.set(1, 0);
        backTexure.repeat.set(-1, 1);
        backTexure.updateMatrix();
        return [
            new THREE.MeshBasicMaterial({
                transparent: true
            }),
            new THREE.MeshBasicMaterial({
                transparent: true
            }),
            new THREE.MeshBasicMaterial({
                transparent: true
            }),
            new THREE.MeshBasicMaterial({
                transparent: true
            }),
            new THREE.MeshBasicMaterial({
                map: boardTexture.load(texture),
                transparent: true
            }),
            new THREE.MeshBasicMaterial({
                map: backTexure,
                transparent: true
            })
        ]
    }
}

export default BoardMesh;