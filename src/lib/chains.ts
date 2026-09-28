/**
 * 引用链：基于解析层产出的依赖图，给出某个包从项目根出发的完整路径。
 * 根 → 直接依赖 → … → 目标包；同时展示每条边是否可选。
 */
import type { LockEdge, LockNode, ParsedLock } from './types';

export interface ChainStep {
  /** null 表示项目根 */
  node: LockNode | null;
  /** 进入该节点的边是否为可选依赖 */
  edgeOptional: boolean;
}

export interface ChainResult {
  chains: ChainStep[][];
  /** 因数量/深度上限被截断 */
  truncated: boolean;
  reachableFromRoot: boolean;
}

const MAX_CHAINS = 30;
const MAX_DEPTH = 14;
const MAX_VISITS = 6000;

export function buildParents(edges: LockEdge[]): Map<string, Array<{ parent: string; optional: boolean }>> {
  const map = new Map<string, Array<{ parent: string; optional: boolean }>>();
  for (const e of edges) {
    const list = map.get(e.to) ?? [];
    list.push({ parent: e.from, optional: e.optional });
    map.set(e.to, list);
  }
  return map;
}

export function findChains(parsed: ParsedLock, targetId: string): ChainResult {
  if (!parsed.byId.has(targetId)) return { chains: [], truncated: false, reachableFromRoot: false };

  const parents = buildParents(parsed.edges);
  const chains: ChainStep[][] = [];
  let truncated = false;
  let visits = 0;

  /**
   * @param id 当前向上遍历到的节点
   * @param downSteps 从 id 的下一跳到目标的步骤（根→目标顺序）
   */
  const dfs = (id: string, downSteps: ChainStep[], visited: Set<string>, depth: number) => {
    if (chains.length >= MAX_CHAINS || visits > MAX_VISITS) {
      truncated = true;
      return;
    }
    visits++;
    const ups = parents.get(id) ?? [];
    for (const up of ups) {
      if (chains.length >= MAX_CHAINS) {
        truncated = true;
        return;
      }
      const extended: ChainStep[] = [
        { node: parsed.byId.get(id)!, edgeOptional: up.optional },
        ...downSteps,
      ];
      if (up.parent === '') {
        chains.push([{ node: null, edgeOptional: false }, ...extended]);
        continue;
      }
      if (visited.has(up.parent)) continue; // 环保护
      if (depth + 1 > MAX_DEPTH) {
        truncated = true;
        continue;
      }
      dfs(up.parent, extended, new Set(visited).add(up.parent), depth + 1);
    }
  };

  dfs(targetId, [], new Set([targetId]), 0);
  return { chains, truncated, reachableFromRoot: chains.length > 0 };
}
