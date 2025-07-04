import * as THREE from "three";

import { FaultPoint } from "../decoder/types";

export class FaultProfile {
    private readonly _id: string;
    private readonly _name: string;
    private readonly _type: string;
    private readonly _strike: number;
    private readonly _dip: number;
    private readonly _throw: number;
    private _points: FaultPoint[];
    private _geometry?: THREE.BufferGeometry; // 类型替换
    private _material?: THREE.Material; // 类型替换

    constructor(
        fault: {
            id: string;
            name: string;
            type: string;
            strike: number;
            dip: number;
            throw: number;
            points: FaultPoint[];
        },
        geometry?: THREE.BufferGeometry,
        material?: THREE.Material
    ) {
        this._id = fault.id;
        this._name = fault.name;
        this._type = fault.type;
        this._strike = fault.strike;
        this._dip = fault.dip;
        this._throw = fault.throw;
        this._points = fault.points;
        this._geometry = geometry;
        this._material = material;
    }

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
        }
        if (this._material) {
            this._material.dispose();
        }
        // 释放几何数据
        this._geometry = undefined;
        // 释放材质数据
        this._material = undefined;
        // 清空点集引用
        this._points = [];
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get type() {
        return this._type;
    }

    get strike() {
        return this._strike;
    }

    get dip() {
        return this._dip;
    }

    get throw() {
        return this._throw;
    }

    get points() {
        return this._points;
    }

    get geometry(): THREE.BufferGeometry {
        return this._geometry!;
    }

    get material(): THREE.Material {
        return this._material!;
    }
}
