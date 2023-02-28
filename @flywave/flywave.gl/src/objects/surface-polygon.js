import { BufferAttribute, BufferGeometry, Vector3, ShapeUtils, Mesh, Vector2, Box3, Box2, Color } from "three"
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { MeshBasicMaterial } from "three";

//up (0,0,1) 
var order = 1;
class SurfacePolygon extends THREE.Group {
    type = "surface-polygon" 

    materials = new MeshBasicMaterial({ side: THREE.FrontSide, color: new Color(0xff0000), transparent: true,opacity: 0.5 });
    stencilBackMaterials = new MeshBasicMaterial({ side: THREE.BackSide, transparent: true });
    stencilFontMaterials = new MeshBasicMaterial({ side: THREE.FrontSide, transparent: true });
    clearStencilMaterials = new MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true});

    constructor(path, feature, application) {
        super();
        this.path = path;
        this.application = application;

        this.mesh = this.makeMesh();
        this.configMaterial();
        this.add(this.mesh); 
        this.mesh.userData = feature;
        this.mesh.onBeforeRender = this.onUpdateVolumnHeight(application);
        this.mesh.renderOrder = Number.MIN_SAFE_INTEGER+257;
        this.configBackStencilMaterial();
        this.configFontStencilMaterial();
    }

    updateGeoBox() {
        var box = new Box2();
        this.path.forEach(e => box.expandByPoint(new Vector2(e.longitude, e.latitude)));
        this.box = box;
    }

    onUpdateVolumnHeight(application) {
        var _this = this;
        return function () {
            if (!_this.anchor) return;
            const { mapView: { visibleTileSet }, terrainSource } = application;
            let t = visibleTileSet.dataSourceTileList.find(e => e.dataSource == terrainSource);
            let max = Number.MIN_SAFE_INTEGER, min = Number.MAX_SAFE_INTEGER;
            t.renderedTiles.forEach(({ geoBox: { northEast, southWest }, elevationRange: { maxElevation, minElevation } }) => {
                let tileBox = new Box2(new Vector2(southWest.lng, southWest.lat),
                    new Vector2(northEast.lng, northEast.lat));
                if (tileBox.intersectsBox(_this.box)) {
                    max = Math.max(maxElevation, max);
                    min = Math.min(minElevation, min)
                }
            });
            let height = Math.max(max, 1000);
            _this.mesh.scale.set(1, 1, height);
            _this.mesh.updateMatrixWorld();
        }
    }

    configBackStencilMaterial = () => {
        this.stencilBackMaterials.stencilWrite = true;
        this.stencilBackMaterials.colorWrite = false;
        // this.stencilBackMaterials.stencilZFail = THREE.DecrementWrapStencilOp;
        // this.stencilBackMaterials.stencilFail = THREE.DecrementWrapStencilOp;
        this.stencilBackMaterials.stencilZPass = THREE.IncrementWrapStencilOp;
        this.stencilBackMaterials.stencilRef = 3; 
        this.stencilBackMaterials.stencilFunc = THREE.LessEqualStencilFunc; 
    }

    configFontStencilMaterial = () => {
        this.stencilFontMaterials.stencilWrite = true;
        this.stencilFontMaterials.colorWrite = false;
        // this.stencilFontMaterials.stencilZFail = THREE.IncrementWrapStencilOp;
        // this.stencilFontMaterials.stencilFail = THREE.IncrementWrapStencilOp;
        this.stencilFontMaterials.stencilZPass = THREE.DecrementWrapStencilOp;

        // this.stencilFontMaterials.stencilFunc = THREE.LessEqualStencilFunc;
        // this.stencilFontMaterials.stencilRef = 3; 
    }

    configMaterial = () => {
        this.materials.stencilWrite = true;
        this.materials.colorWrite = true;
        this.materials.stencilRef = 2;
        this.materials.stencilFunc = THREE.EqualStencilFunc;
        // this.materials.stencilFuncMask = 0x2;
        this.materials.stencilZPass = THREE.KeepStencilOp;
        // this.materials.stencilWriteMask = 0x0;
    }

    projectVertexs = (vertexs, geoPosition) => {
        const { projection } = this.application.mapView;
        var ps = projection.projectPoint(geoPosition, new Vector3());

        var up = new Vector3(0, 0, 1);
        var angle = ps.angleTo(up);
        this.__meshQuaternion.setFromAxisAngle(up.cross(ps).normalize(), -angle);
        ps.applyQuaternion(this.__meshQuaternion);
        for (var i = 0; i < vertexs.length; i += 3) {
            var p = new GeoCoordinates(vertexs[i + 1], vertexs[i], vertexs[i + 2]);
            var xyz = projection.projectPoint(p, new Vector3()).applyQuaternion(this.__meshQuaternion).sub(ps);
            vertexs[i] = xyz.x;
            vertexs[i + 1] = xyz.y;
            vertexs[i + 2] = xyz.z;
        }
        return vertexs;
    }

    __meshQuaternion = new THREE.Quaternion();

    computeGeometry() {
        var top = this.path.map(e => new Vector3(e.longitude, e.latitude, 0.5));
        if (THREE.ShapeUtils.isClockWise(top)) {
            top.reverse();
        }
        this.updateGeoBox();
        var bottoms = top.map(e => {
            return new Vector3().copy(e).add(new Vector3(0, 0, -1));
        });

        var box = new Box3();
        bottoms.forEach(element => {
            box.expandByPoint(element)
        });

        var vertexs = [];
        var indices = [];

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

        const faces = ShapeUtils.triangulateShape(bottoms, []);

        faces.forEach(([a, b, c]) => {
            // triangles.push(new THREE.Triangle(bottoms[a], bottoms[b], bottoms[c]));
            triangles.push(new THREE.Triangle(top[a], top[b], top[c]));
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

        buffer.groups.push({start:0,count:indices.length,materialIndex:0});
        buffer.groups.push({start:0,count:indices.length,materialIndex:1});
        buffer.groups.push({start:0,count:indices.length,materialIndex:2}); 
        this.anchor = geoPosition;
        return buffer;
    }

    makeMesh() {
        var mesh = new Mesh(this.computeGeometry(), [this.stencilBackMaterials,this.stencilFontMaterials,this.materials]);
        mesh.quaternion.copy(this.__meshQuaternion.invert());
        return mesh;
    }

    setPath(path) {
        this.path = path;
        if (this.mesh) {
            this.mesh.geometry.dispose();
        }
        this.mesh.geometry = this.computeGeometry();
    }

    updateFeature({ geometry: { coordinates }, topology }) {
        this.setPath(coordinates[0].map(e => GeoCoordinates.fromGeoPoint(e)));
    }

    setQuaternion(quaternion) {
        this.mesh.quaternion.copy(quaternion);
    }

}

export default SurfacePolygon;