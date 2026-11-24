import { InputNumber } from "antd";

import type { ImageCapabilityConfig } from "@/lib/model-capabilities";
import { DEFAULT_IMAGE_SIZE_LIMITS } from "@/services/api/image-validation";

type SizeConfig = ImageCapabilityConfig["size"];
type LimitKey = "step" | "minPixels" | "maxPixels" | "maxEdge" | "maxRatio";

type LimitField = {
    key: LimitKey;
    label: string;
    min: number;
    max: number;
    step?: number;
};

const LIMIT_FIELDS: LimitField[] = [
    { key: "step", label: "对齐步长", min: 1, max: 256 },
    { key: "minPixels", label: "最小像素", min: 4096, max: 33554432, step: 1024 },
    { key: "maxPixels", label: "最大像素", min: 4096, max: 33554432, step: 1024 },
    { key: "maxEdge", label: "最长边", min: 64, max: 16384, step: 64 },
    { key: "maxRatio", label: "最大宽高比", min: 1, max: 16, step: 0.5 },
];

/**
 * 像素约束：留空沿用宿主默认值（16 / 655360 / 8294400 / 3840 / 3）。
 * 把「16 的倍数、最小/最大像素」从全站硬编码改成模型或插件可声明，
 * 需要支持 1920×1080、800×800 这类真实尺寸时把步长或像素下限放宽即可。
 */
export function ImageSizeLimitsFields({ value, disabled, onChange }: { value: SizeConfig; disabled?: boolean; onChange: (patch: Partial<SizeConfig>) => void }) {
    return (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
                像素约束：留空沿用默认值 {DEFAULT_IMAGE_SIZE_LIMITS.step} / {DEFAULT_IMAGE_SIZE_LIMITS.minPixels} / {DEFAULT_IMAGE_SIZE_LIMITS.maxPixels} / {DEFAULT_IMAGE_SIZE_LIMITS.maxEdge} / {DEFAULT_IMAGE_SIZE_LIMITS.maxRatio}。放宽对齐步长即可支持
                1920×1080 这类非 16 倍数尺寸。
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {LIMIT_FIELDS.map((field) => {
                    const current = value[field.key];
                    return (
                        <label key={field.key} className="space-y-1 text-xs">
                            <span className="block text-muted-foreground">{field.label}</span>
                            <InputNumber
                                aria-label={field.label}
                                className="w-full"
                                disabled={disabled}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                placeholder={String(DEFAULT_IMAGE_SIZE_LIMITS[field.key])}
                                value={typeof current === "number" && current > 0 ? current : null}
                                onChange={(next) =>
                                    onChange({
                                        [field.key]: typeof next === "number" && next > 0 ? next : undefined,
                                    } as Partial<SizeConfig>)
                                }
                            />
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
