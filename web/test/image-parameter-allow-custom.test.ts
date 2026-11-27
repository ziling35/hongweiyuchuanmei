import { describe, expect, test } from "bun:test";
import { imageParameterAccepts, projectImageParameters, type ImageParameter } from "../src/lib/image-parameters";
import { defaultImageCapabilityConfig } from "../src/lib/model-capabilities";

// 插件声明的 size 清单只用于给出可选项；allowCustom 决定清单外像素能不能用。
const declared: ImageParameter = {
    name: "size",
    label: "尺寸",
    type: "string",
    encoding: "pixels",
    values: ["1024x1024", "1440x2560"],
    default: "1024x1024",
};

describe("插件声明 allowCustom", () => {
    test("未声明时按白名单处理，清单外像素被拒", () => {
        const profile = projectImageParameters(defaultImageCapabilityConfig(), [declared]);
        expect(profile.size.allowCustom).toBe(false);
        expect(profile.size.values).toEqual(["1024x1024", "1440x2560"]);
        expect(imageParameterAccepts(declared, "800x800")).toBe(false);
    });

    test("声明后保留清单同时开放自定义", () => {
        const withCustom = { ...declared, allowCustom: true };
        const profile = projectImageParameters(defaultImageCapabilityConfig(), [withCustom]);
        expect(profile.size.allowCustom).toBe(true);
        expect(profile.size.values).toEqual(["1024x1024", "1440x2560"]);
        expect(imageParameterAccepts(withCustom, "800x800")).toBe(true);
    });

    test("显式关闭时清单外像素仍被拒", () => {
        const closed = { ...declared, allowCustom: false };
        const profile = projectImageParameters(defaultImageCapabilityConfig(), [closed]);
        expect(profile.size.allowCustom).toBe(false);
        expect(imageParameterAccepts(closed, "800x800")).toBe(false);
    });
});
