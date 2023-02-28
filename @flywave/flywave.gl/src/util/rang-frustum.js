import { Vector3, Plane, Frustum } from "three";


export default function makePickFrustum(x, y, width, height, camera, normalCallback) {

    var lln, llf, lrn, lrf, uln, ulf, urn, urf,  // corner points of frustum
        nl, nr, nt, nb, nn, nf,         // normal vectors of frustum planes
        l, r, t, b, n, f,               // frustum planes
        va, vb = new Vector3(0, 0, 0),  // vectors formed by the corner points 
        screenPoint = new Vector3(0, 0, 0),
        pickRectangle = {
            x: x,
            y: y,
            width: width,
            height: height
        };
 
    function unProject(screenPoint) {
        var z = screenPoint.z;
        screenPoint = normalCallback(screenPoint.x, screenPoint.y);
        var v = new Vector3(screenPoint.x, screenPoint.y, z)
        v.unproject(camera);  
        return screenPoint.clone().copy(v);
    }

    screenPoint.x = pickRectangle.x;
    screenPoint.y = pickRectangle.y;
    screenPoint.z = 0;
    lln = unProject(screenPoint);

    screenPoint.x = pickRectangle.x;
    screenPoint.y = pickRectangle.y;
    screenPoint.z = 1;
    llf = unProject(screenPoint);

    screenPoint.x = pickRectangle.x + pickRectangle.width;
    screenPoint.y = pickRectangle.y;
    screenPoint.z = 0;
    lrn = unProject(screenPoint);

    screenPoint.x = pickRectangle.x + pickRectangle.width;
    screenPoint.y = pickRectangle.y;
    screenPoint.z = 1;
    lrf = unProject(screenPoint);

    screenPoint.x = pickRectangle.x;
    screenPoint.y = pickRectangle.y + pickRectangle.height;
    screenPoint.z = 0;
    uln = unProject(screenPoint);

    screenPoint.x = pickRectangle.x;
    screenPoint.y = pickRectangle.y + pickRectangle.height;
    screenPoint.z = 1;
    ulf = unProject(screenPoint);

    screenPoint.x = pickRectangle.x + pickRectangle.width;
    screenPoint.y = pickRectangle.y + pickRectangle.height;
    screenPoint.z = 0;
    urn = unProject(screenPoint);

    screenPoint.x = pickRectangle.x + pickRectangle.width;
    screenPoint.y = pickRectangle.y + pickRectangle.height;
    screenPoint.z = 1;
    urf = unProject(screenPoint);

    // if (debugPoints) debugPoints.push(lln, llf, lrn, lrf, uln, ulf, urn, urf);

    va = new Vector3(ulf.x - lln.x, ulf.y - lln.y, ulf.z - lln.z);
    vb.set(uln.x - llf.x, uln.y - llf.y, uln.z - llf.z);
    nl = vb.cross(va).normalize();
    l = new Plane(nl.clone(), -nl.dot(lln)); 

    va = new Vector3(urn.x - lrf.x, urn.y - lrf.y, urn.z - lrf.z);
    vb.set(urf.x - lrn.x, urf.y - lrn.y, urf.z - lrn.z);
    nr = vb.cross(va).normalize();
    r = new Plane(nr.clone(), -nr.dot(lrn)); 

    va = new Vector3(ulf.x - urn.x, ulf.y - urn.y, ulf.z - urn.z);
    vb.set(urf.x - uln.x, urf.y - uln.y, urf.z - uln.z);
    nt = vb.cross(va).normalize();
    t = new Plane(nt.clone(), -nt.dot(uln)); 

    va = new Vector3(lrf.x - lln.x, lrf.y - lln.y, lrf.z - lln.z);
    vb.set(llf.x - lrn.x, llf.y - lrn.y, llf.z - lrn.z);
    nb = vb.cross(va).normalize();
    b = new Plane(nb.clone(), -nb.dot(lrn)); 

    va = new Vector3(uln.x - lrn.x, uln.y - lrn.y, uln.z - lrn.z);
    vb.set(urn.x - lln.x, urn.y - lln.y, urn.z - lln.z);
    nn = vb.cross(va).normalize();
    n = new Plane(nn.clone(), -nn.dot(lln)); 

    va = new Vector3(urf.x - llf.x, urf.y - llf.y, urf.z - llf.z);
    vb.set(ulf.x - lrf.x, ulf.y - lrf.y, ulf.z - lrf.z);
    nf = vb.cross(va).normalize();
    f = new Plane(nf.clone(), -nf.dot(llf)); 

    return new Frustum(l, r, b, t, n, f);

}