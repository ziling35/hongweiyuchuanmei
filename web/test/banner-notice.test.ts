import { describe, expect, test } from "bun:test";

import {
    BANNER_BACKGROUND_DEFAULT_MODE,
    BANNER_BACKGROUND_GRADIENT_VALUES,
    BANNER_BACKGROUND_GRADIENTS,
    BANNER_BACKGROUND_MODE_VALUES,
    BANNER_NOTICE_DEFAULT_TYPE,
    BANNER_NOTICE_EMOJI_GROUPS,
    BANNER_NOTICE_EMOJIS,
    BANNER_NOTICE_TYPE_VALUES,
    BANNER_NOTICE_TYPES,
    bannerBackgroundGradientCSS,
    bannerBackgroundGradientReferenceColor,
    bannerBackgroundLabel,
    bannerNoticeSurfaceCSS,
    bannerNoticeTypeLabel,
    normalizeBannerBackgroundGradient,
    normalizeBannerBackgroundMode,
    normalizeBannerNoticeType,
    searchBannerNoticeEmojis,
} from "@/lib/announcements/banner-notice";
import { bannerTitleContrastRatio } from "@/lib/announcements/banner-title";

async function readSource(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

/** 从 Go 的 `var X = map[string]struct{}{...}` 字面量里取出键集合。 */
function goMapKeys(source: string, variable: string) {
    const start = source.indexOf(`var ${variable} = map[string]struct{}{`);
    if (start < 0) throw new Error(`未找到 ${variable}`);
    const end = source.indexOf("\n}", start);
    if (end < 0) throw new Error(`${variable} 字面量未闭合`);
    const body = source.slice(start, end);
    return Array.from(body.matchAll(/"([a-z0-9-]+)"/g)).map((match) => match[1]);
}

describe("通知类型", () => {
    test("未知或空值回落到默认类型", () => {
        expect(normalizeBannerNoticeType(undefined)).toBe(BANNER_NOTICE_DEFAULT_TYPE);
        expect(normalizeBannerNoticeType("")).toBe(BANNER_NOTICE_DEFAULT_TYPE);
        expect(normalizeBannerNoticeType("rainbow")).toBe(BANNER_NOTICE_DEFAULT_TYPE);
        expect(normalizeBannerNoticeType(" ACTIVITY ")).toBe("activity");
    });

    test("每种类型都有中文名与独立的底色 token", () => {
        const vars = BANNER_NOTICE_TYPES.map((item) => item.surfaceVar);
        expect(new Set(vars).size).toBe(vars.length);
        for (const type of BANNER_NOTICE_TYPES) {
            expect(bannerNoticeTypeLabel(type.key)).toBe(type.label);
            expect(bannerNoticeSurfaceCSS(type.key)).toBe(`var(${type.surfaceVar})`);
        }
        // 未知类型也必须拿到可用底色，不能渲染成透明条。
        expect(bannerNoticeSurfaceCSS("rainbow")).toBe(bannerNoticeSurfaceCSS(BANNER_NOTICE_DEFAULT_TYPE));
    });
});

describe("emoji 图标素材库", () => {
    test("字符唯一、非空，每个素材都有中文名", () => {
        const chars = BANNER_NOTICE_EMOJIS.map((item) => item.char);
        expect(new Set(chars).size).toBe(chars.length);
        expect(chars.length).toBeGreaterThanOrEqual(50);
        for (const item of BANNER_NOTICE_EMOJIS) {
            expect(item.char.trim().length).toBeGreaterThan(0);
            expect(item.label.trim().length).toBeGreaterThan(0);
            expect(item.groupLabel.trim().length).toBeGreaterThan(0);
        }
    });

    test("用户点名的素材必须在库内", () => {
        for (const char of ["💰", "🚀", "🔥", "📢"]) {
            expect(BANNER_NOTICE_EMOJIS.some((item) => item.char === char)).toBe(true);
        }
    });

    test("搜索同时匹配中文名、分组名与字符本身", () => {
        expect(searchBannerNoticeEmojis("火箭").map((item) => item.char)).toContain("🚀");
        expect(searchBannerNoticeEmojis("钱袋").map((item) => item.char)).toContain("💰");
        // 分组名搜索命中整组。
        const statusHits = searchBannerNoticeEmojis("状态");
        expect(statusHits.length).toBeGreaterThanOrEqual(BANNER_NOTICE_EMOJI_GROUPS.find((g) => g.key === "status")!.emoji.length);
        // 字符本身也能搜到（支持从别处粘贴检索）。
        expect(searchBannerNoticeEmojis("🔥").map((item) => item.char)).toContain("🔥");
        expect(searchBannerNoticeEmojis("  ").length).toBe(BANNER_NOTICE_EMOJIS.length);
        expect(searchBannerNoticeEmojis("不存在的素材")).toEqual([]);
    });

    test("emoji 是普通文本：标题纯文本拼接函数必须原样保留它", async () => {
        // 防止未来有人给 run.text 做字符过滤，把 emoji 丢掉。
        const { bannerTitlePlainText } = await import("@/lib/announcements/banner-title");
        const runs = [{ text: "🔥", fontSize: 20 }, { text: "限时", color: "#FFE58F" }, { text: "大促" }];
        expect(bannerTitlePlainText(runs as never)).toBe("🔥限时大促");
    });
});

describe("与后端白名单保持一致", () => {
    test("通知类型的后端白名单逐项等于前端注册表", async () => {
        const goSource = await readSource("../../backend/internal/app/announcement.go");
        expect(new Set(goMapKeys(goSource, "bannerNoticeTypes"))).toEqual(new Set(BANNER_NOTICE_TYPE_VALUES));
    });

    test("后端默认值常量与前端一致", async () => {
        const goSource = await readSource("../../backend/internal/app/announcement.go");
        expect(goSource).toContain(`bannerNoticeDefaultType = "${BANNER_NOTICE_DEFAULT_TYPE}"`);
    });

    test("后端不保存独立图标字段：emoji 必须内嵌在标题分段里", async () => {
        const [goModel, goApp, goRepo] = await Promise.all([readSource("../../backend/internal/model/models_project.go"), readSource("../../backend/internal/app/announcement.go"), readSource("../../backend/internal/repository/announcement.go")]);
        // 防止 icon 字段被加回来却没人维护白名单：图标的存储形态就是 TitleRuns 的文本。
        expect(goModel).not.toMatch(/\bIcon\s+string/);
        expect(goApp).not.toContain("normalizeBannerIcon");
        expect(goRepo).not.toContain('"icon"');
    });
});

describe("通知条主题色", () => {
    test("四种类型在明暗两档都满足白字对比度要求", async () => {
        const css = await readSource("../src/styles/globals.css");
        const value = (token: string) => {
            const match = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
            if (!match) throw new Error(`globals.css 缺少 --${token}`);
            return match[1];
        };
        for (const type of BANNER_NOTICE_TYPES) {
            // 浅色档是正文级底色，必须达到 WCAG AA 的 4.5:1；
            // 深色档统一压到 7:1 以上，避免暗色主题里底色过亮。
            const light = value(`palette-banner-${type.key}-500`);
            const dark = value(`palette-banner-${type.key}-700`);
            expect(bannerTitleContrastRatio("#FFFFFF", light)).toBeGreaterThanOrEqual(4.5);
            expect(bannerTitleContrastRatio("#FFFFFF", dark)).toBeGreaterThanOrEqual(7);
        }
    });

    test("前台与预览都引用按类型取值的语义 token", async () => {
        const [globals, adminUi] = await Promise.all([readSource("../src/styles/globals.css"), readSource("../src/styles/admin-ui.css")]);
        for (const type of BANNER_NOTICE_TYPES) {
            // surfaceVar 自带 `--` 前缀，拼接时不要再加一次。
            const name = type.surfaceVar.replace(/^--/, "");
            // 语义层明暗各定义一次：:root 一次、.dark 一次。
            const semantic = new RegExp(`--${name}: var\\(--palette-banner-${type.key}-\\d00\\)`, "g");
            expect(globals.match(semantic)?.length).toBe(2);
            // 后台预览强制两套底色，不受页面当前主题影响。
            expect(adminUi).toContain(`--${name}: var(--palette-banner-${type.key}-500)`);
            expect(adminUi).toContain(`--${name}: var(--palette-banner-${type.key}-700)`);
        }
    });
});

describe("通知条底色", () => {
    test("未知或空模式回落到跟随类型", () => {
        expect(normalizeBannerBackgroundMode(undefined)).toBe(BANNER_BACKGROUND_DEFAULT_MODE);
        expect(normalizeBannerBackgroundMode("")).toBe(BANNER_BACKGROUND_DEFAULT_MODE);
        expect(normalizeBannerBackgroundMode("rainbow")).toBe(BANNER_BACKGROUND_DEFAULT_MODE);
        expect(normalizeBannerBackgroundMode(" GRADIENT ")).toBe("gradient");
    });

    test("渐变键清洗：大小写无关，未知键给空串", () => {
        expect(normalizeBannerBackgroundGradient(" Aurora ")).toBe("aurora");
        expect(normalizeBannerBackgroundGradient("rainbow")).toBe("");
        expect(normalizeBannerBackgroundGradient(undefined)).toBe("");
    });

    test("每个渐变都有中文名、可渲染的 CSS 与唯一键", () => {
        const keys = BANNER_BACKGROUND_GRADIENT_VALUES;
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.length).toBeGreaterThanOrEqual(6);
        for (const preset of BANNER_BACKGROUND_GRADIENTS) {
            expect(preset.label.trim().length).toBeGreaterThan(0);
            expect(bannerBackgroundGradientCSS(preset.key)).toContain("linear-gradient(90deg");
            // 未知键不返回半截 CSS，调用方据此回落到类型底色。
            expect(bannerBackgroundGradientCSS("rainbow")).toBe("");
        }
    });

    test("渐变曲线：两端起笔快、中间留亮色平台", () => {
        const css = bannerBackgroundGradientCSS("crimson");
        // 深色起 → 26% 就到亮色 → 74% 前保持亮色 → 回落同一深色：整条每一段都在变色。
        expect(css.startsWith("linear-gradient(90deg, #991B1B 0%")).toBe(true);
        expect(css).toContain("#BE185D 26%");
        expect(css).toContain("#BE185D 74%");
        expect(css.endsWith("#991B1B 100%)")).toBe(true);
        // 停靠点必须单调递增，否则浏览器会把色标纠正成反向渐变。
        const positions = Array.from(css.matchAll(/(\d+)%/g)).map((match) => Number(match[1]));
        expect(positions[0]).toBe(0);
        expect(positions[positions.length - 1]).toBe(100);
        expect(positions).toEqual([...positions].sort((left, right) => left - right));
        // 中间平台就是对比度参考色，白字在这里最吃力。
        expect(bannerBackgroundGradientReferenceColor("crimson")).toBe("#BE185D");
    });

    test("浅色底会让白字不可读，所以预设色标必须撑住白字 4.5:1", () => {
        for (const preset of BANNER_BACKGROUND_GRADIENTS) {
            expect(bannerTitleContrastRatio("#FFFFFF", preset.from)).toBeGreaterThanOrEqual(4.5);
            expect(bannerTitleContrastRatio("#FFFFFF", preset.to)).toBeGreaterThanOrEqual(4.5);
            // 中点是后台对比度提示用的参考色，同样得站得住。
            expect(bannerBackgroundGradientReferenceColor(preset.key)).toMatch(/^#[0-9A-F]{6}$/);
        }
        expect(bannerBackgroundGradientReferenceColor("rainbow")).toBe("");
    });

    test("底色说明与后端白名单都跟着模式走", async () => {
        const goSource = await readSource("../../backend/internal/app/announcement.go");
        // 双向校验：后端多一项会让前端选中的值被拒，少一项会让后台选项存不进去。
        expect(new Set(goMapKeys(goSource, "bannerBackgroundModes"))).toEqual(new Set(BANNER_BACKGROUND_MODE_VALUES));
        expect(new Set(goMapKeys(goSource, "bannerBackgroundGradients"))).toEqual(new Set(BANNER_BACKGROUND_GRADIENT_VALUES));
        expect(goSource).toContain(`bannerBackgroundDefaultMode = "${BANNER_BACKGROUND_DEFAULT_MODE}"`);

        expect(bannerBackgroundLabel({ noticeType: "activity", backgroundMode: "type" })).toBe("活动 · 类型色");
        expect(bannerBackgroundLabel({ backgroundMode: "solid", backgroundColor: "#4338ca" })).toBe("自定义颜色 #4338CA");
        expect(bannerBackgroundLabel({ backgroundMode: "gradient", backgroundGradient: "aurora" })).toBe("渐变 · 极光");
        // 脏数据：模式是渐变但键不合法 → 明说未选择，不假装有底色。
        expect(bannerBackgroundLabel({ backgroundMode: "gradient", backgroundGradient: "rainbow" })).toBe("渐变 · 未选择");
    });
});
