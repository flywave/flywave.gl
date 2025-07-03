import { B3DMLoaderBase } from "../base/B3DMLoaderBase";
import { Matrix4 } from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import {
    BatchTable,
    BatchTableHeader,
    FeatureComponentType,
    FeatureTable,
    FeatureType
} from "../utilities/FeatureTable";
import { Tile } from "../base/Tile";
import { TileGLTF } from "../base/LoaderBase";
import { TileRenderGLTFLoader, TilesLoadingManager } from "./TilesRenderer";

export class B3DMLoader<
    BatchTableExtensions extends BatchTableHeader
> extends B3DMLoaderBase<BatchTableExtensions> {
    manager: TilesLoadingManager;
    private adjustmentTransform: Matrix4;
    tile: Tile;
    fetchOptions: RequestInit = {};
    workingPath: string = "";

    constructor(manager: TilesLoadingManager, tile?: any) {
        super();
        this.manager = manager;
        this.adjustmentTransform = new Matrix4();
        this.tile = tile;
    }

    async parse(buffer: ArrayBuffer): Promise<TileGLTF> {
        const b3dm = await this.unpack(buffer);
        const gltfBuffer = b3dm.glbBytes.slice().buffer;

        return new Promise((resolve, reject) => {
            const manager = this.manager;
            const fetchOptions = this.fetchOptions;
            const loader: TileRenderGLTFLoader =
                (manager.getHandler("path.gltf") as TileRenderGLTFLoader) ||
                new TileRenderGLTFLoader(manager);

            if (fetchOptions.credentials === "include" && fetchOptions.mode === "cors") {
                loader.setCrossOrigin("use-credentials");
            }

            if ("credentials" in fetchOptions) {
                loader.setWithCredentials(fetchOptions.credentials === "include");
            }

            if (fetchOptions.headers) {
                loader.setRequestHeader(fetchOptions.headers as Record<string, string>);
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
                (
                    model: GLTF & {
                        batchTable: BatchTable<BatchTableExtensions>;
                        featureTable: FeatureTable;
                    }
                ) => {
                    const { batchTable, featureTable } = b3dm;
                    const { scene } = model;

                    const rtcCenter = featureTable.getData(
                        "RTC_CENTER",
                        1,
                        FeatureComponentType.FLOAT,
                        FeatureType.VEC3
                    );
                    if (rtcCenter) {
                        scene.position.x += rtcCenter[0];
                        scene.position.y += rtcCenter[1];
                        scene.position.z += rtcCenter[2];
                    }

                    model.scene.updateMatrix();
                    model.scene.matrix.multiply(adjustmentTransform);
                    model.scene.matrix.decompose(
                        model.scene.position,
                        model.scene.quaternion,
                        model.scene.scale
                    );

                    model.batchTable = batchTable;
                    model.featureTable = featureTable;

                    resolve(
                        model as GLTF & {
                            batchTable: BatchTable<BatchTableExtensions>;
                            featureTable: FeatureTable;
                        }
                    );
                },
                reject
            );
        });
    }
}
