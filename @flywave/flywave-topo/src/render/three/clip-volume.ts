import {
    ClipVector,
    Point3d,
    Transform,
    UnionOfConvexClipPlaneSets,
    Vector3d
} from "../../core-geometry";
import { assert } from "../../utils";
import { RenderClipVolume } from "../render-clip-volume";

const scratch = {
    normal: new Vector3d(),
    dir: new Vector3d(),
    pos: new Point3d(),
    v0: new Vector3d()
};

class ClipPlanesBuffer {
    private readonly _viewMatrix = Transform.createZero();
    private readonly _view: DataView;
    private readonly _data: Uint8Array;
    private _curPos = 0;
    private readonly _clips: UnionOfConvexClipPlaneSets[];
    private readonly _append: (value: number) => void;

    public readonly numRows: number;

    public getData(viewMatrix: Transform): Uint8Array {
        if (!viewMatrix.isAlmostEqual(this._viewMatrix)) this.updateData(viewMatrix);

        return this._data;
    }

    public get byteLength(): number {
        return this._view.buffer.byteLength;
    }

    public static create(clips: UnionOfConvexClipPlaneSets[], numRows: number): ClipPlanesBuffer {
        assert(numRows > 1);
        return new ClipPlanesBuffer(clips, numRows);
    }

    private constructor(clips: UnionOfConvexClipPlaneSets[], numRows: number) {
        this._data = new Uint8Array(numRows * 4 * 4);
        this._view = new DataView(this._data.buffer);
        this._clips = clips;
        this.numRows = numRows;

        this._append = (value: number) => this.appendFloat(value);
    }

    private appendFloat(value: number): void {
        this._view.setFloat32(this._curPos, value, true);
        this.advance(4);
    }

    private appendUint8(value: number): void {
        this._view.setUint8(this._curPos, value);
        this.advance(1);
    }

    private appendValues(a: number, b: number, c: number, d: number): void {
        this._append(a);
        this._append(b);
        this._append(c);
        this._append(d);
    }

    private appendPlane(normal: Vector3d, distance: number): void {
        this.appendValues(normal.x, normal.y, normal.z, distance);
    }

    private appendSetBoundary(): void {
        this.appendValues(0, 0, 0, 0);
    }

    private appendUnionBoundary(): void {
        this.appendValues(2, 2, 2, 0);
    }

    private appendEncodedFloat(value: number) {
        const sign = value < 0 ? 1 : 0;
        value = Math.abs(value);
        const exponent = Math.floor(Math.log10(value)) + 1;
        value = value / Math.pow(10, exponent);

        const bias = 38;
        let temp = value * 256;
        const b0 = Math.floor(temp);
        temp = (temp - b0) * 256;
        const b1 = Math.floor(temp);
        temp = (temp - b1) * 256;
        const b2 = Math.floor(temp);
        const b3 = (exponent + bias) * 2 + sign;

        this.appendUint8(b0);
        this.appendUint8(b1);
        this.appendUint8(b2);
        this.appendUint8(b3);
    }

    private advance(numBytes: number): void {
        this._curPos += numBytes;
    }

    private reset(): void {
        this._curPos = 0;
    }

    private updateData(transform: Transform): void {
        this.reset();
        transform.clone(this._viewMatrix);

        const { normal, dir, pos, v0 } = { ...scratch };
        for (const clip of this._clips) {
            for (let j = 0; j < clip.convexSets.length; j++) {
                const set = clip.convexSets[j];
                if (set.planes.length === 0) continue;

                if (j > 0) this.appendSetBoundary();

                for (const plane of set.planes) {
                    plane.inwardNormalRef.clone(normal);
                    let distance = plane.distance;

                    const norm = normal;
                    transform.matrix.multiplyVector(norm, dir);
                    dir.normalizeInPlace();

                    transform.multiplyPoint3d(norm.scale(distance, v0), pos);
                    v0.setFromPoint3d(pos);

                    normal.set(dir.x, dir.y, dir.z);
                    distance = -v0.dotProduct(dir);
                    this.appendPlane(normal, distance);
                }
            }

            this.appendUnionBoundary();
        }
    }
}

export class ClipVolume extends RenderClipVolume {
    private readonly _buffer: ClipPlanesBuffer;

    public get numRows(): number {
        return this._buffer.numRows;
    }

    public get byteLength(): number {
        return this._buffer.byteLength;
    }

    public getData(viewMatrix: Transform): Uint8Array {
        return this._buffer.getData(viewMatrix);
    }

    public static create(clip: ClipVector): ClipVolume | undefined {
        if (!clip.isValid) return undefined;

        const unions = [];
        let numRows = 0;
        for (const primitive of clip.clips) {
            const union = primitive.fetchClipPlanesRef();
            if (!union) continue;

            let numSets = 0;
            for (const set of union.convexSets) {
                const setLength = set.planes.length;
                if (setLength > 0) {
                    ++numSets;
                    numRows += setLength;
                }
            }

            if (numSets > 0) {
                unions.push(union);
                numRows += numSets - 1;
            }
        }

        if (unions.length === 0) return undefined;

        numRows += unions.length;
        const buffer = ClipPlanesBuffer.create(unions, numRows);
        return new ClipVolume(clip, buffer);
    }

    private constructor(clip: ClipVector, buffer: ClipPlanesBuffer) {
        super(clip);
        this._buffer = buffer;
    }
}
