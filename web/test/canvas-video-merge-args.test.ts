import { describe, expect, test } from "bun:test";

import { buildMergeArgs, buildRecordingTranscodeArgs, evenDimension, resolveMergeTimeout, resolveRecordingTranscodeTimeout } from "../src/lib/canvas/canvas-video-merge-args";

describe("buildRecordingTranscodeArgs", () => {
    test("奇数画布先裁成偶数，并且不要求音轨", () => {
        const args = buildRecordingTranscodeArgs("recording.webm", "recording-transcoded.mp4");
        expect(args).toContain("-an");
        expect(args).toContain("scale=trunc(iw/2)*2:trunc(ih/2)*2");
        expect(args).not.toContain("-c:a");
        expect(args.indexOf("-vf")).toBeGreaterThan(args.indexOf("-i"));
        expect(args.indexOf("-vf")).toBeLessThan(args.indexOf("recording-transcoded.mp4"));
        expect(args).toEqual(["-i", "recording.webm", "-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "1", "recording-transcoded.mp4"]);
    });

    test("给了镜头帧率与时长时按固定帧率重采样并裁到镜头时长", () => {
        const args = buildRecordingTranscodeArgs("in.webm", "out.mp4", { fps: 24, duration: 6 });
        expect(args[args.indexOf("-vf") + 1]).toBe("fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2");
        expect(args[args.indexOf("-t") + 1]).toBe("6");
        expect(args.indexOf("-t")).toBeLessThan(args.indexOf("-c:v"));
        expect(args.at(-1)).toBe("out.mp4");
        const invalid = buildRecordingTranscodeArgs("in.webm", "out.mp4", { fps: Number.NaN, duration: -1 });
        expect(invalid).not.toContain("-t");
        expect(invalid[invalid.indexOf("-vf") + 1]).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    });

    test("转码超时按镜头时长放宽，未知时长给 5 分钟", () => {
        expect(resolveRecordingTranscodeTimeout()).toBe(300_000);
        expect(resolveRecordingTranscodeTimeout(6)).toBe(180_000);
        expect(resolveRecordingTranscodeTimeout(600)).toBe(900_000);
    });
});

describe("buildMergeArgs", () => {
    test("同画幅多段走 concat 滤镜统一 scale/pad/setsar，不再直拼", () => {
        const plan = buildMergeArgs(
            [
                { name: "a.mp4", width: 992, height: 432, hasAudio: true },
                { name: "b.mp4", width: 992, height: 432, hasAudio: true },
            ],
            "out.mp4",
        );
        expect(plan.target).toEqual({ width: 992, height: 432 });
        expect(plan.withAudio).toBe(true);
        const filter = plan.args[plan.args.indexOf("-filter_complex") + 1];
        expect(filter).toContain("[0:v]scale=992:432:force_original_aspect_ratio=decrease,pad=992:432:(ow-iw)/2:(oh-ih)/2,setsar=1[v0]");
        expect(filter).toContain("[1:v]scale=992:432:force_original_aspect_ratio=decrease,pad=992:432:(ow-iw)/2:(oh-ih)/2,setsar=1[v1]");
        expect(filter).toContain("[0:a]aresample=async=1:first_pts=0[a0]");
        expect(filter).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]");
        expect(plan.args.join(" ")).toContain("-map [v] -map [a]");
        expect(plan.args).toContain("-c:a");
        expect(plan.args).not.toContain("-an");
        expect(plan.args).not.toContain("-c");
        expect(plan.args).not.toContain("copy");
        expect(plan.args.at(-1)).toBe("out.mp4");
    });

    test("奇数边长裁成偶数，未知尺寸回落到 1280x720", () => {
        expect(evenDimension(993, 1280)).toBe(992);
        expect(evenDimension(431, 720)).toBe(430);
        expect(evenDimension(undefined, 1280)).toBe(1280);
        expect(evenDimension(Number.NaN, 720)).toBe(720);
        const plan = buildMergeArgs([{ name: "a.mp4" }, { name: "b.mp4", width: 1921, height: 1081 }], "out.mp4");
        expect(plan.target).toEqual({ width: 1920, height: 1080 });
        const empty = buildMergeArgs([{ name: "a.mp4" }, { name: "b.mp4" }], "out.mp4");
        expect(empty.target).toEqual({ width: 1280, height: 720 });
    });

    test("任一段缺音轨就整体输出无音轨，且不引入音频滤镜", () => {
        const plan = buildMergeArgs(
            [
                { name: "a.mp4", width: 720, height: 1280, hasAudio: true },
                { name: "b.mp4", width: 720, height: 1280, hasAudio: false },
            ],
            "out.mp4",
        );
        expect(plan.withAudio).toBe(false);
        const filter = plan.args[plan.args.indexOf("-filter_complex") + 1];
        expect(filter).not.toContain("aresample");
        expect(filter).toContain("concat=n=2:v=1:a=0[v]");
        expect(plan.args).toContain("-an");
        expect(plan.args.join(" ")).not.toContain("-map [a]");
    });

    test("少于两段直接拒绝", () => {
        expect(() => buildMergeArgs([{ name: "a.mp4" }], "out.mp4")).toThrow();
    });

    test("音轨状态未知时保守保留音轨，只有明确无音轨才丢弃", () => {
        // 老节点的 hasAudio 可能是 undefined（探测失败），不能因此丢掉整条音轨。
        const unknown = buildMergeArgs(
            [
                { name: "a.mp4", width: 992, height: 432 },
                { name: "b.mp4", width: 992, height: 432, hasAudio: undefined },
            ],
            "out.mp4",
        );
        expect(unknown.withAudio).toBe(true);
        expect(unknown.args).toContain("-c:a");
        // 上层在 ffmpeg 报错后可强制去掉音轨重试。
        const forced = buildMergeArgs(
            [
                { name: "a.mp4", width: 992, height: 432, hasAudio: true },
                { name: "b.mp4", width: 992, height: 432, hasAudio: true },
            ],
            "out.mp4",
            { withAudio: false },
        );
        expect(forced.withAudio).toBe(false);
        expect(forced.args).toContain("-an");
    });

    test("合并超时按总时长放宽，未知时长给 10 分钟", () => {
        expect(resolveMergeTimeout()).toBe(600_000);
        expect(resolveMergeTimeout(4)).toBe(190_000);
        expect(resolveMergeTimeout(600)).toBe(1_800_000);
    });
});
