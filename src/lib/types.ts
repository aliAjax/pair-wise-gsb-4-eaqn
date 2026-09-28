// 依赖审查台的共享数据模型

export type Distribution = 'closed' | 'open';

/** 风险等级：阻止放行 / 人工复核 / 允许 */
export type RiskLevel = 'block' | 'review' | 'pass';

/** 直接（生产）/ 直接（开发）/ 传递 */
export type DepType = 'direct-prod' | 'direct-dev' | 'transitive';

/** 依赖可达范围：随产物交付 / 仅构建期 / 锁文件内但未解析到引用 */
export type Scope = 'prod' | 'dev' | 'none';

export type DispositionKind = 'pending' | 'approved' | 'rejected';

/** 许可证族：宽松 / 弱 Copyleft / 强 Copyleft / 未知 */
export type LicenseClass = 'permissive' | 'weak' | 'strong' | 'unknown';

/** package-lock 中单个条目的原始字段（只保留我们关心的） */
export interface RawEntry {
  version?: string;
  resolved?: string;
  license?: string | { type?: string; url?: string };
  licenses?: Array<string | { type?: string }>;
  dev?: boolean;
  optional?: boolean;
  /** v2/v3 为版本范围；v1 嵌套树为完整的子依赖对象 */
  dependencies?: Record<string, string | RawEntry>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  name?: string;
}

/** 整理后的一个已安装包节点（同一包名不同路径/版本视为不同节点） */
export interface PkgNode {
  /** 安装路径，全局唯一，例如 node_modules/express/node_modules/debug */
  id: string;
  path: string;
  name: string;
  version: string;
  /** 规范化后的许可证原文（SPDX 表达式），缺失时为空串 */
  licenseLabel: string;
  licenseMissing: boolean;
  resolved?: string;
  depType: DepType;
  scope: Scope;
  optional: boolean;
  /** 直接引用方节点 id 列表（根节点用 '' 表示项目本身） */
  parents: string[];
  /** 从项目根到本节点的完整引用链，最多 3 条；每条为节点 id 数组（不含根） */
  chains: string[][];
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  nodes: PkgNode[];
  lockfileVersion?: number;
  projectName: string;
  projectVersion: string;
}

export interface Finding {
  level: RiskLevel;
  licenseClass: LicenseClass;
  /** 判定理由（人类可读，可多条） */
  reasons: string[];
  /** 无法识别的许可证标识 */
  unknownTokens: string[];
  distribution: Distribution;
}

export interface ReviewRow {
  node: PkgNode;
  finding: Finding;
}

export interface Disposition {
  kind: DispositionKind;
  note: string;
  updatedAt: string;
}

export type DecisionMap = Record<string, Disposition>;
