import * as THREE from "three";
import { svgToCanvas } from "../util/svg-to-canvas";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils"; 
import placemarker from "../image/place-marker.png"

const Pointmaterial = new THREE.SpriteMaterial({ map: new THREE.Texture(),depthTest:false, sizeAttenuation: false });

const image = new Image();
image.src = placemarker;
image.onload = function () {
	Pointmaterial.map.needsUpdate = true;
}; 
Pointmaterial.map.image = image;
 
export { Pointmaterial as PointMaterial };

class DefaultPoint extends THREE.Object3D {
    constructor(application, feature) {
        super(application);
        const sprite = new THREE.Sprite(Pointmaterial);
        sprite.scale.set(.02, .02, .02);
        const { geometry: { coordinates } } = feature;
        this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2]);
        this.add(sprite);

        sprite.userData = {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        };
    }
}

export { DefaultPoint };