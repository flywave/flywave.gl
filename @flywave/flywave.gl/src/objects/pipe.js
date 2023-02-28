import RemoteTopo from "./remote-topo";

export default class Pipe extends RemoteTopo {
    type = "pipe"

    constructor(application) {
        super(application);

        this.readyPromise = new Promise((reslove, reject) => {
            this.reslove = reslove;
            this.reject = reject;
        });
    }

    withReady(opt) {
        if (this.ready) {
            opt();
        }
        else {
            this.readyPromise.then(() => opt());
        }
    }

    getReady() {
        if (this.ready) {
            return Promise.resolve(this);
        }
        else {
            return this.readyPromise;
        }
    }

    getPipeGeometryPoint(gltf) {
        const { scene } = gltf;

        var geometries = [];
        scene.traverse((object) => {
            if (object.isMesh) {
                const { geometry } = object;
                geometries.push(geometry);
            }
        });
        if (geometries.length) {
            return geometries[0].getAttribute("position");
        }
        return [];
    }

    async updateScene(gltf, feature, position) {
        var [lng, lat, alt] = position;
        const { decoder } = this.application.topoSource;
        const attribute = this.getPipeGeometryPoint(gltf);

        var mat = new THREE.Matrix4;
        mat.elements = position.slice(3);
        mat.setPosition(0, 0, 0);

        var v = new THREE.Vector3,
            q = new THREE.Quaternion,
            s = new THREE.Vector3;

        mat.decompose(v, q, s);

        const positions = await decoder.load(position, mat.elements, [lng, lat, alt]);

        attribute.array = positions;

        return super.updateScene(gltf, feature, position)
    }
}