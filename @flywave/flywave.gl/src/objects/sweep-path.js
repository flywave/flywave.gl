import RemoteTopo from "./remote-topo";
import DefaultMultiLine from "./default-multi-line";

import { unProcessFeature } from "../util/explain-mulity-line";

class SweepPath extends DefaultMultiLine {

    constructor(feature, userData, application) {
        super(feature.geometry.coordinates, userData, application);

        this.mesh = new RemoteTopo(application);
        this.mesh.getReady().then(e => {
            this.updateGeometry(feature.geometry.coordinates,this.mesh.anchor);
        });
        this.add( this.mesh);
    }
    flush(feature){
        return this.mesh.flush(unProcessFeature(feature));
    }

    getReady(){
        return this.mesh.getReady().then(e=>{
            return this;
        });
    }
}

export default SweepPath;