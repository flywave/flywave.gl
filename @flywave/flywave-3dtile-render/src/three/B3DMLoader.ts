import { B3DMLoaderBase } from "../base/B3DMLoaderBase";
import { Matrix4 } from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { BatchTableHeader, FeatureComponentType, FeatureType } from "../utilities/FeatureTable";
import { Tile } from "../base/Tile";
import { TileGLTF } from "../base/LoaderBase";
import { TileRenderGLTFLoader, TilesLoadingManager } from "./TilesRenderer";

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
                (model: GLTF & { batchTable: any; featureTable: any }) => {
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

                    resolve(model as GLTF & { batchTable: any; featureTable: any });
                },
                reject
            );
        });
    }
}
