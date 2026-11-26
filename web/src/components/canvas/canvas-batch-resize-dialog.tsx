import { useState } from "react";
import { InputNumber, Radio, Select } from "antd";

import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_UPSCALE_LONG_EDGE, type ImageUpscaleAlgorithm, type PixelSize } from "@/lib/canvas/image-operation-plan";
import type { CanvasImageUpscaleParams } from "./canvas-node-upscale-dialog";

type BatchResizeDialogProps = {
    /** 本次会处理多少张图片（只统计真正带内容的图片节点）。 */
    count: number;
    onCancel: () => void;
    onConfirm: (params: CanvasImageUpscaleParams) => void;
};

const presetTargets: PixelSize[] = [
    { width: 512, height: 512 },
    { width: 800, height: 800 },
    { width: 1024, height: 1024 },
    { width: 1080, height: 1080 },
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 2048, height: 2048 },
    { width: 4096, height: 4096 },
];

function clamp(value: number | null | undefined, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(MAX_UPSCALE_LONG_EDGE, Math.round(value)));
}

/**
 * 批量改尺寸：两种口径。
 * 「统一宽高」把每张图精确拉到同一尺寸，比例不同的图会被拉伸；
 * 「统一长边」按各自比例缩放到同一条长边，不变形，但输出宽高因图而异。
 */
export function CanvasBatchResizeDialog({ count, onCancel, onConfirm }: BatchResizeDialogProps) {
    const [mode, setMode] = useState<"exact" | "longEdge">("exact");
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [longEdge, setLongEdge] = useState(1024);
    const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const presetValue = presetTargets.some((item) => item.width === width && item.height === height) ? `${width}x${height}` : undefined;
    const ready = mode === "exact" ? width > 0 && height > 0 : longEdge > 0;
    return (
        <AppModal
            open
            centered
            title={`批量改尺寸 · ${count} 张`}
            width={560}
            onCancel={onCancel}
            okText="开始处理"
            okButtonProps={{ disabled: !ready }}
            onOk={() => onConfirm(mode === "exact" ? { width, height, algorithm } : { targetLongEdge: longEdge, algorithm })}
        >
            <p className="mb-4 text-sm text-muted-foreground">每张图片都会生成一个新节点并连到原图，原图保留。缩小会丢弃像素细节，放大不会生成新的真实细节。</p>
            <div className="flex flex-col gap-4">
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm">尺寸口径</legend>
                    <Radio.Group value={mode} onChange={(event) => setMode(event.target.value)} className="flex flex-col gap-2">
                        <Radio value="exact">统一宽高 · 所有图输出同一尺寸（比例不同会被拉伸）</Radio>
                        <Radio value="longEdge">统一长边 · 按各自比例缩放，不变形</Radio>
                    </Radio.Group>
                </fieldset>
                {mode === "exact" ? (
                    <>
                        <div className="flex items-end gap-3">
                            <label className="flex flex-1 flex-col gap-2 text-sm">
                                宽（px）
                                <InputNumber aria-label="批量目标宽度" value={width} min={1} max={MAX_UPSCALE_LONG_EDGE} precision={0} onChange={(value) => setWidth(clamp(value, width))} className="w-full" />
                            </label>
                            <label className="flex flex-1 flex-col gap-2 text-sm">
                                高（px）
                                <InputNumber aria-label="批量目标高度" value={height} min={1} max={MAX_UPSCALE_LONG_EDGE} precision={0} onChange={(value) => setHeight(clamp(value, height))} className="w-full" />
                            </label>
                        </div>
                        <label className="flex flex-col gap-2 text-sm">
                            常用尺寸
                            <Select
                                aria-label="批量常用尺寸"
                                allowClear
                                placeholder="或从常用尺寸里选"
                                value={presetValue}
                                onChange={(value: string | undefined) => {
                                    const preset = presetTargets.find((item) => `${item.width}x${item.height}` === value);
                                    if (!preset) return;
                                    setWidth(preset.width);
                                    setHeight(preset.height);
                                }}
                                options={presetTargets.map((item) => ({ value: `${item.width}x${item.height}`, label: `${item.width} × ${item.height}` }))}
                            />
                        </label>
                    </>
                ) : (
                    <label className="flex flex-col gap-2 text-sm">
                        目标长边（px）
                        <InputNumber aria-label="批量目标长边" value={longEdge} min={1} max={MAX_UPSCALE_LONG_EDGE} precision={0} onChange={(value) => setLongEdge(clamp(value, longEdge))} className="w-full" />
                    </label>
                )}
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm">插值方式</legend>
                    <Radio.Group value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} className="flex flex-col gap-2">
                        <Radio value="high">高质量 · 照片与细节图</Radio>
                        <Radio value="bilinear">双线性 · 平滑快速</Radio>
                        <Radio value="nearest">最近邻 · 像素图</Radio>
                    </Radio.Group>
                </fieldset>
            </div>
        </AppModal>
    );
}
