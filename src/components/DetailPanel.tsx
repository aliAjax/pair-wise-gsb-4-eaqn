import { ArrowRight, GitBranch, X } from 'lucide-react';
import type { Disposition, DispositionKind, ReviewRow } from '../lib/types';
import { DISPOSITION_LABEL } from '../lib/gate';
import { levelLabel } from './ResultsList';

interface Props {
  row: ReviewRow | null;
  /** id -> 包名版本，用于渲染引用链上的节点 */
  lookup: (id: string) => ReviewRow | undefined;
  decision: Disposition | undefined;
  onDecide: (kind: DispositionKind) => void;
  onNote: (note: string) => void;
  onClose: () => void;
}

export default function DetailPanel(props: Props) {
  const { row } = props;
  if (!row) {
    return (
      <aside className="panel detail-panel empty-detail">
        <p>点击列表中的任意依赖项，查看完整引用链与判定依据。</p>
        <p className="dim">风险项（阻止 / 复核）建议优先处理。</p>
      </aside>
    );
  }
  const n = row.node;
  const finding = row.finding;
  const kind = props.decision?.kind ?? 'pending';

  return (
    <aside className="panel detail-panel">
      <header className="detail-head">
        <div>
          <span className={`badge ${finding.level}`}>{levelLabel(finding.level)}</span>
          <h3 title={n.path}>{n.name}</h3>
          <span className="mono dim">{n.version}</span>
        </div>
        <button className="icon-only" onClick={props.onClose} title="关闭">
          <X size={17} />
        </button>
      </header>

      <dl className="kv">
        <div>
          <dt>安装路径</dt>
          <dd className="mono path-full">{n.path || '—'}</dd>
        </div>
        <div>
          <dt>许可证</dt>
          <dd className="mono">{n.licenseMissing ? '(锁文件未声明)' : n.licenseLabel}</dd>
        </div>
        <div>
          <dt>依赖类型</dt>
          <dd>
            {n.depType === 'direct-prod'
              ? '直接依赖（生产）'
              : n.depType === 'direct-dev'
                ? '直接依赖（开发）'
                : '传递依赖'}
            {n.scope === 'dev' && ' · 仅构建期，不随产物交付'}
            {n.scope === 'none' && ' · 锁文件内但无引用'}
            {n.optional && ' · optional'}
          </dd>
        </div>
        {n.resolved && (
          <div>
            <dt>来源</dt>
            <dd className="mono resolved" title={n.resolved}>
              {n.resolved}
            </dd>
          </div>
        )}
      </dl>

      <section className="chain-box">
        <h4>
          <GitBranch size={14} /> 完整引用链
        </h4>
        {n.chains.length === 0 ? (
          <p className="dim">未从项目根解析到到达该包的引用路径。</p>
        ) : (
          n.chains.map((chain, i) => (
            <ol className="chain" key={i}>
              <li className="root">项目根</li>
              {chain.map((id, j) => {
                const r = props.lookup(id);
                const isLast = j === chain.length - 1;
                return (
                  <li key={id} className={isLast ? 'target' : ''}>
                    <ArrowRight size={12} className="chain-arrow" />
                    <span className="mono">
                      {r ? r.node.name : id.slice(id.lastIndexOf('node_modules/') + 'node_modules/'.length)}
                      <em>{r ? `@${r.node.version}` : ''}</em>
                    </span>
                    {r && isLast && <span className={`mini-badge ${r.finding.level}`}>{levelLabel(r.finding.level)}</span>}
                  </li>
                );
              })}
            </ol>
          ))
        )}
        {n.parents.length > 0 && (
          <p className="dim direct-parents">直接引用方 {n.parents.length} 个</p>
        )}
      </section>

      <section className="reason-box">
        <h4>判定依据</h4>
        <ul>
          {finding.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
        <p className="dim">分发方式：{finding.distribution === 'closed' ? '闭源交付' : '开源分发'}</p>
      </section>

      <section className="decision-box">
        <h4>处理结论</h4>
        <div className="decision-buttons">
          {(['pending', 'approved', 'rejected'] as DispositionKind[]).map((k) => (
            <button key={k} className={`decision ${kind === k ? 'active' : ''} ${k}`} onClick={() => props.onDecide(k)}>
              {DISPOSITION_LABEL[k]}
            </button>
          ))}
        </div>
        <textarea
          className="note-input"
          placeholder="复核备注（法务意见、授权工单号、整改计划…）"
          value={props.decision?.note ?? ''}
          onChange={(e) => props.onNote(e.target.value)}
        />
        {props.decision?.updatedAt && (
          <span className="dim updated">最近更新：{new Date(props.decision.updatedAt).toLocaleString()}</span>
        )}
      </section>
    </aside>
  );
}
