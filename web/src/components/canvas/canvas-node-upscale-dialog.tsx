import { useState } from "react";
import { InputNumber, Radio, Select, Switch } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_UPSCALE_LONG_EDGE, resolveResizeTarget, type ImageUpscaleAlgorithm, type ImageUpscaleParams, type PixelSize } from "@/lib/canvas/image-operation-plan";
import { useImageToolSource } from "./use-image-tool-source";

export type CanvasImageUpscaleParams = ImageUpscaleParams;
type UpscaleDialogProps = { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void };
/** 常见交付尺寸：命中平台要求时不必手输，未列出的尺寸仍可直接键入。 */
const presetTargets: PixelSize[] = [
    { width: 800, height: 800 },
    { width: 1024, height: 1024 },
    { width: 1080, height: 1080 },
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 2048, height: 2048 },
    { width: 2560, height: 1440 },
    { width: 4096, height: 4096 },
];

export function CanvasNodeUpscaleDialog(props: UpscaleDialogProps) {
    return props.open && props.dataUrl ? <ResizeEditor key={props.dataUrl} {...props} /> : null;
}

function clampEdge(value: number | null | undefined): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.max(1, Math.min(MAX_UPSCALE_LONG_EDGE, Math.round(value)));
}

function ResizeEditor({ dataUrl, onClose, onConfirm }: UpscaleDialogProps) {
    const { size, error } = useImageToolSource(dataUrl);
    const [draft, setDraft] = useState<PixelSize | null>(null);
    const [locked, setLocked] = useState(true);
    const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const ratio = size ? size.width / size.height : 1;
    const target = draft ?? size;
    let output: PixelSize | null = null;
    let invalid: string | null = null;
    if (size && target) {
        try {
            output = resolveResizeTarget(size, target);
        } catch (reason) {
            invalid = reason instanceof Error ? reason.message : "目标尺寸无效";
        }
    }
    const changed = Boolean(size && output && (output.width !== size.width || output.height !== size.height));
    const ready = Boolean(size && output && changed);
    const shrinking = Boolean(size && output && output.width * output.height < size.width * size.height);
    const applyWidth = (value: number | null) => {
        if (!size) return;
        const width = clampEdge(value);
        if (width === null) return;
        setDraft({ width, height: locked ? Math.max(1, Math.round(width / ratio)) : (target?.height ?? size.height) });
    };
    const applyHeight = (value: number | null) => {
        if (!size) return;
        const height = clampEdge(value);
        if (height === null) return;
        setDraft({ width: locked ? Math.max(1, Math.round(height * ratio)) : (target?.width ?? size.width), height });
    };
    const applyPreset = (value: string | undefined) => {
        const preset = presetTargets.find((item) => `${item.width}x${item.height}` === value);
        if (preset) setDraft(preset);
    };
    return (
        <AppModal open centered title="调整图片尺寸" width={760} onCancel={onClose} okText="生成新图片" okButtonProps={{ disabled: !ready }} onOk={() => ready && output && onConfirm({ width: output.width, height: output.height, algorithm })}>
            <p className="mb-4 text-sm text-muted-foreground">按目标像素重新采样并另存为新图片，原图保留。缩小会丢弃像素细节，放大不会生成新的真实细节。</p>
            <div className="grid gap-5 md:grid-cols-2">
                <figure className="m-0 flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-active p-3">
                    <img alt="待调整尺寸的图片" src={dataUrl} draggable={false} className="max-h-[320px] max-w-full object-contain" />
                    <figcaption className="text-sm text-muted-foreground">{size ? `原图 ${size.width} × ${size.height} px` : error || "正在读取图片…"}</figcaption>
                </figure>
                <div className="flex flex-col gap-5">
                    <div className="flex items-end gap-3">
                        <label className="flex flex-1 flex-col gap-2 text-sm">
                            宽（px）
                            <InputNumber aria-label="目标宽度" value={target?.width ?? null} min={1} max={MAX_UPSCALE_LONG_EDGE} precision={0} disabled={!size} onChange={applyWidth} className="w-full" />
                        </label>
                        <label className="flex flex-1 flex-col gap-2 text-sm">
                            高（px）
                            <InputNumber aria-label="目标高度" value={target?.height ?? null} min={1} max={MAX_UPSCALE_LONG_EDGE} precision={0} disabled={!size} onChange={applyHeight} className="w-full" />
                        </label>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span>保持原图宽高比</span>
                        <Switch checked={locked} onChange={setLocked} aria-label="保持原图宽高比" />
                    </div>
                    <label className="flex flex-col gap-2 text-sm">
                        常用尺寸
                        <Select
                            aria-label="常用尺寸"
                            allowClear
                            placeholder="或从常用交付尺寸里选"
                            disabled={!size}
                            value={output && presetTargets.some((item) => item.width === output?.width && item.height === output?.height) ? `${output.width}x${output.height}` : undefined}
                            onChange={applyPreset}
                            options={presetTargets.map((item) => ({ value: `${item.width}x${item.height}`, label: `${item.width} × ${item.height}` }))}
                        />
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm">插值方式</legend>
                        <Radio.Group value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} className="flex flex-col gap-2">
                            <Radio value="high">高质量 · 照片与细节图</Radio>
                            <Radio value="bilinear">双线性 · 平滑快速</Radio>
                            <Radio value="nearest">最近邻 · 像素图</Radio>
                        </Radio.Group>
                    </fieldset>
                    <output className="text-sm">{output ? `输出 ${output.width} × ${output.height} px` : "等待读取尺寸"}</output>
                    {invalid || error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {invalid || error}
                        </p>
                    ) : null}
                    {!invalid && !error && size && !changed ? <p className="text-sm text-muted-foreground">目标尺寸与原图一致，请修改宽或高。</p> : null}
                    {!invalid && shrinking ? <p className="text-sm text-muted-foreground">这是缩小操作，不会增加画面细节。</p> : null}
                </div>
            </div>
        </AppModal>
    );
}
