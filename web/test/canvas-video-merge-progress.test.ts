import { describe, expect, test } from "bun:test";
import { mergeReadProgress } from "../src/lib/canvas/canvas-video-merge-progress";

// 读取阶段占据 0..45 的进度区间：先把每段视频下载下来，再写进 wasm 虚拟文件系统。
describe("合并读取阶段进度", () => {
    test("两段视频按文件切分区间", () => {
        expect(mergeReadProgress(0, 2)).toBe(0);
        expect(mergeReadProgress(1, 2)).toBe(23);
        expect(mergeReadProgress(2, 2)).toBe(45);
    });

    test("有 content-length 时按字节推进", () => {
        expect(mergeReadProgress(0, 2, 50, 100)).toBe(11);
        expect(mergeReadProgress(0, 2, 100, 100)).toBe(23);
        expect(mergeReadProgress(1, 2, 50, 100)).toBe(34);
    });

    test("超出范围的字节数被夹住，不越过区间上界", () => {
        expect(mergeReadProgress(0, 2, 200, 100)).toBe(23);
        expect(mergeReadProgress(0, 2, -10, 100)).toBe(0);
    });

    test("缺少总字节数时退回文件粒度", () => {
        expect(mergeReadProgress(0, 3, 123, 0)).toBe(0);
        expect(mergeReadProgress(3, 3, 123, 0)).toBe(45);
    });

    test("结果始终落在 0..45", () => {
        for (const count of [2, 3, 5, 10]) {
            for (let index = 0; index <= count; index += 1) {
                const value = mergeReadProgress(index, count, 7, 13);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(45);
            }
        }
    });
});
