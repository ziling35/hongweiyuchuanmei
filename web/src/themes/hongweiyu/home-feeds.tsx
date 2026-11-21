import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { HongweiyuWorksShowcase } from "./works-showcase";
import "./home-feeds.css";

type Feed = "inspiration" | "works";

/**
 * 「灵感大厅 / 作品广场」切换。
 *
 * 两者是同一块内容区的两种内容，所以切换按钮长在灵感大厅自己的标题下面，而不是首页顶部——
 * 顶部「创作 / 画布」是页面级视图，这里是内容级视图，层级不同不能混在一起。
 *
 * 灵感大厅由上游渲染，主题包拿不到它的 JSX，因此：
 * 1. 用 portal 把切换按钮挂进 `.inspiration-hall-header` 的标题容器；
 * 2. 作品广场同样用 portal 挂进 `#creation-inspirations`，占据原来的结果区域；
 * 3. 在 html 上挂 `hwy-works-view`，由 theme.css 收起灵感大厅的筛选条与结果区。
 * 大厅是懒挂载（IntersectionObserver + lazy chunk），所以要等它出现后再挂 portal。
 */
function useInspirationHallHost() {
    const [host, setHost] = useState<{ title: HTMLElement; section: HTMLElement } | null>(null);

    useEffect(() => {
        let stopped = false;
        const resolve = () => {
            const section = document.querySelector<HTMLElement>("#creation-inspirations");
            const title = section?.querySelector<HTMLElement>(".inspiration-hall-header > div");
            if (!title || !section) return false;
            if (!stopped) setHost({ title, section });
            return true;
        };
        if (resolve()) return;
        const observer = new MutationObserver(() => {
            if (resolve()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            stopped = true;
            observer.disconnect();
        };
    }, []);

    return host;
}

export function HongweiyuHomeFeeds() {
    const [feed, setFeed] = useState<Feed>("inspiration");
    const host = useInspirationHallHost();

    // 作品广场视图下，灵感大厅只剩标题与切换按钮，其余部分由 theme.css 收起。
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle("hwy-works-view", feed === "works");
        return () => root.classList.remove("hwy-works-view");
    }, [feed]);

    if (!host) return null;

    return (
        <>
            {createPortal(
                <nav className="hwy-feed-titles" aria-label="内容切换">
                    <button type="button" className={feed === "inspiration" ? "hwy-feed-title is-active" : "hwy-feed-title"} aria-current={feed === "inspiration" ? "true" : undefined} onClick={() => setFeed("inspiration")}>
                        灵感大厅
                    </button>
                    <button type="button" className={feed === "works" ? "hwy-feed-title is-active" : "hwy-feed-title"} aria-current={feed === "works" ? "true" : undefined} onClick={() => setFeed("works")}>
                        作品广场
                    </button>
                </nav>,
                host.title,
            )}
            {feed === "works" ? createPortal(<HongweiyuWorksShowcase />, host.section) : null}
        </>
    );
}
