import { B3DMDescription, B3DMLoaderBase } from "../base/B3DMLoaderBase";
import {
    DefaultLoadingManager,
    Matrix4,
    Mesh,
    BufferAttribute,
    BufferGeometry,
    LineSegments,
    Object3D,
    LoadingManager
} from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { BatchTableHeader } from "../utilities/FeatureTable";

interface PrimitiveDef {
    extensions?: Record<string, any>;
    attributes: Record<string, any>;
    material?: number;
    mode?: number;
    indices?: number;
}

interface DracoExtension {
    bufferView: number;
    indices: number;
    attributes: Record<string, any>;
}

interface FetchOptions {
    credentials?: "include" | "omit";
    mode?: "cors" | "no-cors" | "same-origin";
    headers?: Record<string, string>;
}

const EXTENSIONS = {
    KHR_BINARY_GLTF: "KHR_binary_glTF",
    KHR_DRACO_MESH_COMPRESSION: "KHR_draco_mesh_compression",
    KHR_LIGHTS_PUNCTUAL: "KHR_lights_punctual",
    KHR_MATERIALS_CLEARCOAT: "KHR_materials_clearcoat",
    KHR_MATERIALS_IOR: "KHR_materials_ior",
    KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: "KHR_materials_pbrSpecularGlossiness",
    KHR_MATERIALS_SHEEN: "KHR_materials_sheen",
    KHR_MATERIALS_SPECULAR: "KHR_materials_specular",
    KHR_MATERIALS_TRANSMISSION: "KHR_materials_transmission",
    KHR_MATERIALS_UNLIT: "KHR_materials_unlit",
    KHR_MATERIALS_VOLUME: "KHR_materials_volume",
    KHR_TEXTURE_BASISU: "KHR_texture_basisu",
    KHR_TEXTURE_TRANSFORM: "KHR_texture_transform",
    KHR_MESH_QUANTIZATION: "KHR_mesh_quantization",
    EXT_TEXTURE_WEBP: "EXT_texture_webp",
    EXT_MESHOPT_COMPRESSION: "EXT_meshopt_compression"
} as const;

export class B3DMLoader<
    BatchTableExtensions extends BatchTableHeader
> extends B3DMLoaderBase<BatchTableExtensions> {
    manager: LoadingManager;
    private adjustmentTransform: Matrix4;
    tile: any;
    fetchOptions: FetchOptions = {};
    workingPath: string = "";

    constructor(manager: LoadingManager = DefaultLoadingManager, tile?: any) {
        super();
        this.manager = manager;
        this.adjustmentTransform = new Matrix4();
        this.tile = tile;
    }

    private createAttributesKey(attributes: Record<string, any>): string {
        let attributesKey = "";
        const keys = Object.keys(attributes).sort();

        for (let i = 0, il = keys.length; i < il; i++) {
            attributesKey += keys[i] + ":" + attributes[keys[i]] + ";";
        }

        return attributesKey;
    }

    private createPrimitiveKey(primitiveDef: PrimitiveDef): string {
        const dracoExtension = primitiveDef.extensions?.[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION] as
            | DracoExtension
            | undefined;
        let geometryKey: string;

        if (dracoExtension) {
            geometryKey =
                "draco:" +
                dracoExtension.bufferView +
                ":" +
                dracoExtension.indices +
                ":" +
                this.createAttributesKey(dracoExtension.attributes);
        } else {
            geometryKey =
                (primitiveDef.material ?? "") +
                ":" +
                this.createAttributesKey(primitiveDef.attributes) +
                ":" +
                (primitiveDef.mode ?? "");
        }

        return geometryKey;
    }

    async parse(buffer: ArrayBuffer): Promise<B3DMDescription> {
        const b3dm = await super.parse(buffer);
        const gltfBuffer = b3dm.glbBytes.slice().buffer;

        return new Promise((resolve, reject) => {
            const manager = this.manager;
            const fetchOptions = this.fetchOptions;
            const loader: GLTFLoader =
                (manager.getHandler("path.gltf") as GLTFLoader) || new GLTFLoader(manager);

            if (fetchOptions.credentials === "include" && fetchOptions.mode === "cors") {
                loader.setCrossOrigin("use-credentials");
            }

            if ("credentials" in fetchOptions) {
                loader.setWithCredentials(fetchOptions.credentials === "include");
            }

            if (fetchOptions.headers) {
                loader.setRequestHeader(fetchOptions.headers);
            }

            // GLTFLoader assumes the working path ends in a slash
            let workingPath = this.workingPath;
            if (!/[\\/]$/.test(workingPath) && workingPath.length) {
                workingPath += "/";
            }

            const adjustmentTransform = this.adjustmentTransform;

            loader.parse(
                gltfBuffer,
                workingPath,
                (model: GLTF) => {
                    const { batchTable, featureTable } = b3dm;
                    const scene = model.scene;

                    const meshMap = new Map<string, Mesh | LineSegments>();
                    const indexBuffer = new Map<string, ArrayLike<number>[]>();

                    scene.traverse((e: Object3D) => {
                        if ((e as Mesh).isMesh || (e as LineSegments).isLine) {
                            const mesh = e as Mesh | LineSegments;
                            const key = this.createPrimitiveKey((mesh as any).primitive);
                            if (!indexBuffer.has(key)) {
                                indexBuffer.set(key, []);
                            }
                            const buffers = indexBuffer.get(key)!;
                            buffers.push(mesh.geometry.index!.array);
                        }
                    });

                    const removedMeshes: (Mesh | LineSegments)[] = [];
                    scene.traverse((e: Object3D) => {
                        if ((e as Mesh).isMesh || (e as LineSegments).isLine) {
                            const mesh = e as Mesh | LineSegments;
                            const key = this.createPrimitiveKey((mesh as any).primitive);

                            if (!meshMap.has(key)) {
                                const newGeometry = new BufferGeometry();

                                if (mesh.geometry.attributes.normal) {
                                    newGeometry.setAttribute(
                                        "normal",
                                        mesh.geometry.attributes.normal
                                    );
                                }

                                newGeometry.setAttribute(
                                    "position",
                                    mesh.geometry.attributes.position
                                );

                                if (mesh.geometry.attributes.uv) {
                                    newGeometry.setAttribute("uv", mesh.geometry.attributes.uv);
                                }

                                if (mesh.geometry.attributes._batchid) {
                                    const batchIdArray = new Float32Array(
                                        mesh.geometry.attributes._batchid.array as ArrayLike<number>
                                    );
                                    newGeometry.setAttribute(
                                        "_batchid",
                                        new BufferAttribute(batchIdArray, 1)
                                    );
                                }

                                const newMesh =
                                    mesh instanceof LineSegments
                                        ? new LineSegments(newGeometry, mesh.material)
                                        : new Mesh(newGeometry, mesh.material);

                                newMesh.castShadow = true;
                                (newMesh as any).tile = this.tile;
                                (newMesh as any).batchTable = batchTable;

                                if (mesh.geometry.attributes._batchid) {
                                    (newMesh as any)._batchid =
                                        mesh.geometry.attributes._batchid.array;
                                }

                                (newMesh as any).type = "b3dm";
                                mesh.parent!.add(newMesh);
                                meshMap.set(key, newMesh);
                            }
                            removedMeshes.push(mesh);
                        }
                    });

                    removedMeshes.forEach(e => e.removeFromParent());

                    meshMap.forEach((mesh, key) => {
                        const { geometry } = mesh;
                        const indexArrays = indexBuffer.get(key)!;
                        const index = new Uint32Array(
                            indexArrays.reduce((a, b) => a + b.length, 0)
                        );
                        geometry.setIndex(new BufferAttribute(index, 1));

                        let offset = 0;
                        indexArrays.forEach(buffer => {
                            index.set(buffer as ArrayLike<number>, offset);
                            offset += buffer.length;
                        });
                    });

                    const rtcCenter = featureTable.getData("RTC_CENTER") as number[] | undefined;
                    if (rtcCenter) {
                        scene.position.x += rtcCenter[0];
                        scene.position.y += rtcCenter[1];
                        scene.position.z += rtcCenter[2];
                    }

                    scene.updateMatrix();
                    scene.matrix.multiply(adjustmentTransform);
                    scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);

                    (model as any).batchTable = batchTable;
                    (model as any).featureTable = featureTable;

                    (scene as any).batchTable = batchTable;
                    (scene as any).featureTable = featureTable;

                    //@ts-ignore
                    resolve(model as GLTF & { batchTable: any; featureTable: any });
                },
                reject
            );
        });
    }
}
