/** 视频合并的画幅判定：只允许同比例视频直拼，避免成片里出现黑边或拉伸。 */

/** 宽高比相对误差超过该阈值即视为不同画幅；1% 足以容纳不同像素档位的四舍五入。 */
export const VIDEO_MERGE_RATIO_TOLERANCE = 0.01;

export type VideoFrameSize = { width?: number; height?: number };

export type VideoAspectConflict = {
    /** 基准画幅：按选择顺序第一个能确认尺寸的视频。 */
    expected: { width: number; height: number };
    actual: { width: number; height: number };
};

function usableFrame(value: VideoFrameSize | undefined | null): { width: number; height: number } | null {
    const width = value?.width;
    const height = value?.height;
    if (typeof width !== "number" || typeof height !== "number") return null;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}

/**
 * 返回第一处画幅冲突，供调用方给出可读提示；没有冲突返回 null。
 * 尺寸未知的视频跳过比较——元信息缺失不该拦住合并本身。
 */
export function videoAspectConflict(videos: ReadonlyArray<VideoFrameSize | undefined | null>, tolerance = VIDEO_MERGE_RATIO_TOLERANCE): VideoAspectConflict | null {
    let baseline: { width: number; height: number } | null = null;
    let baselineRatio = 0;
    for (const video of videos) {
        const frame = usableFrame(video);
        if (!frame) continue;
        const ratio = frame.width / frame.height;
        if (!baseline) {
            baseline = frame;
            baselineRatio = ratio;
            continue;
        }
        if (Math.abs(ratio - baselineRatio) / Math.max(ratio, baselineRatio) > tolerance) {
            return { expected: baseline, actual: frame };
        }
    }
    return null;
}

/** 只需是/否时用这个；与 videoAspectConflict 判据完全一致。 */
export function isSameVideoAspect(videos: ReadonlyArray<VideoFrameSize | undefined | null>, tolerance = VIDEO_MERGE_RATIO_TOLERANCE): boolean {
    return videoAspectConflict(videos, tolerance) === null;
}

/** 画布节点的画幅来源：优先媒体原生尺寸，其次持久化首帧尺寸。 */
export function videoFrameSizeFromMetadata(metadata: { naturalWidth?: number; naturalHeight?: number; videoPreview?: { width?: number; height?: number } } | undefined): VideoFrameSize {
    return {
        width: metadata?.naturalWidth ?? metadata?.videoPreview?.width,
        height: metadata?.naturalHeight ?? metadata?.videoPreview?.height,
    };
}
