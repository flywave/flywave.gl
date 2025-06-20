class Config {
    _BASE_PATH = "";

    GLOBEVARIABLE = {};

    get RESOURCE_BASE_URL() {
        return `${this._BASE_PATH}/resources`;
    }

    get DRACO_PATH() {
        return `${this._BASE_PATH}/libs/draco/`;
    }

    get DECODER_URL() {
        return `${this._BASE_PATH}/flywave.decoder.js`;
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
}
export default new Config();
