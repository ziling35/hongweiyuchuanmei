import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

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

// 尺寸被归一掉时必须给用户反馈，否则点「应用」看起来像没生效。
// 这些全局只服务本文件的渲染用例，测试结束必须还原：否则同进程里后续测试文件会拿到
// happy-dom 的 Event/document，出现 "dispatchEvent must be an instance of Event" 之类的跨运行时错误。
const dom = new Window({ url: "http://localhost/" });
const restoreGlobals: Array<() => void> = [];
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    SVGElement: dom.SVGElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    MouseEvent: dom.MouseEvent,
    CustomEvent: dom.CustomEvent,
    ShadowRoot: dom.ShadowRoot,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => {
        if (previous) Object.defineProperty(globalThis, key, previous);
        else delete (globalThis as Record<string, unknown>)[key];
    });
}
afterAll(() => {
    for (const restore of restoreGlobals.reverse()) restore();
    restoreGlobals.length = 0;
});
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ImageSizePicker } = await import("../src/components/image-size-picker");

describe("自定义尺寸被归一后的提示", () => {
    test("模型拒绝自定义像素时提示实际采用的尺寸", async () => {
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container);
        const profile = declarativeProfile({ acceptCustomSize: false });
        await act(async () => {
            root.render(<ImageSizePicker profile={profile} size="1024x1024" imageResolution="1K" onChange={() => {}} />);
        });
        const input = container.querySelector('input[aria-label="自定义比例或尺寸"]') as InstanceType<typeof dom.HTMLInputElement>;
        expect(input).toBeTruthy();
        const setValue = Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")?.set;
        await act(async () => {
            setValue?.call(input, "1152x1152");
            input.dispatchEvent(new dom.Event("input", { bubbles: true }));
        });
        const apply = Array.from(container.querySelectorAll("button")).find((button) => (button.textContent || "").replace(/\s/g, "") === "应用");
        expect(apply).toBeTruthy();
        await act(async () => {
            apply?.dispatchEvent(new dom.MouseEvent("click", { bubbles: true }));
        });
        expect(container.textContent).toContain("当前模型不接受 1152x1152");
        expect(container.textContent).toContain("已按 1024 × 1024 应用");
        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
