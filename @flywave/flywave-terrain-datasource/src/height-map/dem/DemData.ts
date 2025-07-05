import { GeoBox } from "@flywave/flywave-geoutils";
import { clamp, warnOnce } from "@flywave/flywave-utils";
import * as THREE from "three";

import DemMinMaxQuadTree from "./DemTree";

export type DEMEncoding = "mapbox" | "terrarium";

const unpackVectors: Record<DEMEncoding, THREE.Vector4> = {
    mapbox: new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0),
    terrarium: new THREE.Vector4(256.0, 1.0, 1.0 / 256.0, 32768.0)
};

interface OverlayerHeightMap {
    getDigAltitude(lng: number, lat: number): number;
}

export default class DEMData {
    public readonly uid: string | number;
    public readonly data: Uint32Array;
    public readonly stride: number;
    public readonly dim: number;
    public readonly encoding: DEMEncoding;
    public borderReady: boolean;
    public readonly height: number;
    public readonly width: number;
    public readonly pixels: Uint8Array;
    public texture?: THREE.DataTexture;
    public displacementMap?: Float32Array;
    public displacementMapTexture?: THREE.DataTexture;
    public geoBox?: GeoBox;
    public overlayerHeightMap?: OverlayerHeightMap;

    private _tree?: DemMinMaxQuadTree;
    private readonly _unpackFn: (r: number, g: number, b: number) => number;

    get tree(): DemMinMaxQuadTree {
        if (!this._tree) this.buildQuadTree();
        return this._tree!;
    }

    constructor(
        uid: string | number,
        data: ImageData,
        encoding: DEMEncoding = "mapbox",
        borderReady: boolean = false,
        buildQuadTree: boolean = false
    ) {
        this.uid = uid;
        this.height = data.height;
        this.width = data.width;

        if (data.height !== data.width) {
            throw new RangeError("DEM tiles must be square");
        }

        if (encoding && !(encoding in unpackVectors)) {
            warnOnce(
                `"${encoding}" is not a valid encoding type. Valid types include "mapbox" and "terrarium".`
            );
            encoding = "mapbox";
        }

        this.stride = data.height;
        this.dim = data.height - 2;
        this.data = new Uint32Array(data.data.buffer);
        this.pixels = new Uint8Array(this.data.buffer);
        this.encoding = encoding;
        this.borderReady = borderReady;
        this._unpackFn = encoding === "terrarium" ? this._unpackTerrarium : this._unpackMapbox;

        if (!borderReady) {
            this._fillBorders();
        }

        if (buildQuadTree) {
            this.buildQuadTree();
        }
    }

    setOverlayerHeight(geoBox: GeoBox, overlayerHeightMap: OverlayerHeightMap): void {
        this.geoBox = geoBox;
        this.overlayerHeightMap = overlayerHeightMap;
    }

    clearTree(): void {
        this._tree = undefined;
    }

    public buildDisplacementMap(): void {
        if (this.displacementMap) return;

        const q = unpackVectors.mapbox; // Using pre-defined vector
        const size = this.width * this.width;
        const displacementMap = new Float32Array(size);
        const buffer = this.pixels;

        for (let i = 0, j = 0; i < buffer.length; i += 4, j++) {
            displacementMap[j] = new THREE.Vector4(
                buffer[i],
                buffer[i + 1],
                buffer[i + 2],
                -1.0
            ).dot(q);
        }

        this.displacementMap = displacementMap;
    }

    private _fillBorders(): void {
        const { dim, data } = this;

        // Fill vertical borders
        for (let x = 0; x < dim; x++) {
            // left vertical border
            data[this._idx(-1, x)] = data[this._idx(0, x)];
            // right vertical border
            data[this._idx(dim, x)] = data[this._idx(dim - 1, x)];
            // left horizontal border
            data[this._idx(x, -1)] = data[this._idx(x, 0)];
            // right horizontal border
            data[this._idx(x, dim)] = data[this._idx(x, dim - 1)];
        }

        // Fill corners
        data[this._idx(-1, -1)] = data[this._idx(0, 0)];
        data[this._idx(dim, -1)] = data[this._idx(dim - 1, 0)];
        data[this._idx(-1, dim)] = data[this._idx(0, dim - 1)];
        data[this._idx(dim, dim)] = data[this._idx(dim - 1, dim - 1)];
    }

    _buildDisplacementMapTexture(size: number): void {
        this.buildDisplacementMap();
        const _size = size + 2;

        this.displacementMapTexture = new THREE.DataTexture(
            this.displacementMap!,
            _size,
            _size,
            THREE.RedFormat,
            THREE.FloatType
        );
        this.displacementMapTexture.flipY = true;
    }

    _buildTexture(size: number): void {
        const _size = size + 2;
        this.texture = new THREE.DataTexture(
            new Uint8Array(this.pixels.buffer),
            _size,
            _size,
            THREE.RGBAFormat
        );
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.flipY = true;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.needsUpdate = true;
    }

    public buildQuadTree(): void {
        if (!this._tree) {
            this._tree = new DemMinMaxQuadTree(this);
        }
    }

    get(x: number, y: number, clampToEdge: boolean = false): number {
        if (clampToEdge) {
            x = clamp(x, -1, this.dim);
            y = clamp(y, -1, this.dim);
        }
        const index = this._idx(x, y) * 4;
        const [r, g, b] = this.pixels.slice(index, index + 3);
        return this._unpackFn(r, g, b);
    }

    getDigBoxHeight(x: number, y: number): number {
        if (!this.overlayerHeightMap || !this.geoBox) return 0;

        const box = new THREE.Box2();
        box.expandByPoint(new THREE.Vector2().fromArray(this.geoBox.southWest.toGeoPoint()));
        box.expandByPoint(new THREE.Vector2().fromArray(this.geoBox.northEast.toGeoPoint()));

        const boxSize = box.getSize(new THREE.Vector2());
        const ret = new THREE.Vector2(x, 1 - y).multiply(boxSize).add(box.min);

        return this.overlayerHeightMap.getDigAltitude(ret.x, ret.y);
    }

    static getUnpackVector(encoding: DEMEncoding): THREE.Vector4 {
        return unpackVectors[encoding];
    }

    get unpackVector(): THREE.Vector4 {
        return unpackVectors[this.encoding];
    }

    private _idx(x: number, y: number): number {
        if (x < -1 || x >= this.dim + 1 || y < -1 || y >= this.dim + 1) {
            throw new RangeError("out of range source coordinates for DEM data");
        }
        return (y + 1) * this.stride + (x + 1);
    }

    private _unpackMapbox(r: number, g: number, b: number): number {
        return (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
    }

    private _unpackTerrarium(r: number, g: number, b: number): number {
        return r * 256 + g + b / 256 - 32768.0;
    }

    static pack(
        altitude: number,
        encoding: DEMEncoding = "mapbox"
    ): [number, number, number, number] {
        const color: [number, number, number, number] = [0, 0, 0, 0];
        const vector = DEMData.getUnpackVector(encoding);
        let v = Math.floor((altitude + vector[3]) / vector[2]);
        color[2] = v % 256;
        v = Math.floor(v / 256);
        color[1] = v % 256;
        v = Math.floor(v / 256);
        color[0] = v;
        return color;
    }

    getPixels(): THREE.DataTexture | undefined {
        return this.texture;
    }

    backfillBorder(borderTile: DEMData, dx: number, dy: number): void {
        if (this.dim !== borderTile.dim) {
            throw new Error("dem dimension mismatch");
        }

        let xMin = dx * this.dim;
        let xMax = dx * this.dim + this.dim;
        let yMin = dy * this.dim;
        let yMax = dy * this.dim + this.dim;

        // Adjust ranges based on direction
        if (dx === -1) xMin = xMax - 1;
        else if (dx === 1) xMax = xMin + 1;

        if (dy === -1) yMin = yMax - 1;
        else if (dy === 1) yMax = yMin + 1;

        const ox = -dx * this.dim;
        const oy = -dy * this.dim;
        const srcPixels = borderTile.pixels;
        const dstPixels = this.pixels;

        for (let y = yMin; y < yMax; y++) {
            for (let x = xMin; x < xMax; x++) {
                const srcIdx = 4 * this._idx(x + ox, y + oy);
                const dstIdx = 4 * this._idx(x, y);

                dstPixels[dstIdx] = srcPixels[srcIdx];
                dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
                dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
                dstPixels[dstIdx + 3] = srcPixels[srcIdx + 3];
            }
        }
    }

    dispose(): void {
        this.texture?.dispose();
        this.displacementMapTexture?.dispose();
    }

    onDeserialize(): void {
        if (this._tree) {
            this._tree.dem = this;
        }
    }
}

export { DEMData, DemMinMaxQuadTree };
