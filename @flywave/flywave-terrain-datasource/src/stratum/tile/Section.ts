import * as THREE from "three";

export class SectionLine {
    private readonly _id: string;
    private readonly _name: string;
    private _lineString: Array<[number, number, number]>;
    private _geometries?: THREE.BufferGeometry[];
    private _materials?: THREE.Material[];

    constructor(
        sl: {
            id: string;
            name: string;
            lineString: Array<[number, number, number]>;
        },
        geometry?: THREE.BufferGeometry[],
        materials?: THREE.Material[]
    ) {
        this._id = sl.id;
        this._name = sl.name;
        this._lineString = sl.lineString;
        this._geometries = geometry;
        this._materials = materials;
    }

    get id(): string {
        return this._id;
    }

    get name(): string {
        return this._name;
    }

    get lineString(): Array<[number, number, number]> {
        return this._lineString;
    }

    get geometries(): THREE.BufferGeometry[] {
        // 返回类型修改
        return this._geometries || [];
    }

    get materials(): THREE.Material[] {
        // 返回类型修改
        return this._materials || [];
    }

    dispose() {
        this._geometries?.forEach(geom => geom.dispose());
        this._materials?.forEach(mat => mat.dispose());

        // 释放几何数据
        this._geometries = undefined;
        // 释放材质数据
        this._materials = undefined;
        // 清空剖切线坐标数据
        this._lineString = [];
    }
}
