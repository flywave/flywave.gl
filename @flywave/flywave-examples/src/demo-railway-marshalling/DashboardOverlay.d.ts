export class DashboardOverlay {
    m_clockInterval: number;
    m_simSlot: any;
    m_root: HTMLDivElement;
    getSimSlot(): any;
    build(): void;
    buildHeader(): any;
    buildLeftPanel(): any;
    buildRightPanel(): any;
    buildFooter(): any;
    switchStatTab(idx: any): void;
    updateClock(): void;
    injectStyles(): void;
    dispose(): void;
}
