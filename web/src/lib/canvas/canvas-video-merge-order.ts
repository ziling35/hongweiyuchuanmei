import type { CanvasNodeData } from "@/types/canvas";

/**
 * 合并的默认顺序：镜头号 → 画布纵坐标 → 横坐标。
 * 与历史行为一致，只作为合并前排序面板的初始值，用户可以在面板里调整。
 */
export function defaultMergeOrder(nodes: readonly CanvasNodeData[]): string[] {
    return [...nodes]
        .sort((left, right) => {
            const leftShot = left.metadata?.shotIndex ?? Number.MAX_SAFE_INTEGER;
            const rightShot = right.metadata?.shotIndex ?? Number.MAX_SAFE_INTEGER;
            return leftShot - rightShot || left.position.y - right.position.y || left.position.x - right.position.x;
        })
        .map((node) => node.id);
}

/** 把某一项上移/下移一位；越界时返回原顺序的副本，调用方不必自己判断边界。 */
export function moveMergeOrderItem<T extends { id: string }>(items: readonly T[], id: string, delta: -1 | 1): T[] {
    const index = items.findIndex((item) => item.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= items.length) return [...items];
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
}

/** 按给定 id 顺序取节点；顺序里没有的节点按原顺序补在后面，避免漏拼。 */
export function orderNodesByIds<T extends { id: string }>(nodes: readonly T[], order: readonly string[]): T[] {
    const remaining = new Map(nodes.map((node) => [node.id, node] as const));
    const ordered: T[] = [];
    for (const id of order) {
        const node = remaining.get(id);
        if (!node) continue;
        ordered.push(node);
        remaining.delete(id);
    }
    for (const node of remaining.values()) ordered.push(node);
    return ordered;
}
