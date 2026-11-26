import { ArrowDown, ArrowUp, Video } from "lucide-react";
import { Button } from "antd";

import { CanvasVideoPreviewImage } from "./canvas-video-preview-image";
import { AppModal } from "@/components/ui/product/app-modal";
import type { CanvasNodeData } from "@/types/canvas";

type MergeOrderDialogProps = {
    /** 打开时展示当前选择的视频，顺序即合并顺序（第一项在最前）。 */
    items: CanvasNodeData[];
    onMove: (id: string, delta: -1 | 1) => void;
    onCancel: () => void;
    onConfirm: () => void;
};

function clockLabel(durationMs?: number) {
    if (!durationMs || durationMs <= 0) return "";
    const total = Math.round(durationMs / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * 合并前确认顺序：列出选中的视频，允许逐项上移/下移。
 * 默认顺序沿用镜头号或画布位置，用户在这里改的就是最终拼接顺序。
 */
export function CanvasVideoMergeOrderDialog({ items, onMove, onCancel, onConfirm }: MergeOrderDialogProps) {
    return (
        <AppModal open centered title="确认合并顺序" width={560} onCancel={onCancel} okText={`按此顺序合并 ${items.length} 段`} okButtonProps={{ disabled: items.length < 2 }} onOk={onConfirm}>
            <p className="mb-3 text-sm text-muted-foreground">成片按下面从上到下的顺序拼接。默认顺序是镜头号，没有镜头号时按画布位置（从上到下、从左到右）。</p>
            <ol className="m-0 flex max-h-[420px] list-none flex-col gap-2 overflow-y-auto p-0">
                {items.map((node, index) => (
                    <li key={node.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-active p-2">
                        <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-black">
                            <CanvasVideoPreviewImage node={node} alt="" className="size-full object-contain" eager fallback={<Video className="size-5 text-white/40" />} />
                            {clockLabel(node.metadata?.durationMs) ? <span className="absolute bottom-0.5 right-1 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">{clockLabel(node.metadata?.durationMs)}</span> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{node.title || "视频"}</div>
                            <div className="text-xs text-muted-foreground">
                                {node.metadata?.naturalWidth && node.metadata?.naturalHeight ? `${node.metadata.naturalWidth}×${node.metadata.naturalHeight}` : "尺寸未知"}
                                {node.metadata?.workflowKind === "final" ? " · 已合并成片" : ""}
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                            <Button size="small" aria-label="上移" disabled={index === 0} onClick={() => onMove(node.id, -1)}>
                                <ArrowUp className="size-3.5" />
                            </Button>
                            <Button size="small" aria-label="下移" disabled={index === items.length - 1} onClick={() => onMove(node.id, 1)}>
                                <ArrowDown className="size-3.5" />
                            </Button>
                        </div>
                    </li>
                ))}
            </ol>
        </AppModal>
    );
}
