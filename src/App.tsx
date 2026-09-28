import { useEffect, useMemo, useState } from 'react';
import { FileDown, Scale } from 'lucide-react';
import type { DecisionMap, DispositionKind, Distribution, ReviewRow } from './lib/types';
import { parseLock } from './lib/parseLock';
import { evaluateNode } from './lib/policy';
import { evaluateGate } from './lib/gate';
import { loadState, saveState, clearState } from './lib/storage';
import { buildReport, downloadText } from './lib/report';
import { SAMPLE_LOCK, SAMPLE_NAME } from './lib/sample';
import ImportPanel from './components/ImportPanel';
import GateBar from './components/GateBar';
import StatsBar from './components/StatsBar';
import ResultsList, { type RiskFilter, type TypeFilter } from './components/ResultsList';
import DetailPanel from './components/DetailPanel';

export default function App() {
  const persisted = useMemo(loadState, []);
  const [rawLock, setRawLock] = useState<string | null>(persisted.rawLock);
  const [sourceName, setSourceName] = useState<string | null>(persisted.sourceName);
  const [draft, setDraft] = useState<string>(persisted.rawLock ?? '');
  const [distribution, setDistribution] = useState<Distribution>(persisted.distribution);
  const [decisions, setDecisions] = useState<DecisionMap>(persisted.decisions);
  const [savedAt, setSavedAt] = useState<string | null>(persisted.savedAt || null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [risk, setRisk] = useState<RiskFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 解析层：对清单原文做结构化整理
  const parsed = useMemo(() => (rawLock ? parseLock(rawLock) : null), [rawLock]);

  // 判断层：结构化结果 + 分发方式 -> 自动判定
  const allRows: ReviewRow[] = useMemo(() => {
    if (!parsed?.ok) return [];
    return parsed.nodes.map((node) => ({ node, finding: evaluateNode(node, distribution).finding }));
  }, [parsed, distribution]);

  const rowById = useMemo(() => new Map(allRows.map((r) => [r.node.id, r])), [allRows]);
  const gate = useMemo(() => evaluateGate(allRows, decisions), [allRows, decisions]);

  // 持久化：清单、分发方式、处理结论
  useEffect(() => {
    if (rawLock === null) return;
    try {
      const at = new Date().toISOString();
      saveState({ rawLock, sourceName, distribution, decisions });
      setSavedAt(at);
    } catch (e) {
      setToast((e as Error).message);
    }
  }, [rawLock, sourceName, distribution, decisions]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // 重新导入后，若选中项不存在则清空
  useEffect(() => {
    if (selectedId && !rowById.has(selectedId)) setSelectedId(null);
  }, [rowById, selectedId]);

  // 统计与风险 tab 计数跟随当前搜索/类型结果
  const scopedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (type !== 'all' && r.node.depType !== type) return false;
      if (q) {
        const hay = `${r.node.name} ${r.node.path} ${r.node.licenseLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, type, query]);

  const counts = useMemo(() => {
    const c: Record<RiskFilter, number> = { all: scopedRows.length, pass: 0, review: 0, block: 0 };
    for (const r of scopedRows) c[r.finding.level] += 1;
    return c;
  }, [scopedRows]);

  const visibleRows = useMemo(
    () => (risk === 'all' ? scopedRows : scopedRows.filter((r) => r.finding.level === risk)),
    [scopedRows, risk],
  );

  const applyManifest = (text: string, name: string) => {
    const result = parseLock(text);
    if (!result.ok) {
      setParseError(result.error ?? '解析失败');
      setDraft(text);
      return;
    }
    setParseError(null);
    setRawLock(text);
    setSourceName(name);
    setDraft(text);
    setToast(`解析完成：${result.nodes.length} 个包${result.lockfileVersion ? `（lockfileVersion ${result.lockfileVersion}）` : ''}`);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => applyManifest(String(reader.result ?? ''), file.name);
    reader.onerror = () => setParseError('文件读取失败');
    reader.readAsText(file);
  };

  const decide = (kind: DispositionKind) => {
    if (!selectedId) return;
    setDecisions((prev) => {
      const next = { ...prev };
      const prevNote = next[selectedId]?.note ?? '';
      if (kind === 'pending') delete next[selectedId];
      else next[selectedId] = { kind, note: prevNote, updatedAt: new Date().toISOString() };
      return next;
    });
  };

  const updateNote = (note: string) => {
    if (!selectedId) return;
    setDecisions((prev) => ({
      ...prev,
      [selectedId]: {
        kind: prev[selectedId]?.kind ?? 'pending',
        note,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const clearAll = () => {
    if (!window.confirm('确定清除当前清单与全部处理结论？此操作不可恢复。')) return;
    clearState();
    setRawLock(null);
    setSourceName(null);
    setDraft('');
    setDecisions({});
    setSelectedId(null);
    setSavedAt(null);
    setParseError(null);
  };

  const exportReport = () => {
    if (!allRows.length) return;
    const md = buildReport(visibleRows, allRows, decisions, distribution, parsed?.projectName ?? '');
    downloadText(`license-review-${new Date().toISOString().slice(0, 10)}.md`, md);
    setToast(`已导出 ${visibleRows.length} 项的 Markdown 报告`);
  };

  const selectedRow = selectedId ? rowById.get(selectedId) ?? null : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Scale size={19} />
          </div>
          <div>
            <h1>License Lens</h1>
            <small>依赖许可证审查台</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={exportReport} disabled={!allRows.length}>
            <FileDown size={15} /> 导出 Markdown
          </button>
        </div>
      </header>

      {allRows.length > 0 && <GateBar gate={gate} />}

      {allRows.length > 0 && <StatsBar rows={visibleRows} total={allRows.length} />}

      <div className="workspace">
        <ImportPanel
          draft={draft}
          onDraftChange={setDraft}
          onAnalyze={() => applyManifest(draft, sourceName ?? '粘贴的 package-lock.json')}
          onLoadSample={() => applyManifest(SAMPLE_LOCK, SAMPLE_NAME)}
          onFile={handleFile}
          error={parseError}
          activeSource={sourceName}
          savedAt={savedAt}
          distribution={distribution}
          onDistributionChange={setDistribution}
          totalNodes={allRows.length}
          onClear={clearAll}
        />

        {allRows.length === 0 ? (
          <section className="panel hero panel-empty">
            <div className="hero-mark">
              <Scale size={26} />
            </div>
            <h2>发版前的依赖审查台</h2>
            <p>
              粘贴或导入 <code>package-lock.json</code>，按包名、版本和安装路径整理直接与传递依赖；
              闭源交付碰到 GPL / AGPL 会阻止放行，未知许可证进入人工复核。
            </p>
            <ul>
              <li>点击任意风险项查看完整引用链与判定依据</li>
              <li>列表与统计实时跟随筛选结果</li>
              <li>处理结论、分发方式和清单会保存在浏览器，关掉再打开仍在</li>
            </ul>
            <button className="primary" onClick={() => applyManifest(SAMPLE_LOCK, SAMPLE_NAME)}>
              加载示例清单看看
            </button>
          </section>
        ) : (
          <ResultsList
            rows={visibleRows}
            totalCount={allRows.length}
            risk={risk}
            type={type}
            query={query}
            selectedId={selectedId}
            onRisk={setRisk}
            onType={setType}
            onQuery={setQuery}
            onSelect={setSelectedId}
            counts={counts}
          />
        )}

        {allRows.length > 0 && (
          <DetailPanel
            row={selectedRow}
            lookup={(id) => rowById.get(id)}
            decision={selectedId ? decisions[selectedId] : undefined}
            onDecide={decide}
            onNote={updateNote}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
