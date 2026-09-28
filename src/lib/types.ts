/** 共享数据模型：解析层与判断层之间的契约 */

/** 分发方式：闭源交付 / 开源分发 */
export type Distribution = 'closed' | 'open';

/** 判定结论 */
export type Verdict = 'pass' | 'review' | 'block';

/** 人工处理结论：auto 表示沿用自动判定 */
export type Override = 'auto' | Verdict;

/** 依赖作用域 */
export type Scope = 'production' | 'development';

export type DependencyKind = 'direct' | 'transitive';

/** 一个已安装的包实例（同名同版本在不同路径下是不同节点） */
export interface LockNode {
  /** packages 键，即安装路径，如 node_modules/a/node_modules/b */
  id: string;
  name: string;
  version: string;
  /** 展示用安装路径 */
  path: string;
  /** lockfile 中 license/licenses 字段的原始归一化文本 */
  licenseText: string;
  direct: boolean;
  scope: Scope;
  optional: boolean;
}

/** 依赖边：from === '' 表示来自项目根 */
export interface LockEdge {
  from: string;
  to: string;
  optional: boolean;
}

export interface ParseError {
  ok: false;
  error: string;
}

export interface ParsedLock {
  ok: true;
  manifestName: string;
  manifestVersion: string;
  lockfileVersion: number | null;
  rootDeps: Record<string, string>;
  rootDevDeps: Record<string, string>;
  nodes: LockNode[];
  edges: LockEdge[];
  byId: Map<string, LockNode>;
}

export type ParseResult = ParsedLock | ParseError;

/** 许可证大类 */
export type LicenseCategory =
  | 'permissive'
  | 'public-domain'
  | 'attribution'
  | 'weak-copyleft'
  | 'strong-copyleft'
  | 'restricted'
  | 'proprietary'
  | 'unknown';

/** 单个包的审查结论 */
export interface Finding {
  node: LockNode;
  category: LicenseCategory;
  /** 自动判定（尚未叠加人工结论） */
  auto: Verdict;
  reasons: string[];
}

/** 人工处理记录，按 name@version 归档，同包同版本的所有路径共用 */
export interface Decision {
  override: Override;
  note: string;
  updatedAt: string;
}

export interface Gate {
  verdict: Verdict;
  productionBlocked: number;
  productionReview: number;
  developmentBlocked: number;
  total: number;
}
