import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { fetchFile } from "@ffmpeg/util";

import { getMediaBlob } from "@/services/file-storage";
import { buildMergeArgs, buildRecordingTranscodeArgs, resolveMergeTimeout, resolveRecordingTranscodeTimeout, type MergeVideoSource } from "./canvas-video-merge-args";

export type MergeVideoInput = { id: string; url?: string; storageKey?: string; width?: number; height?: number; durationMs?: number; hasAudio?: boolean };
export type MergeVideoProgress = { phase: "loading" | "reading" | "encoding"; progress: number };

const FFMPEG_IDLE_MS = 30_000;
const FFMPEG_LOAD_ERROR = "浏览器视频转码组件（FFmpeg.wasm）加载失败，请刷新页面后重试；自部署时确认前端 /assets 下的 ffmpeg-core 文件能访问（这一步在浏览器执行，与服务器是否安装 FFmpeg 无关）";

let ffmpegInstance: FFmpeg | null = null;
let queueTail: Promise<void> = Promise.resolve();
let pendingTasks = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let ffmpegJobSerial = 0;

// FFmpeg 只在用户明确开始媒体处理时加载，避免 wasm 和 worker 进入画布首屏路径。
export async function loadFFmpeg(onProgress?: (progress: MergeVideoProgress) => void) {
    if (ffmpegInstance) return ffmpegInstance;
    const ffmpeg = new FFmpeg();
    try {
        onProgress?.({ phase: "loading", progress: 0 });
        await ffmpeg.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
    } catch (cause) {
        ffmpeg.terminate();
        throw new Error(FFMPEG_LOAD_ERROR, { cause });
    }
}

function resetFFmpeg(ffmpeg: FFmpeg) {
    if (ffmpegInstance === ffmpeg) ffmpegInstance = null;
    ffmpeg.terminate();
}

/** 整个任务（包括输入读取和清理）独占虚拟文件系统，避免并发任务互相覆盖文件。 */
export function runFFmpegTask<T>(work: (ffmpeg: FFmpeg) => Promise<T>, onProgress?: (progress: MergeVideoProgress) => void, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("媒体处理已取消", "AbortError"));
    pendingTasks += 1;
    clearTimeout(idleTimer);
    idleTimer = undefined;
    const task = queueTail.then(async () => {
        try {
            signal?.throwIfAborted();
            const ffmpeg = await loadFFmpeg(onProgress);
            signal?.throwIfAborted();
            const result = await work(ffmpeg);
            signal?.throwIfAborted();
            return result;
        } finally {
            pendingTasks -= 1;
            if (!pendingTasks && ffmpegInstance) {
                idleTimer = setTimeout(() => {
                    idleTimer = undefined;
                    if (pendingTasks) return;
                    ffmpegInstance?.terminate();
                    ffmpegInstance = null;
                }, FFMPEG_IDLE_MS);
            }
        }
    });
    queueTail = task.then(
        () => undefined,
        () => undefined,
    );
    return task;
}

export type TranscodeVideoOptions = {
    /** 镜头帧率与时长，给出后按固定帧率输出并裁到镜头时长。 */
    fps?: number;
    duration?: number;
    onProgress?: (progress: MergeVideoProgress) => void;
    signal?: AbortSignal;
};

type TranscodeProgress = ((progress: MergeVideoProgress) => void) | undefined;

export function transcodeVideoToMp4(input: Blob, options?: TranscodeVideoOptions): Promise<Blob>;
export function transcodeVideoToMp4(input: Blob, onProgress?: TranscodeProgress, signal?: AbortSignal): Promise<Blob>;
export function transcodeVideoToMp4(input: Blob, optionsOrProgress: TranscodeVideoOptions | TranscodeProgress = {}, signal?: AbortSignal): Promise<Blob> {
    const options = typeof optionsOrProgress === "function" || optionsOrProgress === undefined ? { onProgress: optionsOrProgress, signal } : optionsOrProgress;
    const onProgress = options.onProgress;
    const taskSignal = options.signal;

    return runFFmpegTask(
        async (ffmpeg) => {
            const serial = (ffmpegJobSerial += 1);
            const inputName = `recording-${serial}.${input.type.includes("mp4") ? "mp4" : "webm"}`;
            const outputName = `recording-${serial}-transcoded.mp4`;
            const logs: string[] = [];
            let healthy = true;
            const onLog = ({ message }: { message: string }) => {
                if (message) logs.push(message);
                if (logs.length > 40) logs.shift();
            };
            const onEncodeProgress = ({ time }: { time: number }) => {
                if (options.duration && Number.isFinite(time) && time > 0) {
                    onProgress?.({ phase: "encoding", progress: Math.min(99, Math.round(55 + (time / 1e6 / options.duration) * 44)) });
                }
            };
            try {
                await ffmpeg.writeFile(inputName, await fetchFile(input));
                taskSignal?.throwIfAborted();
                onProgress?.({ phase: "encoding", progress: 55 });
                ffmpeg.on("log", onLog);
                ffmpeg.on("progress", onEncodeProgress);
                const timeout = resolveRecordingTranscodeTimeout(options.duration);
                let timer: ReturnType<typeof setTimeout> | undefined;
                let exitCode = 1;
                try {
                    exitCode = await Promise.race([
                        ffmpeg.exec(buildRecordingTranscodeArgs(inputName, outputName, { fps: options.fps, duration: options.duration }), timeout),
                        new Promise<number>((_, reject) => {
                            timer = setTimeout(() => reject(new Error("视频转码超时")), timeout + 15_000);
                        }),
                    ]);
                } catch (error) {
                    healthy = false;
                    throw new Error(error instanceof Error && error.message === "视频转码超时" ? "视频转码超时：镜头较长时请缩短镜头或降低帧率后重试" : "视频转码中断，请重试", { cause: error });
                } finally {
                    if (timer) clearTimeout(timer);
                    ffmpeg.off("log", onLog);
                    ffmpeg.off("progress", onEncodeProgress);
                }
                taskSignal?.throwIfAborted();
                if (exitCode !== 0) {
                    healthy = false;
                    console.error("录制视频转码失败", { exitCode, bytes: input.size, mimeType: input.type, logs: logs.slice(-12) });
                    throw new Error("视频转码失败，请重试");
                }
                const output = await ffmpeg.readFile(outputName);
                taskSignal?.throwIfAborted();
                onProgress?.({ phase: "encoding", progress: 100 });
                return new Blob([output as BlobPart], { type: "video/mp4" });
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") throw error;
                healthy = false;
                throw error;
            } finally {
                await Promise.all([inputName, outputName].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
                if (!healthy) resetFFmpeg(ffmpeg);
            }
        },
        onProgress,
        taskSignal,
    );
}

export async function mergeVideos(inputs: MergeVideoInput[], onProgress?: (progress: MergeVideoProgress) => void) {
    if (inputs.length < 2) throw new Error("至少选择 2 个视频才能合并");
    const totalMilliseconds = inputs.reduce((sum, input) => sum + (typeof input.durationMs === "number" && input.durationMs > 0 ? input.durationMs : 0), 0);
    const totalSeconds = totalMilliseconds > 0 ? totalMilliseconds / 1000 : undefined;
    return runFFmpegTask(async (ffmpeg) => {
        const serial = (ffmpegJobSerial += 1);
        const files: string[] = [];
        const outputName = `merge-${serial}.mp4`;
        let healthy = true;
        try {
            const sources: MergeVideoSource[] = [];
            for (let index = 0; index < inputs.length; index += 1) {
                const input = inputs[index];
                const storedBlob = input.storageKey ? await getMediaBlob(input.storageKey) : null;
                const remoteBlob =
                    !storedBlob && input.url
                        ? await fetch(input.url).then((response) => {
                              if (!response.ok) throw new Error(`视频资源请求失败（${response.status}）`);
                              return response.blob();
                          })
                        : null;
                const blob = storedBlob || remoteBlob;
                if (!blob) throw new Error(`无法读取第 ${index + 1} 个视频`);
                const name = `merge-${serial}-${index}.mp4`;
                await ffmpeg.writeFile(name, await fetchFile(blob));
                files.push(name);
                sources.push({ name, width: input.width, height: input.height, hasAudio: input.hasAudio });
                onProgress?.({ phase: "reading", progress: Math.round(((index + 1) / inputs.length) * 45) });
            }
            const plan = buildMergeArgs(sources, outputName);
            files.push(outputName);
            const timeout = resolveMergeTimeout(totalSeconds);
            const logs: string[] = [];
            let timer: ReturnType<typeof setTimeout> | undefined;
            const onLog = ({ message }: { message: string }) => {
                if (!message) return;
                logs.push(message);
                if (logs.length > 40) logs.shift();
            };
            const onEncodeProgress = ({ time }: { time: number }) => {
                if (!totalSeconds || !Number.isFinite(time) || time <= 0) return;
                onProgress?.({ phase: "encoding", progress: Math.min(99, Math.round(46 + (time / 1e6 / totalSeconds) * 53)) });
            };
            onProgress?.({ phase: "encoding", progress: 46 });
            const runPlan = async (args: string[]) => {
                let code = 1;
                try {
                    code = await Promise.race([
                        ffmpeg.exec(args, timeout),
                        new Promise<number>((_, reject) => {
                            timer = setTimeout(() => reject(new Error("视频合并超时：片段较长时请缩短后重试")), timeout + 15_000);
                        }),
                    ]);
                } finally {
                    if (timer) clearTimeout(timer);
                    timer = undefined;
                }
                return code;
            };
            ffmpeg.on("log", onLog);
            ffmpeg.on("progress", onEncodeProgress);
            let exitCode = 1;
            try {
                exitCode = await runPlan(plan.args);
                if (exitCode !== 0 && plan.withAudio) {
                    // 元数据缺失时无法预判哪一段真的没有音轨：去掉音轨重试一次，而不是让整次合并失败。
                    onProgress?.({ phase: "encoding", progress: 47 });
                    exitCode = await runPlan(buildMergeArgs(sources, outputName, { withAudio: false }).args);
                }
            } catch (error) {
                healthy = false;
                throw error instanceof Error && error.message.startsWith("视频合并超时") ? error : new Error("视频合并中断，请重试", { cause: error });
            } finally {
                ffmpeg.off("log", onLog);
                ffmpeg.off("progress", onEncodeProgress);
            }
            if (exitCode !== 0) {
                healthy = false;
                console.error("视频合并失败", { exitCode, segments: inputs.length, logs: logs.slice(-12) });
                throw new Error("视频编码失败，请确认视频编码格式兼容");
            }
            const output = await ffmpeg.readFile(outputName);
            onProgress?.({ phase: "encoding", progress: 100 });
            return new Blob([output as BlobPart], { type: "video/mp4" });
        } finally {
            await Promise.all(files.map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
            // concat 滤镜失败后 FFmpeg 实例可能停在异常状态，重置以免污染后续任务。
            if (!healthy) resetFFmpeg(ffmpeg);
        }
    }, onProgress);
}
