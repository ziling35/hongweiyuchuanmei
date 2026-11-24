/**
 * 首页常驻通知条的「通知类型」与「标题图标素材」模型。
 *
 * 通知类型决定通知条底色（后台与前台共用同一套 token）。
 * 图标素材是 emoji 字符：它就是普通文本，随 TitleRuns 的文本分段一起存储与渲染，
 * 因此可以插到标题任意位置、跟随分段样式、参与关键字检索，后端不需要单独字段或白名单。
 *
 * 本模块只放纯数据与纯函数，不 import 任何组件。
 */

export type BannerNoticeType = "notice" | "activity" | "update" | "warning";

/** 未指定类型时的兜底：平台公告。 */
export const BANNER_NOTICE_DEFAULT_TYPE: BannerNoticeType = "notice";

export const BANNER_NOTICE_TYPES: {
    key: BannerNoticeType;
    label: string;
    hint: string;
    /** 该类型的语义底色 token；由 globals.css 按明暗主题分别取值。 */
    surfaceVar: string;
}[] = [
    { key: "notice", label: "公告", hint: "平台公告、规则与流程变更", surfaceVar: "--notice-banner-surface-notice" },
    { key: "activity", label: "活动", hint: "运营活动、限时促销与福利", surfaceVar: "--notice-banner-surface-activity" },
    { key: "update", label: "更新", hint: "版本发布、功能上新与改版", surfaceVar: "--notice-banner-surface-update" },
    { key: "warning", label: "警告", hint: "维护窗口、风险与服务异常", surfaceVar: "--notice-banner-surface-warning" },
];

const BANNER_NOTICE_TYPE_KEYS = new Set<string>(BANNER_NOTICE_TYPES.map((item) => item.key));

/** 未知 / 空类型一律回落到默认类型，通知条不会因为脏数据失去底色。 */
export function normalizeBannerNoticeType(value?: string | null): BannerNoticeType {
    const raw = (value || "").trim().toLowerCase();
    return BANNER_NOTICE_TYPE_KEYS.has(raw) ? (raw as BannerNoticeType) : BANNER_NOTICE_DEFAULT_TYPE;
}

export function bannerNoticeTypeMeta(value?: string | null) {
    const key = normalizeBannerNoticeType(value);
    return BANNER_NOTICE_TYPES.find((item) => item.key === key) as (typeof BANNER_NOTICE_TYPES)[number];
}

export function bannerNoticeTypeLabel(value?: string | null) {
    return bannerNoticeTypeMeta(value).label;
}

export function bannerNoticeTypeHint(value?: string | null) {
    return bannerNoticeTypeMeta(value).hint;
}

/** 该类型底色的 CSS 引用（含 var()）；scope 内可被预览容器覆盖成明暗指定档。 */
export function bannerNoticeSurfaceCSS(value?: string | null) {
    return `var(${bannerNoticeTypeMeta(value).surfaceVar})`;
}

/** 合法类型键，供后端白名单与前端一致性测试使用。 */
export const BANNER_NOTICE_TYPE_VALUES = BANNER_NOTICE_TYPES.map((item) => item.key);

/*
 * 通知条底色除了「跟随通知类型」，还允许管理员自定义纯色或从预设渐变里挑一个。
 *
 * 三种来源互斥：模式决定哪一项生效，另外两项在写入时清空（后端 normalizeBannerBackground 同一规则）。
 * 渐变用结构化色标而不是整段 CSS：这样才能算出对比度参考色，也才能让后端只存一个键。
 */

export type BannerBackgroundMode = "type" | "solid" | "gradient";

export const BANNER_BACKGROUND_DEFAULT_MODE: BannerBackgroundMode = "type";

export const BANNER_BACKGROUND_MODES: { key: BannerBackgroundMode; label: string; hint: string }[] = [
    { key: "type", label: "跟随类型", hint: "用通知类型的主题色，明暗主题各一档" },
    { key: "solid", label: "自定义颜色", hint: "任选一个颜色铺满整条" },
    { key: "gradient", label: "渐变", hint: "从预设渐变里挑一个" },
];

/** 预设渐变：色标都压在中深色区间，保证默认白字仍然可读。 */
export const BANNER_BACKGROUND_GRADIENTS = [
    { key: "aurora", label: "极光", from: "#4338CA", to: "#0E7490" },
    { key: "sunset", label: "日落", from: "#C2410C", to: "#BE185D" },
    { key: "ocean", label: "深海", from: "#1D4ED8", to: "#0E7490" },
    { key: "forest", label: "森林", from: "#047857", to: "#3F6212" },
    { key: "violet", label: "紫韵", from: "#6D28D9", to: "#A21CAF" },
    { key: "crimson", label: "烈焰", from: "#991B1B", to: "#BE185D" },
    { key: "midnight", label: "午夜", from: "#0F172A", to: "#3730A3" },
    { key: "gold", label: "鎏金", from: "#92400E", to: "#A16207" },
] as const;
export type BannerBackgroundGradientKey = (typeof BANNER_BACKGROUND_GRADIENTS)[number]["key"];

const BANNER_BACKGROUND_GRADIENT_KEYS = new Set<string>(BANNER_BACKGROUND_GRADIENTS.map((item) => item.key));

/** 合法模式键，供后端白名单与一致性测试使用。 */
export const BANNER_BACKGROUND_MODE_VALUES = BANNER_BACKGROUND_MODES.map((item) => item.key);
/** 合法渐变键，后端 bannerBackgroundGradients 必须与它逐项一致。 */
export const BANNER_BACKGROUND_GRADIENT_VALUES = BANNER_BACKGROUND_GRADIENTS.map((item) => item.key);

/** 未知 / 空模式一律回落到「跟随类型」：脏数据不会让通知条失去底色。 */
export function normalizeBannerBackgroundMode(value?: string | null): BannerBackgroundMode {
    const raw = (value || "").trim().toLowerCase();
    return (BANNER_BACKGROUND_MODE_VALUES as string[]).includes(raw) ? (raw as BannerBackgroundMode) : BANNER_BACKGROUND_DEFAULT_MODE;
}

export function isBannerBackgroundGradientKey(value?: string | null) {
    return BANNER_BACKGROUND_GRADIENT_KEYS.has((value || "").trim().toLowerCase());
}

/** 清洗渐变键：未知值返回空串，调用方据此回落到「未选择」。 */
export function normalizeBannerBackgroundGradient(value?: string | null): BannerBackgroundGradientKey | "" {
    const key = (value || "").trim().toLowerCase();
    return BANNER_BACKGROUND_GRADIENT_KEYS.has(key) ? (key as BannerBackgroundGradientKey) : "";
}

export function bannerBackgroundGradientMeta(value?: string | null) {
    const key = (value || "").trim().toLowerCase();
    return BANNER_BACKGROUND_GRADIENTS.find((item) => item.key === key);
}

/** 在两个 #RRGGBB 之间线性插值（与浏览器渐变默认的 sRGB 插值一致）。 */
function mixBannerHex(from: string, to: string, ratio: number) {
    const channel = (offset: number) => {
        const start = Number.parseInt(from.slice(offset, offset + 2), 16);
        const end = Number.parseInt(to.slice(offset, offset + 2), 16);
        return Math.round(start + (end - start) * ratio)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase();
    };
    return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * 渐变停靠点：两端变化快、中间留一段亮色平台。
 *
 * 通知条在宽屏上接近整窗宽，等距的两色渐变在最左/最右几百像素里只走完十几个百分点，
 * 看着像一块纯色（还会被误认为「侧栏上方没铺到渐变」）。把色差压在两端各 26% 的区间，
 * 中间 26%–74% 保持亮色，任何宽度下整条每一段都能看出是在渐变。
 */
const BANNER_GRADIENT_STOPS: { position: number; mix: number }[] = [
    { position: 0, mix: 0 },
    { position: 6, mix: 0.2 },
    { position: 12, mix: 0.36 },
    { position: 18, mix: 0.48 },
    { position: 26, mix: 1 },
    { position: 74, mix: 1 },
    { position: 82, mix: 0.48 },
    { position: 88, mix: 0.36 },
    { position: 94, mix: 0.2 },
    { position: 100, mix: 0 },
];

/** 渐变的 CSS 值；未知键返回空串，调用方据此回落到类型底色。 */
export function bannerBackgroundGradientCSS(value?: string | null) {
    const preset = bannerBackgroundGradientMeta(value);
    if (!preset) return "";
    const stops = BANNER_GRADIENT_STOPS.map((stop) => `${mixBannerHex(preset.from, preset.to, stop.mix)} ${stop.position}%`).join(", ");
    return `linear-gradient(90deg, ${stops})`;
}

/** 渐变最亮处的颜色：中间平台是白字最吃力的位置，用于对比度提示。 */
export function bannerBackgroundGradientReferenceColor(value?: string | null) {
    return bannerBackgroundGradientMeta(value)?.to || "";
}

/** 后台列表与预览用的底色说明，避免各处自己拼字符串。 */
export function bannerBackgroundLabel(source: { noticeType?: string | null; backgroundMode?: string | null; backgroundColor?: string | null; backgroundGradient?: string | null }) {
    const mode = normalizeBannerBackgroundMode(source.backgroundMode);
    if (mode === "solid") {
        const color = (source.backgroundColor || "").trim().toUpperCase();
        return `自定义颜色 ${color || "未选择"}`;
    }
    if (mode === "gradient") {
        return `渐变 · ${bannerBackgroundGradientMeta(source.backgroundGradient)?.label || "未选择"}`;
    }
    return `${bannerNoticeTypeLabel(source.noticeType)} · 类型色`;
}

/**
 * 标题可插入的 emoji 图标素材，按用途分组。
 * 每项的 char 会作为普通文本插进标题（跟随光标处的字号 / 颜色样式），label 供搜索与 aria 标注。
 */
export const BANNER_NOTICE_EMOJI_GROUPS: { key: string; label: string; emoji: { char: string; label: string }[] }[] = [
    {
        key: "notice",
        label: "通知",
        emoji: [
            { char: "📢", label: "喇叭" },
            { char: "📣", label: "扩音" },
            { char: "🔔", label: "铃铛" },
            { char: "📮", label: "邮筒" },
            { char: "📌", label: "图钉" },
            { char: "📄", label: "文件" },
            { char: "📝", label: "备注" },
            { char: "📰", label: "快讯" },
            { char: "🗓️", label: "日历" },
            { char: "⏰", label: "闹钟" },
            { char: "🕐", label: "时钟" },
            { char: "🎯", label: "目标" },
        ],
    },
    {
        key: "celebrate",
        label: "庆祝",
        emoji: [
            { char: "🎉", label: "撒花" },
            { char: "🎊", label: "礼花" },
            { char: "🎈", label: "气球" },
            { char: "🎁", label: "礼物" },
            { char: "🎂", label: "蛋糕" },
            { char: "🥳", label: "狂欢" },
            { char: "🏆", label: "奖杯" },
            { char: "🥇", label: "金牌" },
            { char: "👑", label: "皇冠" },
            { char: "💎", label: "宝石" },
            { char: "✨", label: "闪光" },
            { char: "⭐", label: "星星" },
        ],
    },
    {
        key: "hot",
        label: "热门",
        emoji: [
            { char: "🔥", label: "热门" },
            { char: "🚀", label: "火箭" },
            { char: "⚡", label: "闪电" },
            { char: "💥", label: "爆炸" },
            { char: "🌟", label: "亮星" },
            { char: "💫", label: "星晕" },
            { char: "🌈", label: "彩虹" },
            { char: "☀️", label: "太阳" },
            { char: "🌙", label: "月亮" },
            { char: "❤️", label: "红心" },
            { char: "💯", label: "满分" },
            { char: "👍", label: "点赞" },
        ],
    },
    {
        key: "commerce",
        label: "商业",
        emoji: [
            { char: "💰", label: "钱袋" },
            { char: "💸", label: "飞钱" },
            { char: "💳", label: "银行卡" },
            { char: "🏦", label: "银行" },
            { char: "🛒", label: "购物车" },
            { char: "🛍️", label: "购物袋" },
            { char: "🏷️", label: "价签" },
            { char: "💼", label: "公文包" },
            { char: "📈", label: "上涨" },
            { char: "📉", label: "下跌" },
            { char: "🎫", label: "票券" },
            { char: "🎟️", label: "门票" },
        ],
    },
    {
        key: "status",
        label: "状态",
        emoji: [
            { char: "✅", label: "完成" },
            { char: "❌", label: "取消" },
            { char: "⚠️", label: "警告" },
            { char: "⛔", label: "禁止" },
            { char: "🚫", label: "禁用" },
            { char: "❓", label: "疑问" },
            { char: "❗", label: "感叹" },
            { char: "⏳", label: "等待" },
            { char: "🔄", label: "刷新" },
            { char: "🔧", label: "扳手" },
            { char: "🔒", label: "上锁" },
            { char: "🐞", label: "缺陷" },
        ],
    },
];

/** 扁平化的 emoji 清单，顺序与分组一致。 */
export const BANNER_NOTICE_EMOJIS = BANNER_NOTICE_EMOJI_GROUPS.flatMap((group) => group.emoji.map((item) => ({ ...item, group: group.key, groupLabel: group.label })));

/** 按关键字过滤（匹配中文名、分组名或字符本身），空关键字返回全量。 */
export function searchBannerNoticeEmojis(keyword: string) {
    const query = keyword.trim().toLowerCase();
    if (!query) return BANNER_NOTICE_EMOJIS;
    return BANNER_NOTICE_EMOJIS.filter((item) => item.char.includes(query) || item.label.includes(query) || item.groupLabel.includes(query));
}

/**
 * 读取指定类型在当前主题下的通知条实底色，避免把设计 token 的色值复制到 TS 里。
 * scope 传后台预览容器可在该容器强制指定的明 / 暗档里取值。
 */
export function readBannerNoticeSurface(noticeType?: string | null, scope?: HTMLElement | null) {
    if (typeof window === "undefined") return "";
    const host = scope || window.document.body || window.document.documentElement;
    if (!host) return "";
    const probe = window.document.createElement("span");
    probe.style.cssText = `position:absolute;left:-9999px;top:-9999px;background-color:${bannerNoticeSurfaceCSS(noticeType)}`;
    host.appendChild(probe);
    const resolved = window.getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
}
