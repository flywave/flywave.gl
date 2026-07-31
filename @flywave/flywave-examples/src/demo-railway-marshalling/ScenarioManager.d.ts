export class ScenarioManager {
    constructor(sim: any);
    m_running: boolean;
    m_timers: any[];
    m_runtimes: Map<any, any>;
    m_signalCheck: any;
    m_configs: any[];
    m_doneCount: number;
    m_sim: any;
    onLog(cb: any): void;
    m_onLog: any;
    onCycle(cb: any): void;
    m_onCycle: any;
    get running(): boolean;
    log(msg: any): void;
    reset(): void;
    run(configs: any): void;
    onArriveAtSignal(rt: any): void;
    startBranchForth(rt: any): void;
    onBranchEnd(rt: any): void;
    takeTail(path: any, length: any): any;
    orientAway(edge: any, other: any): any;
    orientFrom(edge: any, fromPoint: any): any;
}
