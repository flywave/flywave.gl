import { ViewFlags } from "../common";

export class ViewState {
    viewFlags: ViewFlags;

    public is3d(): boolean {
        return true;
    }

    constructor() {
        this.viewFlags = new ViewFlags();
    }
}
