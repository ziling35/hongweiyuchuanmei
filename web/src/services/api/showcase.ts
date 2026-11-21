import { compactApiParams, http } from "@/services/api/request";

/** 作品广场分类：管理员在后台维护，前台只读启用中的那些。 */
export type ShowcaseCategory = {
    id: number;
    slug: string;
    name: string;
    sortOrder: number;
    enabled: boolean;
    /** 该分类下已上架作品数。 */
    workCount: number;
};

/** 作品列表项：不含画布快照，列表页不需要把整份画布带下来。 */
export type ShowcaseWork = {
    id: string;
    ownerId: string;
    projectId: string;
    categoryId: number;
    categoryName: string;
    title: string;
    description: string;
    mediaKind: "image" | "video";
    coverKey: string;
    videoKey: string;
    status: "pending" | "published" | "rejected" | "hidden";
    reviewNote: string;
    publishedAt: string | null;
    createdAt: string;
};

export type ShowcaseWorkInput = {
    projectId: string;
    categoryId: number;
    title: string;
    description: string;
    mediaKind: "image" | "video";
    coverKey: string;
    videoKey: string;
    /** 画布快照 JSON 字符串，由画布页在提交时序列化。 */
    snapshot: string;
};

export type ShowcasePage = {
    items: ShowcaseWork[];
    total: number;
    page: number;
    pageSize: number;
    categories: ShowcaseCategory[];
};

/** 制作过程弹窗用的画布快照（结构由前端画布 store 决定）。 */
export type ShowcaseCanvasSnapshot = {
    nodes?: unknown[];
    connections?: unknown[];
    viewport?: unknown;
    appearance?: unknown;
    title?: string;
};

export function fetchShowcaseWorks(params: { categoryId?: number; page?: number; pageSize?: number } = {}) {
    return http.get<ShowcasePage>("/showcase/works", {
        params: compactApiParams({ categoryId: params.categoryId, page: params.page, pageSize: params.pageSize }),
    });
}

export function fetchShowcaseCategories() {
    return http.get<{ categories: ShowcaseCategory[] }>("/showcase/categories");
}

/** 「查看制作过程」与「复制项目」都读这份快照。 */
export function fetchShowcaseWorkCanvas(id: string) {
    return http.get<{ work: ShowcaseWork; canvas: ShowcaseCanvasSnapshot }>(`/showcase/works/${encodeURIComponent(id)}/canvas`);
}

export function submitShowcaseWork(input: ShowcaseWorkInput) {
    return http.post<{ work: ShowcaseWork }>("/showcase/works", input);
}

export function updateShowcaseWork(id: string, input: ShowcaseWorkInput) {
    return http.patch<{ work: ShowcaseWork }>(`/showcase/works/${encodeURIComponent(id)}`, input);
}

export function fetchMyShowcaseWorks() {
    return http.get<{ items: ShowcaseWork[] }>("/showcase/mine");
}

export function withdrawShowcaseWork(id: string) {
    return http.delete<{ deleted: boolean }>(`/showcase/works/${encodeURIComponent(id)}`);
}

// ---------- 后台 ----------

export function fetchAdminShowcaseCategories() {
    return http.get<{ categories: ShowcaseCategory[] }>("/admin/showcase/categories");
}

export function createShowcaseCategory(body: { slug: string; name: string; sortOrder?: number; enabled?: boolean }) {
    return http.post<{ category: ShowcaseCategory }>("/admin/showcase/categories", body);
}

export function updateShowcaseCategory(id: number, body: { slug?: string; name?: string; sortOrder?: number; enabled?: boolean }) {
    return http.patch<{ category: ShowcaseCategory }>(`/admin/showcase/categories/${id}`, body);
}

export function deleteShowcaseCategory(id: number) {
    return http.delete<{ deleted: boolean }>(`/admin/showcase/categories/${id}`);
}

export function fetchAdminShowcaseWorks(params: { status?: string; page?: number; pageSize?: number } = {}) {
    return http.get<{ items: ShowcaseWork[]; total: number }>("/admin/showcase/works", {
        params: compactApiParams({ status: params.status, page: params.page, pageSize: params.pageSize }),
    });
}

export function reviewShowcaseWork(id: string, body: { approve: boolean; note?: string }) {
    return http.post<{ work: ShowcaseWork }>(`/admin/showcase/works/${encodeURIComponent(id)}/review`, body);
}

export function setShowcaseWorkStatus(id: string, status: "published" | "hidden") {
    return http.patch<{ work: ShowcaseWork }>(`/admin/showcase/works/${encodeURIComponent(id)}/status`, { status });
}
