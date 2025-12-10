import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export declare class FogGUIModule {
    private readonly mapView;
    private readonly fogModule;
    private readonly gui;
    private readonly folder;
    private readonly currentData;
    constructor(mapView: MapView, gui: GUI);
    private setupControls;
    private updateEffects;
    getName(): string;
    getFolder(): GUI;
    update(): void;
}
