import type { ReviewRow } from '../lib/types';

interface Props {
  rows: ReviewRow[];
  total: number;
}

/** 统计卡片跟随当前筛选结果 */
export default function StatsBar({ rows, total }: Props) {
  const count = (lvl: ReviewRow['finding']['level']) => rows.filter((r) => r.finding.level === lvl).length;
  const pass = count('pass');
  const review = count('review');
  const block = count('block');
  return (
    <section className="stats">
      <div className="metric">
        <small>当前结果</small>
        <b>
          {rows.length}
          <em> / {total}</em>
        </b>
      </div>
      <div className="metric">
        <small>允许</small>
        <b className="good">{pass}</b>
      </div>
      <div className="metric">
        <small>需复核</small>
        <b className="warn">{review}</b>
      </div>
      <div className="metric">
        <small>阻止放行</small>
        <b className="bad">{block}</b>
      </div>
    </section>
  );
}
