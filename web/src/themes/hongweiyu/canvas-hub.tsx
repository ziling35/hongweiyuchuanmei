import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { App } from "antd";
import { ArrowUpRight, LoaderCircle, PanelsTopLeft, Plus } from "lucide-react";

import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import { RelativeTime } from "@/components/ui/product/relative-time";
import { useAuthEntry } from "@/hooks/use-auth-entry";
import { getActiveUserScope } from "@/lib/user-scope";
import { loadCanvasProjectPage } from "@/lib/workspace-route-modules";
import { workspacePath } from "@/lib/workspace-routes";
import { listRemoteCanvasProjectsPage, type CanvasLibrarySummary } from "@/services/api/user-data";
import { canvasDraftNavigationState, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";

import "./canvas-hub.css";

/** 首页「画布」视图列出的历史画布条数；更多的从「全部画布」进画布库。 */
const HUB_COUNT = 8;

/**
 * 首页「画布」视图：新建画布 + 最近画布。
 *
 * 数据、权限和「新建画布」的落点与上游的最近画布区块完全一致（同一套画布列表接口、
 * 同一套本地草稿 + 跳转），只是这里当成一整块板块来展示，并把条数放宽到 8 条——
 * 上游那块只在创作首页露出 4 条；allHref 由 hero 传入，团队空间前缀不会丢。
 */
export function HongweiyuCanvasHub({ allHref = "/canvas" }: { allHref?: string }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { openAuth } = useAuthEntry();
    const userId = useUserStore((state) => state.user?.id);
    const sessionHydrated = useUserStore((state) => state.hydrated);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const localProjects = useCanvasStore((state) => state.projects);
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);

    const query = useQuery({
        queryKey: ["canvas-library", userId, "home-hub"],
        queryFn: ({ signal }) => listRemoteCanvasProjectsPage({ page: 1, pageSize: HUB_COUNT, sort: "updated", signal }),
        enabled: Boolean(userId) && sessionHydrated,
    });

    const projects = useMemo<CanvasLibrarySummary[]>(
        () =>
            userId
                ? query.data?.projects || []
                : [...localProjects]
                      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
                      .slice(0, HUB_COUNT)
                      .map((project) => ({ ...project, nodeCount: project.nodes.length, previewNodes: project.nodes.slice(0, 4) })),
        [localProjects, query.data, userId],
    );
    const loading = !sessionHydrated || !canvasHydrated || Boolean(userId && query.isPending);

    // 画布页是异步 chunk：指针落到入口上就先取回来，点进去不再等。
    const preload = () => {
        void loadCanvasProjectPage();
    };

    const createCanvas = async () => {
        if (!userId) {
            openAuth({ preferDialog: true });
            return;
        }
        if (!canvasHydrated || creatingRef.current) return;
        const scope = getActiveUserScope();
        creatingRef.current = true;
        setCreating(true);
        try {
            const id = useCanvasStore.getState().createDraftProject("未命名画布");
            if (getActiveUserScope() !== scope || useUserStore.getState().user?.id !== userId) return;
            navigate(workspacePath(`/canvas/${id}`), { state: canvasDraftNavigationState(id) });
        } catch (error) {
            if (getActiveUserScope() === scope) message.error(error instanceof Error ? error.message : "新建画布失败，请稍后重试。");
        } finally {
            creatingRef.current = false;
            setCreating(false);
        }
    };

    return (
        <section className="hwy-hub" aria-label="画布">
            <header className="hwy-hub-head">
                <h2>最近画布</h2>
                <Link className="hwy-hub-more" to={allHref} onPointerEnter={preload} onFocus={preload}>
                    全部画布
                    <ArrowUpRight aria-hidden="true" />
                </Link>
            </header>
            <button type="button" className="hwy-hub-new" disabled={!sessionHydrated || !canvasHydrated || creating} onClick={() => void createCanvas()} onPointerEnter={preload} onFocus={preload}>
                <span className="hwy-hub-new-icon" aria-hidden="true">
                    {creating ? <LoaderCircle className="hwy-hub-spin" /> : <Plus />}
                </span>
                <span className="hwy-hub-new-label">{creating ? "正在创建…" : "新建画布"}</span>
            </button>
            <div className="hwy-hub-grid" role="list" aria-busy={loading}>
                {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="hwy-hub-cell hwy-hub-skeleton" role="listitem" aria-label="画布读取中">
                            <span />
                            <span />
                        </div>
                    ))
                ) : userId && query.isError ? (
                    <div className="hwy-hub-state" role="listitem">
                        <span role="alert">画布列表暂时无法读取</span>
                        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
                            {query.isFetching ? "重试中…" : "重试"}
                        </button>
                    </div>
                ) : projects.length ? (
                    projects.map((project) => (
                        <div className="hwy-hub-cell" role="listitem" key={project.id}>
                            <Link className="hwy-hub-card" to={workspacePath(`/canvas/${project.id}`)} title={project.title} onPointerEnter={preload} onFocus={preload}>
                                <span className="hwy-hub-thumb" aria-hidden="true">
                                    <ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} preferLatestImage />
                                </span>
                                <span className="hwy-hub-copy">
                                    <strong>{project.title || "未命名画布"}</strong>
                                    <small>
                                        {project.nodeCount} 个节点 · <RelativeTime value={project.updatedAt} />
                                    </small>
                                </span>
                            </Link>
                        </div>
                    ))
                ) : (
                    <div className="hwy-hub-state" role="listitem">
                        <PanelsTopLeft aria-hidden="true" />
                        <span>{userId ? "还没有画布，从「新建画布」开始。" : "登录后可以看到你的画布。"}</span>
                        {!userId ? (
                            <button type="button" onClick={() => openAuth({ preferDialog: true })}>
                                登录
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </section>
    );
}
