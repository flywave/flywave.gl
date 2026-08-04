import * as THREE from "three/webgpu";
import { GUI } from "dat.gui";

const CANVAS_ID = "mapCanvas";

interface Stats {
    frame: number;
    meshesCreated: number;
    meshesDestroyed: number;
    meshesAlive: number;
    weakMapEstimate: number;
    pipelineCount: number;
    nodeBuilderCacheSize: number;
    bindGroupCount: number;
    jsHeapUsed: number;
    jsHeapTotal: number;
    fps: number;
}

class LeakTest {
    private renderer: THREE.WebGPURenderer;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private sharedMaterial: THREE.MeshStandardNodeMaterial;
    private sharedGeometry: THREE.BufferGeometry;
    private meshPool: THREE.Mesh[] = [];
    private aliveMeshes: THREE.Mesh[] = [];
    public mode: "no-dispose" | "full-dispose" | "bindings-only" | "aggressive" = "no-dispose";
    public spawnRate: number = 50;
    public maxAlive: number = 200;
    public patchMode: boolean = true;
    private patched: boolean = false;
    private frameCount: number = 0;
    private totalCreated: number = 0;
    private totalDestroyed: number = 0;
    private lastTime: number = performance.now();
    private fpsAccum: number = 0;
    private fpsFrames: number = 0;
    private stats: Stats = {
        frame: 0,
        meshesCreated: 0,
        meshesDestroyed: 0,
        meshesAlive: 0,
        weakMapEstimate: 0,
        pipelineCount: 0,
        nodeBuilderCacheSize: 0,
        bindGroupCount: 0,
        jsHeapUsed: 0,
        jsHeapTotal: 0,
        fps: 0
    };
    private statsDiv: HTMLDivElement;

    constructor() {
        const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
        this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        this.camera.position.z = 5;

        this.sharedMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x44aa44 });
        this.sharedGeometry = new THREE.BufferGeometry();
        this.sharedGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
                new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
                3
            )
        );
        this.sharedGeometry.setIndex([0, 1, 2, 0, 2, 3]);

        this.statsDiv = document.createElement("div");
        this.statsDiv.style.cssText =
            "position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;font:11px monospace;padding:8px;z-index:9999;border-radius:4px;white-space:pre;line-height:1.4";
        document.body.appendChild(this.statsDiv);
    }

    async init() {
        await this.renderer.init();
        if (this.patchMode) {
            this.applyPatch();
        }
    }

    private applyPatch() {
        if (this.patched) return;
        const internals = (this.renderer as THREE.WebGPURenderer & Record<string, unknown>)
            ._objects as {
            createRenderObject: (...args: unknown[]) => {
                dispose(): void;
                onDispose: (() => void) | null;
                getChainArray(): unknown[];
            };
            bindings: { deleteForRender(ro: unknown): void; delete(ro: unknown): void };
            pipelines: { delete(ro: unknown): void };
            nodes: { delete(ro: unknown): void };
            getChainMap(passId?: string): { delete(keys: unknown[]): boolean };
        };

        const original = internals.createRenderObject.bind(internals);
        const self = this;

        internals.createRenderObject = function patchedCreateRenderObject(...args: unknown[]) {
            const renderObject = original(...args);
            const chainMap = internals.getChainMap(args[10] as string | undefined);

            renderObject.onDispose = () => {
                if (self.mode === "no-dispose") return;

                internals.bindings.deleteForRender(renderObject);
                chainMap.delete(renderObject.getChainArray());

                if (self.mode === "full-dispose") {
                    internals.pipelines.delete(renderObject);
                    internals.nodes.delete(renderObject);
                }

                if (self.mode === "aggressive") {
                    internals.pipelines.delete(renderObject);
                    internals.nodes.delete(renderObject);
                    internals.bindings.delete(renderObject);
                }
            };

            const object = args[3] as THREE.Mesh<
                THREE.BufferGeometry,
                THREE.MeshStandardNodeMaterial
            >;
            let onDisposeHandler: (() => void) | null = null;
            onDisposeHandler = () => {
                renderObject.dispose();
                if (onDisposeHandler) {
                    (object.removeEventListener as (type: string, listener: () => void) => void)(
                        "dispose",
                        onDisposeHandler
                    );
                    onDisposeHandler = null;
                }
            };
            (object.addEventListener as (type: string, listener: () => void) => void)(
                "dispose",
                onDisposeHandler
            );

            return renderObject;
        };
        this.patched = true;
    }

    private spawnMesh(): THREE.Mesh {
        this.totalCreated++;
        const mesh = new THREE.Mesh(this.sharedGeometry, this.sharedMaterial);
        mesh.position.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0);
        this.scene.add(mesh);
        return mesh;
    }

    private destroyMesh(mesh: THREE.Mesh) {
        this.totalDestroyed++;
        this.scene.remove(mesh);
        if (this.mode !== "no-dispose") {
            (mesh.dispatchEvent as (event: object) => void)({ type: "dispose" });
        }
    }

    private collectStats() {
        const internals = (this.renderer as THREE.WebGPURenderer & Record<string, unknown>)
            ._objects as Record<string, unknown>;
        const nodes = (this.renderer as THREE.WebGPURenderer & Record<string, unknown>)._nodes as {
            nodeBuilderCache: Map<unknown, unknown>;
            data: WeakMap<object, unknown>;
        };
        const bindings = internals.bindings as { data: WeakMap<object, unknown> };
        const pipelines = internals.pipelines as {
            data: WeakMap<object, unknown>;
            caches: Map<unknown, unknown>;
            programs: Record<string, Map<unknown, unknown>>;
        };

        const memInfo = (
            performance as Performance & {
                memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
            }
        ).memory;

        this.stats.frame = this.frameCount;
        this.stats.meshesCreated = this.totalCreated;
        this.stats.meshesDestroyed = this.totalDestroyed;
        this.stats.meshesAlive = this.aliveMeshes.length;
        this.stats.pipelineCount = pipelines.caches.size;
        this.stats.nodeBuilderCacheSize = nodes.nodeBuilderCache.size;
        this.stats.jsHeapUsed = memInfo ? memInfo.usedJSHeapSize : 0;
        this.stats.jsHeapTotal = memInfo ? memInfo.totalJSHeapSize : 0;
        this.stats.fps =
            this.fpsAccum > 0 ? Math.round(1000 / (this.fpsAccum / this.fpsFrames)) : 0;

        this.statsDiv.textContent = [
            `Frame:     ${this.stats.frame}`,
            `FPS:       ${this.stats.fps}`,
            `Created:   ${this.stats.meshesCreated}`,
            `Destroyed: ${this.stats.meshesDestroyed}`,
            `Alive:     ${this.stats.meshesAlive}`,
            `Pipelines: ${this.stats.pipelineCount}`,
            `NodeCache: ${this.stats.nodeBuilderCacheSize}`,
            `Heap Used: ${(this.stats.jsHeapUsed / 1048576).toFixed(1)} MB`,
            `Heap Total:${(this.stats.jsHeapTotal / 1048576).toFixed(1)} MB`,
            `Mode:      ${this.mode}`
        ].join("\n");
    }

    update() {
        this.frameCount++;

        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;
        this.fpsAccum += delta;
        this.fpsFrames++;
        if (this.fpsFrames >= 30) {
            this.fpsAccum = 0;
            this.fpsFrames = 0;
        }

        const toSpawn = Math.min(this.spawnRate, this.maxAlive - this.aliveMeshes.length);
        for (let i = 0; i < toSpawn; i++) {
            const mesh = this.spawnMesh();
            this.aliveMeshes.push(mesh);
        }

        if (this.aliveMeshes.length >= this.maxAlive) {
            const toRemove = Math.min(this.spawnRate, this.aliveMeshes.length);
            for (let i = 0; i < toRemove; i++) {
                const mesh = this.aliveMeshes.shift()!;
                this.destroyMesh(mesh);
            }
        }

        this.renderer.render(this.scene, this.camera);
        this.collectStats();
    }

    setupGUI() {
        const gui = new GUI();
        const target = this as {
            mode: string;
            spawnRate: number;
            maxAlive: number;
            patchMode: boolean;
        };
        gui.add(target, "mode", ["no-dispose", "full-dispose", "bindings-only", "aggressive"]).name(
            "Disposal Mode"
        );
        gui.add(target, "spawnRate", 1, 200, 1).name("Spawn Rate/frame");
        gui.add(target, "maxAlive", 10, 1000, 10).name("Max Alive");
        gui.add(target, "patchMode")
            .name("Patched")
            .onChange((v: boolean) => {
                if (v && !this.patched) this.applyPatch();
            });
        gui.add(
            {
                reset: () => {
                    for (const m of this.aliveMeshes) this.destroyMesh(m);
                    this.aliveMeshes.length = 0;
                    this.totalCreated = 0;
                    this.totalDestroyed = 0;
                    this.frameCount = 0;
                }
            },
            "reset"
        ).name("Reset Counters");
    }
}

async function main() {
    const test = new LeakTest();
    await test.init();
    test.setupGUI();

    function loop() {
        test.update();
        requestAnimationFrame(loop);
    }
    loop();
}

main().catch(console.error);
