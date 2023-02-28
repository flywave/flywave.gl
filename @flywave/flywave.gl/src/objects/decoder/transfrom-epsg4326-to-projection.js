
export function transfromEpsg4326ToProjection(data, projection) {

}

export const OBJECT_TRANSFROM_DECODER_ID = "OBJECT_TRANSFROM_DECODER_ID";
export class Decoder {
    connect() {
        return Promise.resolve()
    }

    configure() { }

    decode(data, projection) {
        var tileTerrain = transfromEpsg4326ToProjection(data, projection);
        return Promise.resolve(verityTile)
    }
}