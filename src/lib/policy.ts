/**
 * 判断层：许可证 → 大类 → 自动结论
 *
 * 纯函数模块，不依赖 DOM / React。策略要点：
 *  - 闭源交付：GPL / AGPL 等强 copyleft 阻止放行；LGPL/MPL 等弱 copyleft 进入复核
 *  - 开源分发：强 copyleft 可通过（提示需遵守源代码开放义务）
 *  - 开发工具（仅 development）中的强 copyleft：闭源也降级为复核（不随产物分发）
 *  - 无许可证 / 未知 / 专有：一律进入人工复核
 */
import type {
  Decision,
  Distribution,
  Finding,
  Gate,
  LicenseCategory,
  LockNode,
  Override,
  ParsedLock,
  Verdict,
} from './types';

/* ------------------------- 单个许可证识别 ------------------------- */

interface LeafEval {
  key: string;
  category: LicenseCategory;
  /** 判定时给出的理由 */
  notes: string[];
}

const PERMISSIVE_IDS = new Set([
  'MIT',
  'ISC',
  'BSD-2-CLAUSE',
  'BSD-3-CLAUSE',
  'BSD-4-CLAUSE',
  'APACHE-2.0',
  'APACHE-1.1',
  '0BSD',
  'CC0-1.0',
  'UNLICENSE',
  'WTFPL',
  'X11',
  'ZLIB',
  'PYTHON-2.0',
  'PSF-2.0',
  'POSTGRESQL',
  'BLUEOAK-1.0.0',
  'HL3',
]);

/** 非 SPDX 写法归一化 */
const ALIASES: Record<string, string> = {
  'APACHE': 'Apache-2.0',
  'APACHE LICENSE': 'Apache-2.0',
  'APACHE LICENSE, VERSION 2.0': 'Apache-2.0',
  'APACHE LICENSE V2.0': 'Apache-2.0',
  'APACHE 2': 'Apache-2.0',
  'APACHE2': 'Apache-2.0',
  'APACHE SOFTWARE LICENSE': 'Apache-2.0',
  'THE APACHE SOFTWARE LICENSE, VERSION 2.0': 'Apache-2.0',
  'BSD': 'BSD-3-Clause',
  'NEW BSD LICENSE': 'BSD-3-Clause',
  'REVISED BSD LICENSE': 'BSD-3-Clause',
  'MIT LICENSE': 'MIT',
  'THE MIT LICENSE': 'MIT',
  'MIT/X11': 'MIT',
  'GPL': 'GPL-3.0-only',
  'GPL V2': 'GPL-2.0-only',
  'GPL V3': 'GPL-3.0-only',
  'GPLV2': 'GPL-2.0-only',
  'GPLV3': 'GPL-3.0-only',
  'GPL-2': 'GPL-2.0-only',
  'GPL-3': 'GPL-3.0-only',
  'AGPL': 'AGPL-3.0-only',
  'AGPL V3': 'AGPL-3.0-only',
  'AGPL-3': 'AGPL-3.0-only',
  'LGPL': 'LGPL-3.0-only',
  'LGPL V3': 'LGPL-3.0-only',
  'LGPL-2.1': 'LGPL-2.1-only',
  'MOZILLA PUBLIC LICENSE 2.0': 'MPL-2.0',
  'MPL': 'MPL-2.0',
  'CC-BY': 'CC-BY-4.0',
  'CC BY 4.0': 'CC-BY-4.0',
  'CC-BY-SA': 'CC-BY-SA-4.0',
  'CC BY-SA 4.0': 'CC-BY-SA-4.0',
  'CC0': 'CC0-1.0',
  'CREATIVE COMMONS ZERO': 'CC0-1.0',
  'PUBLIC DOMAIN': 'CC0-1.0',
  'UNLICENSED': 'UNLICENSED',
  'PROPRIETARY': 'PROPRIETARY',
  'COMMERCIAL': 'PROPRIETARY',
};

export function categorizeLicense(id: string): { category: LicenseCategory; canonical: string } {
  const trimmed = id.replace(/[()]/g, '').trim();
  const upper = trimmed.toUpperCase();
  const aliasKey = ALIASES[upper];
  const canonical = aliasKey ?? trimmed;
  const cu = canonical.toUpperCase();

  if (ALIASES[upper] === 'UNLICENSED' || cu === 'UNLICENSED') {
    return { category: 'proprietary', canonical: 'UNLICENSED' };
  }
  if (cu === 'PROPRIETARY' || cu === 'COMMERCIAL' || cu.startsWith('PROPRIETARY')) {
    return { category: 'proprietary', canonical };
  }
  if (/AGPL|AFFERO/.test(cu)) {
    return { category: 'strong-copyleft', canonical };
  }
  if (/LGPL|LESSER/.test(cu)) {
    return { category: 'weak-copyleft', canonical };
  }
  if (/(^|[^A-Z])GPL([^A-Z]|$)/.test(cu) || /GENERAL PUBLIC LICENSE/.test(cu)) {
    return { category: 'strong-copyleft', canonical };
  }
  if (/^MPL-|MOZILLA PUBLIC LICENSE|^EPL-|ECLIPSE PUBLIC LICENSE|^CDDL-|CPL-|^EUPL-/.test(cu)) {
    return { category: 'weak-copyleft', canonical };
  }
  if (PERMISSIVE_IDS.has(cu)) {
    // CC0 在集合里但语义是 public-domain
    if (cu === 'CC0-1.0' || cu === 'PUBLIC-DOMAIN') return { category: 'public-domain', canonical };
    return { category: 'permissive', canonical };
  }
  if (/^CC-BY-SA/.test(cu) || /CC BY-SA/.test(cu)) {
    return { category: 'weak-copyleft', canonical };
  }
  if (/^CC-BY/.test(cu)) {
    return { category: 'attribution', canonical };
  }
  if (/^CC-|CREATIVE COMMONS/.test(cu)) {
    return { category: 'restricted', canonical };
  }
  if (/BUSINESS SOURCE|BUSL|SSPL|ELASTIC|NON-COMMERCIAL|NONCOMMERCIAL|SEE LICENSE/.test(cu)) {
    return { category: 'restricted', canonical };
  }
  return { category: 'unknown', canonical };
}

/* ------------------------- SPDX 表达式 ------------------------- */

type Token =
  | { type: 'id'; value: string }
  | { type: 'and' }
  | { type: 'or' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  const re = /\(|\)|AND|OR|WITH|(?:[^\s()]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    const t = m[0];
    if (t === '(') tokens.push({ type: 'lparen' });
    else if (t === ')') tokens.push({ type: 'rparen' });
    else if (t.toUpperCase() === 'AND') tokens.push({ type: 'and' });
    else if (t.toUpperCase() === 'OR') tokens.push({ type: 'or' });
    else if (t.toUpperCase() === 'WITH') {
      // WITH <exception> 只修饰前一个许可证 id，直接消费掉 exception 标识
      const next = re.exec(expr);
      const prev = tokens[tokens.length - 1];
      if (prev?.type === 'id') prev.value += ` WITH ${next ? next[0] : ''}`;
    } else {
      tokens.push({ type: 'id', value: t });
    }
  }
  return tokens;
}

type ExprNode =
  | { kind: 'leaf'; id: string }
  | { kind: 'and'; children: ExprNode[] }
  | { kind: 'or'; children: ExprNode[] };

/** 递归下降：and 优先级低于 or（SPDX 规则） */
function parseExpression(tokens: Token[]): ExprNode {
  let pos = 0;
  const peek = () => tokens[pos];
  const parseOr = (): ExprNode => {
    const children = [parseAnd()];
    while (peek()?.type === 'or') {
      pos++;
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  };
  const parseAnd = (): ExprNode => {
    const children = [parseAtom()];
    while (peek()?.type === 'and') {
      pos++;
      children.push(parseAtom());
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  };
  const parseAtom = (): ExprNode => {
    const t = peek();
    if (t?.type === 'lparen') {
      pos++;
      const inner = parseOr();
      if (peek()?.type === 'rparen') pos++;
      return inner;
    }
    if (t?.type === 'id') {
      pos++;
      return { kind: 'leaf', id: t.value };
    }
    // 意外 token，跳过避免死循环
    pos++;
    return { kind: 'leaf', id: 'UNKNOWN' };
  };
  return parseOr();
}

/* ------------------------- 判定 ------------------------- */

const CATEGORY_LABEL: Record<LicenseCategory, string> = {
  permissive: '宽松许可',
  'public-domain': '公共领域',
  attribution: '署名许可',
  'weak-copyleft': '弱 Copyleft',
  'strong-copyleft': '强 Copyleft',
  restricted: '受限许可',
  proprietary: '专有/未授权',
  unknown: '未知许可证',
};

function leafEval(id: string, distribution: Distribution): LeafEval {
  const notes: string[] = [];
  let { category, canonical } = categorizeLicense(id);
  const withClasspath = /WITH CLASSPATH-EXCEPTION/i.test(id.toUpperCase());
  if (withClasspath && category === 'strong-copyleft') category = 'weak-copyleft';

  switch (category) {
    case 'permissive':
      notes.push(`${canonical} 是宽松许可证，保留版权与许可声明即可分发`);
      break;
    case 'public-domain':
      notes.push(`${canonical} 表示放弃权利（公共领域），可自由分发`);
      break;
    case 'attribution':
      notes.push(`${canonical} 仅要求署名，分发时保留声明即可`);
      break;
    case 'strong-copyleft':
      notes.push(
        distribution === 'closed'
          ? `${canonical} 属强 Copyleft：衍生作品必须以同一许可证开放源代码，闭源交付不允许`
          : `${canonical} 属强 Copyleft：开源分发可放行，但须完整提供对应源代码`,
      );
      break;
    case 'weak-copyleft':
      notes.push(
        `${canonical} 属弱 Copyleft：动态/独立方式使用通常可行，静态链接或修改需开放相关部分，建议法务确认`,
      );
      break;
    case 'restricted':
      notes.push(`${canonical} 含额外限制条款（如商用/衍生限制），需对照实际使用方式确认`);
      break;
    case 'proprietary':
      notes.push(`${canonical}：未声明开源授权或属专有许可，无明确分发依据`);
      break;
    case 'unknown':
      notes.push(`未能识别许可证标识 “${id}”，需要人工查阅包内 LICENSE 文件`);
      break;
  }
  return { key: canonical, category, notes };
}

const RANK: Record<Verdict, number> = { pass: 0, review: 1, block: 2 };

/** 一个包（可能含 SPDX 表达式）的判定 */
export function evaluateNode(node: LockNode, distribution: Distribution): Finding {
  const reasons: string[] = [];
  const text = node.licenseText.trim();

  let category: LicenseCategory;
  let auto: Verdict;
  if (!text) {
    category = 'unknown';
    auto = 'review';
    reasons.push('该包未声明 license 字段，无授权依据，进入人工复核');
  } else {
    const expr = parseExpression(tokenize(text));
    const leaves = collectLeaves(expr);
    const evals = leaves.map(l => leafEval(l, distribution));
    category = combineCategory(expr, evals);
    auto = combineVerdict(expr, evals, distribution);
    reasons.push(...evals.flatMap(e => e.notes));
  }

  // 开发工具：强 copyleft 在闭源交付下从“阻止”降级为“复核”（不进入分发产物）
  const devBlocked = auto === 'block' && node.scope === 'development';
  if (devBlocked) {
    auto = 'review';
    reasons.push('该包仅在 development 作用域、不随产物分发，由阻止降级为复核（请确认未被打包进交付物）');
  }
  if (node.optional && auto === 'block') {
    reasons.push('该包为可选依赖：如交付形态不安装它可考虑移除，否则仍按阻止处理');
  }

  return { node, category, auto, reasons: dedupe(reasons) };
}

function collectLeaves(node: ExprNode): string[] {
  if (node.kind === 'leaf') return [node.id];
  return node.children.flatMap(collectLeaves);
}

/** AND 取最严，OR 取最宽（按 SPDX 语义：OR 表示可任选其一） */
function combineVerdict(node: ExprNode, evals: LeafEval[], distribution: Distribution): Verdict {
  const vOf = (e: LeafEval): Verdict => verdictOf(e.category, distribution);
  let cursor = 0; // 叶子按 collectLeaves 的 DFS 顺序与 evals 一一对应
  const go = (n: ExprNode): Verdict => {
    if (n.kind === 'leaf') return vOf(evals[cursor++]);
    const vs = n.children.map(go);
    if (n.kind === 'and') return vs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    return vs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
  };
  return go(node);
}

function combineCategory(node: ExprNode, evals: LeafEval[]): LicenseCategory {
  let cursor = 0;
  const go = (n: ExprNode): LicenseCategory => {
    if (n.kind === 'leaf') return evals[cursor++].category;
    const cs = n.children.map(go);
    if (n.kind === 'and') return cs.reduce(worstCategory);
    // OR：取“最可用”的类别
    return cs.reduce(bestCategory);
  };
  return go(node);
}

const CAT_RANK: Record<LicenseCategory, number> = {
  permissive: 0,
  'public-domain': 0,
  attribution: 1,
  'weak-copyleft': 2,
  'strong-copyleft': 3,
  restricted: 4,
  proprietary: 5,
  unknown: 6,
};
function worstCategory(a: LicenseCategory, b: LicenseCategory): LicenseCategory {
  return CAT_RANK[b] > CAT_RANK[a] ? b : a;
}
function bestCategory(a: LicenseCategory, b: LicenseCategory): LicenseCategory {
  return CAT_RANK[b] < CAT_RANK[a] ? b : a;
}

function verdictOf(category: LicenseCategory, distribution: Distribution): Verdict {
  switch (category) {
    case 'permissive':
    case 'public-domain':
    case 'attribution':
      return 'pass';
    case 'strong-copyleft':
      return distribution === 'closed' ? 'block' : 'pass';
    case 'weak-copyleft':
    case 'restricted':
      return 'review';
    case 'proprietary':
    case 'unknown':
      return 'review';
  }
}

export function categoryLabel(c: LicenseCategory): string {
  return CATEGORY_LABEL[c];
}

/* ------------------------- 汇总与闸门 ------------------------- */

export function analyzeAll(parsed: ParsedLock, distribution: Distribution): Finding[] {
  return parsed.nodes.map(n => evaluateNode(n, distribution));
}

export function decisionKey(node: LockNode): string {
  return `${node.name}@${node.version}`;
}

export function effectiveVerdict(auto: Verdict, override: Override): Verdict {
  return override === 'auto' ? auto : override;
}

export function buildGate(findings: Finding[], decisions: Map<string, Decision>): Gate {
  let productionBlocked = 0;
  let productionReview = 0;
  let developmentBlocked = 0;
  for (const f of findings) {
    const dec = decisions.get(decisionKey(f.node));
    const v = effectiveVerdict(f.auto, dec?.override ?? 'auto');
    if (f.node.scope === 'production') {
      if (v === 'block') productionBlocked++;
      if (v === 'review') productionReview++;
    } else if (v === 'block') developmentBlocked++;
  }
  const verdict: Verdict =
    productionBlocked > 0 ? 'block' : productionReview > 0 ? 'review' : 'pass';
  return {
    verdict,
    productionBlocked,
    productionReview,
    developmentBlocked,
    total: findings.length,
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '可放行',
  review: '待复核',
  block: '阻止放行',
};

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
