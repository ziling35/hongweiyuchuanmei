import { expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { resolveImageRequestSize } from "../src/services/api/image-validation";

// 1920x1080 是标准 16:9，但 1080 不是 16 的倍数：只有被声明或配置成预设时才豁免对齐校验。
function profileWithPreset(size?: { width: number; height: number }) {
    const profile = defaultModelCapabilityConfig("openai-image", "gpt-image-2");
    const image = profile.image!;
    image.size.parameter = "size";
    image.size.values = [];
    image.size.allowCustom = true;
    image.size.presets = size
        ? [
              {
                  tier: "2k",
                  ratio: "16:9",
                  width: size.width,
                  height: size.height,
                  size: `${size.width}x${size.height}`,
              },
          ]
        : [];
    return image;
}

test("配置成预设的 1920x1080 不再被 16 像素对齐拦住", () => {
    const resolved = resolveImageRequestSize(profileWithPreset({ width: 1920, height: 1080 }), "medium", "1920x1080");
    expect(resolved).toEqual({ parameter: "size", value: "1920x1080" });
});

test("未被声明也未被配置成预设的 1920x1080 仍然按 16 校验拒绝", () => {
    expect(() => resolveImageRequestSize(profileWithPreset(), "medium", "1920x1080")).toThrow("16 的倍数");
});

test("16 倍数尺寸（1920x1088）不需要任何预设即可通过", () => {
    expect(resolveImageRequestSize(profileWithPreset(), "medium", "1920x1088")).toEqual({
        parameter: "size",
        value: "1920x1088",
    });
});

test("预设只放行自己的像素，其它非 16 倍数尺寸照样拒绝", () => {
    const profile = profileWithPreset({ width: 1920, height: 1080 });
    expect(() => resolveImageRequestSize(profile, "medium", "2560x1440x")).toThrow();
    expect(() => resolveImageRequestSize(profile, "medium", "1280x720")).not.toThrow();
    expect(() => resolveImageRequestSize(profile, "medium", "1000x1000")).toThrow("16 的倍数");
});
