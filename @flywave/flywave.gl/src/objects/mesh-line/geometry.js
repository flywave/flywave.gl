import { BufferGeometry,Matrix4 } from "three";

function MeshLineRaycast(raycaster, intersects) {
    var inverseMatrix = new THREE.Matrix4();
    var ray = new THREE.Ray();
    var sphere = new THREE.Sphere();
    var interRay = new THREE.Vector3();
    var geometry = this.geometry;
    // Checking boundingSphere distance to ray

    sphere.copy(geometry.boundingSphere);
    sphere.applyMatrix4(this.matrixWorld);

    if (raycaster.ray.intersectSphere(sphere, interRay) === false) {
        return;
    }

    inverseMatrix.getInverse(this.matrixWorld);
    ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);

    var vStart = new THREE.Vector3();
    var vEnd = new THREE.Vector3();
    var interSegment = new THREE.Vector3();
    var step = this instanceof THREE.LineSegments ? 2 : 1;
    var index = geometry.index;
    var attributes = geometry.attributes;

    if (index !== null) {
        var indices = index.array;
        var positions = attributes.position.array;
        var widths = attributes.width.array;

        for (var i = 0, l = indices.length - 1; i < l; i += step) {
            var a = indices[i];
            var b = indices[i + 1];

            vStart.fromArray(positions, a * 3);
            vEnd.fromArray(positions, b * 3);
            var width =
                widths[Math.floor(i / 3)] != undefined
                    ? widths[Math.floor(i / 3)]
                    : 1;
            var precision =
                raycaster.linePrecision +
                (this.material.lineWidth * width) / 2;
            var precisionSq = precision * precision;

            var distSq = ray.distanceSqToSegment(
                vStart,
                vEnd,
                interRay,
                interSegment
            );

            if (distSq > precisionSq) continue;

            interRay.applyMatrix4(this.matrixWorld); //Move back to world space for distance calculation

            var distance = raycaster.ray.origin.distanceTo(interRay);

            if (distance < raycaster.near || distance > raycaster.far)
                continue;

            intersects.push({
                distance: distance,
                // What do we want? intersection point on the ray or on the segment??
                // point: raycaster.ray.at( distance ),
                point: interSegment.clone().applyMatrix4(this.matrixWorld),
                index: i,
                face: null,
                faceIndex: null,
                object: this
            });
            // make event only fire once
            i = l;
        }
    }
}

function memcpy(src, srcOffset, dst, dstOffset, length) {
    var i;

    src = src.subarray || src.slice ? src : src.buffer;
    dst = dst.subarray || dst.slice ? dst : dst.buffer;

    src = srcOffset
        ? src.subarray
            ? src.subarray(srcOffset, length && srcOffset + length)
            : src.slice(srcOffset, length && srcOffset + length)
        : src;

    if (dst.set) {
        dst.set(src, dstOffset);
    } else {
        for (i = 0; i < src.length; i++) {
            dst[i + dstOffset] = src[i];
        }
    }

    return dst;
}

class MeshLine extends BufferGeometry {
    constructor() {
        super(...arguments);
        Object.defineProperties(this, {
            geometry: {
                enumerable: true,
                get: function () {
                    return this;
                },
                set: function (value) {
                    this.setFromGeometry(value);
                }
            },
            vertices: {
                enumerable: true,
                get: function () {
                    return this._vertices;
                },
                set: function (value) {
                    this.setVertices(value);
                }
            },
            bufferArray: {
                enumerable: true,
                get: function () {
                    return this._bufferArray;
                },
                set: function (value) {
                    this.setBufferArray(value);
                }
            }
        });
    }
    type = "MeshLine";

    positions = [];

    previous = [];
    next = [];
    side = [];
    width = [];
    indices_array = [];
    uvs = [];
    counters = [];
    _vertices = [];
    _bufferArray = [];

    widthCallback = null;

    // Used to raycast
    matrixWorld = new THREE.Matrix4();

    // to support previous api

    isMeshLine = true;

    setMatrixWorld(matrixWorld) {
        this.matrixWorld = matrixWorld;
    };

    setFromGeometry(g, c) {
        if (g instanceof THREE.Geometry) {
            this.setVertices(g.vertices, c);
        }
        if (g instanceof THREE.BufferGeometry) {
            this.setBufferArray(g.getAttribute("position").array, c);
        }
        if (g instanceof Float32Array || g instanceof Array) {
            // to support previous api
            this.setBufferArray(g, c);
        }
    }

    setGeometry(g, c) {
        this.setFromGeometry(g, c);
    };

    setVertices(vts, wcb) {
        this._vertices = vts;
        this.widthCallback = wcb || this.widthCallback;
        this.positions = [];
        this.counters = [];
        for (var j = 0; j < vts.length; j++) {
            var v = vts[j];
            var c = j / vts.length;
            this.positions.push(v.x, v.y, v.z);
            this.positions.push(v.x, v.y, v.z);
            this.counters.push(c);
            this.counters.push(c);
        }
        this.process();
    }

    setBufferArray(ba, wcb) {
        this._bufferArray = ba;
        this.widthCallback = wcb || this.widthCallback;
        this.positions = [];
        this.counters = [];
        for (var j = 0; j < ba.length; j += 3) {
            var c = j / ba.length;
            this.positions.push(ba[j], ba[j + 1], ba[j + 2]);
            this.positions.push(ba[j], ba[j + 1], ba[j + 2]);
            this.counters.push(c);
            this.counters.push(c);
        }
        this.process();
    }

    raycast = MeshLineRaycast;

    compareV3(a, b) {
        var aa = a * 6;
        var ab = b * 6;
        return (
            this.positions[aa] === this.positions[ab] &&
            this.positions[aa + 1] === this.positions[ab + 1] &&
            this.positions[aa + 2] === this.positions[ab + 2]
        );
    }
    copyV3(a) {
        var aa = a * 6;
        return [
            this.positions[aa],
            this.positions[aa + 1],
            this.positions[aa + 2]
        ];
    };

    process() {
        var l = this.positions.length / 6;

        this.previous = [];
        this.next = [];
        this.side = [];
        this.width = [];
        this.indices_array = [];
        this.uvs = [];

        for (var j = 0; j < l; j++) {
            this.side.push(1);
            this.side.push(-1);
        }

        var w;
        for (var j = 0; j < l; j++) {
            if (this.widthCallback) w = this.widthCallback(j / (l - 1));
            else w = 1;
            this.width.push(w);
            this.width.push(w);
        }

        for (var j = 0; j < l; j++) {
            this.uvs.push(j / (l - 1), 0);
            this.uvs.push(j / (l - 1), 1);
        }

        var v;

        if (this.compareV3(0, l - 1)) {
            v = this.copyV3(l - 2);
        } else {
            v = this.copyV3(0);
        }
        this.previous.push(v[0], v[1], v[2]);
        this.previous.push(v[0], v[1], v[2]);
        for (var j = 0; j < l - 1; j++) {
            v = this.copyV3(j);
            this.previous.push(v[0], v[1], v[2]);
            this.previous.push(v[0], v[1], v[2]);
        }

        for (var j = 1; j < l; j++) {
            v = this.copyV3(j);
            this.next.push(v[0], v[1], v[2]);
            this.next.push(v[0], v[1], v[2]);
        }

        if (this.compareV3(l - 1, 0)) {
            v = this.copyV3(1);
        } else {
            v = this.copyV3(l - 1);
        }
        this.next.push(v[0], v[1], v[2]);
        this.next.push(v[0], v[1], v[2]);

        for (var j = 0; j < l - 1; j++) {
            var n = j * 2;
            this.indices_array.push(n, n + 1, n + 2);
            this.indices_array.push(n + 2, n + 1, n + 3);
        }
        if (!this._attributes) {
            this._attributes = {
                position: new THREE.BufferAttribute(
                    new Float32Array(this.positions),
                    3
                ),
                previous: new THREE.BufferAttribute(
                    new Float32Array(this.previous),
                    3
                ),
                next: new THREE.BufferAttribute(new Float32Array(this.next), 3),
                side: new THREE.BufferAttribute(new Float32Array(this.side), 1),
                width: new THREE.BufferAttribute(
                    new Float32Array(this.width),
                    1
                ),
                uv: new THREE.BufferAttribute(new Float32Array(this.uvs), 2),
                index: new THREE.BufferAttribute(
                    new Uint16Array(this.indices_array),
                    1
                ),
                counters: new THREE.BufferAttribute(
                    new Float32Array(this.counters),
                    1
                )
            };
        } else {
            this._attributes.position.copyArray(
                new Float32Array(this.positions)
            );
            this._attributes.position.needsUpdate = true;
            this._attributes.previous.copyArray(
                new Float32Array(this.previous)
            );
            this._attributes.previous.needsUpdate = true;
            this._attributes.next.copyArray(new Float32Array(this.next));
            this._attributes.next.needsUpdate = true;
            this._attributes.side.copyArray(new Float32Array(this.side));
            this._attributes.side.needsUpdate = true;
            this._attributes.width.copyArray(new Float32Array(this.width));
            this._attributes.width.needsUpdate = true;
            this._attributes.uv.copyArray(new Float32Array(this.uvs));
            this._attributes.uv.needsUpdate = true;
            this._attributes.index.copyArray(
                new Uint16Array(this.indices_array)
            );
            this._attributes.index.needsUpdate = true;
        }

        this.setAttribute("position", this._attributes.position);
        this.setAttribute("previous", this._attributes.previous);
        this.setAttribute("next", this._attributes.next);
        this.setAttribute("side", this._attributes.side);
        this.setAttribute("width", this._attributes.width);
        this.setAttribute("uv", this._attributes.uv);
        this.setAttribute("counters", this._attributes.counters);

        this.setIndex(this._attributes.index);

        this.computeBoundingSphere();
        this.computeBoundingBox();
    }

    advance(position) {
        var positions = this._attributes.position.array;
        var previous = this._attributes.previous.array;
        var next = this._attributes.next.array;
        var l = positions.length;

        // PREVIOUS
        memcpy(positions, 0, previous, 0, l);

        // POSITIONS
        memcpy(positions, 6, positions, 0, l - 6);

        positions[l - 6] = position.x;
        positions[l - 5] = position.y;
        positions[l - 4] = position.z;
        positions[l - 3] = position.x;
        positions[l - 2] = position.y;
        positions[l - 1] = position.z;

        // NEXT
        memcpy(positions, 6, next, 0, l - 6);

        next[l - 6] = position.x;
        next[l - 5] = position.y;
        next[l - 4] = position.z;
        next[l - 3] = position.x;
        next[l - 2] = position.y;
        next[l - 1] = position.z;

        this._attributes.position.needsUpdate = true;
        this._attributes.previous.needsUpdate = true;
        this._attributes.next.needsUpdate = true;
    }
}

export default MeshLine;