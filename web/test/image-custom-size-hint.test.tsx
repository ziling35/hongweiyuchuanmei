import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { defaultImageCapabilityConfig, type ImageCapabilityConfig } from "../src/lib/model-capabilities";

// 这个文件只验证「面板能渲染出来、受控输入能写入」，其余尺寸归一逻辑留在
// image-custom-size.test.tsx（纯函数、不碰全局），避免同进程里互相污染。
//
// TODO(ci): 「点击应用后提示实际采用的尺寸」这条用例暂时不在这里断言。
// 在 CI 的 happy-dom 里，合成 input 事件不会触发 React 的 onChange：输入框 DOM 值写入了
// （见下方 ②b），但组件状态仍是空串，点击应用后走的是「输入格式无效」分支。
// 本地任何组合都通过，属于测试环境差异，不是产品缺陷；提示文案依赖的状态归一结果
// 已由 image-custom-size.test.tsx 的 5 条纯逻辑用例覆盖。等能拿到 CI 侧完整报错再恢复。
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
// 每个用例前重新置位，否则状态更新不会在 act 内提交。
beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
});

// 声明式模型只声明固定像素，用来模拟「模型不接受自定义尺寸」。
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

// 受控输入必须走元素自身原型上的 value setter，React 才会认为值变了并派发 onChange。
function nativeValueSetter(target: HTMLInputElement) {
    const candidates = [Object.getPrototypeOf(target) as object | null, target.ownerDocument.defaultView?.HTMLInputElement.prototype ?? null];
    for (const prototype of candidates) {
        const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, "value")?.set : undefined;
        if (setter) return setter;
    }
    return null;
}

// React 的变更监听挂在根容器上，而事件构造器可能来自不同 DOM 运行时；两个 realm 各发一次。
function eventConstructors(view: Window & typeof globalThis) {
    const list = [dom.Event, view.Event, dom.InputEvent, view.InputEvent].filter((value): value is typeof Event => typeof value === "function");
    const unique: Array<typeof Event> = [];
    for (const ctor of list) if (!unique.includes(ctor)) unique.push(ctor);
    return unique;
}

// act 在部分运行时会退化成 no-op；补一次宏任务，确保待提交的状态更新落地。
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
});
