const degToRad = (d: number) => (d * Math.PI) / 180;
const radToDeg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const MAX_LAT = 85.05112878;

export type ProjectionName =
    | 'mercator'
    | 'equirectangular'
    | 'albers'
    | 'lambertConicConic'
    | 'equalEarth'
    | 'naturalEarth'
    | 'winkelTripel'
    | 'globe';

export interface ProjectionConfig {
    name: ProjectionName;
    center?: [number, number];
    parallels?: [number, number];
}

export interface ProjectedPoint {
    x: number;
    y: number;
}

export function project(
    lng: number,
    lat: number,
    config: ProjectionConfig,
): ProjectedPoint {
    switch (config.name) {
        case 'mercator':
            return {
                x: lng / 360 + 0.5,
                y: 0.5 - (Math.log(Math.tan(Math.PI / 4 + degToRad(lat) / 2)) / Math.PI) * 0.5,
            };
        case 'equirectangular':
            return { x: 0.5 + lng / 360, y: 0.5 - lat / 360 };
        case 'albers':
            return projectAlbers(lng, lat, config);
        case 'equalEarth':
            return projectEqualEarth(lng, lat);
        case 'naturalEarth':
            return projectNaturalEarth(lng, lat);
        case 'winkelTripel':
            return projectWinkelTripel(lng, lat);
        case 'lambertConicConic':
            return projectLambert(lng, lat, config);
        case 'globe':
            return projectSphere(lng, lat);
        default:
            return { x: lng / 360 + 0.5, y: 0.5 - lat / 360 };
    }
}

export function unproject(
    x: number,
    y: number,
    config: ProjectionConfig,
): { lng: number; lat: number } {
    switch (config.name) {
        case 'mercator':
            return {
                lng: (x - 0.5) * 360,
                lat: clamp(radToDeg(2 * Math.atan(Math.exp((0.5 - y) * Math.PI)) - Math.PI / 2), -MAX_LAT, MAX_LAT),
            };
        case 'equirectangular':
            return {
                lng: (x - 0.5) * 360,
                lat: clamp((0.5 - y) * 360, -MAX_LAT, MAX_LAT),
            };
        case 'albers':
            return unprojectAlbers(x, y, config);
        case 'equalEarth':
            return unprojectEqualEarth(x, y);
        case 'naturalEarth':
            return unprojectNaturalEarth(x, y);
        case 'winkelTripel':
            return unprojectWinkelTripel(x, y);
        case 'lambertConicConic':
            return unprojectLambert(x, y, config);
        case 'globe':
            return unprojectSphere(x, y);
        default:
            return { lng: (x - 0.5) * 360, lat: clamp((0.5 - y) * 360, -MAX_LAT, MAX_LAT) };
    }
}

function projectAlbers(lng: number, lat: number, config: ProjectionConfig): ProjectedPoint {
    const center = config.center ?? [-96, 37.5];
    const parallels = config.parallels ?? [29.5, 45.5];
    const n = (Math.sin(degToRad(parallels[0])) + Math.sin(degToRad(parallels[1]))) / 2;
    const c = 1 + Math.sin(degToRad(parallels[0])) * (2 * n - Math.sin(degToRad(parallels[0])));
    const r0 = Math.sqrt(c) / n;
    const lambda = degToRad(lng - center[0]);
    const phi = degToRad(lat);
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    return { x: r * Math.sin(lambda * n), y: r * Math.cos(lambda * n) - r0 };
}

function unprojectAlbers(x: number, y: number, config: ProjectionConfig): { lng: number; lat: number } {
    const center = config.center ?? [-96, 37.5];
    const parallels = config.parallels ?? [29.5, 45.5];
    const n = (Math.sin(degToRad(parallels[0])) + Math.sin(degToRad(parallels[1]))) / 2;
    const c = 1 + Math.sin(degToRad(parallels[0])) * (2 * n - Math.sin(degToRad(parallels[0])));
    const r0 = Math.sqrt(c) / n;
    const r0y = r0 + y;
    const rho2y = x * x + r0y * r0y;
    const phi = Math.asin(clamp((c - rho2y * n * n) / (2 * n), -1, 1));
    let l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y) / n;
    return {
        lng: clamp(radToDeg(l) + center[0], -180, 180),
        lat: clamp(radToDeg(phi), -MAX_LAT, MAX_LAT),
    };
}

const EE_A1 = 1.340264, EE_A2 = -0.081106, EE_A3 = 0.000893, EE_A4 = 0.003796;
const EE_M = Math.sqrt(3) / 2;

function projectEqualEarth(lng: number, lat: number): ProjectedPoint {
    const phi = degToRad(lat);
    const lambda = degToRad(lng);
    const theta = Math.asin(EE_M * Math.sin(phi));
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const xRaw = (lambda * Math.cos(theta)) / (EE_M * (EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)));
    const yRaw = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2));
    return { x: (xRaw / Math.PI + 0.5) * 0.5, y: 1 - (yRaw / Math.PI + 1) * 0.5 };
}

function unprojectEqualEarth(x: number, y: number): { lng: number; lat: number } {
    const xn = (2 * x - 0.5) * Math.PI;
    const yn = (2 * (1 - y) - 1) * Math.PI;
    let theta = yn;
    for (let i = 0; i < 12; i++) {
        const t2 = theta * theta;
        const t6 = t2 * t2 * t2;
        const fy = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2)) - yn;
        const fpy = EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2);
        const delta = fy / fpy;
        theta = clamp(theta - delta, -Math.PI / 3, Math.PI / 3);
        if (Math.abs(delta) < 1e-12) break;
    }
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const lambda = (EE_M * xn * (EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2))) / Math.cos(theta);
    const phi = Math.asin(Math.sin(theta) / EE_M);
    return { lng: clamp(radToDeg(lambda), -180, 180), lat: clamp(radToDeg(phi), -MAX_LAT, MAX_LAT) };
}

function projectNaturalEarth(lng: number, lat: number): ProjectedPoint {
    const phi = degToRad(lat);
    const lambda = degToRad(lng);
    const p2 = phi * phi;
    const p4 = p2 * p2;
    const xRaw = lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
    const yRaw = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    return { x: (xRaw / Math.PI + 0.5) * 0.5, y: 1 - (yRaw / Math.PI + 1) * 0.5 };
}

function unprojectNaturalEarth(x: number, y: number): { lng: number; lat: number } {
    const xn = (2 * x - 0.5) * Math.PI;
    const yn = (2 * (1 - y) - 1) * Math.PI;
    const maxPhi = degToRad(MAX_LAT);
    let phi = yn;
    for (let i = 0; i < 25; i++) {
        const p2 = phi * phi;
        const p4 = p2 * p2;
        const delta =
            (phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - yn) /
            (1.007226 + p2 * (0.015085 * 3 + p4 * (-0.044475 * 7 + 0.028874 * 9 * p2 - 0.005916 * 11 * p4)));
        phi = clamp(phi - delta, -maxPhi, maxPhi);
        if (Math.abs(delta) < 1e-6) break;
    }
    const p2 = phi * phi;
    const lambda = xn / (0.8707 + p2 * (-0.131979 + p2 * (-0.013791 + p2 * p2 * p2 * (0.003971 - 0.001529 * p2))));
    return { lng: clamp(radToDeg(lambda), -180, 180), lat: radToDeg(phi) };
}

function projectWinkelTripel(lng: number, lat: number): ProjectedPoint {
    const phi = degToRad(lat);
    const lambda = degToRad(lng);
    const cosLat = Math.cos(phi);
    const alpha = Math.acos(clamp(cosLat * Math.cos(lambda / 2), -1, 1));
    const s = Math.abs(alpha) < 1e-10 ? 1 : Math.sin(alpha) / alpha;
    const xRaw = 0.5 * (lambda * (2 / Math.PI) + (2 * cosLat * Math.sin(lambda / 2)) / s);
    const yRaw = 0.5 * (phi + Math.sin(phi) / s);
    return { x: (xRaw / Math.PI + 0.5) * 0.5, y: 1 - (yRaw / Math.PI + 1) * 0.5 };
}

function unprojectWinkelTripel(x: number, y: number): { lng: number; lat: number } {
    const xn = (2 * x - 0.5) * Math.PI;
    const yn = (2 * (1 - y) - 1) * Math.PI;
    const maxPhi = degToRad(MAX_LAT);
    let lambda = xn;
    let phi = yn;
    for (let i = 0; i < 25; i++) {
        const cosphi = Math.cos(phi);
        const sinphi = Math.sin(phi);
        const sinphi2 = 2 * sinphi * cosphi;
        const sin2phi = sinphi * sinphi;
        const cos2phi = cosphi * cosphi;
        const coslambda2 = Math.cos(lambda / 2);
        const sinlambda2 = Math.sin(lambda / 2);
        const sinlambda = 2 * coslambda2 * sinlambda2;
        const sin2lambda2 = sinlambda2 * sinlambda2;
        const C = 1 - cos2phi * coslambda2 * coslambda2;
        const F = C > 1e-10 ? 1 / C : 0;
        const E = C > 1e-10 ? Math.acos(clamp(cosphi * coslambda2, -1, 1)) * Math.sqrt(1 / C) : 0;
        const fx = 0.5 * (2 * E * cosphi * sinlambda2 + lambda * (2 / Math.PI)) - xn;
        const fy = 0.5 * (E * sinphi + phi) - yn;
        const dxdlambda = 0.5 * F * (cos2phi * sin2lambda2 + E * cosphi * coslambda2 * sinphi2) + 1 / Math.PI;
        const dxdphi = F * (sinlambda * sinphi2 / 4 - E * sinphi * sinlambda2);
        const dydlambda = 0.125 * F * (sinphi2 * sin2lambda2 - E * sinphi * cos2phi * sinlambda);
        const dydphi = 0.5 * F * (sinphi2 * coslambda2 + E * sin2lambda2 * cosphi) + 0.5;
        const denom = dxdphi * dydlambda - dydphi * dxdlambda;
        if (Math.abs(denom) < 1e-15) break;
        const dlambda = (fy * dxdphi - fx * dydphi) / denom;
        const dphi = (fx * dydlambda - fy * dxdlambda) / denom;
        lambda = clamp(lambda - dlambda, -Math.PI, Math.PI);
        phi = clamp(phi - dphi, -maxPhi, maxPhi);
        if (Math.abs(dlambda) < 1e-6 && Math.abs(dphi) < 1e-6) break;
    }
    return { lng: radToDeg(lambda), lat: radToDeg(phi) };
}

function projectLambert(lng: number, lat: number, config: ProjectionConfig): ProjectedPoint {
    const center = config.center ?? [0, 30];
    const parallels = config.parallels ?? [30, 30];
    const y0 = degToRad(parallels[0]);
    const y1 = degToRad(parallels[1]);
    const tany = (y: number) => Math.tan((Math.PI / 2 + y) / 2);
    const n = Math.abs(y0 - y1) < 1e-10
        ? Math.sin(y0)
        : Math.log(Math.cos(y0) / Math.cos(y1)) / Math.log(tany(y1) / tany(y0));
    const f = (Math.cos(y0) * Math.pow(tany(y0), n)) / n;
    const phi = degToRad(lat);
    const lambda = degToRad(lng - center[0]);
    const r = f / Math.pow(tany(phi), n);
    const xRaw = r * Math.sin(n * lambda);
    const yRaw = f - r * Math.cos(n * lambda);
    return {
        x: (xRaw / Math.PI + 0.5) * 0.5,
        y: 1 - (yRaw / Math.PI + 0.5) * 0.5,
    };
}

function unprojectLambert(x: number, y: number, config: ProjectionConfig): { lng: number; lat: number } {
    const center = config.center ?? [0, 30];
    const parallels = config.parallels ?? [30, 30];
    const y0 = degToRad(parallels[0]);
    const y1 = degToRad(parallels[1]);
    const tany = (y: number) => Math.tan((Math.PI / 2 + y) / 2);
    const n = Math.abs(y0 - y1) < 1e-10
        ? Math.sin(y0)
        : Math.log(Math.cos(y0) / Math.cos(y1)) / Math.log(tany(y1) / tany(y0));
    const f = (Math.cos(y0) * Math.pow(tany(y0), n)) / n;
    const xn = (2 * x - 0.5) * Math.PI;
    const yn = (2 * (1 - y) - 0.5) * Math.PI;
    const fy = f - yn;
    const r = Math.sign(n) * Math.sqrt(xn * xn + fy * fy);
    let l = Math.atan2(xn, Math.abs(fy)) * Math.sign(fy);
    if (fy * n < 0) l -= Math.PI * Math.sign(xn) * Math.sign(fy);
    const phi = 2 * Math.atan(Math.pow(f / r, 1 / n)) - Math.PI / 2;
    return {
        lng: clamp(radToDeg(l / n) + center[0], -180, 180),
        lat: clamp(radToDeg(phi), -MAX_LAT, MAX_LAT),
    };
}

export function parseProjection(styleProjection: any): ProjectionConfig {
    if (!styleProjection) return { name: 'mercator' };
    if (typeof styleProjection === 'string') return { name: styleProjection as ProjectionName };
    const name = styleProjection.name ?? 'mercator';
    return {
        name: name as ProjectionName,
        center: styleProjection.center,
        parallels: styleProjection.parallels,
    };
}

function projectSphere(lng: number, lat: number): ProjectedPoint {
    const phi = degToRad(lat);
    const lambda = degToRad(lng);
    const r = 0.5;
    return {
        x: r * Math.cos(phi) * Math.cos(lambda) + 0.5,
        y: r * Math.cos(phi) * Math.sin(lambda) + 0.5,
    };
}

function unprojectSphere(x: number, y: number): { lng: number; lat: number } {
    const px = (x - 0.5) * 2;
    const py = (y - 0.5) * 2;
    const r = Math.sqrt(px * px + py * py);
    if (r < 1e-10) return { lng: 0, lat: 0 };
    const lat = Math.asin(clamp(py / Math.max(r, 1), -1, 1)) * 180 / Math.PI;
    const lng = Math.atan2(px, Math.sqrt(Math.max(0, 1 - px * px - py * py))) * 180 / Math.PI;
    return { lng: clamp(lng, -180, 180), lat: clamp(lat, -MAX_LAT, MAX_LAT) };
}
