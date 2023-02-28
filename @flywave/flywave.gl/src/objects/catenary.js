import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import DefaultLine from "./default-line";
import { Matrix4, Vector3 } from "three";
import { LineGeometry } from "../objects/line/LineGeometry";

const minTessellationCount = 10
const maxTessellationCount = 500
const tessellationCount = 250

class GFunc {
  constructor(d, rootLh) {
    this.d = d;
    this.rootLh = rootLh;
  }

  apply(a) {
    return 2.0 * a * Math.sinh(this.d / (2.0 * a)) - this.rootLh
  }
}

class GFuncDeriv {
  constructor(d) {
    this.d = d;
  }

  apply(a) {
    var da = this.d / a
    return 2.0 * Math.sinh(da / 2.0) - da * Math.cosh(da / 2.0);
  }
}

class CatenaryFunc {
  constructor(a, x1, C, L, d, h) {
    this.a = a;
    this.x1 = x1;
    this.C = C;
    this.L = L;
    this.d = d;
    this.h = h;
  }

  apply(x) {
    return this.a * Math.cosh((x + this.x1) / this.a) + this.C
  }
}

function solve(func_, deriv, guess, tolerance, maxIterations) {
  var xn = guess
  var valid;
  for (var i = 0; i <= maxIterations; i++) {
    var f = func_.apply(xn)
    if (Math.abs(f) <= tolerance) {
      valid = true
      return { xn, valid };
    }
    xn = xn - f / deriv.apply(xn)
  }
  valid = false
  return { xn, valid }
}

function catenarySolve(L, d, h,states) {
  var gfunc = new GFunc(d, Math.sqrt(L * L - h * h));
  var gfuncDeriv = new GFuncDeriv(d);
  var { xn: a,valid } = solve(gfunc, gfuncDeriv, d / 2, 1.0e-6, 16)
  var x1 = (a * Math.log((L + h) / (L - h)) - d) / 2.0
  var C = -a * Math.cosh(x1 / a)
  states.push(valid)
  return new CatenaryFunc(a, x1, C, L, d, h);
}

class MinCatHeight {
  constructor(d, h, refHeight,states) {
    this.d = d;
    this.h = h;
    this.refHeight = refHeight;
    this.states = states;
  }

  apply(L) {
    if (L * L < this.d * this.d + this.h * this.h) {
      return 0.0
    }
    var func_ = catenarySolve(L, this.d, this.h,this.states)
    if (func_.x1 > 0.0) {
      return 0.0
    }
    return (func_.apply(-func_.x1) - this.refHeight)
  }
}

function sgn(val) {
  if (val > 0) {
    return 1
  }
  return 0
}

function solveBisect(func_, x0, x1, tolerance, maxIterations) {
  var f0 = func_.apply(x0)
  var f1 = func_.apply(x1)
  if (sgn(f0) == sgn(f1)) {
    return x0
  }
  var midPoint = 0.0
  for (var i = 0; i < maxIterations; i++) {
    midPoint = (x0 + x1) / 2.0
    var fMidpoint = func_.apply(midPoint)
    if (Math.abs(fMidpoint) <= tolerance) {
      return midPoint
    } else if (sgn(f0) == sgn(fMidpoint)) {
      x0 = midPoint
      f0 = fMidpoint
    } else {
      x1 = midPoint
      f1 = fMidpoint
    }
  }
  return midPoint
}

class Catenary extends DefaultLine {
  constructor(pointA, pointB, userData, application) {
    super([pointA, pointB], userData, application);
  }

  updateGeometry(a) {
    var { feature: { topology: { slack, max_sag, tessellation } } } = this.userData;
    if (!slack) {
      slack = 1.008;
    }
    if (!max_sag) {
      max_sag = 40;
    }
    if (!tessellation) {
      tessellation = 0;
    }

    var state = [];
    var v = this.computeCatenary(a[0], a[a.length - 1], slack, max_sag, tessellation,state);

    var linePos = [];
    v.forEach(p => linePos = linePos.concat(p.toArray()));

    this.anchor = new GeoCoordinates(a[0][1], a[0][0], a[0][2] || 0);

    var geo = new LineGeometry();
    geo.setPositions(linePos);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;

  }

  computeCatenary(pointA, pointB, slack, max_sag, tessellation,state) {
    const { mapView: { projection } } = this.application;

    var p1 = projection.projectPoint(new GeoCoordinates(pointA[1], pointA[0], pointA[2]), new Vector3);
    var p2 = projection.projectPoint(new GeoCoordinates(pointB[1], pointB[0], pointB[2]), new Vector3);

    var dist = p1.distanceTo(p2);
    if (dist > 0) {
      if (tessellation == 0) {
        tessellation = dist / tessellationCount;
      }
      if (dist / tessellation < minTessellationCount) {
        tessellation = dist / minTessellationCount;
      }
      if (dist / tessellation > maxTessellationCount) {
        tessellation = dist / maxTessellationCount;
      }
    }
    var pworld = new Matrix4();
    var zaxis = new Vector3(0, 0, 1);
    pworld.makeRotationAxis(p1.clone().cross(zaxis).normalize(),
      Math.acos(p1.clone().normalize().dot(zaxis)));

    return this.makeCatenary(p1, p2, pworld, slack, max_sag, tessellation,state);
  }

  makeCatenary(p1: Vector3, p2, p1Word, slack, maxSag, tessellation,state) {
    var pp1 = p1.clone().applyMatrix4(p1Word);
    var pp2 = p2.clone().applyMatrix4(p1Word);
    var p2local = pp2.clone().sub(pp1);

    var swapped = false
    var xaxis = new Vector3();
    if (p2local.z < 0.0) {
      swapped = true;
      xaxis = new Vector3(-p2local.x, -p2local.y, 0.0);
    } else {
      xaxis = new Vector3(p2local.x, p2local.y, 0.0);
    }

    var d = xaxis.length()
    xaxis.normalize();
    var yaxis = xaxis.clone().cross(new Vector3(0, 0, 1.0));
    var zaxis = new Vector3(0.0, 0.0, 1.0);

    var matCable = new Matrix4();
    matCable.set(
      xaxis.x, yaxis.x, zaxis.x, 0,
      xaxis.y, yaxis.y, zaxis.y, 0,
      xaxis.z, yaxis.z, zaxis.z, 0,
      0, 0, 0, 1);

    var h = 0.0
    if (swapped) {
      h = -p2local.z
      matCable.setPosition(p2local)
    } else {
      h = p2local.z
    }

    var straightDist = p2local.length();
    var cfunc = catenarySolve(straightDist * slack, d, h,state)

    var xMin = -cfunc.x1
    var yMin = cfunc.apply(xMin)
    if (xMin > 0.0 && yMin < -maxSag) {
      var minimum = new MinCatHeight(d, h, -maxSag,state);
      var newGuess = ((slack - 1.0) * .01 + 1.0) * straightDist

      var Lmin = solveBisect(minimum, newGuess, straightDist * slack, 0.01, 8)
      cfunc = catenarySolve(Lmin, d, h,state)
    }

    var P1 = new Vector3(0.0, 0.0, 0.0);
    var P2 = new Vector3(d, 0.0, h);
    var begin;
    var inc;

    var numSteps = Math.ceil(p2local.length() / tessellation);
    var cablePts = [];

    if (swapped) {
      inc = -d / numSteps;
      begin = d + inc
      cablePts.push(P2);
    } else {
      inc = d / numSteps;
      begin = inc;
      cablePts.push(P1);
    }

    var x = begin;
    for (var i = 1; i <= numSteps; i++) {
      var z = cfunc.apply(x);
      cablePts.push(new Vector3(x, 0.0, z));
      x += inc
    }

    var result = [];
    var invp1Word = p1Word.clone().invert();
    for (var i = 0; i < cablePts.length; i++) {
      var po = cablePts[i].clone().applyMatrix4(matCable);
      po.add(pp1);
      po.applyMatrix4(invp1Word);
      po.sub(p1);
      result.push(po)
    }

    return result
  }

}

export default Catenary;
