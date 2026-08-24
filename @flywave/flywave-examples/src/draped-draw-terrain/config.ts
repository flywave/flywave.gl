import thumbnail from "./thumbnail.png";

export default {
    title: "Terrain Draped Draw",
    titleZh: "贴地绘制（线/面）",
    description:
        "Depth-reconstruction draped line and polygon volumes: screen-space constant-width lines and analytic polygon fills that hug the terrain without CPU height sampling.",
    descriptionZh:
        "基于深度重建的贴合地面绘制：屏幕空间恒宽线与解析判定多边形填充，无需 CPU 采样高程即可紧贴地形。",
    thumbnail: thumbnail,
    code: "terrain-elevation",
    order: 30
};
