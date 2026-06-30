import { Data3DTexture, Loader } from "three";
export declare class STBNLoader extends Loader<Data3DTexture> {
    load(url: string, onLoad?: (data: Data3DTexture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): Data3DTexture;
}
