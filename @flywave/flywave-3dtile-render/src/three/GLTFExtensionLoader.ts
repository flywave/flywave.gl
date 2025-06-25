import { DefaultLoadingManager, LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Description, LoaderBase, TileGLTF } from "../base/LoaderBase";

export class GLTFExtensionLoader extends LoaderBase<Description> {
    public manager: LoadingManager;

    constructor(manager: LoadingManager = DefaultLoadingManager) {
        super();
        this.manager = manager;
        this.fetchOptions = {}; // 初始化 fetchOptions
    }

    protected async unpack(buffer: ArrayBuffer): Promise<Description> {
        return;
    }

    public parse(buffer: ArrayBuffer): Promise<TileGLTF> {
        return new Promise((resolve, reject) => {
            const manager = this.manager;
            const fetchOptions = this.fetchOptions;

            let loader: GLTFLoader | null =
                (manager.getHandler("path.gltf") as GLTFLoader) ||
                (manager.getHandler("path.glb") as GLTFLoader);

            if (!loader) {
                loader = new GLTFLoader(manager);

                if (fetchOptions.credentials === "include" && fetchOptions.mode === "cors") {
                    loader.setCrossOrigin("use-credentials");
                }

                if ("credentials" in fetchOptions) {
                    loader.setWithCredentials(fetchOptions.credentials === "include");
                }

                // 配置请求头
                if (fetchOptions.headers) {
                    loader.setRequestHeader(fetchOptions.headers as Record<string, string>);
                }
            }

            // 设置资源路径
            const resourcePath =
                (loader as any).resourcePath || (loader as any).path || this.workingPath || "";

            // 解析 GLTF 数据
            loader.parse(buffer, resourcePath, resolve, reject);
        });
    }
}
