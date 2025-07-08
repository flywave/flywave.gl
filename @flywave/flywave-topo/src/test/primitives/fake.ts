import { ColorDef } from "../../common";
import { Range3d, Transform } from "../../core-geometry";
import { DisplayParams } from "../../common/render/primitives/display-params";
import { Geometry } from "../../primitives/geometry/geometry-primitives";

export class FakeDisplayParams extends DisplayParams {
  public constructor() {
    super(DisplayParams.Type.Linear, ColorDef.black, ColorDef.black);
  }
}

export class FakeGeometry extends Geometry {
  public constructor() {
    super(Transform.createIdentity(), Range3d.createNull(), new FakeDisplayParams(), undefined);
  }

  protected _getPolyfaces() {
    return undefined;
  }

  protected _getStrokes() {
    return undefined;
  }
}
