/**
 * 解析层：package-lock.json → 包节点 + 依赖图
 *
 * 支持 npm lockfileVersion 1 / 2 / 3：
 *  - v2/v3：读取 packages 映射（安装路径、scope、license、依赖）
 *  - v1  ：读取 dependencies 树，递归重建
 *
 * 该模块只负责“事实”，不做任何许可证好坏判断。
 */
import type { LockEdge, LockNode, ParseResult, ParsedLock, Scope } from './types';

interface RawPackage {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: string | Array<string | { type?: string }>;
  dev?: boolean;
  devOptional?: boolean;
  optional?: boolean;
  peer?: boolean;
  bundled?: boolean;
  link?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  requires?: Record<string, string>;
}

/** 从 packages 键还原包名：node_modules/foo 或 node_modules/@scope/bar */
export function packageNameFromKey(key: string): string | null {
  const m = key.match(/(?:^|node_modules\/)((?:@[^/]+\/)?[^/]+)$/);
  return m ? m[1] : null;
}

/** 从 package.json 风格的 license/licenses 字段提取许可证文本 */
function extractLicense(raw: RawPackage): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    else if (v && typeof v === 'object' && 'type' in v && typeof (v as { type?: unknown }).type === 'string') {
      const t = (v as { type: string }).type.trim();
      if (t) parts.push(t);
    }
  };
  push(raw.license);
  if (Array.isArray(raw.licenses)) raw.licenses.forEach(push);
  else if (typeof raw.licenses === 'string') push(raw.licenses);
  return parts.join(' OR ');
}

/** 按 npm 规则解析某个包对 name 的依赖到具体安装路径 */
function resolveInstall(parentKey: string, name: string, byKey: Map<string, RawPackage>): string | null {
  // 从自身目录开始逐级向上查找 node_modules（包含全局根）
  const dirs: string[] = [];
  if (parentKey === '') {
    dirs.push('');
  } else {
    const segs = parentKey.split('/node_modules/');
    dirs.push(segs.join('/node_modules/'));
    for (let i = segs.length - 1; i >= 1; i--) dirs.push(segs.slice(0, i).join('/node_modules/'));
    dirs.push('');
  }
  for (const dir of dirs) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    const hit = byKey.get(candidate);
    if (hit && hit.link === false) return candidate;
    if (hit && hit.link === undefined) return candidate;
  }
  return null;
}

function parseV2Plus(pkg: Record<string, unknown>): ParsedLock {
  const rawPackages = (pkg.packages ?? {}) as Record<string, RawPackage>;
  const root = (rawPackages[''] ?? {}) as RawPackage;
  const byKey = new Map<string, RawPackage>();
  for (const [key, raw] of Object.entries(rawPackages)) if (key !== '') byKey.set(key, raw);

  const rootDeps = root.dependencies ?? {};
  const rootDevDeps = root.devDependencies ?? {};
  const directNames = new Set([
    ...Object.keys(rootDeps),
    ...Object.keys(rootDevDeps),
    ...Object.keys(root.optionalDependencies ?? {}),
  ]);

  const nodes: LockNode[] = [];
  for (const [key, raw] of byKey.entries()) {
    const name = raw.name ?? packageNameFromKey(key);
    if (!name || raw.link === true) continue;
    // 跳过没有版本号的陈旧/占位条目（workspace 根、空节点等）
    const version = raw.version ?? '';
    if (!version) continue;
    const isDirect = directNames.has(name) && resolveInstall('', name, byKey) === key;
    const scope: Scope = raw.dev === true || raw.devOptional === true ? 'development' : 'production';
    nodes.push({
      id: key,
      name,
      version,
      path: key,
      licenseText: extractLicense(raw),
      direct: isDirect,
      scope,
      optional: raw.optional === true,
    });
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.path.localeCompare(b.path));

  const edges: LockEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (from: string, depName: string, optional: boolean, parent: RawPackage) => {
    const target = resolveInstall(from, depName, byKey);
    if (!target) return;
    const sig = `${from}->${target}`;
    if (seenEdges.has(sig)) return;
    seenEdges.add(sig);
    // 只在 optionalDependencies 里出现才计为可选边
    const onlyOptional =
      optional && !Object.prototype.hasOwnProperty.call(parent.dependencies ?? {}, depName);
    edges.push({ from, to: target, optional: onlyOptional });
  };

  // 根依赖（区分生产 / 开发）
  for (const depName of Object.keys(rootDeps)) addEdge('', depName, false, root);
  for (const depName of Object.keys(root.optionalDependencies ?? {})) addEdge('', depName, true, root);
  for (const depName of Object.keys(rootDevDeps)) addEdge('', depName, false, root);

  for (const [key, raw] of byKey.entries()) {
    for (const depName of Object.keys(raw.dependencies ?? {})) addEdge(key, depName, false, raw);
    for (const depName of Object.keys(raw.optionalDependencies ?? {})) addEdge(key, depName, true, raw);
    for (const depName of Object.keys(raw.peerDependencies ?? {})) {
      const inOptional = Object.prototype.hasOwnProperty.call(raw.optionalDependencies ?? {}, depName);
      if (!inOptional) addEdge(key, depName, false, raw);
    }
  }

  return finalize(pkg, (pkg.lockfileVersion as number) ?? null, rootDeps, rootDevDeps, nodes, edges);
}

/** v1：dependencies 树递归，节点 id 用安装路径，与 v2+ 统一 */
function parseV1(pkg: Record<string, unknown>): ParsedLock {
  const rawDeps = (pkg.dependencies ?? {}) as Record<string, RawPackage>;
  const nodes: LockNode[] = [];
  const edges: LockEdge[] = [];
  const seenNode = new Set<string>();
  const seenEdge = new Set<string>();

  const walk = (tree: Record<string, RawPackage>, parentKey: string, parentScope: Scope) => {
    for (const [name, entry] of Object.entries(tree)) {
      const key = parentKey === '' ? `node_modules/${name}` : `${parentKey}/node_modules/${name}`;
      const version = entry.version ?? '';
      if (version && !seenNode.has(key)) {
        seenNode.add(key);
        const scope: Scope =
          entry.dev === true || entry.devOptional === true
            ? 'development'
            : parentScope;
        nodes.push({
          id: key,
          name,
          version,
          path: key,
          licenseText: extractLicense(entry),
          direct: parentKey === '',
          scope,
          optional: entry.optional === true,
        });
      }
      if (version && !seenEdge.has(`${parentKey}->${key}`)) {
        seenEdge.add(`${parentKey}->${key}`);
        edges.push({ from: parentKey, to: key, optional: entry.optional === true });
      }
      if (entry.dependencies) {
        walk(entry.dependencies as unknown as Record<string, RawPackage>, key, entry.dev ? 'development' : parentScope);
      }
    }
  };
  walk(rawDeps, '', 'production');
  nodes.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return finalize(pkg, 1, (pkg.requires as Record<string, string>) ?? {}, {}, nodes, edges);
}

function finalize(
  pkg: Record<string, unknown>,
  lockfileVersion: number | null,
  rootDeps: Record<string, string>,
  rootDevDeps: Record<string, string>,
  nodes: LockNode[],
  edges: LockEdge[],
): ParsedLock {
  const byId = new Map<string, LockNode>();
  for (const n of nodes) byId.set(n.id, n);
  // 只保留两端都存在的边
  const cleanEdges = edges.filter(e => (e.from === '' || byId.has(e.from)) && byId.has(e.to));
  return {
    ok: true,
    manifestName: typeof pkg.name === 'string' ? pkg.name : '(unknown project)',
    manifestVersion: typeof pkg.version === 'string' ? pkg.version : '',
    lockfileVersion,
    rootDeps,
    rootDevDeps,
    nodes,
    edges: cleanEdges,
    byId,
  };
}

export function parseLockfile(text: string): ParseResult {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return { ok: false, error: '文件内容不是有效的 package-lock.json 对象' };
  }
  if (pkg.packages && typeof pkg.packages === 'object') {
    try {
      return parseV2Plus(pkg);
    } catch (e) {
      return { ok: false, error: `lockfile v2/v3 解析失败：${(e as Error).message}` };
    }
  }
  if (pkg.dependencies && typeof pkg.dependencies === 'object') {
    try {
      return parseV1(pkg);
    } catch (e) {
      return { ok: false, error: `lockfile v1 解析失败：${(e as Error).message}` };
    }
  }
  return { ok: false, error: '未找到 packages 或 dependencies 字段，请确认这是 npm 生成的 package-lock.json' };
}
