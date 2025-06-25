import { Group } from "three";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";

export interface Description {
    version: number;
}

export type TileGLTF = GLTF;

export abstract class LoaderBase<MagicDescriptionData extends Description, ParseData = TileGLTF> {
    public fetchOptions: RequestInit = {};
    public workingPath: string = "";

    public load(url: string): Promise<MagicDescriptionData> {
        return fetch(url, this.fetchOptions)
            .then((res: Response) => {
                if (!res.ok) {
                    throw new Error(
                        `Failed to load file "${url}" with status ${res.status} : ${res.statusText}`
                    );
                }
                return res.arrayBuffer();
            })
            .then((buffer: ArrayBuffer) => {
                if (this.workingPath === "") {
                    this.workingPath = this.workingPathForURL(url);
                }
                return this.unpack(buffer);
            });
    }

    public resolveExternalURL(url: string): string {
        if (/^[^\\/]/.test(url)) {
            return this.workingPath + "/" + url;
        } else {
            return url;
        }
    }

    public workingPathForURL(url: string): string {
        const splits = url.split(/[\\/]/g);
        splits.pop();
        const workingPath = splits.join("/");
        return workingPath + "/";
    }

    protected abstract unpack(buffer: ArrayBuffer): Promise<MagicDescriptionData>;

    public abstract parse(buffer: ArrayBuffer): Promise<ParseData>;
}
