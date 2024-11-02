import { InstancedMesh, Mesh } from "three";

export class ObserveObjectChange {
    _watchIds = {};
    _watchNodifyed = {};
    nodifyCallBack = m => {
        if (m instanceof InstancedMesh) {
            this._nodifyCallBack&&this._nodifyCallBack(m);
            for (let watchId in this._watchIds) {
                if(!m.userData.i3dm)return;
                const {
                    i3dm: {
                        batchTable: { header }
                    }
                } = m.userData;
                let index = header.id.indexOf(parseInt(watchId));
                if (index == -1) continue;
                if (this._watchNodifyed[watchId] && this._watchNodifyed[watchId].has(m.uuid)) {
                    continue;
                }
                let matadata = {};
                for (let k in header) {
                    matadata[k] = header[k][index];
                }
                this._watchIds[watchId]({
                    type: "i3dm",
                    matadata,
                    mesh: m
                });
                if (!this._watchNodifyed[watchId]) {
                    this._watchNodifyed[watchId] = new Set();
                }
                this._watchNodifyed[watchId].add(m.uuid);
            }
            return;
        }

        if (m instanceof Mesh) {
            this._nodifyCallBack&&this._nodifyCallBack(m);
            for (let watchId in this._watchIds) {
                let batchId = -1;
                object.batchTable.header.HIERARCHY.classes.some((e, index) => {
                    if (e.instances.id.indexOf(watchId) != -1) {
                        batchId = object.batchTable.header.HIERARCHY.classIds.indexOf(index);
                        return true;
                    }
                });
                if (index == -1) continue

                if (this._watchNodifyed[watchId] && this._watchNodifyed[watchId].has(m.uuid)) {
                    continue
                }

                this._watchIds[watchId]({
                    type: "b3dm",
                    batchId,
                    mesh: m
                });
                if (!this._watchNodifyed[watchId]) {
                    this._watchNodifyed[watchId] = new Set();
                }
                this._watchNodifyed[watchId].add(m.uuid);
            }
        }
    };

    addObserveId(id, callback) {
        this._watchIds[id] = callback;
    }

    deleteObserveId(id) {
        delete this._watchIds[id];
        delete this._watchNodifyed[id];
    }

    _nodifyCallBack=null
    setNodifyAll(n){
        this._nodifyCallBack = n;
    } 

    onUpdate(object) {
        if (!Object.keys(this._watchIds).length) return;
        object.traverse(this.nodifyCallBack);
    }
}
