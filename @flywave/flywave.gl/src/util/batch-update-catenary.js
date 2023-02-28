import TopologyChangeCmd from "../command/topology-change-cmd";

function batchUpdateCatenary(application, props) {
    var command = [];
    var updateIds = [];
    application.selection.getSelectionFeature().forEach(selection => {
        const feature = application.history.get(selection.featureId);
        const { topology } = feature;
        if (topology.type == "catenary") {
            updateIds.push(selection.featureId);
            command.push(new TopologyChangeCmd(selection.featureId, { ...topology, ...props }));
        }
    });
    application.history.perform(command, `change topology properties`);

    return Promise.all(updateIds.map(e => application.topoSource.recreate(application.history.get(e))));
}

export default batchUpdateCatenary;