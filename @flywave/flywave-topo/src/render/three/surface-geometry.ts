import { BufferAttribute, BufferGeometry, Uint8BufferAttribute } from "three";

import { FillFlags, RenderMode, ViewFlags } from "../../common";
import { SurfaceType } from "../../common/render/primitives/surface-params";
import { VertexIndices } from "../../common/render/primitives/vertex-indices";
import { MaterialInfo } from "./material";
import { MeshData } from "./mesh-data";
import { MeshGeometry } from "./mesh-geometry";
import { RenderOrder } from "./render-flags";
import { Target } from "./target";

export function wantMaterials(vf: ViewFlags): boolean {
    return vf.materials && RenderMode.SmoothShade === vf.renderMode;
}

export class SurfaceGeometry extends MeshGeometry {
    private readonly _buffers: Record<string, BufferAttribute>;
    private readonly _indices: Uint8BufferAttribute;

    public get lutBuffers() {
        return this._buffers;
    }

    public static create(mesh: MeshData, indices: VertexIndices): SurfaceGeometry | undefined {
        const indexBuffer = new Uint8BufferAttribute(indices.data, 3);
        return undefined !== indexBuffer
            ? new SurfaceGeometry(indexBuffer, indices.length, mesh)
            : undefined;
    }

    public dispose() {}

    public get isLit() {
        return SurfaceType.Lit === this.surfaceType || SurfaceType.TexturedLit === this.surfaceType;
    }

    public get isTexturedType() {
        return (
            SurfaceType.Textured === this.surfaceType ||
            SurfaceType.TexturedLit === this.surfaceType
        );
    }

    public get hasTexture() {
        return this.isTexturedType && undefined !== this.texture;
    }

    public get hasNormalMap() {
        return this.isLit && this.isTexturedType && undefined !== this.normalMap;
    }

    public get isGlyph() {
        return this.mesh.isGlyph;
    }

    public override get alwaysRenderTranslucent() {
        return this.isGlyph;
    }

    public get isTileSection() {
        return undefined !== this.texture && this.texture.isTileSection;
    }

    public override get supportsThematicDisplay() {
        return !this.isGlyph;
    }

    public override get allowColorOverride() {
        return FillFlags.Blanking !== (this.fillFlags & FillFlags.Blanking);
    }

    public override get asSurface() {
        return this;
    }

    public override get asEdge() {
        return undefined;
    }

    public override get asSilhouette() {
        return undefined;
    }

    public override get isLitSurface() {
        return this.isLit;
    }

    public override get hasBakedLighting() {
        return this.mesh.hasBakedLighting;
    }

    public get renderOrder(): RenderOrder {
        if (FillFlags.Behind === (this.fillFlags & FillFlags.Behind)) {
            return RenderOrder.BlankingRegion;
        }

        let order = this.isLit ? RenderOrder.LitSurface : RenderOrder.UnlitSurface;
        if (this.isPlanar) order = order | RenderOrder.PlanarBit;

        return order;
    }

    public override getColor(target: Target) {
        return this.colorInfo;
    }

    public override get materialInfo(): MaterialInfo | undefined {
        return this.mesh.materialInfo;
    }

    private constructor(indices: Uint8BufferAttribute, numIndices: number, mesh: MeshData) {
        super(mesh, numIndices);
        this._buffers = {};
        this._buffers["a_pos"] = indices;
        this._indices = indices;
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }
}
