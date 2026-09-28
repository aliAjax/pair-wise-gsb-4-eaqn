import type { DecisionMap, Distribution, ReviewRow } from './types';
import { evaluateGate, RISK_LABEL } from './gate';

/** 生成 Markdown 审查报告（基于当前筛选结果，闸门结论仍按全量计算） */
export function buildReport(
  rows: ReviewRow[],
  allRows: ReviewRow[],
  decisions: DecisionMap,
  dist: Distribution,
  projectName: string,
): string {
  const gate = evaluateGate(allRows, decisions);
  const lines: string[] = [];
  lines.push(`# 依赖许可证审查报告 · ${projectName || '未命名项目'}`);
  lines.push('');
  lines.push(`- 分发方式：**${dist === 'closed' ? '闭源交付' : '开源分发'}**`);
  lines.push(`- 报告范围：当前结果 ${rows.length} 项（全量 ${allRows.length} 项）`);
  lines.push(`- 放行结论：**${gate.title}**`);
  lines.push(`- ${gate.message}`);
  lines.push('');
  lines.push('| 包名 | 版本 | 安装路径 | 类型 | 许可证 | 自动判定 | 处理结论 | 备注 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const depLabel = (r: ReviewRow) =>
    r.node.depType === 'direct-prod'
      ? '直接(生产)'
      : r.node.depType === 'direct-dev'
        ? '直接(开发)'
        : '传递';
  const disp = (r: ReviewRow) => {
    const d = decisions[r.node.id];
    return d ? (d.kind === 'approved' ? '接受/豁免' : d.kind === 'rejected' ? '驳回' : '待处理') : '待处理';
  };
  for (const r of rows) {
    const note = (decisions[r.node.id]?.note ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${r.node.name} | ${r.node.version} | ${r.node.path || '—'} | ${depLabel(r)} | ${r.node.licenseLabel || '(未声明)'} | ${RISK_LABEL[r.finding.level]} | ${disp(r)} | ${note} |`,
    );
  }
  if (gate.blockers.length) {
    lines.push('');
    lines.push('## 未处理的阻断项');
    for (const b of gate.blockers) lines.push(`- ${b.node.name}@${b.node.version}（${b.node.licenseLabel}）— ${b.finding.reasons[0]}`);
  }
  return lines.join('\n');
}

export function downloadText(filename: string, content: string, mime = 'text/markdown'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
