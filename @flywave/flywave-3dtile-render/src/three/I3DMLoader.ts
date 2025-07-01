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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { TileGLTF } from "../base/LoaderBase";
import { BatchTableHeader, FeatureComponentType, FeatureType } from "../utilities/FeatureTable";
import { TilesRenderer } from "./TilesRenderer";

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

export class I3DMLoader<
    BatchTableExtensions extends BatchTableHeader
> extends I3DMLoaderBase<BatchTableExtensions> {
    public manager: LoadingManager;
    public tileRender: TilesRenderer;

    constructor(manager: LoadingManager = DefaultLoadingManager, tileRender?: TilesRenderer) {
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
                let loader = manager.getHandler("path.gltf") as GLTFLoader | null;

                if (!loader) {
                    loader = new GLTFLoader(manager);

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
                        if (this.tileRender?.rootPosition) {
                            averageVector.copy(this.tileRender.rootPosition);
                        } else {
                            for (let i = 0; i < INSTANCES_LENGTH; i++) {
                                averageVector.x += POSITION[i * 3 + 0] / INSTANCES_LENGTH;
                                averageVector.y += POSITION[i * 3 + 1] / INSTANCES_LENGTH;
                                averageVector.z += POSITION[i * 3 + 2] / INSTANCES_LENGTH;
                            }
                        }

                        const instances: InstancedMesh[] = [];
                        const meshes: Mesh[] = [];
                        model.scene.updateMatrixWorld();

                        model.scene.traverse((child: Object3D) => {
                            if ((child as Mesh).isMesh) {
                                const mesh = child as Mesh;
                                meshes.push(mesh);

                                const instancedMesh = new InstancedMesh(
                                    mesh.geometry,
                                    mesh.material,
                                    INSTANCES_LENGTH
                                );
                                instancedMesh.position.copy(averageVector);

                                if (RTC_CENTER) {
                                    instancedMesh.position.x += RTC_CENTER[0];
                                    instancedMesh.position.y += RTC_CENTER[1];
                                    instancedMesh.position.z += RTC_CENTER[2];
                                }

                                instances.push(instancedMesh);
                            }
                        });

                        for (let i = 0; i < INSTANCES_LENGTH; i++) {
                            tempPos.set(
                                POSITION[i * 3 + 0] - averageVector.x,
                                POSITION[i * 3 + 1] - averageVector.y,
                                POSITION[i * 3 + 2] - averageVector.z
                            );

                            tempQuat.identity();

                            if (NORMAL_UP && NORMAL_RIGHT) {
                                tempUp.set(
                                    NORMAL_UP[i * 3 + 0],
                                    NORMAL_UP[i * 3 + 1],
                                    NORMAL_UP[i * 3 + 2]
                                );

                                tempRight.set(
                                    NORMAL_RIGHT[i * 3 + 0],
                                    NORMAL_RIGHT[i * 3 + 1],
                                    NORMAL_RIGHT[i * 3 + 2]
                                );

                                tempFwd.crossVectors(tempRight, tempUp).normalize();
                                tempMat.makeBasis(tempRight, tempUp, tempFwd);
                                tempQuat.setFromRotationMatrix(tempMat);
                            }

                            tempSca.set(1, 1, 1);
                            if (SCALE_NON_UNIFORM) {
                                tempSca.set(
                                    SCALE_NON_UNIFORM[i * 3 + 0],
                                    SCALE_NON_UNIFORM[i * 3 + 1],
                                    SCALE_NON_UNIFORM[i * 3 + 2]
                                );
                            }
                            if (SCALE) {
                                tempSca.multiplyScalar(SCALE[i]);
                            }

                            for (let j = 0, l = instances.length; j < l; j++) {
                                const instance = instances[j];
                                tempLocalQuat.copy(tempQuat);

                                if (featureTable.header.EAST_NORTH_UP) {
                                    instance.updateMatrixWorld();
                                    tempGlobePos.copy(tempPos).applyMatrix4(instance.matrixWorld);

                                    // 这里需要根据实际椭球体实现替换
                                    // this.ellipsoid.getPositionToCartographic(tempGlobePos, tempLatLon);
                                    // this.ellipsoid.getEastNorthUpFrame(tempLatLon.lat, tempLatLon.lon, tempEnuFrame);
                                    // tempLocalQuat.setFromRotationMatrix(tempEnuFrame);
                                }

                                tempMat
                                    .compose(tempPos, tempLocalQuat, tempSca)
                                    .multiply(adjustmentTransform);

                                const mesh = meshes[j];
                                tempMat2.multiplyMatrices(tempMat, mesh.matrixWorld);
                                instance.setMatrixAt(i, tempMat2);
                            }
                        }

                        const scene = new Group();
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
