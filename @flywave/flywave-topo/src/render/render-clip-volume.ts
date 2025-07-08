import { ClipVector } from "../core-geometry";

export abstract class RenderClipVolume {
    public readonly clipVector: ClipVector;

    protected constructor(clipVector: ClipVector) {
        this.clipVector = clipVector;
    }
}
