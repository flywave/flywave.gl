import * as THREE from "three";
import { Water } from "./water/Water";
import DefaultPolygon from "./default-polygon";
import waterNormal from "./water/waternormals.jpg";
import * as turf from "@turf/turf";

var waterTexture = new THREE.Texture();
const image = new Image();
image.src = waterNormal;
image.onload = function () {
    waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
    waterTexture.needsUpdate = true;
};
waterTexture.image = image;

class TopoWater extends DefaultPolygon {


    onBeforeRender() {
        const { application: { center, mapView, mapView: { camera } } } = this;
        this.polygon.material.uniforms['time'].value += 1 / 60.0;

        this.polygon.material.polygonOffsetFactor = -4 * mapView.pixelToWorld;

        // if (mapView.tilt <= 60)
        //     this.polygon.material.uniforms.watterNormal.value.copy(camera.position.clone().sub(center).normalize())
        // this.polygon.material.uniforms['camPosition'].value.copy(camera.position);
    }

    updateMesh() {
        if (!this.polygon) {
            this.polygon = new Water(new THREE.BufferGeometry, {
                textureWidth: 512,
                textureHeight: 512,
                waterNormals: waterTexture,
                sunColor: 0xffffff,
                waterColor: 0x336633,
                distortionScale: 3.7,
                size: 1
            });

            this.polygon.userData = {
                feature: {
                    geometryType: "topo",
                    id: this.feature.id
                }
            };

            var befor = this.polygon.onBeforeRender;
            this.polygon.onBeforeRender = (renderer, scene, camera) => {
                this.onBeforeRender(renderer, scene, camera);
                befor(renderer, new THREE.Scene(), camera)
            }
            this.add(this.polygon);

        }
    }

}

export default TopoWater;