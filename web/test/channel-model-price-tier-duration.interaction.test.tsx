import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLAnchorElement: dom.HTMLAnchorElement,
    HTMLInputElement: dom.HTMLInputElement,
    HTMLTextAreaElement: dom.HTMLTextAreaElement,
    Document: dom.Document,
    DocumentFragment: dom.DocumentFragment,
    ShadowRoot: dom.ShadowRoot,
    SVGElement: dom.SVGElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    MouseEvent: dom.MouseEvent,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Form } = await import("antd");
const { PriceTierFields } = await import("../src/pages/admin/components/channel-model-price-tier-fields");
const { defaultPriceTier } = await import("../src/pages/admin/components/channel-model-price-tier-form");
const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

// 能力声明 5 / 8 / 10 秒，区间控件因此能取到 5–10 的默认边界。
const capabilityConfig = defaultModelCapabilityConfig("agnes-video", "agnes-video-2.5");
capabilityConfig.video!.duration = { selection: "enum", values: [5, 8, 10], default: 5 };

function segmentedItem(label: string) {
    const items = Array.from(document.querySelectorAll(".ant-segmented-item")) as HTMLElement[];
    const item = items.find((element) => element.textContent?.includes(label));
    expect(item).toBeDefined();
    return item!;
}

function renderedDurationInputs() {
    return document.querySelectorAll('[aria-label="最短生成秒数"]').length;
}

async function clickSegmented(label: string) {
    const item = segmentedItem(label);
    const input = item.querySelector("input") as HTMLInputElement | null;
    await act(async () => {
        (input || item).click();
    });
}

async function mountTier(tier: Record<string, unknown>) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let instance: ReturnType<typeof Form.useForm>[0] | null = null;
    const Harness = () => {
        const [form] = Form.useForm();
        instance = form;
        return (
            <Form form={form} initialValues={{ priceCurrency: "CNY", priceTiers: [{ ...defaultPriceTier("advanced"), ...tier }] }}>
                <Form.List name="priceTiers">{() => <PriceTierFields index={0} ordinal={1} form={form} capability="video" protocol="agnes-video" capabilityConfig={capabilityConfig} modelUpstream="" onDirty={() => {}} onRemove={() => {}} />}</Form.List>
            </Form>
        );
    };
    await act(async () => {
        root.render(<Harness />);
    });
    const getForm = () => {
        if (!instance) throw new Error("价格档表单未挂载");
        return instance;
    };
    return {
        getForm,
        unmount: async () => {
            await act(async () => {
                root.unmount();
            });
            host.remove();
        },
    };
}

test("已有时长区间的价格档打开时显示为指定范围", async () => {
    const tier = await mountTier({ videoSecondsMin: 8, videoSecondsMax: 10 });
    expect(renderedDurationInputs()).toBe(1);
    expect(segmentedItem("指定范围").className).toContain("ant-segmented-item-selected");
    await tier.unmount();
});

test("点击指定范围后写入最短最长秒数并显示输入框", async () => {
    const tier = await mountTier({});
    expect(renderedDurationInputs()).toBe(0);

    await clickSegmented("指定范围");

    expect(tier.getForm().getFieldValue(["priceTiers", 0, "videoSecondsMin"])).toBe(5);
    expect(tier.getForm().getFieldValue(["priceTiers", 0, "videoSecondsMax"])).toBe(10);
    expect(renderedDurationInputs()).toBe(1);
    expect(segmentedItem("指定范围").className).toContain("ant-segmented-item-selected");

    await clickSegmented("任意时长");

    expect(tier.getForm().getFieldValue(["priceTiers", 0, "videoSecondsMin"])).toBeNull();
    expect(tier.getForm().getFieldValue(["priceTiers", 0, "videoSecondsMax"])).toBeNull();
    expect(renderedDurationInputs()).toBe(0);
    await tier.unmount();
});
