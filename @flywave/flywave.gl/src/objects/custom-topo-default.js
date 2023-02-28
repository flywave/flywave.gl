import * as THREE from "three"; 
import RemoteTopo from "./remote-topo";
import {
	GeoCoordinates,
} from "@flywave/flywave-geoutils";
import welding from "../image/welding.png";

const materialC = new THREE.SpriteMaterial({ map: new THREE.Texture(),depthTest:false, sizeAttenuation: false });

const image = new Image();
image.src = welding;
image.onload = function () {
	materialC.map.needsUpdate = true;
};

materialC.map.image = image;
class CustomTopoDefault extends RemoteTopo {
	constructor(application, feature) {
		super(application);
		const sprite = new THREE.Sprite(materialC);
		sprite.scale.set(.03, .03, .03);
		const { geometry: { coordinates } } = feature;
		this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2]);
		this.add(sprite);

		sprite.userData = {
			feature: {
				geometryType: "topo",
				id: feature.id
			}
		};

		this.readyPromise = new Promise((reslove, reject) => {
			this.reslove = reslove;
			this.reject = reject;
		});
	}

	withReady(opt) {
		this.readyPromise.then(() => opt());
	}

	flush(feature) {
		const { topology } = feature;
		if (topology["in-pipe-ids"] && topology["in-pipe-ids"].length || topology["out-pipe-ids"] && topology["out-pipe-ids"].length) {
			return super.flush(feature).then(this.reslove);
		}
		return Promise.resolve();
	}
}

export { CustomTopoDefault };