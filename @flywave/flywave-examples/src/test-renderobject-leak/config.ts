import thumbnail from "../threejs-lighting/thumbnail.png";

export default {
    title: "RenderObject Leak Test",
    titleZh: "RenderObject 内存泄漏测试",
    description:
        "Minimal test: create/destroy meshes with shared material to test RenderObject disposal",
    descriptionZh: "最小测试：使用共享材质创建/销毁 mesh，测试 RenderObject 内存释放",
    thumbnail: thumbnail,
    code: "test-renderobject-leak",
    order: 99
};
