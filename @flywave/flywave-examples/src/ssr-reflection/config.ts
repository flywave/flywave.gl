import thumbnail from "./thumbnail.png";

export default {
    title: "SSR Reflection",
    titleZh: "屏幕空间反射",
    description:
        "Screen-space reflections for user components: tag any mesh with mapRenderingManager.addReflectiveObject and it mirrors the live scene — terrain, buildings, other objects — at no extra scene render. Tune the polished-floor preset and the SSR pass live.",
    descriptionZh:
        "用户组件的屏幕空间反射：用 mapRenderingManager.addReflectiveObject 给任意 Mesh 打标，即可映出实时场景（地形、建筑、其他对象），无需二次场景渲染。可实时调抛光地板预设与 SSR 参数。",
    thumbnail: thumbnail,
    code: "advanced-rendering",
    order: 11
};
