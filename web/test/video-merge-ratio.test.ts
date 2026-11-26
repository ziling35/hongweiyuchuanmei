import { describe, expect, test } from "bun:test";
import { isSameVideoAspect, videoAspectConflict, videoFrameSizeFromMetadata, VIDEO_MERGE_RATIO_TOLERANCE } from "../src/lib/canvas/video-merge-ratio";

describe("视频合并画幅判定", () => {
    test("同比例不同像素档位可以合并", () => {
        expect(videoAspectConflict([{ width: 992, height: 432 }, { width: 1984, height: 864 }])).toBeNull();
        expect(videoAspectConflict([{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }])).toBeNull();
        expect(isSameVideoAspect([{ width: 720, height: 1280 }, { width: 1080, height: 1920 }])).toBe(true);
    });

    test("不同比例返回第一处冲突并带两侧尺寸", () => {
        expect(videoAspectConflict([{ width: 992, height: 432 }, { width: 1280, height: 720 }])).toEqual({
            expected: { width: 992, height: 432 },
            actual: { width: 1280, height: 720 },
        });
        // 横竖混选同样拒绝。
        expect(isSameVideoAspect([{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }])).toBe(false);
    });

    test("容差内的轻微差异仍可合并", () => {
        // 1280×716 相对 16:9 偏差约 0.55%，落在 1% 容差内。
        expect(videoAspectConflict([{ width: 1280, height: 720 }, { width: 1280, height: 716 }])).toBeNull();
        // 1280×700 偏差约 2.8%，超过容差。
        expect(videoAspectConflict([{ width: 1280, height: 720 }, { width: 1280, height: 700 }])).not.toBeNull();
        expect(VIDEO_MERGE_RATIO_TOLERANCE).toBe(0.01);
    });

    test("尺寸未知的视频跳过比较而不阻塞合并", () => {
        expect(videoAspectConflict([])).toBeNull();
        expect(videoAspectConflict([{}, { width: 0, height: 0 }, { width: -1, height: 100 }])).toBeNull();
        expect(videoAspectConflict([undefined, null])).toBeNull();
        // 未知项不参与比较：跳过它之后仍以第一个可核实尺寸为基准。
        expect(videoAspectConflict([{}, { width: 992, height: 432 }, {}, { width: 992, height: 434 }])).toBeNull();
        expect(videoAspectConflict([{}, { width: 992, height: 432 }, {}, { width: 1280, height: 720 }])).not.toBeNull();
        // NaN 视为未知。
        expect(videoAspectConflict([{ width: Number.NaN, height: 720 }, { width: 1280, height: 720 }])).toBeNull();
    });

    test("节点尺寸优先取媒体原生尺寸，缺失时回退首帧尺寸", () => {
        expect(videoFrameSizeFromMetadata({ naturalWidth: 992, naturalHeight: 432, videoPreview: { width: 400, height: 174 } })).toEqual({ width: 992, height: 432 });
        expect(videoFrameSizeFromMetadata({ videoPreview: { width: 400, height: 174 } })).toEqual({ width: 400, height: 174 });
        expect(videoFrameSizeFromMetadata(undefined)).toEqual({ width: undefined, height: undefined });
    });
});
