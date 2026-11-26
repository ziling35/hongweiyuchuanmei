import { afterAll, beforeEach, describe, expect, test } from "bun:test";
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
// act() 是否真正 flush 取决于这个全局；其他测试文件可能改写或删除它。
// 每个用例前重新置位，否则状态更新不会在 act 内提交，点击时读到的是旧值。
beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
});

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
// 受控输入必须走元素自身原型上的 value setter，React 才会认为值变了并派发 onChange。
// 不同运行时里 defaultView 指向的构造函数可能不是元素真实原型，所以优先用元素自己的原型。
function nativeValueSetter(target: HTMLInputElement) {
    const candidates = [Object.getPrototypeOf(target) as object | null, target.ownerDocument.defaultView?.HTMLInputElement.prototype ?? null];
    for (const prototype of candidates) {
        const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, "value")?.set : undefined;
        if (setter) return setter;
    }
    return null;
}

// React 的变更监听挂在根容器上，而事件构造器可能来自不同 DOM 运行时。
// 逐个运行时各派发一次（同值 setState 幂等），避免某个构造器不被识别导致 onChange 根本没触发。
function eventConstructors(view: Window & typeof globalThis) {
    const list = [dom.Event, view.Event, dom.InputEvent, view.InputEvent].filter((value): value is typeof Event => typeof value === "function");
    const unique: Array<typeof Event> = [];
    for (const ctor of list) if (!unique.includes(ctor)) unique.push(ctor);
    return unique;
}

// act 在部分运行时会退化成 no-op；补一次宏任务，确保待提交的状态更新落地后再断言或点击。
async function flushReact() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function typeCustomSize(target: HTMLInputElement, value: string) {
    const view = target.ownerDocument.defaultView ?? dom;
    const setter = nativeValueSetter(target);
    await act(async () => {
        if (setter) setter.call(target, value);
        else target.value = value;
        for (const Ctor of eventConstructors(view)) target.dispatchEvent(new Ctor("input", { bubbles: true }));
    });
    await flushReact();
}

async function clickApply(target: HTMLButtonElement) {
    const view = target.ownerDocument.defaultView ?? dom;
    await act(async () => {
        // 原生 click() 不依赖任何 Event 构造器，先用它；再补一次显式事件派发。
        target.click();
        for (const Ctor of eventConstructors(view)) target.dispatchEvent(new Ctor("click", { bubbles: true }));
    });
    await flushReact();
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

    test("②b 输入框接受自定义像素文本", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            if (!input) throw new Error("自定义尺寸输入框未渲染");
            await typeCustomSize(input, "1152x1152");
            expect(input.value, "受控输入没有接受键入值").toBe("1152x1152");
        } finally {
            await cleanup();
        }
    });

    test("③a 点击应用后没有出现输入格式错误", async () => {
        const { container, cleanup } = await renderPicker();
        try {
            const input = findCustomSizeInput(container);
            if (!input) throw new Error("自定义尺寸输入框未渲染");
            await typeCustomSize(input, "1152x1152");
            const apply = findApplyButton(container);
            if (!apply) throw new Error("应用按钮未渲染");
            await clickApply(apply);
            // 格式错误说明点击时组件读到的自定义值仍是空的（事件没被 React 接收）。
            expect(container.textContent, `实际渲染文本：${container.textContent}`).not.toContain("像素 1824x1024");
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
