import type { Distribution, Finding, LicenseClass, PkgNode, RiskLevel } from './types';

/**
 * 判断层：把解析层得到的依赖事实 + 当前分发方式，
 * 判定为「阻止放行 / 需复核 / 允许」。本文件不含任何 DOM 逻辑。
 */

/* ----------------------- 许可证标识归一化 ----------------------- */

const ALIASES: Record<string, string> = {
  MIT: 'MIT',
  ISC: 'ISC',
  APACHE: 'Apache-2.0',
  APACHE2: 'Apache-2.0',
  'APACHE-2': 'Apache-2.0',
  'APACHE-2.0': 'Apache-2.0',
  BSD: 'BSD-3-Clause',
  'BSD-2-CLAUSE': 'BSD-2-Clause',
  'BSD-3-CLAUSE': 'BSD-3-Clause',
  'MPL-1.1': 'MPL-1.1',
  'MPL-2.0': 'MPL-2.0',
  UNLICENSED: 'UNLICENSED',
  PROPRIETARY: 'PROPRIETARY',
};

function canonical(raw: string): string {
  const t = raw.trim();
  if (ALIASES[t.toUpperCase()]) return ALIASES[t.toUpperCase()];
  // "Apache License 2.0" 这类自由文本
  if (/apache/i.test(t) && /2(\.0)?/.test(t)) return 'Apache-2.0';
  if (/^bsd/i.test(t) && /2|two/i.test(t)) return 'BSD-2-Clause';
  if (/^bsd/i.test(t)) return 'BSD-3-Clause';
  if (/^mit(\b|$)/i.test(t)) return 'MIT';
  if (/^isc(\b|$)/i.test(t)) return 'ISC';
  return t;
}

/* ----------------------- 许可证族分类 ----------------------- */

const PERMISSIVE = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'Python-2.0',
  'Artistic-2.0',
  'Zlib',
  'WTFPL',
]);

const WEAK_COPYLEFT = new Set([
  'LGPL-2.0-only',
  'LGPL-2.0-or-later',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MPL-1.1',
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
]);

const STRONG_PREFIXES = [/^AGPL-/i, /^GPL-/i, /^GNU\s+GPL/i, /^GNU\s+Affero/i];
const WEAK_PREFIXES = [/^LGPL-/i, /^GNU\s+LGPL/i, /^MPL-/i, /^EPL-/i, /^CDDL-/i];
const PROPRIETARY_TOKENS = new Set(['PROPRIETARY', 'UNLICENSED', 'COMMERCIAL', 'SEE LICENSE IN LICENSE']);

export interface LicenseVerdict {
  cls: LicenseClass;
  /** GPL-3.0-only 归一为 GPL / AGPL / LGPL / MPL...，用于文案 */
  family: string;
  isAgpl: boolean;
  /** 原始标识无法识别 */
  unknown: boolean;
  proprietary: boolean;
}

export function classifyToken(rawToken: string): LicenseVerdict {
  const t = canonical(rawToken);
  const up = t.toUpperCase();

  if (PROPRIETARY_TOKENS.has(up) || /^licen[sc]e-ref/i.test(t) || /^licen[sc]e:/i.test(t)) {
    return { cls: 'unknown', family: 'proprietary', isAgpl: false, unknown: false, proprietary: true };
  }
  if (PERMISSIVE.has(t)) {
    return { cls: 'permissive', family: t, isAgpl: false, unknown: false, proprietary: false };
  }
  if (WEAK_COPYLEFT.has(t) || WEAK_PREFIXES.some((re) => re.test(t))) {
    return { cls: 'weak', family: familyName(t), isAgpl: false, unknown: false, proprietary: false };
  }
  if (STRONG_PREFIXES.some((re) => re.test(t))) {
    return { cls: 'strong', family: familyName(t), isAgpl: /AGPL|Affero/i.test(t), unknown: false, proprietary: false };
  }
  return { cls: 'unknown', family: t || '(none)', isAgpl: false, unknown: true, proprietary: false };
}

function familyName(t: string): string {
  if (/AGPL|Affero/i.test(t)) return 'AGPL';
  if (/LGPL/i.test(t)) return 'LGPL';
  if (/^GPL|GNU GPL/i.test(t)) return 'GPL';
  if (/MPL/i.test(t)) return 'MPL';
  if (/EPL/i.test(t)) return 'EPL';
  if (/CDDL/i.test(t)) return 'CDDL';
  return t;
}

/* ----------------------- SPDX 表达式 ----------------------- */

type Tok = string;
type NodeExpr =
  | { kind: 'leaf'; token: string; plus: boolean }
  | { kind: 'and'; children: NodeExpr[] }
  | { kind: 'or'; children: NodeExpr[] };

function tokenize(expr: string): Tok[] {
  return expr
    .replace(/\(|\)/g, (m) => ` ${m} `)
    .split(/\s+/)
    .filter(Boolean);
}

/** 递归下降：orExpr := andExpr ('OR' andExpr)*；andExpr := atom ('AND' atom)*；atom := leaf | '(' orExpr ')' */
function parseExpression(tokens: Tok[]): NodeExpr {
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseAtom = (): NodeExpr => {
    if (peek() === '(') {
      consume();
      const inner = parseOr();
      if (peek() === ')') consume();
      return inner;
    }
    let token = consume() ?? '';
    let plus = false;
    if (token.endsWith('+')) {
      plus = true;
      token = token.slice(0, -1);
    }
    // leaf WITH Exception -> 异常标记并入 token，由上层识别
    if (peek()?.toUpperCase() === 'WITH') {
      consume();
      const exc = consume() ?? '';
      token = `${token}<<<WITH>>>${exc}`;
    }
    return { kind: 'leaf', token, plus };
  };
  const parseAnd = (): NodeExpr => {
    const children = [parseAtom()];
    while (peek()?.toUpperCase() === 'AND') {
      consume();
      children.push(parseAtom());
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  };
  const parseOr = (): NodeExpr => {
    const children = [parseAnd()];
    while (peek()?.toUpperCase() === 'OR') {
      consume();
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  };

  return parseOr();
}

const LINK_EXCEPTION = /classpath|GCC-exception|linking-exception|lgpl/i;
const BLOB: Record<RiskLevel, number> = { pass: 0, review: 1, block: 2 };
const LEVEL_NAME: Record<RiskLevel, string> = { pass: '允许', review: '复核', block: '阻止' };

interface LeafResult {
  level: RiskLevel;
  cls: LicenseClass;
  verdict: LicenseVerdict;
  exception: boolean;
}

function evalLeaf(node: { token: string; plus: boolean }, dist: Distribution): LeafResult {
  let token = node.token;
  let exception = false;
  const withIdx = token.indexOf('<<<WITH>>>');
  if (withIdx >= 0) {
    const exc = token.slice(withIdx + '<<<WITH>>>'.length);
    token = token.slice(0, withIdx);
    exception = LINK_EXCEPTION.test(exc);
  }
  const verdict = classifyToken(token);
  let level: RiskLevel;

  if (verdict.proprietary) {
    level = 'review';
  } else if (verdict.cls === 'permissive') {
    level = 'pass';
  } else if (verdict.cls === 'strong') {
    if (dist === 'closed') level = exception ? 'review' : 'block';
    else level = 'pass';
  } else if (verdict.cls === 'weak') {
    level = dist === 'closed' ? 'review' : 'pass';
  } else {
    level = 'review';
  }
  return { level, cls: verdict.cls, verdict, exception };
}

function evalExpr(expr: NodeExpr, dist: Distribution): { level: RiskLevel; leaves: LeafResult[] } {
  if (expr.kind === 'leaf') {
    const r = evalLeaf(expr, dist);
    return { level: r.level, leaves: [r] };
  }
  const subs = expr.children.map((c) => evalExpr(c, dist));
  const leaves = subs.flatMap((s) => s.leaves);
  const level =
    expr.kind === 'or'
      ? subs.reduce((min, s) => (BLOB[s.level] < BLOB[min] ? s.level : min), subs[0].level)
      : subs.reduce((max, s) => (BLOB[s.level] > BLOB[max] ? s.level : max), subs[0].level);
  return { level, leaves };
}

/* ----------------------- 节点级判定 ----------------------- */

export interface Evaluation {
  finding: Finding;
  /** 表达式被拆出的所有许可证标识（用于展示） */
  tokens: string[];
}

export function evaluateNode(node: PkgNode, dist: Distribution): Evaluation {
  const reasons: string[] = [];
  const unknownTokens: string[] = [];

  if (node.licenseMissing || !node.licenseLabel.trim()) {
    reasons.push('锁文件未提供许可证标识，无法自动判断，需要法务/维护方核实。');
    return {
      finding: { level: 'review', licenseClass: 'unknown', reasons, unknownTokens: ['(无)'], distribution: dist },
      tokens: [],
    };
  }

  const expr = parseExpression(tokenize(node.licenseLabel));
  const { level: exprLevel, leaves } = evalExpr(expr, dist);
  const tokens = leaves.map((l) => l.verdict.family);
  let level = exprLevel;

  for (const l of leaves) {
    const v = l.verdict;
    if (v.unknown) unknownTokens.push(v.family);
    if (v.proprietary) {
      reasons.push(`专有许可证标识「${node.licenseLabel}」：须确认商业授权与再分发条款。`);
      continue;
    }
    if (v.cls === 'strong' && dist === 'closed') {
      reasons.push(
        `${v.family} 属强 Copyleft：${v.isAgpl ? 'AGPL 覆盖网络交互场景，' : ''}闭源交付时衍生作品须以相同许可证开源，与闭源分发冲突。`,
      );
      if (l.exception) reasons.push('表达式带链接例外（如 Classpath），可能缓解部分义务，仍需法务确认。');
    } else if (v.cls === 'strong') {
      reasons.push(`${v.family} 为强 Copyleft；当前按开源分发评估，注意开源义务与许可证兼容。`);
    } else if (v.cls === 'weak' && dist === 'closed') {
      reasons.push(`${v.family} 为弱 Copyleft：闭源交付须允许用户替换该库并开放对其的修改，需要确认集成方式。`);
    } else if (v.cls === 'permissive') {
      reasons.push(`${v.family} 为宽松许可证：保留版权与许可声明即可分发。`);
    } else if (v.unknown) {
      reasons.push(`未识别的许可证标识「${v.family}」，需核对 LICENSE 全文。`);
    }
  }
  if (expr.kind === 'or') reasons.push('SPDX "OR" 表示可在多个许可证中择一适用，已按对当前分发最有利的选择初判。');
  if (expr.kind === 'and') reasons.push('SPDX "AND" 表示须同时满足全部许可证义务。');

  // 构建期依赖（dev-only）不会进入交付物：闭源下由阻止降为复核
  if (level === 'block' && node.scope === 'dev') {
    level = 'review';
    reasons.push('该包仅出现在开发依赖链上、不会随产物交付，默认不阻断放行；仍建议确认构建流程不外泄。');
  }
  if (node.scope === 'none') {
    reasons.push('锁文件中存在但未从项目依赖解析到引用（常见于平台不匹配的 optional 二进制）。');
  }

  // 总体许可证族按最严格的叶子归类
  const worstCls: LicenseClass = leaves.some((l) => l.cls === 'strong')
    ? 'strong'
    : leaves.some((l) => l.cls === 'weak')
      ? 'weak'
      : leaves.some((l) => l.cls === 'permissive')
        ? 'permissive'
        : 'unknown';

  return {
    finding: {
      level,
      licenseClass: worstCls,
      reasons: dedupe(reasons),
      unknownTokens: [...new Set(unknownTokens)],
      distribution: dist,
    },
    tokens,
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

export const LEVEL_LABEL: Record<RiskLevel, string> = LEVEL_NAME;
