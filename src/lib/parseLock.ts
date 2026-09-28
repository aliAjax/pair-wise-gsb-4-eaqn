import type { DepType, ParseResult, PkgNode, RawEntry, Scope } from './types';

/**
 * 解析层：只负责把 package-lock.json 整理成依赖事实，
 * 不做任何许可证判断（策略见 policy.ts）。
 * 支持 lockfileVersion 1 / 2 / 3。
 */

interface FlatEntry {
  path: string; // 例如 node_modules/a/node_modules/b，根节点为 ''
  name: string;
  version: string;
  raw: RawEntry;
}

type EdgeKind = 'prod' | 'dev' | 'optional';

interface Edge {
  kind: EdgeKind;
}

const ROOT = '';

export function parseLock(text: string): ParseResult {
  let lock: any;
  try {
    lock = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}`, nodes: [], projectName: '', projectVersion: '' };
  }
  if (typeof lock !== 'object' || lock === null) {
    return { ok: false, error: '文件内容不是合法的对象结构', nodes: [], projectName: '', projectVersion: '' };
  }

  const version: number | undefined = typeof lock.lockfileVersion === 'number' ? lock.lockfileVersion : undefined;

  let entries: FlatEntry[];
  let v1Edges: RawEdge[] = [];
  let v1RootDeps: { name: string; kind: EdgeKind }[] = [];
  if (lock.packages && typeof lock.packages === 'object') {
    // v2/v3：扁平的 packages 表
    entries = flattenPackages(lock.packages as Record<string, RawEntry>);
  } else if (lock.dependencies && typeof lock.dependencies === 'object') {
    // v1：嵌套的 dependencies 树
    const v1 = flattenV1Deps(lock.dependencies as Record<string, RawEntry>);
    entries = v1.entries;
    v1Edges = v1.edges;
    v1RootDeps = v1.rootDeps;
  } else {
    return {
      ok: false,
      error: '未找到 packages 或 dependencies 字段，请确认是 npm 生成的 package-lock.json',
      nodes: [],
      projectName: typeof lock.name === 'string' ? lock.name : '',
      projectVersion: typeof lock.version === 'string' ? lock.version : '',
      lockfileVersion: version,
    };
  }

  const rootRaw: RawEntry = (lock.packages && lock.packages[ROOT]) || {};
  const byId = new Map<string, FlatEntry & { node: PkgNode }>();

  // 根节点（项目本身）不进入依赖列表，但参与建图
  for (const e of entries) {
    const lic = readLicense(e.raw);
    const node: PkgNode = {
      id: e.path,
      path: e.path,
      name: e.name,
      version: e.version || '—',
      licenseLabel: lic.label,
      licenseMissing: lic.missing,
      resolved: e.raw.resolved,
      depType: 'transitive',
      scope: 'none',
      optional: Boolean(e.raw.optional),
      parents: [],
      chains: [],
    };
    byId.set(e.path, { ...e, node });
  }

  // ---- 建边：owner -> 它声明依赖并解析到的实际安装路径 ----
  const adj = new Map<string, Map<string, Edge>>();
  const ensure = (id: string) => {
    let m = adj.get(id);
    if (!m) {
      m = new Map();
      adj.set(id, m);
    }
    return m;
  };
  const addEdge = (owner: string, dep: string, kind: EdgeKind) => {
    const resolvedId = resolveId(owner, dep, byId);
    if (resolvedId === undefined) {
      // 锁文件里缺失（平台不匹配的 optional 二进制很常见），不建边
      return;
    }
    const m = ensure(owner);
    const prev = m.get(resolvedId);
    // prod 优先于 dev 优先于 optional
    const rank: Record<EdgeKind, number> = { prod: 3, dev: 2, optional: 1 };
    if (!prev || rank[kind] > rank[prev.kind]) m.set(resolvedId, { kind });
  };

  // 项目根的依赖（v1：顶层 dependencies 树；v2/v3：packages[""] 的声明）
  for (const dep of Object.keys(rootRaw.dependencies ?? {})) addEdge(ROOT, dep, 'prod');
  for (const dep of Object.keys(rootRaw.devDependencies ?? {})) addEdge(ROOT, dep, 'dev');
  for (const dep of Object.keys(rootRaw.optionalDependencies ?? {})) addEdge(ROOT, dep, 'optional');
  for (const d of v1RootDeps) addEdge(ROOT, d.name, d.kind);

  // 各包自身的依赖
  for (const e of entries) {
    const deps = e.raw.dependencies ?? {};
    for (const [dep, spec] of Object.entries(deps)) {
      if (typeof spec === 'string') addEdge(e.path, dep, 'prod');
    }
    for (const dep of Object.keys(e.raw.optionalDependencies ?? {})) addEdge(e.path, dep, 'optional');
    // v1 树里 devDependencies 可能嵌套出现，一并处理
    const devDeps = e.raw.devDependencies ?? {};
    for (const [dep, spec] of Object.entries(devDeps)) {
      if (typeof spec === 'string') addEdge(e.path, dep, 'dev');
    }
  }
  // v1：依赖边直接由嵌套目录结构给出
  for (const edge of v1Edges) addEdge(edge.owner, edge.dep, edge.kind);

  // ---- 可达性：从根按边类型扩散 ----
  const reachable = (allowDev: boolean) => {
    const seen = new Set<string>([ROOT]);
    const queue = [ROOT];
    while (queue.length) {
      const id = queue.shift()!;
      const m = adj.get(id);
      if (!m) continue;
      for (const [to, edge] of m) {
        if (edge.kind === 'dev' && !allowDev) continue;
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    seen.delete(ROOT);
    return seen;
  };
  const prodReach = reachable(false);
  const allReach = reachable(true);

  // ---- 直接依赖 & 入边 ----
  const rootEdges = adj.get(ROOT);
  const directProd = new Set<string>();
  const directDev = new Set<string>();
  if (rootEdges) {
    for (const [to, edge] of rootEdges) {
      if (edge.kind === 'prod' || edge.kind === 'optional') directProd.add(to);
      if (edge.kind === 'dev') directDev.add(to);
    }
  }
  // 反向邻接表：to -> from 集合，供引用链计算复用
  const reverse = new Map<string, string[]>();
  for (const [from, m] of adj) {
    if (from === ROOT) continue;
    for (const to of m.keys()) {
      byId.get(to)?.node.parents.push(from);
      const list = reverse.get(to);
      if (list) list.push(from);
      else reverse.set(to, [from]);
    }
  }
  // 根的直接子项也要有「来自根」的反向边
  if (rootEdges) {
    for (const to of rootEdges.keys()) {
      const list = reverse.get(to);
      if (list) {
        if (!list.includes(ROOT)) list.push(ROOT);
      } else reverse.set(to, [ROOT]);
    }
  }

  // ---- 引用链（从根到节点的多条最短路径） ----
  for (const e of entries) {
    const n = byId.get(e.path)!;
    const scope: Scope = prodReach.has(e.path) ? 'prod' : allReach.has(e.path) ? 'dev' : 'none';
    let depType: DepType;
    if (directProd.has(e.path)) depType = 'direct-prod';
    else if (directDev.has(e.path)) depType = 'direct-dev';
    else depType = 'transitive';
    n.node.scope = scope;
    n.node.depType = depType;
    if (scope !== 'none') n.node.chains = findChains(e.path, adj, reverse);
  }

  const nodes = entries
    .map((e) => byId.get(e.path)!.node)
    .sort((a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.path.localeCompare(b.path),
    );

  return {
    ok: true,
    nodes,
    lockfileVersion: version,
    projectName: (rootRaw.name as string) || (typeof lock.name === 'string' ? lock.name : ''),
    projectVersion: (rootRaw.version as string) || (typeof lock.version === 'string' ? lock.version : ''),
  };
}

/* ------------------------- 扁平化 ------------------------- */

function flattenPackages(packages: Record<string, RawEntry>): FlatEntry[] {
  const out: FlatEntry[] = [];
  for (const [path, raw] of Object.entries(packages)) {
    if (path === ROOT || !raw || typeof raw !== 'object') continue;
    if (!path.startsWith('node_modules/')) continue;
    const name = nameFromPath(path);
    out.push({ path, name, version: String(raw.version ?? ''), raw });
  }
  return out;
}

interface RawEdge {
  owner: string;
  dep: string;
  kind: EdgeKind;
}

function flattenV1Deps(deps: Record<string, RawEntry>): {
  entries: FlatEntry[];
  edges: RawEdge[];
  rootDeps: { name: string; kind: EdgeKind }[];
} {
  const out: FlatEntry[] = [];
  const edges: RawEdge[] = [];
  const rootDeps: { name: string; kind: EdgeKind }[] = [];
  const walk = (
    map: Record<string, RawEntry>,
    parentDir: string,
    parentPath: string,
    parentKind: EdgeKind | null,
  ) => {
    for (const [name, raw] of Object.entries(map)) {
      if (!raw || typeof raw !== 'object') continue;
      const path = parentDir ? `${parentDir}/node_modules/${name}` : `node_modules/${name}`;
      out.push({ path, name, version: String(raw.version ?? ''), raw });
      if (parentKind) {
        if (parentPath === ROOT) rootDeps.push({ name, kind: parentKind });
        else edges.push({ owner: parentPath, dep: name, kind: parentKind });
      }
      if (raw.dependencies) walk(raw.dependencies as Record<string, RawEntry>, path, path, 'prod');
      if (raw.devDependencies) walk(raw.devDependencies as Record<string, RawEntry>, path, path, 'dev');
      if (raw.optionalDependencies)
        walk(raw.optionalDependencies as Record<string, RawEntry>, path, path, 'optional');
    }
  };
  walk(deps, '', ROOT, null);
  // v1 顶层包：dev 标记的视为开发直接依赖，否则生产直接依赖
  for (const [name, raw] of Object.entries(deps)) {
    rootDeps.push({ name, kind: raw && raw.dev ? 'dev' : 'prod' });
  }
  return { entries: out, edges, rootDeps };
}

/** 从安装路径取包名（末段 node_modules/ 之后的部分，scope 包为两段） */
function nameFromPath(path: string): string {
  const rest = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  return rest;
}

/**
 * npm 提升规则下的路径解析：从依赖声明方目录向上逐级查找
 * node_modules/<dep>。
 */
function resolveId(
  ownerId: string,
  dep: string,
  byId: Map<string, unknown>,
): string | undefined {
  const candidates: string[] = [];
  if (ownerId === ROOT) {
    candidates.push(depPath(ROOT, dep));
  } else {
    const parts = ownerId.split('/');
    for (let i = parts.length; i >= 0; i--) {
      const base = parts.slice(0, i).join('/');
      candidates.push(depPath(base, dep));
    }
  }
  for (const c of candidates) {
    if (byId.has(c)) return c;
  }
  return undefined;
}

function depPath(baseDir: string, dep: string): string {
  return baseDir ? `${baseDir}/node_modules/${dep}` : `node_modules/${dep}`;
}

/* ------------------------- 引用链 ------------------------- */

const MAX_CHAINS = 3;

/** BFS 得最短长度后，沿反向邻接表做受限 DFS，收集最多 MAX_CHAINS 条不同的最短链 */
function findChains(
  target: string,
  adj: Map<string, Map<string, Edge>>,
  reverse: Map<string, string[]>,
): string[][] {
  // dist[to] = 从根到 to 的最短边数
  const dist = new Map<string, number>([[ROOT, 0]]);
  const queue = [ROOT];
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    for (const to of adj.get(id)?.keys() ?? []) {
      if (!dist.has(to)) {
        dist.set(to, d + 1);
        queue.push(to);
      }
    }
  }
  const targetDist = dist.get(target);
  if (targetDist === undefined) return [];

  const results: string[][] = [];
  const dfs = (node: string, acc: string[], seen: Set<string>) => {
    if (results.length >= MAX_CHAINS) return;
    if (node === ROOT) {
      results.push([...acc].reverse());
      return;
    }
    const nd = dist.get(node)!;
    const predecessors = (reverse.get(node) ?? []).filter((p) => dist.get(p) === nd - 1).sort();
    for (const p of predecessors) {
      if (seen.has(p)) continue;
      const isRoot = p === ROOT;
      if (!isRoot) {
        seen.add(p);
        acc.push(p);
      }
      dfs(p, acc, seen);
      if (!isRoot) {
        acc.pop();
        seen.delete(p);
      }
      if (results.length >= MAX_CHAINS) return;
    }
  };
  dfs(target, [target], new Set([target]));
  return results;
}

/* ------------------------- 许可证原文 ------------------------- */

function readLicense(raw: RawEntry): { label: string; missing: boolean } {
  const l = raw.license;
  if (typeof l === 'string' && l.trim()) return { label: l.trim(), missing: false };
  if (l && typeof l === 'object' && typeof l.type === 'string' && l.type.trim()) {
    return { label: l.type.trim(), missing: false };
  }
  // 老格式：licenses: [{ type: 'MIT' }]
  if (Array.isArray(raw.licenses) && raw.licenses.length) {
    const types = raw.licenses
      .map((x) => (typeof x === 'string' ? x : x?.type))
      .filter((x): x is string => Boolean(x && x.trim()));
    if (types.length) return { label: types.join(' OR '), missing: false };
  }
  return { label: '', missing: true };
}
