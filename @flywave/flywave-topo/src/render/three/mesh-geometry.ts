import { LUTGeometry } from "./cached-geometry";
import { ColorInfo } from "./color-info";
import { FloatRgba } from "./float-rgba";
import { MeshData } from "./mesh-data";

export abstract class MeshGeometry extends LUTGeometry {
    public readonly mesh: MeshData;
    protected readonly _numIndices: number;

    public override get asMesh() {
        return this;
    }

    public get edgeWidth() {
        return this.mesh.edgeWidth;
    }

    public get edgeLineCode() {
        return this.mesh.edgeLineCode;
    }

    public override get hasFeatures() {
        return this.mesh.hasFeatures;
    }

    public get surfaceType() {
        return this.mesh.type;
    }

    public get fillFlags() {
        return this.mesh.fillFlags;
    }

    public get isPlanar() {
        return this.mesh.isPlanar;
    }

    public get colorInfo(): ColorInfo {
        return this.mesh.lut.colorInfo;
    }

    public get uniformColor(): FloatRgba | undefined {
        return this.colorInfo.isUniform ? this.colorInfo.uniform : undefined;
    }

    public get texture() {
        return this.mesh.texture;
    }

    public get normalMap() {
        return this.mesh.normalMap;
    }

    public override get hasBakedLighting() {
        return this.mesh.hasBakedLighting;
    }

    public get lut() {
        return this.mesh.lut;
    }

    public get hasScalarAnimation() {
        return this.mesh.lut.hasScalarAnimation;
    }

    protected constructor(mesh: MeshData, numIndices: number) {
        super(mesh.viewIndependentOrigin);
        this._numIndices = numIndices;
        this.mesh = mesh;
    }
}
