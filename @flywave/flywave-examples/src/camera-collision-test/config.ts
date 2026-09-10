import thumbnail from "../getting-started-dem-terrain/thumbnail.png";

export default {
    title: "Camera Terrain Collision Test",
    titleZh: "相机地形碰撞测试",
    description:
        "Visualize camera-vs-terrain collision: TerrainSource.raycast hit point, getWorldPositionAt fallback, and a toggle for enableCameraCollision. Uses free AWS Terrarium DEM.",
    descriptionZh:
        "可视化相机与地形的碰撞：TerrainSource.raycast 命中点、getWorldPositionAt 兜底，可实时开关 enableCameraCollision 对比穿地效果。接入免费 AWS Terrarium DEM。",
    thumbnail: thumbnail,
    code: "terrain-elevation",
    order: 3
};
