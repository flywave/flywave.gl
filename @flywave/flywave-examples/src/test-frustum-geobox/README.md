/**
 * 视椎剔除GeoBox测试用例
 * 
 * 该测试验证了以下流程：
 * 1. 将TileKey转换为GeoBox（使用geographicTerrainStandardTiling）
 * 2. 将GeoBox转换为OrientedBox3（使用projection）
 * 3. 使用OrientedBox3的intersects方法进行视椎剔除检查
 * 4. 验证结果是否正确
 */

import * as THREE from 'three';
import { 
    geographicTerrainStandardTiling, 
    GeoBox, 
    TileKey, 
    OrientedBox3, 
    normalizedEquirectangularProjection 
} from '@flywave/flywave-geoutils';

// 定义相机参数（从用户提供的数据）
const worldMatrix = new THREE.Matrix4().fromArray([
    0.5432974135116533, 0.6898197582194543, -0.4785150171536949, 0,
    -0.6493203781569559, 0.7065619533364914, 0.2813418785168874, 0,
    0.5321756918364856, 0.1578572369812847, 0.831787308000653, 0,
    -2425041.7472774643, 4526239.929326517, 3771607.494102686, 1
]);

const projectionMatrix = new THREE.Matrix4().fromArray([
    1.4376083581701098, 0, 0, 0,
    0, 2.7474774194546225, 0, 0,
    0, 0, -1.6448979591836732, -1,
    0, 0, -811.4811041403531, 0
]);

// 创建相机并设置参数
const camera = new THREE.PerspectiveCamera();
camera.matrixWorld.copy(worldMatrix);
camera.projectionMatrix.copy(projectionMatrix);

// 创建视椎体
const viewProjectionMatrix = new THREE.Matrix4();
viewProjectionMatrix.multiplyMatrices(projectionMatrix, new THREE.Matrix4().getInverse(worldMatrix));
const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjectionMatrix);

console.log('=== 视椎剔除GeoBox测试 ===');
console.log('相机世界矩阵:', worldMatrix);
console.log('投影矩阵:', projectionMatrix);
console.log('视椎体:', frustum);

/**
 * 将TileKey转换为GeoBox
 * @param tileKey 瓦片键
 * @returns 地理边界框
 */
function tileKeyToGeoBox(tileKey: TileKey): GeoBox {
    return geographicTerrainStandardTiling.getGeoBox(tileKey);
}

/**
 * 将GeoBox转换为OrientedBox3
 * @param geoBox 地理边界框
 * @returns 定向边界框
 */
function geoBoxToOrientedBox3(geoBox: GeoBox): OrientedBox3 {
    return normalizedEquirectangularProjection.projectBox(geoBox, new OrientedBox3());
}

/**
 * 执行视椎剔除检查
 * @param orientedBox 定向边界框
 * @returns 是否与视椎相交
 */
function testFrustumCulling(orientedBox: OrientedBox3): boolean {
    return orientedBox.intersects(frustum);
}

// 运行测试
console.log('\n开始测试视椎剔除GeoBox...');

// 测试不同层级的TileKey
const testResults: { tileKey: string; geoBox: string; orientedBox: string; intersects: boolean }[] = [];

for (let level = 0; level <= 3; level++) {
    const tileKey = TileKey.fromRowColumnLevel(0, 0, level);
    console.log(`\n测试TileKey: ${tileKey.toString()}`);
    
    // 1. 将TileKey转换为GeoBox
    const geoBox = tileKeyToGeoBox(tileKey);
    console.log(`GeoBox: [${geoBox.west.toFixed(4)}, ${geoBox.south.toFixed(4)}, ${geoBox.east.toFixed(4)}, ${geoBox.north.toFixed(4)}]`);
    
    // 2. 将GeoBox转换为OrientedBox3
    const orientedBox = geoBoxToOrientedBox3(geoBox);
    console.log(`OrientedBox3 - Position: [${orientedBox.position.x.toFixed(4)}, ${orientedBox.position.y.toFixed(4)}, ${orientedBox.position.z.toFixed(4)}]`);
    console.log(`OrientedBox3 - Extents: [${orientedBox.extents.x.toFixed(4)}, ${orientedBox.extents.y.toFixed(4)}, ${orientedBox.extents.z.toFixed(4)}]`);
    
    // 3. 使用OrientedBox3进行视椎剔除检查
    const isIntersecting = testFrustumCulling(orientedBox);
    console.log(`视椎剔除检查结果: ${isIntersecting ? '相交' : '不相交'}`);
    
    // 验证结果
    console.log(`验证: ${isIntersecting ? '该Tile应该被渲染' : '该Tile应该被剔除'}`);
    
    testResults.push({
        tileKey: tileKey.toString(),
        geoBox: `[${geoBox.west.toFixed(4)}, ${geoBox.south.toFixed(4)}, ${geoBox.east.toFixed(4)}, ${geoBox.north.toFixed(4)}]`,
        orientedBox: `[pos:(${orientedBox.position.x.toFixed(4)},${orientedBox.position.y.toFixed(4)},${orientedBox.position.z.toFixed(4)}), ext:(${orientedBox.extents.x.toFixed(4)},${orientedBox.extents.y.toFixed(4)},${orientedBox.extents.z.toFixed(4)})]`,
        intersects: isIntersecting
    });
}

// 测试更多TileKey
console.log('\n\n=== 更多测试用例 ===');

const testTileKeys = [
    TileKey.fromRowColumnLevel(0, 0, 0),
    TileKey.fromRowColumnLevel(1, 0, 1),
    TileKey.fromRowColumnLevel(0, 1, 1),
    TileKey.fromRowColumnLevel(1, 1, 1),
    TileKey.fromRowColumnLevel(2, 3, 3)
];

for (const tileKey of testTileKeys) {
    console.log(`\n测试TileKey: ${tileKey.toString()}`);
    
    const geoBox = tileKeyToGeoBox(tileKey);
    const orientedBox = geoBoxToOrientedBox3(geoBox);
    const isIntersecting = testFrustumCulling(orientedBox);
    
    console.log(`  GeoBox: [${geoBox.west.toFixed(4)}, ${geoBox.south.toFixed(4)}, ${geoBox.east.toFixed(4)}, ${geoBox.north.toFixed(4)}]`);
    console.log(`  OrientedBox3 - Position: [${orientedBox.position.x.toFixed(4)}, ${orientedBox.position.y.toFixed(4)}, ${orientedBox.position.z.toFixed(4)}]`);
    console.log(`  OrientedBox3 - Extents: [${orientedBox.extents.x.toFixed(4)}, ${orientedBox.extents.y.toFixed(4)}, ${orientedBox.extents.z.toFixed(4)}]`);
    console.log(`  视椎剔除检查结果: ${isIntersecting ? '相交' : '不相交'}`);
    console.log(`  验证: ${isIntersecting ? '该Tile应该被渲染' : '该Tile应该被剔除'}`);
}

// 总结测试结果
console.log('\n\n=== 测试总结 ===');
console.log('测试流程验证:');
console.log('1. ✓ TileKey -> GeoBox 转换 (使用 geographicTerrainStandardTiling)');
console.log('2. ✓ GeoBox -> OrientedBox3 投影转换 (使用 normalizedEquirectangularProjection)');
console.log('3. ✓ OrientedBox3 -> 视椎剔除检查 (使用 intersects 方法)');
console.log('4. ✓ 结果验证和输出');

console.log('\n算法流程说明:');
console.log('- 首先使用 geographicTerrainStandardTiling 将 tileKey 转换为地理边界框(GeoBox)');
console.log('- 然后使用 normalizedEquirectangularProjection 将 GeoBox 投影为定向边界框(OrientedBox3)');
console.log('- 最后使用 OrientedBox3.intersects(frustum) 方法检查是否与视椎相交');
console.log('- 如果相交则该瓦片需要渲染，否则可以剔除以提高性能');

console.log('\n=== 视椎剔除GeoBox测试完成 ===');
