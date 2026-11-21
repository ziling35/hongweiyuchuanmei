import { useEffect, useState, type CSSProperties } from "react";

import type { ThemeHomeHeroProps } from "../types";

import { HongweiyuBackdrop } from "./background";
import { HongweiyuCanvasHub } from "./canvas-hub";
import { HongweiyuHomeFeeds } from "./home-feeds";
import "./hero.css";

const TITLE = "今天，想把什么灵感变成作品？";
const SUBTITLE = "AI 生图、视频与音频生成，团队共创，从这里开始。";

const ACCENT_CHARS = new Set(["灵", "感"]);

type CharGroup = { key: string; text: string; start: number; accent: boolean };

type HomeView = "create" | "canvas";

/**
 * 把标题切成若干段：连续的强调字（「灵感」）合成一段，其余逐字一段。
 *
 * 强调字必须是单个元素：圆锥扫光的圆心落在整段文字上，拆成两段的话每个字会各自
 * 被扫一次，看起来是两团光而不是一道光从两个字上连续扫过去。
 */
function groupChars(title: string): CharGroup[] {
    const chars = Array.from(title);
    const groups: CharGroup[] = [];
    let index = 0;
    while (index < chars.length) {
        const accent = ACCENT_CHARS.has(chars[index]);
        const start = index;
        let text = "";
        if (accent) {
            while (index < chars.length && ACCENT_CHARS.has(chars[index])) {
                text += chars[index];
                index += 1;
            }
        } else {
            text = chars[index] === " " ? "\u00a0" : chars[index];
            index += 1;
        }
        groups.push({ accent, key: `${start}-${text}`, start, text });
    }
    return groups;
}

/**
 * 首页 hero：大标题 + 副标题 + 「创作 / 画布」入口分段。
 *
 * 文案写在这里而不是 i18n：它是这套首页皮肤自己的说法，改文案不需要动上游的
 * 语言包。历史入口由上游以 historySlot 注入，位置由本文件决定。
 *
 * 动效只做两件轻量的事：标题逐字浮现（纯 CSS animation），以及「灵感」两个字上
 * 周期扫过的彩色光带（样式见 hero.css）；另外把指针坐标写成 CSS 变量给背景网格用。
 */
export function HongweiyuHero({ historySlot, canvasTo = "/canvas" }: ThemeHomeHeroProps) {
    const [view, setView] = useState<HomeView>("create");

    useEffect(() => {
        const root = document.documentElement;
        // 直接写 CSS 变量：只影响背景那一层伪元素的重绘，不触发重排；
        // 不用 rAF 是因为页面在后台/隐藏时 rAF 会被暂停，指针光就永远停在默认位置。
        const onMove = (event: PointerEvent) => {
            root.style.setProperty("--hwy-pointer-x", `${event.clientX}px`);
            root.style.setProperty("--hwy-pointer-y", `${event.clientY}px`);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
    }, []);

    // 创作区（输入框、灵感大厅、最近画布）是上游渲染在 hero 之后的，主题包改不到它们的
    // 位置和条件；这里只在根元素上挂一个 class，由 theme.css 在画布视图下把那一层收起来。
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle("hwy-canvas-view", view === "canvas");
        return () => root.classList.remove("hwy-canvas-view");
    }, [view]);

    return (
        <header className="hwy-hero">
            <HongweiyuBackdrop />
            {historySlot ? <div className="hwy-hero-history">{historySlot}</div> : null}
            {/* key 绑当前视图：切换创作/画布时整行重建，逐字浮现与「灵感」的扫光都会重播一次。 */}
            <h1 key={view} className="hwy-hero-title" aria-label={TITLE}>
                {groupChars(TITLE).map((group) => (
                    <span key={group.key} aria-hidden className={group.accent ? "hwy-hero-char is-accent" : "hwy-hero-char"} style={{ "--hwy-char-delay": `${group.start * 32}ms` } as CSSProperties}>
                        {group.text}
                    </span>
                ))}
            </h1>
            <p className="hwy-hero-subtitle">{SUBTITLE}</p>
            <nav className="hwy-hero-tabs" aria-label="首页视图">
                <button type="button" className={view === "create" ? "hwy-hero-tab is-active" : "hwy-hero-tab"} aria-pressed={view === "create"} onClick={() => setView("create")}>
                    创作
                </button>
                <button type="button" className={view === "canvas" ? "hwy-hero-tab is-active" : "hwy-hero-tab"} aria-pressed={view === "canvas"} onClick={() => setView("canvas")}>
                    画布
                </button>
            </nav>
            {/* 灵感大厅 / 作品广场的切换长在灵感大厅自己的标题下面，这里只负责把组件挂上去。 */}
            {view === "create" ? <HongweiyuHomeFeeds /> : null}
            {view === "canvas" ? <HongweiyuCanvasHub allHref={canvasTo} /> : null}
        </header>
    );
}
