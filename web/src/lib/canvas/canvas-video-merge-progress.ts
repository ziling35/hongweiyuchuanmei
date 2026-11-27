/**
 * 合并任务的进度换算：读取阶段占 0..45，编码阶段占 46..99。
 *
 * 读取阶段最容易长时间停在 0%——远程视频要先下载、再写进 wasm 虚拟文件系统。
 * 有 content-length 时按字节推进，没有时退回按文件数推进。
 */
export function mergeReadProgress(index: number, count: number, received = 0, total = 0) {
    const span = 45 / Math.max(1, count);
    const within = total > 0 ? Math.min(1, Math.max(0, received / total)) : 0;
    return Math.max(0, Math.min(45, Math.round(index * span + span * within)));
}
