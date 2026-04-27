declare function tileKeyToGeoBox(tileKey: any): {
    west: number;
    south: number;
    east: number;
    north: number;
    toString: () => string;
};
declare function geoBoxToOrientedBox3(geoBox: any): MockOrientedBox3;
declare function testFrustumCulling(orientedBox: any): any;
declare class MockVector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    copy(v: any): this;
    set(x: any, y: any, z: any): this;
}
declare class MockMatrix4 {
    elements: number[];
    fromArray(array: any): this;
    multiplyMatrices(a: any, b: any): this;
}
declare class MockOrientedBox3 {
    position: MockVector3;
    xAxis: MockVector3;
    yAxis: MockVector3;
    zAxis: MockVector3;
    extents: MockVector3;
    intersects(frustum: any): boolean;
}
declare const worldMatrix: MockMatrix4;
declare const projectionMatrix: MockMatrix4;
declare namespace frustum {
    let type: string;
    let data: string;
}
declare const testTileKeys: string[];
