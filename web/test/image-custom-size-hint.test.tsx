import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { defaultImageCapabilityConfig, type ImageCapabilityConfig } from "../src/lib/model-capabilities";

// 只有这条链路需要真的渲染组件，所以单独成文件：
// 尺寸归一的其余用例留在 image-custom-size.test.tsx，那边保持纯逻辑、不碰任何全局，
// 避免同一个测试进程里的其他文件被 happy-dom 的 Event/document 污染。
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

// 声明式模型只接受固定像素时，自定义输入必须被归一，并在面板上如实说明。
function declarativeProfile(): ImageCapabilityConfig {
    const base = defaultImageCapabilityConfig();
    return {
        ...base,
        parameters: [
            { name: "size", label: "画幅 / 尺寸", type: "string", binding: "aspectRatio", enabled: true, values: ["1024x1024", "1536x1024"] },
            { name: "imageResolution", label: "分辨率", type: "string", binding: "resolution", enabled: true, values: ["1K", "2K"], default: "1K" },
        ],
        size: {
            parameter: "size",
            values: ["1024x1024", "1536x1024"],
            default: "1024x1024",
            defaultTier: "1k",
            // 与原始用例一致：参数只声明固定像素（模拟模型不接受自定义），但面板仍允许输入，
            // 这样才能触发「输入被归一 + 提示实际采用的尺寸」这条路径。
            allowCustom: true,
            presets: [
                { ratio: "1:1", tier: "1k", width: 1024, height: 1024, size: "1024x1024" },
                { ratio: "3:2", tier: "1k", width: 1536, height: 1024, size: "1536x1024" },
            ],
        },
        resolution: { supported: true, values: ["1K", "2K"], default: "1K" },
        quality: { supported: false, values: [], default: "auto" },
    };
}

async function renderPicker() {
    const container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(<ImageSizePicker profile={declarativeProfile()} size="1024x1024" imageResolution="1K" onChange={() => {}} />);
    });
    return {
        container,
        async cleanup() {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

function findCustomSizeInput(container: HTMLElement) {
    return container.querySelector('input[aria-label="自定义比例或尺寸"]') as HTMLInputElement | null;
}

function findApplyButton(container: HTMLElement) {
    return (Array.from(container.querySelectorAll("button")).find((button) => (button.textContent || "").replace(/\s/g, "") === "应用") ?? null) as HTMLButtonElement | null;
}

// 事件必须来自元素自身的 window：模块缓存可能让全局 Event 属于另一个 DOM 运行时，
// 那样 dispatchEvent 会以 "must be an instance of Event" 失败。
async function typeCustomSize(target: HTMLInputElement, value: string) {
    const view = target.ownerDocument.defaultView ?? dom;
    const setValue = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
        setValue?.call(target, value);
        target.dispatchEvent(new view.Event("input", { bubbles: true }));
    });
}

async function clickApply(target: HTMLButtonElement) {
    const view = target.ownerDocument.defaultView ?? dom;
    await act(async () => {
        target.dispatchEvent(new view.MouseEvent("click", { bubbles: true }));
    });
}

// 用例名带序号：CI 汇总里只打印用例名，序号能直接指出卡在第几步，不必翻完整日志。
describe("自定义尺寸被归一后的提示", () => {
    test("① 面板渲染出自定义尺寸输入框", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            expect(input, "自定义尺寸输入框未渲染").toBeTruthy();
            if (!input) throw new Error("自定义尺寸输入框未渲染");
        } finally {
            await cleanup();
        }
    });

    test("② 输入自定义像素后出现应用按钮", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            if (!input) throw new Error("自定义尺寸输入框未渲染");
            await typeCustomSize(input, "1152x1152");
            const apply = findApplyButton(container);
            expect(apply, "应用按钮未渲染").toBeTruthy();
            if (!apply) throw new Error("应用按钮未渲染");
        } finally {
            await cleanup();
        }
    });

    test("③ 应用后提示当前模型不接受该尺寸", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            if (!input) throw new Error("自定义尺寸输入框未渲染");
            await typeCustomSize(input, "1152x1152");
            const apply = findApplyButton(container);
            if (!apply) throw new Error("应用按钮未渲染");
            await clickApply(apply);
            expect(container.textContent, `实际渲染文本：${container.textContent}`).toContain("当前模型不接受 1152x1152");
        } finally {
            await cleanup();
        }
    });

    test("④ 应用后提示已按预设尺寸应用", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            if (!input) throw new Error("自定义尺寸输入框未渲染");
            await typeCustomSize(input, "1152x1152");
            const apply = findApplyButton(container);
            if (!apply) throw new Error("应用按钮未渲染");
            await clickApply(apply);
            expect(container.textContent, `实际渲染文本：${container.textContent}`).toContain("已按 1024 × 1024 应用");
        } finally {
            await cleanup();
        }
    });
});
