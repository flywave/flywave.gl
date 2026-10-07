/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { BatchStyleProcessor } from "../../src/theme/BatchStyleProcessor";

function makeProcessor(styles: any[]): BatchStyleProcessor {
    return new BatchStyleProcessor({ styleSet: styles } as any);
}

const BASE_STYLE = {
    id: "tier-0-15",
    when: "height >= 0 && height < 15",
    technique: "tile3d",
    color: "#7EC8FF",
    opacity: 1
};

describe("BatchStyleProcessor（样式求值与合并）", function () {
    it("when 命中的要素返回样式颜色/透明度", function () {
        const processor = makeProcessor([BASE_STYLE]);
        const style = processor.getBatchStyle({ batchId: 0, height: 10 });
        expect(style.color).to.equal("#7EC8FF");
        expect(style.opacity).to.equal(1);
    });

    it("when 不命中的要素返回默认可见样式（不误染）", function () {
        const processor = makeProcessor([BASE_STYLE]);
        const style = processor.getBatchStyle({ batchId: 0, height: 100 });
        expect(style.color).to.equal(undefined);
        expect(style.visible).to.equal(true);
    });

    it("多样式按顺序合并，后者覆盖前者（分级配色在前、高亮在后的用法依据）", function () {
        const processor = makeProcessor([
            BASE_STYLE,
            {
                id: "highlight",
                when: "height < 15",
                technique: "tile3d",
                color: "#ffff00",
                opacity: 0.5
            }
        ]);
        const style = processor.getBatchStyle({ batchId: 0, height: 5 });
        expect(style.color).to.equal("#ffff00");
        expect(style.opacity).to.equal(0.5);
    });

    it("addStyle 追加样式（无 id 时生成标识）并立即参与求值", function () {
        const processor = makeProcessor([]);
        const added = processor.addStyle({
            when: "height > 50",
            technique: "tile3d",
            color: "#00ff00",
            opacity: 1
        } as any);
        expect((added as any).id).to.exist;

        const style = processor.getBatchStyle({ batchId: 0, height: 80 });
        expect(style.color).to.equal("#00ff00");
    });

    it("updateStyleById 更新求值结果", function () {
        const processor = makeProcessor([BASE_STYLE]);
        expect(processor.updateStyleById("tier-0-15", { color: "#ff00ff" })).to.equal(true);

        const style = processor.getBatchStyle({ batchId: 0, height: 10 });
        expect(style.color).to.equal("#ff00ff");
    });

    it("removeStyleById 移除后回退到剩余样式/默认", function () {
        const processor = makeProcessor([BASE_STYLE]);
        expect(processor.removeStyleById("tier-0-15")).to.equal(true);
        expect(processor.removeStyleById("tier-0-15")).to.equal(false);

        const style = processor.getBatchStyle({ batchId: 0, height: 10 });
        expect(style.color).to.equal(undefined);
        expect(style.visible).to.equal(true);
    });

    it("复杂表达式：括号/或/非混合求值，重叠样式后者覆盖", function () {
        const processor = makeProcessor([
            {
                when: "(height < 20 || height >= 100) && !(height < 5)",
                technique: "tile3d",
                color: "#00cccc"
            },
            {
                when: "height >= 30 && height < 50",
                technique: "tile3d",
                color: "#9966ff"
            },
            {
                when: "height >= 40 && height < 50",
                technique: "tile3d",
                color: "#ff9900"
            }
        ]);

        expect(processor.getBatchStyle({ batchId: 0, height: 10 }).color).to.equal("#00cccc");
        expect(processor.getBatchStyle({ batchId: 0, height: 150 }).color).to.equal("#00cccc");
        expect(processor.getBatchStyle({ batchId: 0, height: 3 }).color).to.equal(undefined);
        expect(processor.getBatchStyle({ batchId: 0, height: 20 }).color).to.equal(undefined);
        expect(processor.getBatchStyle({ batchId: 0, height: 35 }).color).to.equal("#9966ff");
        // 40–50 hits both the purple and orange bands: the latter overrides the former
        expect(processor.getBatchStyle({ batchId: 0, height: 45 }).color).to.equal("#ff9900");
    });

    it("when 解析失败 fail-closed：非法表达式永不命中（不静默染所有要素）", function () {
        // `*` is not supported by the when grammar → parse failure; under fail-closed
        // semantics this style must never match, rather than degenerating into an
        // unconditional match (which would tint every feature #9966ff)
        const processor = makeProcessor([
            { when: "height * 2 >= 60", technique: "tile3d", color: "#9966ff" },
            { when: "height >= 30", technique: "tile3d", color: "#00cccc" }
        ]);

        expect(processor.getBatchStyle({ batchId: 0, height: 3 }).color).to.equal(undefined);
        expect(processor.getBatchStyle({ batchId: 0, height: 40 }).color).to.equal("#00cccc");
    });

    it("20 档样式：边界命中正确档位（多样式求值面）", function () {
        const styles = Array.from({ length: 20 }, (_, i) => ({
            id: `band-${i}`,
            when: `height >= ${i * 10} && height < ${(i + 1) * 10}`,
            technique: "tile3d",
            color: `#${(i + 1).toString(16).padStart(2, "0")}0000`
        }));
        const processor = makeProcessor(styles);

        expect(processor.getBatchStyle({ batchId: 0, height: 0 }).color).to.equal("#010000");
        expect(processor.getBatchStyle({ batchId: 0, height: 95 }).color).to.equal("#0a0000");
        expect(processor.getBatchStyle({ batchId: 0, height: 199.9 }).color).to.equal("#140000");
        expect(processor.getBatchStyle({ batchId: 0, height: 200 }).color).to.equal(undefined);
    });

    it("opacity 0 正确传递（全透明与 visible 互相独立）", function () {
        const processor = makeProcessor([
            { when: "height >= 0", technique: "tile3d", color: "#ff0000", opacity: 0 }
        ]);

        const style = processor.getBatchStyle({ batchId: 0, height: 10 });
        expect(style.opacity).to.equal(0);
        expect(style.visible).to.equal(true);
    });
});
