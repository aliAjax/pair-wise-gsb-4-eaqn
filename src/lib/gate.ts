import type { DecisionMap, DispositionKind, Distribution, ReviewRow, RiskLevel } from './types';

/**
 * 放行闸门：综合自动判定结果与人工处理结论，
 * 决定本次分发是否可以放行。
 */

export type GateStatus = 'pass' | 'review-open' | 'blocked';

export interface GateResult {
  status: GateStatus;
  /** 仍在阻止放行的节点（自动 block 未豁免，或被明确驳回） */
  blockers: ReviewRow[];
  /** 等待人工处理的复核项 */
  pendingReviews: ReviewRow[];
  /** 已人工批准（豁免）的阻止项 */
  approvedBlockers: ReviewRow[];
  /** 被驳回、需要移出清单的项 */
  rejected: ReviewRow[];
  title: string;
  message: string;
}

export function evaluateGate(rows: ReviewRow[], decisions: DecisionMap): GateResult {
  const blockers: ReviewRow[] = [];
  const pendingReviews: ReviewRow[] = [];
  const approvedBlockers: ReviewRow[] = [];
  const rejected: ReviewRow[] = [];

  for (const row of rows) {
    const d = decisions[row.node.id]?.kind ?? 'pending';
    if (d === 'rejected') {
      rejected.push(row);
    } else if (row.finding.level === 'block') {
      if (d === 'approved') approvedBlockers.push(row);
      else blockers.push(row);
    } else if (row.finding.level === 'review' && d === 'pending') {
      pendingReviews.push(row);
    }
  }

  let status: GateStatus;
  if (blockers.length > 0 || rejected.length > 0) {
    status = 'blocked';
  } else if (pendingReviews.length > 0) {
    status = 'review-open';
  } else {
    status = 'pass';
  }

  const dist = rows[0]?.finding.distribution ?? ('closed' as Distribution);
  const distLabel = dist === 'closed' ? '闭源交付' : '开源分发';
  const parts: string[] = [];
  if (blockers.length) parts.push(`${blockers.length} 项 GPL/AGPL 冲突未豁免`);
  if (rejected.length) parts.push(`${rejected.length} 项已驳回、须移出清单`);
  if (pendingReviews.length) parts.push(`${pendingReviews.length} 项待复核`);

  let title: string;
  let message: string;
  if (status === 'pass') {
    title = `可以放行 · ${distLabel}`;
    message = `共 ${rows.length} 项依赖，阻止项与复核项均已处理完毕。`;
  } else if (status === 'blocked') {
    title = `阻止放行 · ${distLabel}`;
    message = parts.join('；') + '。';
  } else {
    title = `暂不能放行 · ${distLabel}`;
    message = `无阻断项，但仍有 ${pendingReviews.length} 项待复核，处理完成后方可放行。`;
  }

  return { status, blockers, pendingReviews, approvedBlockers, rejected, title, message };
}

export const DISPOSITION_LABEL: Record<DispositionKind, string> = {
  pending: '待处理',
  approved: '接受 / 豁免',
  rejected: '驳回（须移除）',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  block: '阻止放行',
  review: '需复核',
  pass: '允许',
};
