import { registerThemePack } from "../registry";
import type { ThemePack } from "../types";

import { HongweiyuHero } from "./hero";
import { HONGWEIYU_SKIN, HONGWEIYU_SKIN_ID } from "./skin";

import "./theme.css";
import "./inspiration.css";

/**
 * 红尾鱼 · 首页：接管首页主题层（配色、卡片表面、antd 令牌）与 hero 排版。
 *
 * hero 是唯一的结构插槽（上游 pages/create/index.tsx 一处条件渲染），用来放
 * 「创作 / 画布」入口分段；其余首页结构仍由上游渲染，主题包缺失或出错时
 * 页面自动回到官方外观。
 */
export const hongweiyuTheme: ThemePack = {
    id: HONGWEIYU_SKIN_ID,
    name: "红尾鱼 · 首页",
    skin: HONGWEIYU_SKIN,
    homeHero: HongweiyuHero,
    copy: {
        homeHeading: "今天，想把什么灵感变成作品？",
    },
};

registerThemePack(hongweiyuTheme);

export default hongweiyuTheme;
