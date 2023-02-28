import * as turf from "@turf/turf";
import hat from "hat";
import { clone, cloneDeep } from "lodash";

export function processFeature(feature) {
    const { geometry: { type, coordinates }, topology, id } = feature;

    if (type !== "MultiLineString") {
        return feature;
    }

    var lineTopology = {};
    if (topology) {
        switch (topology.type) {
            case "sweep-layers": {
                lineTopology.type = topology.type;
                const { layers } = topology;
                if (layers) {
                    lineTopology.layers = layers.map(layer => {
                        return { ...layer, mtl: topology.materials[layer.mtl] }
                    });
                }

                feature.topology = lineTopology;
                break;
            }
        }
    }
    return feature;
}

export function unProcessFeature(feature) {
    var { geometry: { type }, topology } = feature;

    if (type !== "MultiLineString") {
        return feature;
    }

    if (topology) { 
        switch (topology.type) {
            case "sweep-layers": {
                var _feature = cloneDeep(feature)
                var materials = {};
                const { layers } = _feature.topology;
                for (let i = 0; i < layers.length; i++) {
                    var layer = layers[i];
                    var mtlId = hat();
                    materials[mtlId] = layer.mtl;
                    if (layer.mtl)
                        layer.mtl = mtlId;
                }

                _feature.topology.materials = materials;
                return _feature;
            }
        }
    }
}