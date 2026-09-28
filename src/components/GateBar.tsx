import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { GateResult } from '../lib/gate';

export default function GateBar({ gate }: { gate: GateResult }) {
  const cls =
    gate.status === 'pass' ? 'ok' : gate.status === 'blocked' ? 'bad' : 'warn';
  const Icon = gate.status === 'pass' ? ShieldCheck : gate.status === 'blocked' ? ShieldAlert : ShieldQuestion;
  return (
    <section className={`gate ${cls}`}>
      <div className="gate-icon">
        <Icon size={22} />
      </div>
      <div className="gate-body">
        <strong>{gate.title}</strong>
        <span>{gate.message}</span>
      </div>
      <div className="gate-counts">
        {gate.blockers.length > 0 && <em className="bad">{gate.blockers.length} 未处理阻断</em>}
        {gate.approvedBlockers.length > 0 && <em className="warn">{gate.approvedBlockers.length} 已豁免</em>}
        {gate.pendingReviews.length > 0 && <em className="warn">{gate.pendingReviews.length} 待复核</em>}
        {gate.rejected.length > 0 && <em className="bad">{gate.rejected.length} 已驳回</em>}
        {gate.status === 'pass' && <em className="ok">全部处理完成</em>}
      </div>
    </section>
  );
}
