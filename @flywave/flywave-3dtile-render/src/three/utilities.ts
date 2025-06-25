import { Color } from "three";

// 定义颜色缓存对象的类型
interface ColorCache {
    [index: number]: Color;
}

// 初始化颜色缓存对象
const colors: ColorCache = {};

/**
 * 获取基于索引的随机颜色（相同索引返回相同颜色）
 * @param index - 颜色索引
 * @returns 返回一个THREE.Color对象
 */
export function getIndexedRandomColor(index: number): Color {
    // 如果该索引的颜色不存在，则创建一个新的随机颜色
    if (!colors[index]) {
        const h = Math.random(); // 随机色相 (0-1)
        const s = 0.5 + Math.random() * 0.5; // 饱和度 (0.5-1.0)
        const l = 0.375 + Math.random() * 0.25; // 亮度 (0.375-0.625)

        colors[index] = new Color().setHSL(h, s, l);
    }

    // 返回缓存中的颜色
    return colors[index];
}
