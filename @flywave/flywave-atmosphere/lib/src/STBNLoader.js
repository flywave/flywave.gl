/* Copyright (C) 2025 flywave.gl contributors */
import { Data3DTexture, FileLoader, Loader, NearestFilter, RedFormat, RepeatWrapping, UnsignedByteType } from "three";
import { STBN_TEXTURE_DEPTH, STBN_TEXTURE_HEIGHT, STBN_TEXTURE_WIDTH } from "./constants";
export class STBNLoader extends Loader {
    load(url, onLoad, onProgress, onError) {
        const texture = new Data3DTexture();
        const loader = new FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);
        loader.setResponseType("arraybuffer");
        loader.load(url, arrayBuffer => {
            if (!(arrayBuffer instanceof ArrayBuffer)) {
                throw new Error("Expected ArrayBuffer from FileLoader");
            }
            texture.image.data = new Uint8Array(arrayBuffer);
            texture.image.width = STBN_TEXTURE_WIDTH;
            texture.image.height = STBN_TEXTURE_HEIGHT;
            texture.image.depth = STBN_TEXTURE_DEPTH;
            texture.type = UnsignedByteType;
            texture.format = RedFormat;
            texture.minFilter = NearestFilter;
            texture.magFilter = NearestFilter;
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.wrapR = RepeatWrapping;
            texture.needsUpdate = true;
            onLoad?.(texture);
        }, onProgress, onError);
        return texture;
    }
}
//# sourceMappingURL=STBNLoader.js.map