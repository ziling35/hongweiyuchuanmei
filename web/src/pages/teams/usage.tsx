import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Select, Table, Tag } from "antd";

import { PageHeader } from "@/components/layout/workspace-page";
import { teamCredits, teamKeys } from "@/lib/team-query-keys";
import { getTeamUsage, type TeamSummary, type TeamUsageBreakdown, type TeamUsageMember } from "@/services/api/teams";
import { useUserStore } from "@/stores/use-user-store";

const ranges = [
    { value: 7, label: "最近 7 天" },
    { value: 30, label: "最近 30 天" },
    { value: 90, label: "最近 90 天" },
];
const capabilityLabels: Record<string, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
const capabilityLabel = (key: string) => capabilityLabels[key] || key || "未标注";

function dayString(offset: number) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
}

/**
 * 团队用量报表：读 billing_orders 的结算快照。
 * 已结算订单算实际消耗，进行中的订单计入"冻结中"，两者都不含公共池余额。
 */
export function TeamUsagePane() {
    const team = useOutletContext<TeamSummary>();
    const userId = useUserStore((state) => state.user?.id) || "";
    const owner = team.role === "owner";
    const [days, setDays] = useState(30);
    const from = useMemo(() => dayString(-days), [days]);
    const to = useMemo(() => dayString(1), [days]);
    const usage = useQuery({
        queryKey: [...teamKeys.space(userId, team.id), "usage", from, to],
        queryFn: ({ signal }) => getTeamUsage(team.id, { from, to }, signal),
        staleTime: 30_000,
    });
    const report = usage.data;
    const maxDay = Math.max(1, ...(report?.days.map((item) => item.spentMicrocredits) ?? [0]));
    const memberColumns = [
        {
            title: "成员",
            dataIndex: "displayName",
            render: (_: unknown, row: TeamUsageMember) => (
                <span className="flex items-center gap-2">
                    <span className="truncate">{row.displayName || row.username || row.userId}</span>
                    {row.role === "owner" ? <Tag>所有者</Tag> : null}
                    {row.status !== "active" ? <Tag color="default">已离队</Tag> : null}
                </span>
            ),
        },
        { title: "已消耗", dataIndex: "spentMicrocredits", align: "right" as const, render: (value: number) => teamCredits(value) },
        { title: "冻结中", dataIndex: "reservedMicrocredits", align: "right" as const, render: (value: number) => teamCredits(value) },
        { title: "订单", dataIndex: "orderCount", align: "right" as const },
    ];
    const breakdownColumns = [
        { title: "类型", dataIndex: "key", render: (value: string) => capabilityLabel(value) },
        { title: "已消耗", dataIndex: "spentMicrocredits", align: "right" as const, render: (value: number) => teamCredits(value) },
        { title: "订单", dataIndex: "orderCount", align: "right" as const },
    ];
    const modelColumns = [
        { title: "模型", dataIndex: "key" },
        { title: "已消耗", dataIndex: "spentMicrocredits", align: "right" as const, render: (value: number) => teamCredits(value) },
        { title: "订单", dataIndex: "orderCount", align: "right" as const },
    ];
    return (
        <div className="space-y-5">
            <PageHeader
                title="用量报表"
                description={owner ? "全团队按成员、能力和模型汇总的积分消耗，数据来自订单结算快照。" : "只显示你自己的消耗；其他成员用量仅团队所有者可见。"}
                actions={<Select aria-label="统计区间" value={days} onChange={setDays} options={ranges} style={{ width: 140 }} />}
            />
            {usage.isError ? (
                <Alert
                    type="error"
                    title={usage.error.message}
                    action={
                        <button type="button" className="underline" onClick={() => void usage.refetch()}>
                            重试
                        </button>
                    }
                />
            ) : null}
            {usage.isPending ? <p role="status">正在汇总用量…</p> : null}
            {report ? (
                <>
                    <div className="grid gap-4 md:grid-cols-3">
                        {[
                            { label: "已消耗", value: teamCredits(report.totals.spentMicrocredits) },
                            { label: "冻结中", value: teamCredits(report.totals.reservedMicrocredits) },
                            { label: "订单数", value: String(report.totals.orderCount) },
                        ].map((item) => (
                            <section key={item.label} className="rounded-xl border border-border bg-background p-4">
                                <p className="text-sm text-foreground/60">{item.label}</p>
                                <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                            </section>
                        ))}
                    </div>
                    <section className="rounded-xl border border-border bg-background p-4">
                        <h2 className="mb-3 font-semibold">每日消耗</h2>
                        {report.days.length === 0 ? (
                            <p className="text-sm text-foreground/60">这段时间还没有消耗。</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {report.days.map((item) => (
                                    <li key={item.day} className="flex items-center gap-3 text-sm">
                                        <span className="w-24 shrink-0 tabular-nums text-foreground/60">{item.day}</span>
                                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
                                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (item.spentMicrocredits / maxDay) * 100)}%` }} />
                                        </span>
                                        <span className="w-24 shrink-0 text-right tabular-nums">{teamCredits(item.spentMicrocredits)}</span>
                                        <span className="w-16 shrink-0 text-right text-xs text-foreground/50">{item.orderCount} 单</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-xl border border-border bg-background p-4">
                            <h2 className="mb-3 font-semibold">按能力</h2>
                            <Table<TeamUsageBreakdown> size="small" rowKey="key" pagination={false} columns={breakdownColumns} dataSource={report.capabilities} locale={{ emptyText: "暂无消耗" }} />
                        </section>
                        <section className="rounded-xl border border-border bg-background p-4">
                            <h2 className="mb-3 font-semibold">按模型</h2>
                            <Table<TeamUsageBreakdown> size="small" rowKey="key" pagination={false} columns={modelColumns} dataSource={report.models} locale={{ emptyText: "暂无消耗" }} />
                        </section>
                    </div>
                    <section className="rounded-xl border border-border bg-background p-4">
                        <h2 className="mb-3 font-semibold">{owner ? "按成员" : "我的消耗"}</h2>
                        <Table<TeamUsageMember> size="small" rowKey="membershipId" pagination={false} columns={memberColumns} dataSource={report.members} locale={{ emptyText: "暂无消耗" }} />
                    </section>
                </>
            ) : null}
        </div>
    );
}
