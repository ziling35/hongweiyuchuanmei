// 画布录制转 MP4 的 ffmpeg 参数，纯函数便于单测。
// 世界引擎白膜用 WebGL canvas.captureStream 录制，没有音轨，画布在 dpr 1.5 下宽高经常是奇数。
// @ffmpeg/core 的 libx264 + yuv420p 要求宽高都能被 2 整除，奇数帧会直接失败：
// "width not divisible by 2" → exit 1，界面只看到「视频转码失败，请重试」。
// 该内核还关闭了 pthreads 和 asm，默认 medium preset 在视口分辨率下转不动，所以用 ultrafast 单线程。
//
// 实时录制按墙钟打时间戳：帧间隔不均匀，停止录制时还会多出零点几秒尾巴。给了镜头帧率与时长时，
// 输出按固定帧率重采样并裁到镜头时长，深度视频、白膜视频才能和生成视频逐帧对齐。

export type RecordingTranscodeTiming = { fps?: number; duration?: number };

export function buildRecordingTranscodeArgs(inputName: string, outputName: string, timing: RecordingTranscodeTiming = {}): string[] {
    const fps = timing.fps !== undefined && Number.isFinite(timing.fps) && timing.fps >= 1 && timing.fps <= 60 ? Math.round(timing.fps) : undefined;
    const duration = timing.duration !== undefined && Number.isFinite(timing.duration) && timing.duration > 0 && timing.duration <= 600 ? timing.duration : undefined;
    const filter = fps ? `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2` : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
    return ["-i", inputName, "-an", "-vf", filter, ...(duration ? ["-t", String(Number(duration.toFixed(3)))] : []), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "1", outputName];
}

/** 转码超时（毫秒）：单线程 wasm 大约每秒处理十几到几十帧，按镜头时长留足余量；未知时长给 5 分钟。 */
export function resolveRecordingTranscodeTimeout(duration?: number) {
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return 5 * 60_000;
    return Math.round(Math.min(15 * 60_000, 60_000 + duration * 20_000));
}

// ---------------------------------------------------------------------------
// 视频合并参数
//
// 合并曾经用 `-f concat -c copy` 直拼：速度快，但要求各段的分辨率、SAR、时基完全一致。
// 同比例不同来源的片段（例如 992x432 与 1984x864，或同一分辨率但 SAR 不同）拼接后，
// 播放器会按第一段的参数解释后续帧，表现为成片里出现黑边或轻微变形。
// 现在统一走 concat 滤镜：每段先 scale+pad 到同一画幅、setsar=1 统一采样宽高比，
// 再由 concat 滤镜按时间戳重新对齐后编码。代价是要重编码，收益是成片一定正确。
// ---------------------------------------------------------------------------

export type MergeVideoSource = {
    name: string;
    width?: number;
    height?: number;
    hasAudio?: boolean;
};

export type MergeArgsPlan = {
    args: string[];
    /** 归一化后的目标画幅（已保证偶数边长）。 */
    target: { width: number; height: number };
    /** 是否保留音轨：只有所有片段都确认有音轨时才保留。 */
    withAudio: boolean;
};

const MERGE_FALLBACK_WIDTH = 1280;
const MERGE_FALLBACK_HEIGHT = 720;

/** libx264 + yuv420p 要求边长能被 2 整除；未知或非法尺寸回落到兜底值。 */
export function evenDimension(value: number | undefined, fallback: number): number {
    const base = typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
    return Math.max(2, base - (base % 2));
}

/**
 * 构造合并参数。首个能确认尺寸的片段决定目标画幅，其余片段等比缩放后居中补边。
 * 默认保留音轨；只有明确知道某段没有音轨（hasAudio === false）时才整体输出无音轨，
 * 因为 concat 滤镜无法对齐缺失的音轨。调用方可用 options.withAudio 覆盖。
 */
export function buildMergeArgs(sources: readonly MergeVideoSource[], outputName: string, options: { withAudio?: boolean } = {}): MergeArgsPlan {
    if (sources.length < 2) throw new Error("至少需要 2 个视频才能合并");
    const first = sources.find((source) => typeof source.width === "number" && typeof source.height === "number" && source.width > 0 && source.height > 0);
    const target = {
        width: evenDimension(first?.width, MERGE_FALLBACK_WIDTH),
        height: evenDimension(first?.height, MERGE_FALLBACK_HEIGHT),
    };
    // 只有"明确没有音轨"才放弃音轨；unknown 交给上层按失败重试兜底，避免误删用户音轨。
    const withAudio = options.withAudio ?? sources.every((source) => source.hasAudio !== false);
    const fit = `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
    const filters = sources.map((_source, index) => `[${index}:v]${fit}[v${index}]`);
    const labels: string[] = [];
    for (let index = 0; index < sources.length; index += 1) {
        labels.push(`[v${index}]`);
        if (!withAudio) continue;
        filters.push(`[${index}:a]aresample=async=1:first_pts=0[a${index}]`);
        labels.push(`[a${index}]`);
    }
    filters.push(`${labels.join("")}concat=n=${sources.length}:v=1:a=${withAudio ? 1 : 0}[v]${withAudio ? "[a]" : ""}`);
    const args = ["-i", sources[0].name];
    for (const source of sources.slice(1)) args.push("-i", source.name);
    args.push("-filter_complex", filters.join(";"), "-map", "[v]");
    if (withAudio) args.push("-map", "[a]");
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-threads", "1");
    if (withAudio) args.push("-c:a", "aac", "-b:a", "128k");
    else args.push("-an");
    args.push("-movflags", "+faststart", outputName);
    return { args, target, withAudio };
}

/** 合并要重编码，比直拼慢得多；按总时长放宽超时，未知时长给 10 分钟。 */
export function resolveMergeTimeout(totalSeconds?: number) {
    if (totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return 10 * 60_000;
    return Math.round(Math.min(30 * 60_000, 90_000 + totalSeconds * 25_000));
}
