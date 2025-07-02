import { I3DMLoaderBase } from "../base/I3DMLoaderBase";
import {
    DefaultLoadingManager,
    Matrix4,
    InstancedMesh,
    Vector3,
    Quaternion,
    LoadingManager,
    Mesh,
    Object3D,
    Group
} from "three";
import { TileGLTF } from "../base/LoaderBase";
import { BatchTableHeader, FeatureComponentType, FeatureType } from "../utilities/FeatureTable";
import { TileRenderGLTFLoader, TilesLoadingManager, TilesRenderer } from "./TilesRenderer";
import { Topo4DWorkInfo } from "../4d";

// 临时变量
const tempFwd = new Vector3();
const tempUp = new Vector3();
const tempRight = new Vector3();
const tempPos = new Vector3();
const tempQuat = new Quaternion();
const tempLocalQuat = new Quaternion();
const tempSca = new Vector3();
const tempMat = new Matrix4();
const tempMat2 = new Matrix4();
const tempGlobePos = new Vector3();
const adjustmentTransform = new Matrix4();

const Batch4DAttributesName = "topo4d_work";

export interface BatchTable4DExtensions extends BatchTableHeader {
    id: string[];
    [Batch4DAttributesName]: Topo4DWorkInfo[];
}

export class I3DMLoader extends I3DMLoaderBase<BatchTable4DExtensions> {
    public manager: TilesLoadingManager;
    public tileRender: TilesRenderer;

    constructor(manager: TilesLoadingManager, tileRender?: TilesRenderer) {
        super();
        this.manager = manager;
        this.tileRender = tileRender;
    }

    resolveExternalURL(url: string): string {
        return this.manager.resolveURL(super.resolveExternalURL(url));
    }

    parse(buffer: ArrayBuffer): Promise<TileGLTF> {
        return super.unpack(buffer).then(i3dm => {
            const { featureTable, batchTable } = i3dm;
            const gltfBuffer = i3dm.glbBytes!.slice().buffer;

            return new Promise<TileGLTF>((resolve, reject) => {
                const fetchOptions = this.fetchOptions;
                const manager = this.manager;
                let loader = manager.getHandler("path.gltf") as TileRenderGLTFLoader | null;

                if (!loader) {
                    loader = new TileRenderGLTFLoader(manager);

                    if (fetchOptions.credentials === "include" && fetchOptions.mode === "cors") {
                        loader.setCrossOrigin("use-credentials");
                    }

                    if ("credentials" in fetchOptions) {
                        loader.setWithCredentials(fetchOptions.credentials === "include");
                    }

                    if (fetchOptions.headers) {
                        loader.setRequestHeader(fetchOptions.headers as Record<string, string>);
                    }
                }

                let workingPath = this.workingPath;
                if (!/[\\/]$/.test(workingPath)) {
                    workingPath += "/";
                }

                loader.parse(
                    gltfBuffer,
                    workingPath,
                    (model: TileGLTF) => {
                        const INSTANCES_LENGTH = featureTable.getData("INSTANCES_LENGTH") as number;

                        // 获取实例数据
                        let POSITION = featureTable.getData(
                            "POSITION",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const POSITION_QUANTIZED = featureTable.getData(
                            "POSITION_QUANTIZED",
                            INSTANCES_LENGTH,
                            FeatureComponentType.UNSIGNED_SHORT,
                            FeatureType.VEC3
                        ) as Uint16Array | undefined;

                        const QUANTIZED_VOLUME_SCALE = featureTable.getData(
                            "QUANTIZED_VOLUME_SCALE",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const QUANTIZED_VOLUME_OFFSET = featureTable.getData(
                            "QUANTIZED_VOLUME_OFFSET",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const RTC_CENTER = featureTable.getData(
                            "RTC_CENTER",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const NORMAL_UP = featureTable.getData(
                            "NORMAL_UP",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const NORMAL_RIGHT = featureTable.getData(
                            "NORMAL_RIGHT",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const SCALE_NON_UNIFORM = featureTable.getData(
                            "SCALE_NON_UNIFORM",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.VEC3
                        ) as Float32Array | undefined;

                        const SCALE = featureTable.getData(
                            "SCALE",
                            INSTANCES_LENGTH,
                            FeatureComponentType.FLOAT,
                            FeatureType.SCALAR
                        ) as Float32Array | undefined;

                        ["EAST_NORTH_UP", "NORMAL_UP_OCT32P", "NORMAL_RIGHT_OCT32P"].forEach(
                            feature => {
                                if (feature in featureTable.header) {
                                    console.warn(
                                        `I3DMLoader: Unsupported FeatureTable feature "${feature}" detected.`
                                    );
                                }
                            }
                        );

                        if (
                            !POSITION &&
                            POSITION_QUANTIZED &&
                            QUANTIZED_VOLUME_SCALE &&
                            QUANTIZED_VOLUME_OFFSET
                        ) {
                            POSITION = new Float32Array(3 * INSTANCES_LENGTH);
                            for (let j = 0; j < 3 * INSTANCES_LENGTH; j++) {
                                POSITION[j] =
                                    (POSITION_QUANTIZED[j] / 65535.0) *
                                        QUANTIZED_VOLUME_SCALE[j % 3] +
                                    QUANTIZED_VOLUME_OFFSET[j % 3];
                            }
                        }

                        if (!POSITION) {
                            throw new Error("I3DMLoader: No valid position data found");
                        }

                        const averageVector = new Vector3();
                        let useRtcCenter = false;

                        // 确定基准点
                        if (RTC_CENTER && RTC_CENTER.length >= 3) {
                            averageVector.set(RTC_CENTER[0], RTC_CENTER[1], RTC_CENTER[2]);
                            useRtcCenter = true;
                        } else {
                            for (let i = 0; i < INSTANCES_LENGTH; i++) {
                                averageVector.x += POSITION[i * 3] / INSTANCES_LENGTH;
                                averageVector.y += POSITION[i * 3 + 1] / INSTANCES_LENGTH;
                                averageVector.z += POSITION[i * 3 + 2] / INSTANCES_LENGTH;
                            }
                        }

                        const instances: InstancedMesh[] = [];
                        const meshes: (Mesh | InstancedMesh)[] = [];
                        const originalMatrices: Matrix4[] = [];

                        // 收集所有网格和实例化网格
                        model.scene.traverse((child: Object3D) => {
                            if (child instanceof Mesh || child instanceof InstancedMesh) {
                                meshes.push(child);
                                originalMatrices.push(child.matrixWorld.clone());

                                if (child instanceof InstancedMesh) {
                                    // 对于已有的InstancedMesh，我们需要展开它的实例
                                    const instanceCount = child.count;
                                    const newInstancedMesh = new InstancedMesh(
                                        child.geometry,
                                        child.material,
                                        INSTANCES_LENGTH * instanceCount
                                    );
                                    newInstancedMesh.position.copy(averageVector);
                                    newInstancedMesh.updateMatrixWorld();
                                    instances.push(newInstancedMesh);
                                } else {
                                    // 普通Mesh转换为InstancedMesh
                                    const instancedMesh = new InstancedMesh(
                                        child.geometry,
                                        child.material,
                                        INSTANCES_LENGTH
                                    );
                                    // instancedMesh.position.copy(averageVector);
                                    instancedMesh.updateMatrixWorld();
                                    instances.push(instancedMesh);
                                }
                            }
                        });

                        // 处理每个实例
                        for (let i = 0; i < INSTANCES_LENGTH; i++) {
                            // 计算位置
                            tempPos.set(
                                POSITION[i * 3] - (useRtcCenter ? 0 : averageVector.x),
                                POSITION[i * 3 + 1] - (useRtcCenter ? 0 : averageVector.y),
                                POSITION[i * 3 + 2] - (useRtcCenter ? 0 : averageVector.z)
                            );

                            // 计算旋转
                            tempQuat.identity();
                            if (NORMAL_UP && NORMAL_RIGHT) {
                                tempUp.set(
                                    NORMAL_UP[i * 3],
                                    NORMAL_UP[i * 3 + 1],
                                    NORMAL_UP[i * 3 + 2]
                                );
                                tempRight.set(
                                    NORMAL_RIGHT[i * 3],
                                    NORMAL_RIGHT[i * 3 + 1],
                                    NORMAL_RIGHT[i * 3 + 2]
                                );
                                tempFwd.crossVectors(tempRight, tempUp).normalize();
                                tempMat.makeBasis(tempRight, tempUp, tempFwd);
                                tempQuat.setFromRotationMatrix(tempMat);
                            }

                            // 计算缩放
                            tempSca.set(1, 1, 1);
                            if (SCALE_NON_UNIFORM) {
                                tempSca.set(
                                    SCALE_NON_UNIFORM[i * 3],
                                    SCALE_NON_UNIFORM[i * 3 + 1],
                                    SCALE_NON_UNIFORM[i * 3 + 2]
                                );
                            }
                            if (SCALE) {
                                tempSca.multiplyScalar(SCALE[i]);
                            }

                            // 为每个网格/实例设置变换
                            for (let j = 0; j < meshes.length; j++) {
                                const mesh = meshes[j];
                                const instance = instances[j];
                                const originalMatrix = originalMatrices[j];

                                if (mesh instanceof InstancedMesh) {
                                    // 处理原始InstancedMesh的展开
                                    const originalInstanceCount = mesh.count;
                                    for (let k = 0; k < originalInstanceCount; k++) {
                                        mesh.getMatrixAt(k, tempMat2);
                                        tempMat.compose(tempPos, tempQuat, tempSca);
                                        tempMat.multiply(originalMatrix);
                                        tempMat.multiply(tempMat2);

                                        const instanceIndex = i * originalInstanceCount + k;
                                        instance.setMatrixAt(instanceIndex, tempMat);
                                    }
                                } else {
                                    // 处理普通Mesh
                                    tempMat.compose(tempPos, tempQuat, tempSca);
                                    tempMat.multiply(originalMatrix);
                                    instance.setMatrixAt(i, tempMat);
                                }
                            }
                        }

                        // 创建最终场景
                        const scene = new Group();
                        scene.position.copy(averageVector);
                        instances.forEach(instance => scene.add(instance));

                        model.scene = scene;
                        resolve(model);
                    },
                    error => {
                        reject(error);
                    }
                );
            });
        });
    }
}
