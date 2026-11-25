import { Dropdown } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Coins } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useSpaceCreditOverview } from "@/hooks/use-space-credit-overview";
import { teamCredits, teamKeys } from "@/lib/team-query-keys";
import { listTeams } from "@/services/api/teams";
import { useBillingSourceStore } from "@/stores/use-billing-source-store";
import { useUserStore } from "@/stores/use-user-store";
import { useThemePack } from "@/themes/use-theme-pack";

import { openSpaceDirectory } from "./team-space-directory";

/**
 * 顶栏扣费账户选择器。
 *
 * 个人空间生成时，可以花个人钱包，也可以花团长已经划给本人的团队额度；
 * 团队额度是成员自己的账户，公共池不参与，用完即止（不会回退到个人钱包）。
 * 团队空间内不显示本组件：那里的产出一律扣当前成员的空间额度。
 */
export function BillingSourcePicker() {
    const userId = useUserStore((state) => state.user?.id || "");
    const BalanceMark = useThemePack()?.creditMark ?? Coins;
    const overview = useSpaceCreditOverview();
    const teams = useQuery({
        queryKey: teamKeys.list(userId),
        queryFn: ({ signal }) => listTeams(signal),
        enabled: Boolean(userId),
        staleTime: 60_000,
        retry: false,
    });
    const source = useBillingSourceStore((state) => state.source);
    const sync = useBillingSourceStore((state) => state.sync);
    const select = useBillingSourceStore((state) => state.select);

    useEffect(() => {
        sync(userId);
    }, [sync, userId]);

    const spaces = useMemo(() => overview.data?.spaces ?? [], [overview.data]);
    // 空间额度总览不带 membershipId，用它配团队成员列表定位扣费账户。
    const membershipByTeam = useMemo(() => new Map((teams.data ?? []).map((team) => [team.id, team.membershipId])), [teams.data]);

    // 额度被收回、退出团队或团队关闭后回到个人钱包，避免继续提交必然失败的请求。
    useEffect(() => {
        if (!source || overview.isPending || overview.isError) return;
        if (!spaces.some((space) => space.teamId === source.teamId)) select(userId, null);
    }, [overview.isError, overview.isPending, select, source, spaces, userId]);

    // 还没有任何团队额度时保持原入口：点一下打开空间目录，去创建或加入空间。
    if (!spaces.length) {
        return (
            <button type="button" className="app-workspace-topbar-credit-pill space-credit-pill" aria-haspopup="dialog" aria-label="个人积分，查看各空间额度" title="扣费：个人钱包" onClick={openSpaceDirectory}>
                <BalanceMark aria-hidden />
                <span>扣费 个人</span>
                <strong>{overview.data ? teamCredits(overview.data.personal.availableMicrocredits) : "—"}</strong>
            </button>
        );
    }

    const selected = source ? spaces.find((space) => space.teamId === source.teamId) : undefined;
    const personalBalance = overview.data ? teamCredits(overview.data.personal.availableMicrocredits) : "—";
    const balance = selected ? teamCredits(selected.availableMicrocredits) : personalBalance;
    const label = source ? `扣费 ${source.teamName}` : "扣费 个人";
    const selectedKey = source ? `team:${source.teamId}` : "personal";
    const option = (title: string, detail: string, active: boolean) => (
        <span className="flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-sm font-medium">{title}</strong>
                <small className="truncate text-xs text-foreground/55">{detail}</small>
            </span>
            {active ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
        </span>
    );
    const items = [
        ...(spaces.length ? [{ key: "personal", label: option("个人钱包", overview.data ? `${personalBalance} 可用` : "正在读取余额", selectedKey === "personal") }, { type: "divider" as const }] : []),
        ...spaces.map((space) => ({
            key: `team:${space.teamId}`,
            label: option(space.parentName ? `${space.parentName} / ${space.name}` : space.name, `${teamCredits(space.availableMicrocredits)} 可用 · 团长划给你的额度`, selectedKey === `team:${space.teamId}`),
            disabled: !membershipByTeam.get(space.teamId),
        })),
        ...(spaces.length ? [{ type: "divider" as const }, { key: "directory", label: <span className="text-xs text-foreground/60">查看各空间额度与流水</span> }] : []),
    ];
    return (
        <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
                selectedKeys: [selectedKey],
                items,
                onClick: ({ key }) => {
                    if (key === "directory") {
                        openSpaceDirectory();
                        return;
                    }
                    if (key === "personal") {
                        select(userId, null);
                        return;
                    }
                    const teamId = key.slice("team:".length);
                    const space = spaces.find((item) => item.teamId === teamId);
                    const membershipId = membershipByTeam.get(teamId);
                    if (!space || !membershipId) return;
                    select(userId, { membershipId, teamId, teamName: space.parentName ? `${space.parentName} / ${space.name}` : space.name });
                },
            }}
        >
            <button
                type="button"
                className="app-workspace-topbar-credit-pill space-credit-pill"
                aria-haspopup="menu"
                aria-label={`${label}，余额 ${balance}，选择扣费账户`}
                title={source ? `生成扣费：${source.teamName} 划给你的额度，用完为止` : "生成扣费：个人钱包"}
            >
                <BalanceMark aria-hidden />
                <span className="max-w-[11rem] truncate">{label}</span>
                <strong>{balance}</strong>
                <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
            </button>
        </Dropdown>
    );
}
