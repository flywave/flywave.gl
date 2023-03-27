import hat from "hat";
import TopoScheme from "./topo/topo-scheme";
import { dispatch } from "d3-dispatch";
import { ConcurrentDecoderFacade } from "@flywave/flywave-mapview";
import { OBJECT_TRANSFROM_DECODER_ID } from "./objects/decoder/transfrom-epsg4326-to-projection";
import config from "./config";
import { Object3D, Vector3 } from "three";

class TopoSource {
  id = hat();

  dispatch = dispatch("topotransformchange");

  on() {
    this.dispatch.on.apply(this.dispatch, arguments);
  }

  makeDecoder = (options) => {
    return ConcurrentDecoderFacade.getTileDecoder(
      OBJECT_TRANSFROM_DECODER_ID,
      config.DECODER_URL
    );
  };

  async connect() {
    return Promise.resolve();
    await this.decoder.connect();
    this.m_isReady = true;
    this.decoder.configure();
  }

  updateTopoTransform = (featureId, rotation, transform, scale) => {
    var topoObject = this.application.topoSource.getTopoMesh(featureId);
    if (topoObject) {
      topoObject.anchor.copy(transform);
      topoObject.quaternion.copy(rotation);
      topoObject.scale.copy(scale);
    }
    this.dispatch.call(
      "topotransformchange",
      this,
      featureId,
      rotation,
      transform,
      scale
    );
  };

  objects = new Map();
  promiseObject = new Map();

  constructor(application, options) {
    // this.decoder = this.makeDecoder(options);
    this.scheme = new TopoScheme(application);
    this.application = application;

    application.dataProvider.on(`tileLoaded.${this.id}`, this.featuresLoaded);
    application.dataProvider.on(`update.${this.id}`, this.featureLoaded);
  }

  clear() {
    this.objects.forEach((v, k) => {
      this.setTopoMesh(k);
    });
  }

  featureLoaded = (feature) => {
    if (this.objects.has(feature.id)) {
      return;
    }
    Promise.resolve().then(() => {
      this.recreate(feature);
    });
  };

  featuresLoaded = (featureCollection) => {
    featureCollection.features.forEach((feature) => {
      if (this.objects.has(feature.id)) {
        return;
      }
      Promise.resolve().then(() => {
        this.recreate(feature);
      });
    });
  };

  regCustomScheme(scheme) {
    this.scheme.regCustomScheme(scheme);
  }

  recreate(feature) {
    if (!feature) return;
    var ret = this.scheme.makeTopoScheme(feature);
    var pm;
    if (ret instanceof Array) {
      const [mesh, promise] = ret;
      this.setTopoMesh(feature.id, mesh);
      pm = promise;
    } else {
      this.setTopoMesh(feature.id, ret);
      pm = Promise.resolve();
    }
    return pm;
    return pm.then(() => {
      const [selFeature] =
        this.application.selection.getSelectionFeature() || [];
      if (selFeature) {
        if (selFeature.featureId == feature.id) {
          this.application.reEnter();
        }
      }
    });
  }

  getTopoMesh(id, usePromise) {
    var object = this.objects.get(id);
    if (!usePromise) return object;
    if (object) {
      return Promise.resolve(object);
    } else {
      var _reslove;
      var p = new Promise((reslove) => {
        _reslove = reslove;
      });
      this.promiseObject.set(id, _reslove);
      return p;
    }
  }

  setTopoMesh(id, newMesh) {
    if (this.objects.has(id)) {
      var mesh = this.objects.get(id);
      mesh.traverse((e) => e.geometry && e.geometry.dispose());
      this.application.mapView.mapAnchors.remove(mesh);
    }
    if (newMesh) {
      this.objects.set(id, newMesh);
      this.application.mapView.mapAnchors.add(newMesh);
    } else {
      this.objects.delete(id);
    }
    this.application.mapView.update();

    if (this.promiseObject.has(id)) {
      this.promiseObject.get(id)(newMesh);
      this.promiseObject.delete(id);
    }
  }

  findPipeLinkCrossPoint(pipeId, index) {
    const { topology } = this.application.history.get(pipeId);
    if (!topology) return;
    if (topology.type == "pipe") {
      const { anchors } = topology;
      if (!anchors) return;
      var p = anchors[index];
      if (!p) return;
      return { featureId: p.link, anchor: { id: p.id } };
    }

    return;
  }

  findCrossPintLinkOther(crossId, anchorId) {
    const { topology } = this.application.history.get(crossId);
    if (!topology) return;
    const { links } = topology;

    if (!links) return;

    for (var i = 0; i < links.length; i++) {
      var { link, dest_anchor_id } = links[i];

      const { geometry: { type }, topology } = this.application.history.get(link);
      if (!topology) continue;

      if (type == "LineString") {
        for (var j = 0; j < topology.anchors.length; j++) {
          const e = topology.anchors[j];
          if (e && e.id == anchorId && e.link == crossId) {
            return { featureId: link, anchor: { id: anchorId, index: j } };
          }
        }
      }
      if (topology.type == "cross-point" && dest_anchor_id == anchorId) {
        return { featureId: link, anchor: { id: dest_anchor_id } };
      }
    }
  }

  rotationAbleAxis(crossId, thresholdAngle = 10) {
    const { topology } = this.application.history.get(crossId);
    if (!topology) return { enable: "all" };

    const { links } = topology;
    if (!links) return { enable: "all" };
    var topoMesh = this.getTopoMesh(crossId);

    if (!topoMesh || !topoMesh.anchors) return { enable: "all" };

    const {
      anchors: { anchors },
    } = topoMesh;

    var linkedAnchor = [];

    anchors.forEach((anchor) => {
      if (!links.find((l) => l.anchor_id == anchor.id)) {
        return;
      }

      linkedAnchor.push(anchor);
    });

    if (!linkedAnchor.length) {
      return { enable: "all" };
    }

    var makeRotation = (axis_) => {
      var quaternion = new Object3D();
      var x = new Vector3(1, 0, 0);
      var arc = Math.acos(axis_.dot(x));
      var axis = axis_.cross(x).normalize();
      if (axis.length() == 0) {
        axis.set(0, 0, 1);
      }
      quaternion.setRotationFromAxisAngle(axis, arc);

      return quaternion.quaternion.invert();
    };

    if (linkedAnchor.length == 1) {
      const [x] = linkedAnchor;
      var axis = new Vector3().fromArray(x.normal).normalize();
      return {
        enable: "axis",
        rotation: makeRotation(axis),
        center: new Vector3().fromArray(x.center),
        axis: "X"
      };
    }


    const [x, y, z] = linkedAnchor;
    var xAxis = new Vector3().fromArray(x.normal).add(new Vector3().fromArray(x.center)).normalize();
    var yAxis = new Vector3().fromArray(y.normal).add(new Vector3().fromArray(y.center)).normalize();
    var arc = (thresholdAngle * Math.PI) / 180;

    var isInAxis = (axis) => {
      var xaArc = Math.abs(Math.acos(xAxis.dot(axis)));
      if (xaArc >= arc) {
        if (Math.PI - arc >= xaArc) {
          return false;
        }
      }
      return true;
    };

    if (!z) {
      if (isInAxis(yAxis)) {
        return {
          enable: "axis",
          normal: yAxis,
          center: new Vector3().fromArray(y.center),
          rotation: makeRotation(yAxis),
        };
      }
      return false;
    }

    var zAxis = new Vector3().fromArray(z.normal).add(new Vector3().fromArray(z.center)).normalize();
    if ((isInAxis(zAxis) && isInAxis(yAxis))) {
      return {
        enable: "axis",
        normal: zAxis,
        center: new Vector3().fromArray(z.center),
        rotation: makeRotation(yAxis)
      };
    }
    return false;

  }
}

export default TopoSource;
