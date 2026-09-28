import { AlertOctagon, HelpCircle, CheckCircle2, Search } from 'lucide-react';
import type { DepType, ReviewRow, RiskLevel } from '../lib/types';

export type RiskFilter = 'all' | RiskLevel;
export type TypeFilter = 'all' | DepType;

interface Props {
  rows: ReviewRow[];
  totalCount: number;
  risk: RiskFilter;
  type: TypeFilter;
  query: string;
  selectedId: string | null;
  onRisk: (f: RiskFilter) => void;
  onType: (t: TypeFilter) => void;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  counts: Record<RiskFilter, number>;
}

const RISK_TABS: Array<{ key: RiskFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'block', label: '阻止' },
  { key: 'review', label: '复核' },
  { key: 'pass', label: '允许' },
];

const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部依赖' },
  { key: 'direct-prod', label: '直接·生产' },
  { key: 'direct-dev', label: '直接·开发' },
  { key: 'transitive', label: '传递' },
];

export default function ResultsList(props: Props) {
  const { rows } = props;
  return (
    <section className="panel results">
      <div className="results-head">
        <div className="risk-tabs">
          {RISK_TABS.map((t) => (
            <button
              key={t.key}
              className={`risk-tab ${props.risk === t.key ? 'active' : ''} ${t.key}`}
              onClick={() => props.onRisk(t.key)}
            >
              {t.label}
              <span>{props.counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={15} />
          <input
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            placeholder="搜索包名 / 路径 / 许可证…"
          />
        </div>
      </div>

      <div className="type-tabs">
        {TYPE_TABS.map((t) => (
          <button
            key={t.key}
            className={props.type === t.key ? 'active' : ''}
            onClick={() => props.onType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="list-head row-grid">
        <span>包名</span>
        <span>版本</span>
        <span>许可证</span>
        <span>类型</span>
        <span>结论</span>
      </div>

      <div className="list-body">
        {rows.length === 0 && <div className="list-empty">没有匹配的依赖项</div>}
        {rows.map((r) => (
          <button
            key={r.node.id}
            className={`row-grid dep-row ${props.selectedId === r.node.id ? 'selected' : ''}`}
            onClick={() => props.onSelect(r.node.id)}
          >
            <span className="pkg-cell">
              <LevelIcon level={r.finding.level} />
              <span className="pkg-copy">
                <strong title={r.node.path}>{r.node.name}</strong>
                <small className="path" title={r.node.path}>
                  {shortPath(r.node.path)}
                </small>
              </span>
            </span>
            <span className="mono ver">{r.node.version}</span>
            <span className="mono lic" title={r.node.licenseLabel}>
              {r.node.licenseMissing ? <i className="missing">(未声明)</i> : r.node.licenseLabel}
            </span>
            <span className="type-cell">
              <span className={`dep-tag ${r.node.depType}`}>{depLabel(r.node.depType)}</span>
              {r.node.scope === 'dev' && <i className="scope-tag dev">仅构建</i>}
              {r.node.scope === 'none' && <i className="scope-tag none">无引用</i>}
            </span>
            <span>
              <span className={`badge ${r.finding.level}`}>{levelLabel(r.finding.level)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function depLabel(t: DepType): string {
  return t === 'direct-prod' ? '直接·生产' : t === 'direct-dev' ? '直接·开发' : '传递';
}

export function levelLabel(l: RiskLevel): string {
  return l === 'block' ? '阻止放行' : l === 'review' ? '需复核' : '允许';
}

function shortPath(p: string): string {
  if (!p) return '—';
  return p.startsWith('node_modules/') ? p.slice('node_modules/'.length) : p;
}

function LevelIcon({ level }: { level: RiskLevel }) {
  if (level === 'block') return <AlertOctagon size={16} className="level-icon bad" />;
  if (level === 'review') return <HelpCircle size={16} className="level-icon warn" />;
  return <CheckCircle2 size={16} className="level-icon good" />;
}
