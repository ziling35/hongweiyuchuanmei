import { ColorPicker } from "antd";
import { Check } from "lucide-react";

import { BANNER_BACKGROUND_GRADIENTS, BANNER_BACKGROUND_MODES, bannerBackgroundGradientCSS, normalizeBannerBackgroundMode, type BannerBackgroundMode } from "@/lib/announcements/banner-notice";
import { normalizeBannerTitleHex } from "@/lib/announcements/banner-title";

/** 自定义纯色的快捷色板：都在中深色区间，默认白字仍然可读。 */
const BANNER_SOLID_PRESETS = ["#4338CA", "#0F172A", "#B91C1C", "#B45309", "#047857", "#1D4ED8", "#7C3AED", "#DB2777"];

export type BannerBackgroundValue = { mode: string; color: string; gradient: string };

/**
 * 通知条底色编辑：跟随类型 / 自定义纯色 / 预设渐变三选一。
 *
 * 切模式时顺手补齐该模式的默认取值——后端只接受「模式 + 该模式的合法取值」，
 * 不能出现「选了渐变但没选方案」这种存不进去的半成品状态。
 */
export function BannerBackgroundEditor({ value, onChange }: { value: BannerBackgroundValue; onChange: (next: BannerBackgroundValue) => void }) {
    const mode = normalizeBannerBackgroundMode(value.mode);

    const selectMode = (next: BannerBackgroundMode) => {
        if (next === "solid") {
            onChange({ mode: next, color: normalizeBannerTitleHex(value.color) || BANNER_SOLID_PRESETS[0], gradient: "" });
            return;
        }
        if (next === "gradient") {
            onChange({ mode: next, color: "", gradient: value.gradient || BANNER_BACKGROUND_GRADIENTS[0].key });
            return;
        }
        onChange({ mode: next, color: "", gradient: "" });
    };

    return (
        <div className="space-y-3">
            <div className="admin-banner-bg-modes" role="radiogroup" aria-label="通知条底色来源">
                {BANNER_BACKGROUND_MODES.map((item) => {
                    const selected = mode === item.key;
                    return (
                        <button key={item.key} type="button" role="radio" aria-checked={selected} data-banner-bg-mode={item.key} title={item.hint} className={`admin-banner-bg-mode${selected ? " is-active" : ""}`} onClick={() => selectMode(item.key)}>
                            {item.label}
                            {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                        </button>
                    );
                })}
            </div>

            {mode === "solid" ? (
                <div className="flex flex-wrap items-center gap-2">
                    <ColorPicker
                        size="small"
                        aria-label="通知条底色"
                        value={normalizeBannerTitleHex(value.color) || BANNER_SOLID_PRESETS[0]}
                        disabledAlpha
                        showText
                        onChange={(color) => {
                            // 后端只存 #RRGGBB，这里统一去掉透明度并转大写。
                            const hex = color.toHexString().toUpperCase();
                            onChange({ mode: "solid", color: hex, gradient: "" });
                        }}
                        presets={[{ label: "常用底色", colors: BANNER_SOLID_PRESETS }]}
                    />
                    <span className="text-[var(--fs-label)] text-foreground/45">白字在中深色上更清晰；选浅色时建议把标题颜色调深。</span>
                </div>
            ) : null}

            {mode === "gradient" ? (
                <div className="admin-banner-gradient-grid" role="radiogroup" aria-label="渐变方案">
                    {BANNER_BACKGROUND_GRADIENTS.map((preset) => {
                        const selected = value.gradient === preset.key;
                        return (
                            <button
                                key={preset.key}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                data-banner-gradient={preset.key}
                                className={`admin-banner-gradient-swatch${selected ? " is-active" : ""}`}
                                style={{ backgroundImage: bannerBackgroundGradientCSS(preset.key) }}
                                onClick={() => onChange({ mode: "gradient", color: "", gradient: preset.key })}
                            >
                                <span className="truncate">{preset.label}</span>
                                {selected ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            {mode === "type" ? <p className="text-[var(--fs-label)] text-foreground/45">跟随通知类型：切换上方「通知类型」即可换色，浅色与深色主题各取一档。</p> : null}
        </div>
    );
}
