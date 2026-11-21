import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clapperboard, Play } from "lucide-react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { workspacePath } from "@/lib/workspace-routes";
import { fetchShowcaseWorks, type ShowcaseWork } from "@/services/api/showcase";

import { WorkProcessModal, useShowcaseVideoUrl } from "./work-process-modal";
import "./works-showcase.css";

const PAGE_SIZE = 24;

/**
 * 作品卡：封面用 CachedResourceImage 按 storageKey 取图；
 * 视频作品在指针移入时才换签名地址并播放，静止时不浪费流量。
 */
function ShowcaseCard({ work, onOpen }: { work: ShowcaseWork; onOpen: () => void }) {
    const [hovered, setHovered] = useState(false);
    const videoUrl = useShowcaseVideoUrl(work.videoKey, hovered && work.mediaKind === "video");

    return (
        <article className="hwy-work-card" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <button type="button" className="hwy-work-cover" onClick={onOpen} aria-label={`查看制作过程：${work.title}`} aria-haspopup="dialog">
                {videoUrl ? (
                    <video src={videoUrl} autoPlay muted loop playsInline />
                ) : (
                    <>
                        <CachedResourceImage storageKey={work.coverKey} alt="" loading="lazy" decoding="async" />
                        {work.mediaKind === "video" ? (
                            <span className="hwy-work-play" aria-hidden="true">
                                <Play />
                            </span>
                        ) : null}
                    </>
                )}
            </button>
            <div className="hwy-work-copy">
                <strong title={work.title}>{work.title}</strong>
                <small>{work.categoryName}</small>
            </div>
            <button type="button" className="hwy-work-process" onClick={onOpen}>
                查看制作过程
            </button>
        </article>
    );
}

/**
 * 作品广场：用户公开的画布作品（发布时快照，管理员审核后上架）。
 *
 * 与「灵感大厅」并列，但内容来源完全不同：这里读 `GET /showcase/works`，
 * 只返回已上架作品；点卡片打开制作过程弹窗，可以把整张画布复制成自己的。
 */
export function HongweiyuWorksShowcase() {
    const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
    const [process, setProcess] = useState<ShowcaseWork | null>(null);

    const query = useQuery({
        queryKey: ["showcase-works", categoryId],
        queryFn: () => fetchShowcaseWorks({ categoryId, page: 1, pageSize: PAGE_SIZE }),
    });

    const items = query.data?.items ?? [];
    const categories = query.data?.categories ?? [];
    const total = query.data?.total ?? 0;

    // 与灵感大厅同一套选项结构：文字 + 计数胶囊，样式由 inspiration-hall-modes 统一提供。
    const modeOptions = useMemo(
        () => [
            {
                value: "all",
                label: (
                    <>
                        <span>全部</span>
                        {total ? <span className="inspiration-mode-count app-segmented-count">{total.toLocaleString("zh-CN")}</span> : null}
                    </>
                ),
            },
            ...categories.map((category) => ({
                value: String(category.id),
                label: (
                    <>
                        <span>{category.name}</span>
                        {category.workCount ? <span className="inspiration-mode-count app-segmented-count">{category.workCount.toLocaleString("zh-CN")}</span> : null}
                    </>
                ),
                title: `${category.name} ${category.workCount} 件`,
            })),
        ],
        [categories, total],
    );

    return (
        <section className="hwy-gallery" aria-label="作品广场">
            {/* 分类与素材库入口同一行：上面已经有「作品广场」大字，这里不再单独占一行标题。 */}
            <div className="hwy-gallery-bar">
                {categories.length ? (
                    <SegmentedControl
                        options={modeOptions}
                        value={categoryId === undefined ? "all" : String(categoryId)}
                        onChange={(value) => setCategoryId(value === "all" ? undefined : Number(value))}
                        ariaLabel="作品分类"
                        className="inspiration-hall-modes"
                    />
                ) : (
                    <span className="hwy-gallery-count">{total ? `共 ${total.toLocaleString("zh-CN")} 件作品` : ""}</span>
                )}
                <Link className="hwy-gallery-more" to={workspacePath("/assets")}>
                    官方素材库
                    <ArrowUpRight aria-hidden="true" />
                </Link>
            </div>

            {query.isPending ? (
                <div className="hwy-gallery-grid" aria-busy="true">
                    {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="hwy-gallery-skeleton" aria-label="作品读取中">
                            <span />
                            <span />
                        </div>
                    ))}
                </div>
            ) : query.isError ? (
                <div className="hwy-gallery-state">
                    <span role="alert">作品暂时无法读取</span>
                    <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
                        {query.isFetching ? "重试中…" : "重试"}
                    </button>
                </div>
            ) : items.length ? (
                <div className="hwy-gallery-grid">
                    {items.map((work) => (
                        <ShowcaseCard key={work.id} work={work} onOpen={() => setProcess(work)} />
                    ))}
                </div>
            ) : (
                <div className="hwy-gallery-state">
                    <Clapperboard aria-hidden="true" />
                    <span>{categoryId === undefined ? "还没有公开的作品。在画布页把作品公开到作品广场，管理员审核通过后会出现在这里。" : "这个分类下还没有作品。"}</span>
                </div>
            )}

            <WorkProcessModal work={process} onClose={() => setProcess(null)} />
        </section>
    );
}
