import { describe, expect, test } from "bun:test";

import { defaultImageCapabilityConfig, type ImageCapabilityConfig } from "../src/lib/model-capabilities";
import { imageParameterRequest } from "../src/lib/image-parameters";
import { preserveImageSettings } from "../src/lib/media-settings";

// 自定义像素必须穿过「选择器校验 → 上层归一 → 请求组装」三段都保持不变，
// 否则面板显示的尺寸和实际发出的尺寸会不一致（见 imageSizeForSelection）。
function declarativeProfile({ acceptCustomSize = true, allowCustom = true }: { acceptCustomSize?: boolean; allowCustom?: boolean } = {}): ImageCapabilityConfig {
    const base = defaultImageCapabilityConfig();
    return {
        ...base,
        parameters: [
            {
                name: "size",
                label: "画幅 / 尺寸",
                type: "string",
                binding: "aspectRatio",
                enabled: true,
                values: acceptCustomSize ? undefined : ["1024x1024", "1536x1024"],
            },
            { name: "imageResolution", label: "分辨率", type: "string", binding: "resolution", enabled: true, values: ["1K", "2K"], default: "1K" },
        ],
        size: {
            parameter: "size",
            values: ["1024x1024", "1536x1024"],
            default: "1024x1024",
            defaultTier: "1k",
            allowCustom,
            presets: [
                { ratio: "1:1", tier: "1k", width: 1024, height: 1024, size: "1024x1024" },
                { ratio: "3:2", tier: "1k", width: 1536, height: 1024, size: "1536x1024" },
            ],
        },
        resolution: { supported: true, values: ["1K", "2K"], default: "1K" },
        quality: { supported: false, values: [], default: "auto" },
    };
}

describe("自定义图片尺寸", () => {
    test("模型接受自定义像素时，同比例的自定义尺寸不会被预设像素覆盖", () => {
        const profile = declarativeProfile();
        const preserved = preserveImageSettings(profile, { size: "1152x1152", imageResolution: "1K" });
        expect(preserved.size).toBe("1152x1152");
        expect(preserved.imageResolution).toBe("1K");
        expect(imageParameterRequest(profile, { size: "1152x1152", imageResolution: "1K", count: "1" }, true)).toMatchObject({ size: "1152x1152", imageResolution: "1K" });
    });

    test("size 参数只声明固定取值时仍按同比例预设归一", () => {
        const profile = declarativeProfile({ acceptCustomSize: false });
        const preserved = preserveImageSettings(profile, { size: "1152x1152", imageResolution: "1K" });
        expect(preserved.size).toBe("1024x1024");
    });

    test("模型未开启自定义尺寸时仍按同比例预设归一", () => {
        const profile = declarativeProfile({ allowCustom: false });
        const preserved = preserveImageSettings(profile, { size: "1152x1152", imageResolution: "1K" });
        expect(preserved.size).toBe("1024x1024");
    });

    test("不符合步长或像素范围的尺寸仍按预设归一", () => {
        const profile = declarativeProfile();
        // 1153 不是 16 的倍数；800x800 低于最小总像素。
        expect(preserveImageSettings(profile, { size: "1153x1153", imageResolution: "1K" }).size).toBe("1024x1024");
        expect(preserveImageSettings(profile, { size: "800x800", imageResolution: "1K" }).size).toBe("1024x1024");
    });

    test("比例协议的模型仍把像素输入换算成比例", () => {
        const base = defaultImageCapabilityConfig();
        const profile: ImageCapabilityConfig = {
            ...base,
            parameters: undefined,
            size: { parameter: "aspect_ratio", values: ["1:1", "16:9"], default: "1:1", allowCustom: true },
        };
        expect(preserveImageSettings(profile, { size: "1152x1152" }).size).toBe("1:1");
    });
});
