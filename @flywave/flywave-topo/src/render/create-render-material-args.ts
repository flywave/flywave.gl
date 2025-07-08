import { MaterialParams } from "../common/render/material-params";
import { Id64String } from "../utils";

export interface RenderMaterialSource {
    id: Id64String;
}

export interface CreateRenderMaterialArgs extends MaterialParams {
    source?: RenderMaterialSource;
}
