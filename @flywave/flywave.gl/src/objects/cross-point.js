import RemoteTopo from "./remote-topo";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import config from "../config";

var downloadManager = TransferManager.instance();

class CrossPoint extends RemoteTopo {

    constructor(application) {
        super(application);

        this.readyPromise = new Promise((reslove, reject) => {
            this.reslove = reslove;
            this.reject = reject;
        });
    }

    withReady(opt) {
        if (this.anchors) {
            opt();
        }
        else {
            this.readyPromise.then(() => opt());
        }
    }

    getReady() {
        if (this.anchors) {
            return Promise.resolve(this);
        }
        else {
            return this.readyPromise;
        }
    }

    flush(feature) {
        return super.flush(feature).then(() => {
            return this.requestAnchorInfo(feature)
        }).then(this.reslove)
    }

    anchorUrl(id) {
        return config.formatVariableUrl(config.ANCHOR_INFO_URL,{"mesh_id":id});
    }

    requestAnchorInfo(feature) {
        const { topology } = feature;
        if (topology.model) {
            return downloadManager.downloadJson(this.anchorUrl(topology.model), {}).catch((e) => {
                this.reject();
            }).then(anchors => {
                this.anchors = anchors;
            });
        } else {
            return Promise.resolve();
        }
    }
}

export default CrossPoint;