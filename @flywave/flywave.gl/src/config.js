
class Config {
    ANCHOR_INFO_URL = '';
    TOPO_MESH_URL = '';
    RESOUCE_MESH_URL = '';
    TOPO_TEXTURE_URL = '';
    _BASE_PATH = '';

    GLOBEVARIABLE = {};

    get RESOURCE_BASE_URL() {
        return `${this._BASE_PATH}/resources`
    }

    get DRACO_PATH() {
        return `${this._BASE_PATH}/libs/draco/`
    }

    get DECODER_URL() {
        return `${this._BASE_PATH}/flywave.decoders.js`
    }

    get BASE_PATH() {
        return this._BASE_PATH;
    }

    set BASE_PATH(v) {
        this._BASE_PATH = v;
    }


    formatGlobeVariableUrl(url) {
        return this.formatVariableUrl(url, this.GLOBEVARIABLE);
    }

    formatVariableUrl(url, map) {
        for (var i in map) {
            url = url.replace(`{${i}}`, map[i]);
        }
        return url;
    }

    formatTopoTextureUrl(textureId) {
        return this.TOPO_TEXTURE_URL.replace('{textureId}', textureId)
    }
}
export default new Config();