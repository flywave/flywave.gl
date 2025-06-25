import { Group, DefaultLoadingManager, LoadingManager } from "three";
import { CMPTLoaderBase } from "../base/CMPTLoaderBase";
import { B3DMLoader } from "./B3DMLoader";
import { PNTSLoader } from "./PNTSLoader";
import { I3DMLoader } from "./I3DMLoader";
import { TileGLTF } from "../base/LoaderBase";

interface ParseResult {
    tiles: Array<{
        scene: Group;
    }>;
    scene: Group;
}

export interface CMPTGLTF extends TileGLTF {
    tiles: TileGLTF[];
}

export class CMPTLoader extends CMPTLoaderBase<CMPTGLTF> {
    constructor(private manager: LoadingManager = DefaultLoadingManager) {
        super();
    }

    public async parse(buffer: ArrayBuffer): Promise<CMPTGLTF> {
        const result = await super.unpack(buffer);
        const manager = this.manager;
        const promises: Array<Promise<TileGLTF>> = [];

        for (const i in result.tiles) {
            const { type, buffer } = result.tiles[i];

            const slicedBuffer = buffer.slice();

            switch (type) {
                case "b3dm": {
                    const loader = new B3DMLoader(manager);
                    loader.workingPath = this.workingPath;
                    loader.fetchOptions = this.fetchOptions;

                    const promise = loader.parse(slicedBuffer.buffer);
                    promises.push(promise);
                    break;
                }

                case "pnts": {
                    const loader = new PNTSLoader(manager);
                    loader.workingPath = this.workingPath;
                    loader.fetchOptions = this.fetchOptions;

                    const promise = loader.parse(slicedBuffer.buffer);
                    promises.push(promise);
                    break;
                }

                case "i3dm": {
                    const loader = new I3DMLoader(manager);
                    loader.workingPath = this.workingPath;
                    loader.fetchOptions = this.fetchOptions;

                    const promise = loader.parse(slicedBuffer.buffer);
                    promises.push(promise);
                    break;
                }

                default:
                    console.warn(`Unsupported tile type: ${type}`);
                    break;
            }
        }

        return Promise.all(promises).then(results => {
            const group = new Group();
            results.forEach(result => {
                group.add(result.scene);
            });

            return {
                tiles: results,
                scene: group
            } as CMPTGLTF;
        });
    }
}
