import * as THREE from 'three';

export class SectionLine {
    private _id: string;
    private _name: string;
    private _lineString: [number, number, number][];
    private _geometries?: THREE.BufferGeometry[];  // 类型替换
    private _bbox?: THREE.Box3;
    private _materials?: THREE.Material[];        // 类型替换

    constructor(sl: {
        id: string, name: string, lineString: [number, number, number][]
    }, bbox?: THREE.Box3, geometry?: THREE.BufferGeometry[], materials?: THREE.Material[]) {
        this._id = sl.id;
        this._name = sl.name;
        this._lineString = sl.lineString;
        this._bbox = bbox;
        this._geometries = geometry;
        this._materials = materials;
    }

    get id(): string {
        return this._id;
    }

    get name(): string {
        return this._name;
    }

    get lineString(): [number, number, number][] {
        return this._lineString;
    }

    get bbox() {
        return this._bbox;
    }

    get geometries(): THREE.BufferGeometry[] {  // 返回类型修改
        return this._geometries || [];
    }

    get materials(): THREE.Material[] {         // 返回类型修改
        return this._materials || [];
    }

    dispose() {
        this._geometries?.forEach(geom => geom.dispose());
        this._materials?.forEach(mat => mat.dispose());
        
        // 释放几何数据
        this._geometries = undefined;
        // 释放材质数据
        this._materials = undefined;
        // 清空包围盒引用
        this._bbox = undefined;
        // 清空剖切线坐标数据
        this._lineString = [];
    }
}
