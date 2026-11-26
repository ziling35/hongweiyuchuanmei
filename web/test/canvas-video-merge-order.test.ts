import { describe, expect, test } from "bun:test";

import { defaultMergeOrder, moveMergeOrderItem, orderNodesByIds } from "../src/lib/canvas/canvas-video-merge-order";
import type { CanvasNodeData } from "../src/types/canvas";

function video(id: string, y: number, x: number, shotIndex?: number) {
    return { id, position: { x, y }, metadata: shotIndex === undefined ? {} : { shotIndex } } as unknown as CanvasNodeData;
}

describe("合并顺序", () => {
    test("默认顺序：镜头号优先，其次从上到下、从左到右", () => {
        const nodes = [video("c", 100, 0), video("a", 300, 0, 1), video("b", 200, 500, 0), video("d", 100, 200)];
        // 有镜头号的 a(1)、b(0) 按镜头号在前；没有镜头号的 c、d 落到后面，再按 y、x 排。
        // 有镜头号的 b(0)、a(1) 按镜头号在前；没有镜头号的 c、d 落到后面，同 y 再按 x 排（c 在 d 左）。
        expect(defaultMergeOrder(nodes)).toEqual(["b", "a", "c", "d"]);
    });

    test("全部没有镜头号时退化为画布位置排序", () => {
        const nodes = [video("bottom", 400, 0), video("topRight", 100, 900), video("topLeft", 100, 100)];
        expect(defaultMergeOrder(nodes)).toEqual(["topLeft", "topRight", "bottom"]);
    });

    test("上移与下移交换相邻项，越界保持原顺序", () => {
        const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
        expect(moveMergeOrderItem(items, "c", -1).map((item) => item.id)).toEqual(["a", "c", "b"]);
        expect(moveMergeOrderItem(items, "a", 1).map((item) => item.id)).toEqual(["b", "a", "c"]);
        expect(moveMergeOrderItem(items, "a", -1).map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(moveMergeOrderItem(items, "c", 1).map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(moveMergeOrderItem(items, "missing", 1).map((item) => item.id)).toEqual(["a", "b", "c"]);
        // 不修改入参
        expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    });

    test("按给定顺序取节点，未列出的追加在后面且不重复", () => {
        const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
        expect(orderNodesByIds(nodes, ["c", "a", "b"]).map((node) => node.id)).toEqual(["c", "a", "b"]);
        expect(orderNodesByIds(nodes, ["c"]).map((node) => node.id)).toEqual(["c", "a", "b"]);
        expect(orderNodesByIds(nodes, ["c", "c", "a"]).map((node) => node.id)).toEqual(["c", "a", "b"]);
        expect(orderNodesByIds(nodes, ["ghost", "b"]).map((node) => node.id)).toEqual(["b", "a", "c"]);
    });
});
