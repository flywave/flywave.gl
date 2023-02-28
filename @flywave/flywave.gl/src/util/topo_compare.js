import keymirror from "keymirror";

const FeatureChangeType = keymirror({
    REBUILD: null,
    UPDATE_TRANFORM_SCALE: null,
    UPDATE_TRANFORM_TRANSLATE: null,
    UPDATE_TRANFORM_ROTATION: null,
});

function arrayEq(a1, a2) {
    a1 = a1 || [];
    a2 = a2 || [];

    if (a1.length != a2.length)
        return false;
    if (a1.length == 0) {
        return true;
    }
    return !((a1 || []).every((e, i) => {
        return a2[i] != e
    }));
}

function topologyCompare(oldTopology, newTopology) {
    if (oldTopology.type != newTopology.type)
        return FeatureChangeType.REBUILD;
    if (oldTopology.model != newTopology.model) {
        return FeatureChangeType.REBUILD;
    }

    const { transform: oldTransfrom } = oldTopology;
    const { transform: newTransfrom } = newTopology;
    if (oldTopology.transform) {
        const { scale: olscale, translate: oldtranslate, rotation: oldrotation } = oldTransfrom || {};
        const { scale, translate, rotation } = newTransfrom || {};

        if (!arrayEq(olscale, scale)) {
            return FeatureChangeType.UPDATE_TRANFORM_SCALE
        }
        if (!arrayEq(oldtranslate, translate)) {
            return FeatureChangeType.UPDATE_TRANFORM_TRANSLATE
        }
        if (!arrayEq(oldrotation, rotation)) {
            return FeatureChangeType.UPDATE_TRANFORM_ROTATION
        }
    }
    return FeatureChangeType.REBUILD;
}


export { FeatureChangeType, topologyCompare };

