import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export declare class PostProcessingGUIModule {
    private readonly mapView;
    private readonly postProcessingModule;
    private readonly gui;
    private readonly folder;
    private readonly currentData;
    constructor(mapView: MapView, gui: GUI);
    open(): void;
    close(): void;
    private setupControls;
    private updateEffects;
    getName(): string;
    getFolder(): GUI;
    update(): void;
}
