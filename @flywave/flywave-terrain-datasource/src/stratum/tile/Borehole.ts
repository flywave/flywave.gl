import * as THREE from "three";

import { BoreholeStratum, TrajectoryPoint } from "../decoder";
import { StratumMaterial } from "./StratumMaterial";

export class Borehole {
    private readonly _id: string;
    private readonly _location: [number, number, number];
    private readonly _depth: number;
    private readonly _azimuth: number;
    private readonly _inclination: number;
    private _trajectory: TrajectoryPoint[];
    private _stratums: BoreholeStratum[];
    private _geometrys?: THREE.BufferGeometry[];
    private _materials?: StratumMaterial[];

    constructor(
        bh: {
            id: string;
            location: [number, number, number];
            depth: number;
            azimuth: number;
            inclination: number;
            trajectory: TrajectoryPoint[];
            stratums: BoreholeStratum[];
        },
        geometry?: THREE.BufferGeometry[],
        materials?: StratumMaterial[]
    ) {
        this._id = bh.id;
        this._location = bh.location;
        this._depth = bh.depth;
        this._azimuth = bh.azimuth;
        this._inclination = bh.inclination;
        this._trajectory = bh.trajectory;
        this._stratums = bh.stratums;
        this._geometrys = geometry;
        this._materials = materials;
    }

    get id() {
        return this._id;
    }

    get location() {
        return this._location;
    }

    get depth() {
        return this._depth;
    }

    get azimuth() {
        return this._azimuth;
    }

    get inclination() {
        return this._inclination;
    }

    get trajectory() {
        return this._trajectory;
    }

    get stratums() {
        return this._stratums;
    }

    get geometries(): THREE.BufferGeometry[] {
        return this._geometrys || [];
    }

    get materials(): StratumMaterial[] {
        return this._materials || [];
    }

    dispose() {
        this._geometrys?.forEach(geom => {
            geom.dispose();
        });

        this._materials?.forEach(mat => {
            mat.dispose();
        });

        // 清空数组引用
        this._geometrys = undefined;
        this._materials = undefined;
        this._trajectory = [];
        this._stratums = [];
    }
}
