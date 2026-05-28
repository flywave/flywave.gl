import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RailwayDataSource } from "./RailwayDataSource";
import { TrackNetwork, TrackEdge } from "./TrackNetwork";

export enum TrainState {
    WAITING = "waiting",
    MOVING = "moving",
    STOPPED = "stopped"
}

export enum SignalState {
    RED = "red",
    GREEN = "green"
}

export interface TrainInstance {
    id: string;
    engine: THREE.Object3D;
    carriages: THREE.Object3D[];
    state: TrainState;
    pathPositions: THREE.Vector3[];
    pathTangents: THREE.Vector3[];
    pathTotalLength: number;
    distance: number;
    speed: number;
    pathEdges: TrackEdge[];
    onArrival?: () => void;
}

export interface SignalLight {
    group: THREE.Group;
    greenSphere: THREE.Mesh;
    redSphere: THREE.Mesh;
    state: SignalState;
    label: string;
    position: THREE.Vector3;
    direction: THREE.Vector3;
}

export interface RetarderInstanceData {
    translate: number[];
    rotation: number[];
    scale: number[];
}

export class TrainSimulator {
    private m_dataSource: RailwayDataSource;
    private m_network: TrackNetwork;
    private m_trains: Map<string, TrainInstance> = new Map();
    private m_signals: Map<string, SignalLight> = new Map();
    private m_carriageSpacing = 15;
    private m_engineGap = 14;
    private m_engineModel?: THREE.Object3D;
    private m_carriageModel?: THREE.Object3D;
    private m_signalModel?: THREE.Object3D;
    private m_retarderModel?: THREE.Object3D;
    private m_modelScale = 0.8;
    private m_customEnvMap: THREE.Texture | null = null;

    constructor(dataSource: RailwayDataSource, network: TrackNetwork) {
        this.m_dataSource = dataSource;
        this.m_network = network;
    }

    async loadEnvMap(url: string): Promise<void> {
        try {
            const tex = await new THREE.TextureLoader().loadAsync(url);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            this.m_customEnvMap = tex;
        } catch {
            this.m_customEnvMap = null;
        }
    }

    async loadModels(engineUrl: string, carriageUrl: string, scale: number = 1): Promise<void> {
        this.m_modelScale = scale;
        try {
            const loader = new GLTFLoader();
            const [eg, cg] = await Promise.all([
                loader.loadAsync(engineUrl),
                loader.loadAsync(carriageUrl)
            ]);
            this.m_engineModel = eg.scene;
            this.m_carriageModel = cg.scene;
        } catch {}
        if (!this.m_engineModel) this.m_engineModel = this.createPlaceholder(0xff4444);
        if (!this.m_carriageModel) this.m_carriageModel = this.createPlaceholder(0x4488ff);
    }

    async loadSignalModel(url: string, scale: number = 1): Promise<void> {
        try {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(url);
            this.m_signalModel = gltf.scene;
            this.m_signalModel.scale.setScalar(scale);
        } catch {
            this.m_signalModel = undefined;
        }
    }

    async loadRetarderModel(url: string): Promise<void> {
        try {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(url);
            this.m_retarderModel = gltf.scene;
        } catch {
            this.m_retarderModel = undefined;
        }
    }

    private disableEnvMap(model: THREE.Object3D): void {
        model.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
                const mesh = child as THREE.Mesh;
                const mat = mesh.material;
                const mats = Array.isArray(mat) ? mat : [mat];
                for (const m of mats) {
                    if (m instanceof THREE.MeshStandardMaterial) {
                        m.envMapIntensity = 1.0;
                    }
                }
                const origBefore = mesh.onBeforeRender.bind(mesh);
                mesh.onBeforeRender = (renderer, scene, camera) => {
                    (mesh as any)._savedEnv = scene.environment;
                    scene.environment = this.m_customEnvMap;
                    origBefore(renderer, scene, camera);
                };
                const origAfter = mesh.onAfterRender.bind(mesh);
                mesh.onAfterRender = (renderer, scene, camera) => {
                    scene.environment = (mesh as any)._savedEnv;
                    origAfter(renderer, scene, camera);
                };
            }
        });
    }

    private createPlaceholder(color: number): THREE.Object3D {
        const g = new THREE.Group();
        const b = new THREE.Mesh(
            new THREE.BoxGeometry(3.5, 24, 3.5),
            new THREE.MeshBasicMaterial({ color })
        );
        b.position.y = 10;
        g.add(b);
        return g;
    }

    createTrain(id: string, carriageCount: number, edgeId: string): TrainInstance | null {
        if (!this.m_engineModel || !this.m_carriageModel) return null;
        const edge = this.m_network.getEdge(edgeId);
        if (!edge) return null;

        const engineWrap = new THREE.Group();
        const engine = this.m_engineModel.clone();
        engine.scale.setScalar(this.m_modelScale);
        this.disableEnvMap(engine);
        engineWrap.add(engine);
        this.m_dataSource.addObject(`${id}_engine`, engineWrap);

        const carriages: THREE.Object3D[] = [];
        for (let i = 0; i < carriageCount; i++) {
            const cwrap = new THREE.Group();
            const carriage = this.m_carriageModel!.clone();
            carriage.scale.setScalar(this.m_modelScale);
            this.disableEnvMap(carriage);
            cwrap.add(carriage);
            this.m_dataSource.addObject(`${id}_carriage_${i}`, cwrap);
            carriages.push(cwrap);
        }

        const pp = edge.projectedPath.map(p => p.clone());
        const pt: THREE.Vector3[] = [];
        for (let i = 0; i < pp.length - 1; i++)
            pt.push(new THREE.Vector3().subVectors(pp[i + 1], pp[i]).normalize());
        pt.push(pt.length > 0 ? pt[pt.length - 1].clone() : new THREE.Vector3(1, 0, 0));
        let tl = 0;
        for (let i = 1; i < pp.length; i++) tl += pp[i].distanceTo(pp[i - 1]);

        const t: TrainInstance = {
            id,
            engine: engineWrap,
            carriages,
            state: TrainState.WAITING,
            pathPositions: pp,
            pathTangents: pt,
            pathTotalLength: tl,
            distance: 0,
            speed: 0,
            pathEdges: [edge]
        };
        this.m_trains.set(id, t);
        this.updateVisual(t);
        return t;
    }

    moveTrain(
        id: string,
        positions: THREE.Vector3[],
        edges: TrackEdge[],
        speed: number,
        onArrival?: () => void,
        initialDistance: number = 0
    ): boolean {
        const t = this.m_trains.get(id);
        if (!t || positions.length < 2) return false;

        const tangents: THREE.Vector3[] = [];
        for (let i = 0; i < positions.length - 1; i++)
            tangents.push(
                new THREE.Vector3().subVectors(positions[i + 1], positions[i]).normalize()
            );
        tangents.push(
            tangents.length > 0 ? tangents[tangents.length - 1].clone() : new THREE.Vector3(1, 0, 0)
        );

        let tl = 0;
        for (let i = 1; i < positions.length; i++) tl += positions[i].distanceTo(positions[i - 1]);

        t.pathPositions = positions;
        t.pathTangents = tangents;
        t.pathTotalLength = tl;
        t.pathEdges = edges;
        t.distance = initialDistance;
        t.speed = speed;
        t.state = TrainState.MOVING;
        t.onArrival = onArrival;
        for (const e of edges) this.m_network.occupyEdge(e.id);
        return true;
    }

    stopTrain(id: string): void {
        const t = this.m_trains.get(id);
        if (!t) return;
        t.state = TrainState.STOPPED;
        t.speed = 0;
        for (const e of t.pathEdges) this.m_network.releaseEdge(e.id);
    }

    waitTrain(id: string): void {
        const t = this.m_trains.get(id);
        if (t) {
            t.state = TrainState.WAITING;
            t.speed = 0;
        }
    }

    removeTrain(id: string): void {
        const t = this.m_trains.get(id);
        if (!t) return;
        this.m_dataSource.removeObject(`${id}_engine`);
        for (let i = 0; i < t.carriages.length; i++)
            this.m_dataSource.removeObject(`${id}_carriage_${i}`);
        for (const e of t.pathEdges) this.m_network.releaseEdge(e.id);
        this.m_trains.delete(id);
    }

    createSignalAtPosition(
        id: string,
        lat: number,
        lon: number,
        alt: number,
        label: string,
        direction: THREE.Vector3
    ): void {
        const pos = this.m_dataSource.projectToWorld(lat, lon, alt);
        const normal = this.m_dataSource.computeSurfaceNormal(pos);

        const group = new THREE.Group();

        const modelGroup = new THREE.Group();
        if (this.m_signalModel) {
            const model = this.m_signalModel.clone();
            this.disableEnvMap(model);
            modelGroup.add(model);
        }

        const greenSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.073, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        greenSphere.position.set(0.011648, 0.752258, 0.062135);
        greenSphere.visible = false;
        modelGroup.add(greenSphere);

        const redSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.073, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        redSphere.position.set(0.011648, 0.912623, 0.062135);
        redSphere.visible = true;
        modelGroup.add(redSphere);

        group.add(modelGroup);

        modelGroup.rotateY((240 * Math.PI) / 180);

        group.position.copy(pos);
        const up = normal.clone().normalize();
        const fwd = direction.clone().normalize();
        const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const corrFwd = new THREE.Vector3().crossVectors(right, up).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, up, corrFwd)
        );
        group.quaternion.copy(q);

        this.m_dataSource.addObject(id, group);
        this.m_signals.set(id, {
            group,
            greenSphere,
            redSphere,
            state: SignalState.RED,
            label,
            position: pos.clone(),
            direction: corrFwd.clone()
        });
    }

    setSignal(id: string, state: SignalState): void {
        const s = this.m_signals.get(id);
        if (!s) return;
        s.state = state;
        s.greenSphere.visible = state === SignalState.GREEN;
        s.redSphere.visible = state === SignalState.RED;
    }

    createRetarderInstances(
        id: string,
        basePosition: THREE.Vector3,
        instances: RetarderInstanceData[]
    ): void {
        if (!this.m_retarderModel || instances.length === 0) return;

        this.m_retarderModel.updateMatrixWorld(true);

        const group = new THREE.Group();
        group.position.copy(basePosition);

        const count = instances.length;
        const dummy = new THREE.Object3D();

        this.m_retarderModel.traverse(child => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrixWorld);

            const mat = Array.isArray(mesh.material)
                ? mesh.material.map(m => m.clone())
                : mesh.material.clone();

            if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMapIntensity = 1.0;
            }

            const im = new THREE.InstancedMesh(geom, mat, count);
            im.castShadow = true;
            im.receiveShadow = false;

            for (let i = 0; i < count; i++) {
                const inst = instances[i];
                dummy.position.set(inst.translate[0], inst.translate[1], inst.translate[2]);
                dummy.quaternion.set(
                    inst.rotation[0],
                    inst.rotation[1],
                    inst.rotation[2],
                    inst.rotation[3]
                );
                dummy.scale.set(inst.scale[0], inst.scale[1], inst.scale[2]);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
            }
            im.instanceMatrix.needsUpdate = true;
            group.add(im);
        });

        this.m_dataSource.addObject(id, group);
    }

    getSignalState(id: string): SignalState | undefined {
        return this.m_signals.get(id)?.state;
    }

    getSignals(): Map<string, SignalLight> {
        return this.m_signals;
    }

    isEdgeOccupied(edgeId: string): boolean {
        return this.m_network.getEdge(edgeId)?.occupied ?? false;
    }

    update(dt: number): void {
        for (const t of this.m_trains.values()) {
            if (t.state !== TrainState.MOVING) continue;
            t.distance += t.speed * dt;
            if (t.distance >= t.pathTotalLength) {
                t.distance = t.pathTotalLength;
                t.state = TrainState.STOPPED;
                t.speed = 0;
                if (t.onArrival) {
                    const cb = t.onArrival;
                    t.onArrival = undefined;
                    cb();
                }
            }
            this.updateVisual(t);
        }
    }

    private updateVisual(train: TrainInstance): void {
        const ep = this.lerp(
            train.pathPositions,
            train.pathTangents,
            train.distance,
            train.pathTotalLength
        );
        if (!ep) return;
        this.applyRot(train.engine, ep.position, ep.tangent);
        for (let i = 0; i < train.carriages.length; i++) {
            const offset = this.m_engineGap + i * this.m_carriageSpacing;
            const d = train.distance - offset;
            const cp = this.lerp(train.pathPositions, train.pathTangents, d, train.pathTotalLength);
            if (cp) this.applyRot(train.carriages[i], cp.position, cp.tangent);
        }
    }

    private applyRot(obj: THREE.Object3D, pos: THREE.Vector3, tangent: THREE.Vector3): void {
        const fwd = tangent.clone().normalize();
        const up = this.m_dataSource.computeSurfaceNormal(pos).normalize();
        const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, up, fwd)
        );
        obj.position.copy(pos);
        obj.quaternion.copy(q);
    }

    private lerp(
        positions: THREE.Vector3[],
        tangents: THREE.Vector3[],
        dist: number,
        total: number
    ) {
        if (positions.length === 0) return null;
        const d = Math.max(0, Math.min(dist, total));
        let acc = 0;
        for (let i = 0; i < positions.length - 1; i++) {
            const seg = positions[i].distanceTo(positions[i + 1]);
            if (acc + seg >= d) {
                const t = seg > 0 ? (d - acc) / seg : 0;
                return {
                    position: new THREE.Vector3().lerpVectors(positions[i], positions[i + 1], t),
                    tangent: tangents[i] ? tangents[i].clone() : new THREE.Vector3(1, 0, 0)
                };
            }
            acc += seg;
        }
        return {
            position: positions[positions.length - 1].clone(),
            tangent: tangents[tangents.length - 1] || new THREE.Vector3(1, 0, 0)
        };
    }

    getTrain(id: string) {
        return this.m_trains.get(id);
    }
    getTrains() {
        return Array.from(this.m_trains.values());
    }
    getNetwork() {
        return this.m_network;
    }
    get dataSource() {
        return this.m_dataSource;
    }
}
