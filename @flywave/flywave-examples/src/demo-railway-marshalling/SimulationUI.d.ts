export class SimulationUI {
    constructor(sim: any, scenario: any, onStart: any, onReset: any);
    m_running: boolean;
    m_sim: any;
    m_scenario: any;
    m_onStart: any;
    m_onReset: any;
    m_container: HTMLDivElement;
    m_listEl: Element;
    m_startBtn: Element;
    resetUI(): void;
    update(): void;
    buildHTML(): string;
    addStyle(): void;
}
