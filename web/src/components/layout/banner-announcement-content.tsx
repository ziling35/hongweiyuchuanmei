import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { bannerBackgroundGradientCSS, bannerBackgroundGradientReferenceColor, bannerNoticeSurfaceCSS, normalizeBannerBackgroundMode, readBannerNoticeSurface } from "@/lib/announcements/banner-notice";
import { bannerTitleRunStyle, normalizeBannerTitleHex, type BannerTitleRun } from "@/lib/announcements/banner-title";

/**
 * 通知条的展示单元：底色、富文本标题、详情入口。
 *
 * 首页通知条与后台「前台效果预览」共用这里的每一个部件——后台 DIY 出来的结果之所以能原样回显，
 * 靠的就是两处不各写一份渲染，而不是靠两边样式对齐。
 * 图标素材（emoji）是标题文本的一部分，随 BannerAnnouncementTitle 一起渲染，这里不单独处理。
 */

/** 决定通知条底色的字段集合：模式 + 该模式下生效的一个取值。 */
export type BannerBackgroundSource = {
    noticeType?: string | null;
    backgroundMode?: string | null;
    backgroundColor?: string | null;
    backgroundGradient?: string | null;
};

/**
 * 通知条底色：跟随类型时用类型 token（明暗各一档），自定义时用纯色或预设渐变。
 * 模式里的取值不合法（脏数据 / 旧记录）时回落到类型底色，通知条不会渲染成透明条。
 */
export function bannerAnnouncementBarStyle(source: BannerBackgroundSource) {
    const mode = normalizeBannerBackgroundMode(source.backgroundMode);
    if (mode === "solid") {
        const color = normalizeBannerTitleHex(source.backgroundColor || "");
        if (color) return { backgroundColor: color };
    }
    if (mode === "gradient") {
        const gradient = bannerBackgroundGradientCSS(source.backgroundGradient);
        if (gradient) return { backgroundImage: gradient };
    }
    return { backgroundColor: bannerNoticeSurfaceCSS(source.noticeType) };
}

/** 底色的「参考色」：标题对比度提示用它计算，纯色与渐变都给出确定取值。 */
export function bannerAnnouncementBackgroundReference(source: BannerBackgroundSource, scope?: HTMLElement | null) {
    const mode = normalizeBannerBackgroundMode(source.backgroundMode);
    if (mode === "solid") {
        const color = normalizeBannerTitleHex(source.backgroundColor || "");
        if (color) return color;
    }
    if (mode === "gradient") {
        const color = bannerBackgroundGradientReferenceColor(source.backgroundGradient);
        if (color) return color;
    }
    return readBannerNoticeSurface(source.noticeType, scope);
}

/** 「详情 ›」入口；仅在通知可点击时由调用方渲染。 */
export function BannerAnnouncementLinkHint({ chevronClassName }: { chevronClassName?: string }) {
    const { t } = useTranslation();
    return (
        <span className="flex shrink-0 items-center gap-1 text-[var(--fs-label)] font-semibold text-white">
            <span>{t("account.layout.banner.details")}</span>
            <ChevronRight className={chevronClassName || "size-3.5"} aria-hidden="true" />
        </span>
    );
}

/**
 * 通知标题：按样式分段输出行内 span，未设置样式的维度沿用外层类名（通知条为白色 12px 半粗）。
 * 分段为空时回落到纯文本标题，避免旧数据不显示。
 */
export function BannerAnnouncementTitle({ runs, fallbackText }: { runs?: BannerTitleRun[] | null; fallbackText?: string }) {
    if (!runs || !runs.length) {
        return <>{fallbackText || ""}</>;
    }
    return (
        <>
            {runs.map((run, index) => {
                const style = bannerTitleRunStyle(run);
                return (
                    <span key={`${index}:${run.text}`} style={style} className={!run.color ? "text-white" : undefined}>
                        {run.text}
                    </span>
                );
            })}
        </>
    );
}
