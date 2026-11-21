import { useEffect, useRef } from "react";

/**
 * 首页背景：40px 网格 + 指针所在单格高亮 + 向四周渐隐。
 *
 * 设计取舍：
 * 1. 网格靠一个持续递减的 offset 平移，所以「永远是流动的」；按 40px 取模铺线，不会出现接缝。
 * 2. 鼠标只点亮指针所在的那一格，不是一片光环——背景始终是背景，不抢内容。
 * 3. 径向渐晕让网格从中心向外融进底色，避免线条怼到屏幕边。
 *
 * 关键修复：绘制前把侧栏所占的横向区域裁掉。
 * 侧栏链路里有多层容器，只要有一层不留底色就会透出网格；与其逐个容器补背景，
 * 不如让网格根本不画到那片区域——侧栏底下永远是纯底色，不会有格子穿过去。
 *
 * 颜色从 CSS 变量读（--hwy-grid / --hwy-grid-hover / --hwy-grid-edge），
 * 只在挂载、resize 和主题 class 变化时读一次——每帧调 getComputedStyle 会强制样式重算。
 */
const CELL = 40;
const SPEED = 16;
const EASE = 10;

type Palette = { line: string; hover: string; edge: string };

const FALLBACK: Palette = {
    line: "rgba(15, 18, 20, 0.13)",
    hover: "rgba(37, 99, 235, 0.1)",
    edge: "rgba(244, 246, 247, 0.9)",
};

export function HongweiyuBackdrop() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let width = 0;
        let height = 0;
        let offset = 0;
        let clipLeft = 0;
        let frame = 0;
        let last = 0;
        let pointer: { x: number; y: number } | null = null;
        let hover: { col: number; row: number; alpha: number } | null = null;
        let palette: Palette = FALLBACK;
        let vignette: CanvasGradient | null = null;

        /** 侧栏右边界 = 网格的绘制起点；侧栏折叠时它会跟着变窄。 */
        const measure = () => {
            const sidebar = document.querySelector(".app-workspace-sidebar");
            const right = sidebar ? sidebar.getBoundingClientRect().right : 0;
            clipLeft = Math.max(0, Math.min(width, Math.round(right)));
        };

        const buildVignette = () => {
            const cx = clipLeft + (width - clipLeft) / 2;
            const cy = height / 2;
            vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width - clipLeft, height) / 2);
            // 中心 55% 完全不遮，只在最外圈渐隐——否则渐晕会把边缘的网格线整片擦掉。
            vignette.addColorStop(0, `rgb(from ${palette.edge} r g b / 0)`);
            vignette.addColorStop(0.55, `rgb(from ${palette.edge} r g b / 0)`);
            vignette.addColorStop(1, palette.edge);
        };

        const refreshPalette = () => {
            const style = getComputedStyle(canvas);
            palette = {
                line: style.getPropertyValue("--hwy-grid").trim() || FALLBACK.line,
                hover: style.getPropertyValue("--hwy-grid-hover").trim() || FALLBACK.hover,
                edge: style.getPropertyValue("--hwy-grid-edge").trim() || FALLBACK.edge,
            };
            if (width && height) buildVignette();
        };

        const draw = (dt: number) => {
            ctx.clearRect(0, 0, width, height);

            // 只画侧栏右侧的内容区。
            ctx.save();
            ctx.beginPath();
            ctx.rect(clipLeft, 0, Math.max(0, width - clipLeft), height);
            ctx.clip();

            // 网格相位：竖线、横线、高亮格必须共用同一个原点。竖线从侧栏右边界画起，
            // 所以原点要带上 clipLeft；否则侧栏宽度不是 40 的整数倍时，格子会和线条
            // 整体错开 clipLeft % CELL 像素，看起来就像"没落在完整方格上"。
            const phase = ((offset % CELL) + CELL) % CELL;
            const originX = clipLeft + phase;
            const originY = phase;

            if (pointer) {
                const col = Math.floor((pointer.x - originX) / CELL);
                const row = Math.floor((pointer.y - originY) / CELL);
                if (!hover || hover.col !== col || hover.row !== row) hover = { col, row, alpha: 0 };
            }
            if (hover) {
                const target = pointer ? 1 : 0;
                hover.alpha += (target - hover.alpha) * (reduced.matches ? 1 : 1 - Math.exp(-dt * EASE));
                if (hover.alpha > 0.01) {
                    ctx.globalAlpha = hover.alpha * 0.9;
                    ctx.fillStyle = palette.hover;
                    ctx.fillRect(originX + hover.col * CELL, originY + hover.row * CELL, CELL, CELL);
                    ctx.globalAlpha = 1;
                } else if (!pointer) {
                    hover = null;
                }
            }

            ctx.strokeStyle = palette.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = originX; x <= width; x += CELL) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (let y = originY; y <= height; y += CELL) {
                ctx.moveTo(clipLeft, y);
                ctx.lineTo(width, y);
            }
            ctx.stroke();

            if (vignette) {
                ctx.fillStyle = vignette;
                ctx.fillRect(clipLeft, 0, width - clipLeft, height);
            }

            ctx.restore();
        };

        const resize = () => {
            width = canvas.clientWidth || window.innerWidth;
            height = canvas.clientHeight || window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            measure();
            refreshPalette();
            draw(0);
        };

        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            offset -= dt * SPEED;
            draw(dt);
            frame = requestAnimationFrame(loop);
        };

        const start = () => {
            cancelAnimationFrame(frame);
            if (document.hidden) return;
            draw(0);
            if (reduced.matches) return;
            last = performance.now();
            frame = requestAnimationFrame(loop);
        };

        const onMove = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            const rect = canvas.getBoundingClientRect();
            pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            if (reduced.matches) draw(0);
        };

        const onLeave = () => {
            pointer = null;
            if (reduced.matches) draw(0);
        };

        const observer = new ResizeObserver(() => {
            resize();
        });
        const themeObserver = new MutationObserver(() => {
            refreshPalette();
            draw(0);
        });
        const sidebar = document.querySelector(".app-workspace-sidebar");
        observer.observe(canvas);
        if (sidebar) observer.observe(sidebar); // 侧栏折叠/展开时重新量裁剪边界
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerleave", onLeave, { passive: true });
        window.addEventListener("blur", onLeave);
        document.addEventListener("visibilitychange", start);
        reduced.addEventListener("change", start);

        resize();
        start();

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            themeObserver.disconnect();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
            window.removeEventListener("blur", onLeave);
            document.removeEventListener("visibilitychange", start);
            reduced.removeEventListener("change", start);
        };
    }, []);

    return <canvas ref={ref} className="hwy-backdrop" aria-hidden="true" />;
}
