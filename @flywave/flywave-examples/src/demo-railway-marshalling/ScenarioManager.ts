import * as THREE from "three";
import { TrainSimulator, SignalState } from "./TrainSimulator";
import type { TrackEdge } from "./TrackNetwork";

const CARRIAGE_SPACING = 21.2;

export interface TrainConfig {
    id: string;
    edgeIds: string[];
    carriages: number;
    speed: number;
    signalId?: string;
}

enum Phase {
    APPROACHING,
    WAITING_SIGNAL,
    BRANCH_FORTH,
    DONE
}

interface Runtime {
    cfg: TrainConfig;
    phase: Phase;
    driveToSignalPath: THREE.Vector3[];
    driveToSignalEdges: TrackEdge[];
    branchPath: THREE.Vector3[];
    branchEdge: TrackEdge;
    hasApproach: boolean;
}

export class ScenarioManager {
    private m_sim: TrainSimulator;
    private m_running = false;
    private m_onLog?: (msg: string) => void;
    private m_onCycle?: () => void;
    private m_timers: number[] = [];
    private m_runtimes: Map<string, Runtime> = new Map();
    private m_signalCheck: number | null = null;
    private m_configs: TrainConfig[] = [];
    private m_doneCount = 0;

    constructor(sim: TrainSimulator) {
        this.m_sim = sim;
    }

    onLog(cb: (msg: string) => void) {
        this.m_onLog = cb;
    }

    onCycle(cb: () => void) {
        this.m_onCycle = cb;
    }

    get running() {
        return this.m_running;
    }

    private log(msg: string) {
        this.m_onLog?.(msg);
    }

    reset() {
        for (const t of this.m_timers) clearTimeout(t);
        if (this.m_signalCheck !== null) clearInterval(this.m_signalCheck);
        this.m_timers = [];
        this.m_signalCheck = null;
        for (const t of this.m_sim.getTrains()) this.m_sim.removeTrain(t.id);
        for (const [id] of this.m_sim.getSignals()) this.m_sim.setSignal(id, SignalState.RED);
        this.m_runtimes.clear();
        this.m_doneCount = 0;
        this.m_running = false;
    }

    run(configs: TrainConfig[]) {
        if (this.m_running) return;
        this.reset();
        this.m_configs = configs;

        const net = this.m_sim.getNetwork();
        this.m_running = true;

        for (const cfg of configs) {
            const edges = cfg.edgeIds.map(id => net.getEdge(id)).filter((e): e is TrackEdge => !!e);
            if (edges.length === 0) continue;

            const firstEdge = edges[0];
            const lastEdge = edges[edges.length - 1];
            const hasApproach = edges.length > 1;

            const train = this.m_sim.createTrain(cfg.id, cfg.carriages, firstEdge.id);
            if (!train) continue;

            let driveToSignalPath: THREE.Vector3[] = [];
            let driveToSignalEdges: TrackEdge[] = [];
            let branchPath: THREE.Vector3[];

            if (hasApproach) {
                driveToSignalPath = this.orientAway(firstEdge, lastEdge);
                driveToSignalEdges = [firstEdge];
                branchPath = this.orientFrom(
                    lastEdge,
                    driveToSignalPath[driveToSignalPath.length - 1]
                );
            } else {
                branchPath = firstEdge.projectedPath.map(p => p.clone());
            }

            const rt: Runtime = {
                cfg,
                phase: Phase.APPROACHING,
                driveToSignalPath,
                driveToSignalEdges,
                branchPath,
                branchEdge: lastEdge,
                hasApproach
            };
            this.m_runtimes.set(cfg.id, rt);

            if (hasApproach) {
                this.log(`${cfg.id}: 驶向信号灯`);
                this.m_sim.moveTrain(cfg.id, driveToSignalPath, driveToSignalEdges, cfg.speed, () =>
                    this.onArriveAtSignal(rt)
                );
            } else {
                this.log(`${cfg.id}: 出发`);
                this.startBranchForth(rt);
            }
        }
    }

    private onArriveAtSignal(rt: Runtime) {
        this.m_sim.stopTrain(rt.cfg.id);
        rt.phase = Phase.WAITING_SIGNAL;
        this.log(`${rt.cfg.id}: 红灯等待`);

        this.m_signalCheck = window.setInterval(() => {
            if (this.m_sim.getSignalState(rt.cfg.signalId!) === SignalState.GREEN) {
                if (this.m_signalCheck !== null) clearInterval(this.m_signalCheck);
                this.m_signalCheck = null;
                this.log(`${rt.cfg.id}: 信号绿灯，进入分支`);
                this.startBranchForth(rt);
            }
        }, 200);
    }

    private startBranchForth(rt: Runtime) {
        rt.phase = Phase.BRANCH_FORTH;

        if (rt.hasApproach) {
            const tailLen = (rt.cfg.carriages + 1) * CARRIAGE_SPACING;
            const tail = this.takeTail(rt.driveToSignalPath, tailLen);
            const combined = [...tail, ...rt.branchPath.slice(1)];
            const initialDist = tail.length > 1 ? tail[tail.length - 1].distanceTo(tail[0]) : 0;
            this.m_sim.moveTrain(
                rt.cfg.id,
                combined,
                [rt.branchEdge],
                rt.cfg.speed,
                () => this.onBranchEnd(rt),
                initialDist
            );
        } else {
            this.m_sim.moveTrain(rt.cfg.id, rt.branchPath, [rt.branchEdge], rt.cfg.speed, () =>
                this.onBranchEnd(rt)
            );
        }
    }

    private onBranchEnd(rt: Runtime) {
        this.m_sim.stopTrain(rt.cfg.id);
        rt.phase = Phase.DONE;
        this.log(`${rt.cfg.id}: 到达终点`);
        this.m_doneCount++;
        if (this.m_doneCount >= this.m_runtimes.size) {
            this.log("全部到达，3s 后重新开始");
            const timer = window.setTimeout(() => {
                this.m_onCycle?.();
                this.m_running = false;
                this.run(this.m_configs);
            }, 3000);
            this.m_timers.push(timer);
        }
    }

    private takeTail(path: THREE.Vector3[], length: number): THREE.Vector3[] {
        if (path.length < 2) return path;
        const result: THREE.Vector3[] = [path[path.length - 1].clone()];
        let acc = 0;
        for (let i = path.length - 2; i >= 0; i--) {
            acc += path[i + 1].distanceTo(path[i]);
            result.unshift(path[i].clone());
            if (acc >= length) break;
        }
        return result;
    }

    private orientAway(edge: TrackEdge, other: TrackEdge): THREE.Vector3[] {
        const path = edge.projectedPath;
        const first = path[0];
        const last = path[path.length - 1];
        const dFirst =
            first.distanceTo(other.projectedPath[0]) +
            first.distanceTo(other.projectedPath[other.projectedPath.length - 1]);
        const dLast =
            last.distanceTo(other.projectedPath[0]) +
            last.distanceTo(other.projectedPath[other.projectedPath.length - 1]);
        if (dFirst < dLast) {
            return path
                .slice()
                .reverse()
                .map(p => p.clone());
        }
        return path.map(p => p.clone());
    }

    private orientFrom(edge: TrackEdge, fromPoint: THREE.Vector3): THREE.Vector3[] {
        const path = edge.projectedPath;
        const dFirst = fromPoint.distanceTo(path[0]);
        const dLast = fromPoint.distanceTo(path[path.length - 1]);
        if (dLast < dFirst) {
            return path
                .slice()
                .reverse()
                .map(p => p.clone());
        }
        return path.map(p => p.clone());
    }
}
