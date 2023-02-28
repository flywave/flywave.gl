import { BackSide, DoubleSide, FrontSide, MeshLambertMaterial, MeshPhongMaterial } from "three";
import { BufferAttribute, BufferGeometry, Vector3, ShapeUtils, Mesh, Box3, Color } from "three"
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { MeshBasicMaterial } from "three";

//up (0,0,1)
class GroundHole extends THREE.Group {
    type = "ground-hole"

    stBackMaterials = new MeshLambertMaterial({
        emissive: new Color(0xF0900A), transparent: true,
        emissiveIntensity: 0.3, roughness: 0, color: new Color(0x2e240a),

        side: BackSide,
        transparent: true,
        colorWrite: false,
        stencilWrite: true,
        stencilZPass: THREE.IncrementStencilOp,
        stencilRef: 1
    });

    stGroundMaterials = new MeshBasicMaterial({
        side: BackSide,
        transparent: true,
        colorWrite: false,
        stencilWrite: true,
        stencilZPass: THREE.IncrementStencilOp
    });

    backMaterials = new MeshLambertMaterial({
        side: THREE.BackSide, emissive: new Color(0xF0900A), transparent: true,
        emissiveIntensity: 0.3, roughness: 0, color: new Color(0x2e240a),
        stencilWrite: true, 
        stencilRef: 7, 
        stencilZPass: THREE.ReplaceStencilOp, 
        // stencilFail:THREE.ReplaceStencilOp, 
        // stencilZFail:THREE.ReplaceStencilOp, 
    });

    fontMaterials = new MeshBasicMaterial({
        side: THREE.FrontSide, color: new Color(0xffffff), transparent: true,
        stencilWrite: true, 
        stencilZPass: THREE.ReplaceStencilOp, 
        // stencilFail:THREE.ReplaceStencilOp, 
        // stencilZFail:THREE.ReplaceStencilOp, 
        stencilRef: 1
    });

    constructor(path, depth, feature, application) {
        super();
        this.path = path;
        this.depth = depth;
        this.application = application;

        this.meshStencil = new Mesh(new BufferGeometry,this.stBackMaterials);
        this.meshStencil.renderOrder = Number.MIN_SAFE_INTEGER;
        // this.add(this.meshStencil);

        this.maskWallMesh = new Mesh(new BufferGeometry, [this.backMaterials,this.fontMaterials]);
        this.add(this.maskWallMesh);
        this.maskWallMesh.renderOrder = Number.MIN_SAFE_INTEGER + 1; 
        this.maskWallMesh.userData = feature;
    }


    projectVertexs = (vertexs, geoPosition) => {
        const { projection } = this.application.mapView;
        var ps = projection.projectPoint(geoPosition, new Vector3());
        for (var i = 0; i < vertexs.length; i += 3) {
            var p = new GeoCoordinates(vertexs[i + 1], vertexs[i], vertexs[i + 2]);
            var xyz = projection.projectPoint(p, new Vector3()).sub(ps);
            vertexs[i] = xyz.x;
            vertexs[i + 1] = xyz.y;
            vertexs[i + 2] = xyz.z;
        }
        return vertexs;
    }

    computeGeometry() {
        var top = this.path.map(e => new Vector3(e.longitude, e.latitude, e.altitude));
        if (THREE.ShapeUtils.isClockWise(top)) {
            top.reverse();
        }
        var bottoms = top.map(e => {
            return new Vector3().copy(e).add(new Vector3(0, 0, -this.depth));
        });

        var box = new Box3();
        bottoms.forEach(element => {
            box.expandByPoint(element)
        });

        var vertexs = [];
        var indices = [];
        var uvs = [];

        //faces
        var triangles = [];
        for (var i = 0; i < top.length - 1; i += 1) {
            var v1 = top[i];
            var v2 = bottoms[i];
            var v3 = bottoms[i + 1];
            triangles.push(new THREE.Triangle(v1, v2, v3));
        }
        for (var i = 0; i < top.length - 1; i += 1) {
            var v1 = top[i];
            var v2 = bottoms[i + 1];
            var v3 = top[i + 1];
            triangles.push(new THREE.Triangle(v1, v2, v3));
        }

        triangles.forEach((t, i) => {
            var len = vertexs.length / 3;
            indices.push(len, len + 1, len + 2);
            vertexs.push(t.a.x, t.a.y, t.a.z);
            vertexs.push(t.b.x, t.b.y, t.b.z);
            vertexs.push(t.c.x, t.c.y, t.c.z);
        });

        var wall = { start: 0, count: indices.length, materialIndex: 0 }
        triangles.length = 0;
        const faces = ShapeUtils.triangulateShape(bottoms, []);

        faces.forEach(([a, b, c]) => {
            triangles.push(new THREE.Triangle(bottoms[c], bottoms[b], bottoms[a]));
        });


        triangles.forEach((t, i) => {
            var len = vertexs.length / 3;
            indices.push(len, len + 1, len + 2);
            vertexs.push(t.a.x, t.a.y, t.a.z);
            vertexs.push(t.b.x, t.b.y, t.b.z);
            vertexs.push(t.c.x, t.c.y, t.c.z);
        });

        var worldPosition = box.getCenter();
        var geoPosition = new GeoCoordinates(worldPosition.y, worldPosition.x, worldPosition.z);
        this.projectVertexs(vertexs, geoPosition);

        var buffer = new BufferGeometry();
        buffer.setAttribute("position", new BufferAttribute(new Float32Array(vertexs), 3));
        // buffer.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2))
        buffer.setIndex(new BufferAttribute(new Uint16Array(indices), 1));

        buffer.computeVertexNormals();
        this.anchor = geoPosition;
        return { buffer, all: { start: 0, count: indices.length }, wall, ground: { start: wall.count, count: indices.length - wall.count } };
    }


    setPath(path, depth) {
        this.depth = depth;
        this.path = path;
        if (this.mesh) {
            this.mesh.geometry.dispose();
        }
        if (this.meshStencil) {
            this.meshStencil.geometry.dispose();
        }
        var { buffer, all, wall, ground } = this.computeGeometry();
        this.meshStencil.geometry = buffer;
        // this.meshStencil.geometry.groups.push({ ...all, materialIndex: 0 });
        // this.meshStencil.geometry.groups.push({ ...wall, materialIndex: 0 });

        this.maskWallMesh.geometry = buffer.clone();
        // this.maskWallMesh.geometry.groups.length = 0;
        this.maskWallMesh.geometry.groups.push({ ...all, materialIndex: 0 });
        this.maskWallMesh.geometry.groups.push({ ...all, materialIndex: 1 });

    }

    updateFeature({ geometry: { coordinates }, topology }) {
        const { depth } = topology || {};
        this.setPath(coordinates[0].map(e => GeoCoordinates.fromGeoPoint(e)), depth || 1);
    }

    setQuaternion(quaternion) {
        this.mesh.quaternion.copy(quaternion);
    }

}

export default GroundHole;