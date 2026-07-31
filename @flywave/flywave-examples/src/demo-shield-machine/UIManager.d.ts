export class UIManager {
    constructor(delegate: any);
    delegate: any;
    root: HTMLDivElement;
    panel: HTMLDivElement;
    panelContent: Element;
    renderTopBar(): void;
    renderBottomBar(): void;
    renderControls(): void;
    createPanel(): HTMLDivElement;
    showOverview(): void;
    showPartInfo(info: any, meshName: any): void;
    setExplodeButtonActive(mode: any): void;
    mount(parent: any): void;
}
