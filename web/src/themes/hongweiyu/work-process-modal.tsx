import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Copy, Image as ImageIcon } from "lucide-react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { workspacePath } from "@/lib/workspace-routes";
import { getResourceAccess, resolveResourceAccessURL } from "@/services/api/resources";
import { fetchShowcaseWorkCanvas, type ShowcaseWork } from "@/services/api/showcase";
import { canvasDraftNavigationState, useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";

import "./work-process-modal.css";

/** 悬停预览和弹窗播放都要能播：按 storageKey 换一次签名地址。 */
export function useShowcaseVideoUrl(storageKey: string, enabled: boolean) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        if (!enabled || !storageKey) return;
        let cancelled = false;
        void (async () => {
            try {
                const access = await getResourceAccess(storageKey, "display", "original");
                if (!cancelled) setUrl(resolveResourceAccessURL(access.url));
            } catch {
                if (!cancelled) setUrl("");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [storageKey, enabled]);
    return url;
}

type SnapshotNode = { id?: string; type?: string; content?: string; storageKey?: string; data?: { content?: string; storageKey?: string } };

/** 从快照节点里挑出可显示的媒体：兼容 content / storageKey 两套历史写法。 */
function mediaKeyOf(node: SnapshotNode): string | null {
    const candidates = [node.storageKey, node.content, node.data?.storageKey, node.data?.content];
    for (const value of candidates) {
        if (typeof value === "string" && (value.startsWith("resource:") || value.startsWith("image:") || value.startsWith("http"))) return value;
    }
    return null;
}

/**
 * 「查看制作过程」弹窗：预览整张画布，并允许一键复制成自己的画布。
 *
 * 快照是发布那一刻固化的，所以原画布后来被改或删都不影响这里的内容；
 * 复制走画布 store 的 importProject（生成新 id 的本地画布），随后跳到新画布继续编辑。
 */
export function WorkProcessModal({ work, onClose }: { work: ShowcaseWork | null; onClose: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const query = useQuery({
        queryKey: ["showcase-work-canvas", work?.id],
        queryFn: () => fetchShowcaseWorkCanvas(work!.id),
        enabled: Boolean(work?.id),
        staleTime: 5 * 60 * 1000,
    });

    const canvas = query.data?.canvas;
    const previews = useMemo(() => {
        const nodes = (canvas?.nodes ?? []) as SnapshotNode[];
        return nodes
            .map(mediaKeyOf)
            .filter((key): key is string => Boolean(key))
            .slice(0, 16);
    }, [canvas]);
    const nodeCount = (canvas?.nodes ?? []).length;
    const connectionCount = (canvas?.connections ?? []).length;

    const copyProject = () => {
        if (!canvas) return;
        try {
            const id = useCanvasStore.getState().importProject({
                title: canvas.title || `${work?.title || "作品"}（副本）`,
                nodes: canvas.nodes as CanvasProject["nodes"],
                connections: canvas.connections as CanvasProject["connections"],
                viewport: canvas.viewport as CanvasProject["viewport"],
                appearance: canvas.appearance as CanvasProject["appearance"],
            });
            message.success("已复制到你自己的画布");
            onClose();
            navigate(workspacePath(`/canvas/${id}`), { state: canvasDraftNavigationState(id) });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "复制失败，请稍后再试");
        }
    };

    return (
        <AppModal open={Boolean(work)} onCancel={onClose} footer={null} width={880} title={null} centered>
            {work ? (
                <article className="hwy-process">
                    <header className="hwy-process-head">
                        <div>
                            <h3>{work.title}</h3>
                            <p>
                                {work.categoryName}
                                {work.description ? ` · ${work.description}` : ""}
                            </p>
                        </div>
                        <Button type="primary" icon={<Copy className="size-4" />} disabled={!canvas} onClick={copyProject}>
                            复制项目
                        </Button>
                    </header>
                    {query.isPending ? (
                        <div className="hwy-process-state">正在读取画布快照…</div>
                    ) : query.isError ? (
                        <div className="hwy-process-state">
                            <span role="alert">制作过程暂时无法读取</span>
                            <Button size="small" onClick={() => void query.refetch()}>
                                重试
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="hwy-process-stats">
                                <span>{nodeCount} 个节点</span>
                                <span>{connectionCount} 条连线</span>
                                <span>快照版本，复制后独立编辑</span>
                            </div>
                            {previews.length ? (
                                <div className="hwy-process-canvas">
                                    {previews.map((key, index) => (
                                        <span key={`${key}-${index}`} className="hwy-process-tile">
                                            {key.startsWith("http") ? <img src={key} alt="" loading="lazy" /> : <CachedResourceImage storageKey={key} alt="" loading="lazy" />}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="hwy-process-state">
                                    <ImageIcon aria-hidden="true" />
                                    <span>这份画布里没有可预览的图片节点。</span>
                                </div>
                            )}
                        </>
                    )}
                </article>
            ) : null}
        </AppModal>
    );
}
