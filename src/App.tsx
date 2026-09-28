import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  FileLock2,
  FlaskConical,
  FolderTree,
  GitBranch,
  ListFilter,
  Package,
  RotateCcw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type {
  Decision,
  Distribution,
  Finding,
  LockNode,
  Override,
  ParsedLock,
  Verdict,
} from './lib/types';
import { parseLockfile } from './lib/parse-lockfile';
import {
  analyzeAll,
  buildGate,
  categoryLabel,
  decisionKey,
  effectiveVerdict,
  VERDICT_LABEL,
} from './lib/policy';
import { findChains } from './lib/chains';
import { clearAll, loadLockText, loadMeta, saveLockText, saveMeta } from './lib/persistence';
import { SAMPLE_LOCK_TEXT } from './lib/sample-lock';

type FilterKey = 'all' | Verdict;

const BADGE: Record<Verdict, { cls: string; label: string }> = {
  pass: { cls: 'ok', label: '可放行' },
  review: { cls: 'review', label: '待复核' },
  block: { cls: 'risk', label: '阻止放行' },
};

const OVERRIDE_OPTIONS: Array<{ value: Override; label: string }> = [
  { value: 'auto', label: '沿用自动判定' },
  { value: 'pass', label: '人工通过' },
  { value: 'review', label: '转复核' },
  { value: 'block', label: '人工阻止' },
];

export default function App() {
  const initialMeta = useRef(loadMeta());
  const [lockText, setLockText] = useState<string>(() => loadLockText() || SAMPLE_LOCK_TEXT);
  const [distribution, setDistribution] = useState<Distribution>(initialMeta.current.distribution);
  const [decisions, setDecisions] = useState<Record<string, Decision>>(initialMeta.current.decisions);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- 解析层 → 判断层 ---------- */
  const parsed = useMemo(() => parseLockfile(lockText), [lockText]);
  const findings = useMemo(
    () => (parsed.ok ? analyzeAll(parsed, distribution) : []),
    [parsed, distribution],
  );
  const decisionMap = useMemo(() => new Map(Object.entries(decisions)), [decisions]);
  const gate = useMemo(() => buildGate(findings, decisionMap), [findings, decisionMap]);

  const verdictOf = (f: Finding): Verdict =>
    effectiveVerdict(f.auto, decisionMap.get(decisionKey(f.node))?.override ?? 'auto');

  /* ---------- 列表与统计跟随当前结果 ---------- */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter(f => {
      const v = verdictOf(f);
      if (filter !== 'all' && v !== filter) return false;
      if (q && !`${f.node.name} ${f.node.version} ${f.node.path} ${f.node.licenseText}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, filter, query, decisionMap]);

  const stats = useMemo(() => {
    let direct = 0;
    let transitive = 0;
    const byVerdict = { pass: 0, review: 0, block: 0 };
    for (const f of visible) {
      if (f.node.direct) direct++;
      else transitive++;
      byVerdict[verdictOf(f)]++;
    }
    return { total: visible.length, direct, transitive, ...byVerdict };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, decisionMap]);

  const filterCounts = useMemo(() => {
    const c = { all: findings.length, pass: 0, review: 0, block: 0 };
    for (const f of findings) c[verdictOf(f)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, decisionMap]);

  /* ---------- 持久化：处理结论、分发方式、清单文本 ---------- */
  useEffect(() => {
    const r = saveMeta({ distribution, decisions });
    setStorageError(r.ok ? '' : `设置未能保存：${r.error}`);
  }, [distribution, decisions]);
  useEffect(() => {
    const r = saveLockText(lockText);
    if (!r.ok) setStorageError(`清单未能保存（可能超出浏览器存储上限）：${r.error}`);
  }, [lockText]);

  const setDecision = (node: LockNode, patch: Partial<Decision>) => {
    const key = decisionKey(node);
    const prev = decisions[key];
    const next: Decision = {
      override: patch.override ?? prev?.override ?? 'auto',
      note: patch.note ?? prev?.note ?? '',
      updatedAt: new Date().toISOString(),
    };
    setDecisions(d => ({ ...d, [key]: next }));
  };

  const selectedFinding = selectedId ? findings.find(f => f.node.id === selectedId) ?? null : null;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLockText(String(reader.result ?? ''));
      setFilter('all');
    };
    reader.readAsText(file);
  };

  const resetAll = () => {
    if (!window.confirm('将清空当前清单、分发方式与全部处理结论，恢复为内置示例。确定继续？')) return;
    clearAll();
    setDecisions({});
    setDistribution('closed');
    setLockText(SAMPLE_LOCK_TEXT);
    setSelectedId(null);
    setFilter('all');
    setQuery('');
    setStorageError('');
  };

  const exportMarkdown = () => {
    if (!parsed.ok) return;
    const line = (f: Finding) => {
      const v = verdictOf(f);
      const d = decisionMap.get(decisionKey(f.node));
      return `| ${f.node.direct ? '直接' : '传递'} | ${f.node.scope === 'development' ? 'dev' : 'prod'} | ${f.node.name} | ${f.node.version} | ${f.node.licenseText || '(未声明)'} | ${VERDICT_LABEL[v]} | ${d?.note ?? ''} |`;
    };
    const md = [
      '# 依赖许可证审查报告',
      '',
      `- 项目：${parsed.manifestName}${parsed.manifestVersion ? `@${parsed.manifestVersion}` : ''}`,
      `- 分发方式：${distribution === 'closed' ? '闭源交付' : '开源分发'}`,
      `- 放行闸门：${VERDICT_LABEL[gate.verdict]}（生产阻止 ${gate.productionBlocked}，待复核 ${gate.productionReview}，dev 阻止 ${gate.developmentBlocked}）`,
      `- 生成时间：${new Date().toLocaleString()}`,
      '',
      '| 类型 | 作用域 | 包名 | 版本 | 许可证 | 结论 | 备注 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...findings.map(line),
      '',
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = 'license-review.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo"><Scale size={19} /></div>
          <div>
            <h1>License Lens 依赖审查台</h1>
            <small>package-lock.json · 直接与传递依赖许可证审查</small>
          </div>
        </div>
        <div className="top-actions">
          <div className="dist-switch" role="group" aria-label="分发方式">
            <button
              className={distribution === 'closed' ? 'active' : ''}
              onClick={() => setDistribution('closed')}
              title="闭源交付：不提供源代码"
            >
              <FileLock2 size={14} />闭源交付
            </button>
            <button
              className={distribution === 'open' ? 'active' : ''}
              onClick={() => setDistribution('open')}
              title="开源分发：随产物提供源代码"
            >
              <GitBranch size={14} />开源分发
            </button>
          </div>
          <button className="btn" onClick={resetAll}><RotateCcw size={14} />重置</button>
          <button className="btn primary" onClick={exportMarkdown} disabled={!parsed.ok}>
            <Download size={14} />导出报告
          </button>
        </div>
      </header>

      <div className="layout">
        {/* ---------------- 导入面板 ---------------- */}
        <aside className="panel import-panel">
          <h3><Upload size={13} />导入依赖清单</h3>
          <textarea
            className="lock-input"
            spellCheck={false}
            value={lockText}
            onChange={e => setLockText(e.target.value)}
            placeholder="粘贴 package-lock.json 内容…"
          />
          <button
            className={`dropzone${dragOver ? ' dragover' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Package size={16} />
            <span>拖入 package-lock.json，或点击选择文件</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={e => onFile(e.target.files?.[0])}
            />
          </button>
          <div className="import-actions">
            <button className="btn" onClick={() => setLockText(SAMPLE_LOCK_TEXT)}><Sparkles size={14} />载入示例</button>
          </div>

          {parsed.ok ? (
            <div className="manifest-meta">
              <div className="meta-row"><Package size={13} /><b>{parsed.manifestName}</b><span>{parsed.manifestVersion}</span></div>
              <div className="meta-row"><ListFilter size={13} /><span>lockfile v{parsed.lockfileVersion ?? '?'}</span><span>{parsed.nodes.length} 个包实例</span></div>
              <div className="meta-row"><FolderTree size={13} /><span>直接 {parsed.nodes.filter(n => n.direct).length}</span><span>传递 {parsed.nodes.filter(n => !n.direct).length}</span></div>
              <div className="meta-row"><FlaskConical size={13} /><span>dev 作用域 {parsed.nodes.filter(n => n.scope === 'development').length}</span></div>
              <p className="saved-hint">清单、分发方式与处理结论会保留在本浏览器，关闭页面后再打开仍在。</p>
            </div>
          ) : (
            <div className="parse-error"><AlertTriangle size={14} />{parsed.error}</div>
          )}
          {storageError && <div className="storage-error">{storageError}</div>}
        </aside>

        {/* ---------------- 结果区 ---------------- */}
        <main className="panel results-panel">
          {parsed.ok && <GateBanner gate={gate} distribution={distribution} />}

          {parsed.ok && (
            <>
              <section className="stats">
                <StatCard label="当前结果包实例" value={stats.total} sub={`直接 ${stats.direct} · 传递 ${stats.transitive}`} />
                <StatCard label="阻止放行" value={stats.block} tone="bad" icon={<Ban size={15} />} />
                <StatCard label="待复核" value={stats.review} tone="warn" icon={<CircleHelp size={15} />} />
                <StatCard label="可放行" value={stats.pass} tone="good" icon={<ShieldCheck size={15} />} />
              </section>
              <p className="stats-hint">统计与下方列表联动（按当前筛选/搜索结果计算）；放行闸门始终针对完整清单。</p>

              <div className="toolbar">
                <div className="filters">
                  {([
                    ['all', `全部 ${filterCounts.all}`],
                    ['block', `阻止 ${filterCounts.block}`],
                    ['review', `复核 ${filterCounts.review}`],
                    ['pass', `可放行 ${filterCounts.pass}`],
                  ] as Array<[FilterKey, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      className={`chip${filter === key ? ' active' : ''}`}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="search-box">
                  <Search size={14} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索包名 / 版本 / 路径 / 许可证" />
                  {query && <button className="clear-q" onClick={() => setQuery('')}><X size={12} /></button>}
                </div>
              </div>

              <div className="table">
                <div className="t-row t-head">
                  <div>包名 / 路径</div>
                  <div className="col-version">版本</div>
                  <div className="col-kind">类型</div>
                  <div className="col-license">许可证</div>
                  <div className="col-verdict">结论</div>
                  <div className="col-link" />
                </div>
                {visible.map(f => {
                  const v = verdictOf(f);
                  const manual = decisionMap.get(decisionKey(f.node));
                  return (
                    <button key={f.node.id} className="t-row t-body" onClick={() => setSelectedId(f.node.id)}>
                      <div className="pkg-cell">
                        <span className="pkg-name">{f.node.name}</span>
                        <span className="pkg-path" title={f.node.path}>{f.node.path}</span>
                      </div>
                      <div className="col-version version">{f.node.version}</div>
                      <div className="col-kind">
                        <span className={`kind-tag ${f.node.direct ? 'k-direct' : 'k-trans'}`}>
                          {f.node.direct ? '直接' : '传递'}
                        </span>
                        {f.node.scope === 'development' && <span className="kind-tag k-dev">dev</span>}
                        {f.node.optional && <span className="kind-tag k-opt">optional</span>}
                      </div>
                      <div className="col-license license">{f.node.licenseText || <em>未声明</em>}</div>
                      <div className="col-verdict">
                        <span className={`badge ${BADGE[v].cls}`}>
                          {v === 'block' ? <Ban size={11} /> : v === 'review' ? <CircleHelp size={11} /> : <CheckCircle2 size={11} />}
                          {BADGE[v].label}
                        </span>
                        {manual && <span className="manual-dot" title="已有人工处理结论" />}
                      </div>
                      <div className="col-link"><ChevronRight size={15} /></div>
                    </button>
                  );
                })}
                {visible.length === 0 && (
                  <div className="empty">没有匹配当前筛选条件的依赖</div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {selectedFinding && parsed.ok && (
        <DetailDrawer
          parsed={parsed}
          finding={selectedFinding}
          effective={verdictOf(selectedFinding)}
          decision={decisionMap.get(decisionKey(selectedFinding.node)) ?? null}
          distribution={distribution}
          onClose={() => setSelectedId(null)}
          onSetDecision={(patch) => setDecision(selectedFinding.node, patch)}
        />
      )}
    </div>
  );
}

/* ------------------------- 子组件 ------------------------- */

function StatCard({ label, value, sub, tone, icon }: {
  label: string; value: number; sub?: string; tone?: 'good' | 'warn' | 'bad'; icon?: React.ReactNode;
}) {
  return (
    <div className={`stat-card${tone ? ` ${tone}` : ''}`}>
      <small>{icon}{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function GateBanner({ gate, distribution }: { gate: ReturnType<typeof buildGate>; distribution: Distribution }) {
  const tone = gate.verdict === 'block' ? 'risk' : gate.verdict === 'review' ? 'review' : 'ok';
  return (
    <div className={`gate ${tone}`}>
      <div className="gate-icon">
        {gate.verdict === 'block' ? <ShieldAlert size={22} /> : gate.verdict === 'review' ? <CircleHelp size={22} /> : <ShieldCheck size={22} />}
      </div>
      <div className="gate-copy">
        <h2>
          {gate.verdict === 'block'
            ? `禁止放行：生产依赖中有 ${gate.productionBlocked} 个阻断项`
            : gate.verdict === 'review'
              ? `有条件放行：${gate.productionReview} 个包待人工复核`
              : '可以放行：未发现阻断或许可证未知项'}
        </h2>
        <p>
          {gate.verdict === 'block' &&
            `${distribution === 'closed' ? '当前为闭源交付' : '当前为开源分发'}，依赖链中存在 GPL / AGPL 等强 Copyleft 组件，必须移除、替换或取得商业授权后才能发版；${gate.developmentBlocked > 0 ? `另有 ${gate.developmentBlocked} 个阻断项仅在 dev 作用域。` : ''}`}
          {gate.verdict === 'review' &&
            `许可证未知、弱 Copyleft 或专有授权的包需要法务/合规复核，复核通过后可继续发版。${gate.developmentBlocked > 0 ? `dev 作用域还有 ${gate.developmentBlocked} 个阻止项。` : ''}`}
          {gate.verdict === 'pass' &&
            `当前 ${distribution === 'closed' ? '闭源交付' : '开源分发'} 方式下全部 ${gate.total} 个包实例均满足策略，记得保留各许可证声明文本。`}
        </p>
      </div>
    </div>
  );
}

function DetailDrawer({ parsed, finding, effective, decision, distribution, onClose, onSetDecision }: {
  parsed: ParsedLock;
  finding: Finding;
  effective: Verdict;
  decision: Decision | null;
  distribution: Distribution;
  onClose: () => void;
  onSetDecision: (patch: Partial<Decision>) => void;
}) {
  const { node } = finding;
  const chains = useMemo(() => findChains(parsed, node.id), [parsed, node.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <h2>{node.name}</h2>
            <span className="drawer-version">{node.version}</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)"><X size={17} /></button>
        </header>

        <div className="drawer-body">
          <div className="detail-grid">
            <div><small>安装路径</small><code title={node.path}>{node.path}</code></div>
            <div><small>依赖类型</small><span>{node.direct ? '直接依赖' : '传递依赖'}</span></div>
            <div><small>作用域</small><span>{node.scope === 'development' ? 'development（不随产物）' : 'production（随交付分发）'}</span></div>
            <div><small>声明许可证</small><span className="license">{node.licenseText || <em>未声明</em>}</span></div>
            <div><small>许可证归类</small><span>{categoryLabel(finding.category)}</span></div>
            <div><small>分发方式</small><span>{distribution === 'closed' ? '闭源交付' : '开源分发'}</span></div>
          </div>

          <section className="verdict-box">
            <div className="verdict-line">
              <span className={`badge big ${BADGE[effective].cls}`}>
                {effective === 'block' ? <Ban size={13} /> : effective === 'review' ? <CircleHelp size={13} /> : <CheckCircle2 size={13} />}
                {BADGE[effective].label}
              </span>
              {decision?.override && decision.override !== 'auto' && <span className="manual-tag">已人工处理</span>}
            </div>
            <ul className="reasons">
              {finding.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>

          <section className="manual-box">
            <h3><Scale size={13} />处理结论</h3>
            <p className="scope-hint">按 <code>{node.name}@{node.version}</code> 归档，会同时作用于该包此版本的全部安装路径，并在关闭页面后保留。</p>
            <div className="override-row">
              {OVERRIDE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  className={`override-btn ${(decision?.override ?? 'auto') === o.value ? 'active' : ''}`}
                  onClick={() => onSetDecision({ override: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              className="note-input"
              placeholder="复核备注：法务结论、授权依据、豁免说明…"
              value={decision?.note ?? ''}
              onChange={e => onSetDecision({ note: e.target.value })}
            />
            {decision?.updatedAt && (
              <small className="updated-at">最近更新：{new Date(decision.updatedAt).toLocaleString()}</small>
            )}
          </section>

          <section className="chains-box">
            <h3><GitBranch size={13} />完整引用链（{chains.chains.length}）</h3>
            {chains.chains.length === 0 ? (
              <p className="chain-empty">未找到从项目根到该包的引用路径（可能是孤儿包，或只被可选/开发路径引用）。</p>
            ) : (
              <>
                {chains.chains.map((chain, i) => (
                  <div className="chain" key={i}>
                    {chain.map((step, j) => {
                      const isLast = j === chain.length - 1;
                      return (
                        <div className="chain-step" key={j}>
                          {j > 0 && <ChevronRight size={12} className="chain-arrow" />}
                          <span className={`chain-dot ${isLast ? 'target' : ''} ${step.node?.direct ? 'direct' : ''}`} />
                          {step.node === null ? (
                            <span className="chain-node root">项目根</span>
                          ) : (
                            <span className={`chain-node ${isLast ? 'target' : ''}`} title={step.node.path}>
                              <b>{step.node.name}</b>@{step.node.version}
                              {step.node.direct && <i className="mini-tag">直接</i>}
                              {step.node.scope === 'development' && <i className="mini-tag dev">dev</i>}
                              {step.edgeOptional && <i className="mini-tag opt">可选边</i>}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {chains.truncated && <p className="chain-trunc">引用路径较多，仅展示前 30 条。</p>}
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
