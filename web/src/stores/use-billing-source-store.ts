import { create } from "zustand";

/** 团长划给本人的团队额度；选中它之后，个人空间的生成扣该成员账户，公共池不动。 */
export type TeamBillingSource = { membershipId: string; teamId: string; teamName: string };

const STORAGE_KEY = "yingce.billing-source";

type PersistedSources = Record<string, TeamBillingSource>;

function readAll(): PersistedSources {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PersistedSources) : {};
    } catch {
        return {};
    }
}

function persist(userId: string, source: TeamBillingSource | null) {
    try {
        const all = readAll();
        if (source) all[userId] = source;
        else delete all[userId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
        // 浏览器禁用存储时选择只在本次会话有效。
    }
}

type Store = {
    userId: string;
    source: TeamBillingSource | null;
    /** 登录账号变化时载入该账号上次的选择；换号不能沿用上一个账号的团队额度。 */
    sync: (userId: string) => void;
    select: (userId: string, source: TeamBillingSource | null) => void;
};

export const useBillingSourceStore = create<Store>((set) => ({
    userId: "",
    source: null,
    sync: (userId) => {
        const stored = userId ? readAll()[userId] : undefined;
        set({ userId, source: stored ?? null });
    },
    select: (userId, source) => {
        persist(userId, source);
        set({ userId, source });
    },
}));

/** 供非 React 的请求层读取当前扣费账户；空字符串表示扣个人钱包。 */
export function activeTeamBillingMembershipId() {
    return useBillingSourceStore.getState().source?.membershipId || "";
}
