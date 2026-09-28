import { useRef } from 'react';
import { ClipboardPaste, FileUp, FlaskConical, PackageCheck, Trash2 } from 'lucide-react';
import type { Distribution } from '../lib/types';

interface Props {
  draft: string;
  onDraftChange: (v: string) => void;
  onAnalyze: () => void;
  onLoadSample: () => void;
  onFile: (file: File) => void;
  error: string | null;
  activeSource: string | null;
  savedAt: string | null;
  distribution: Distribution;
  onDistributionChange: (d: Distribution) => void;
  totalNodes: number;
  onClear: () => void;
}

export default function ImportPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasManifest = props.totalNodes > 0;

  return (
    <aside className="panel import-panel">
      <div className="panel-title">
        <h3>导入依赖清单</h3>
        <span>package-lock.json</span>
      </div>

      <textarea
        className="lock-input"
        spellCheck={false}
        placeholder="在此粘贴 package-lock.json 全文……"
        value={props.draft}
        onChange={(e) => props.onDraftChange(e.target.value)}
      />
      {props.error && <div className="parse-error">{props.error}</div>}

      <div className="import-actions">
        <button className="primary" onClick={props.onAnalyze} disabled={!props.draft.trim()}>
          <ClipboardPaste size={15} /> 解析清单
        </button>
        <button onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> 选择文件
        </button>
        <button onClick={props.onLoadSample}>
          <FlaskConical size={15} /> 示例
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <div
        className="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('over');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('over')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('over');
          const f = e.dataTransfer.files?.[0];
          if (f) props.onFile(f);
        }}
      >
        也可把 package-lock.json 拖到这里
      </div>

      {hasManifest && (
        <div className="manifest-meta">
          <PackageCheck size={15} />
          <div>
            <strong>{props.activeSource ?? '当前清单'}</strong>
            <span>
              {props.totalNodes} 个包{props.savedAt ? ` · 已保存 ${formatTime(props.savedAt)}` : ''}
            </span>
          </div>
          <button className="icon-only" title="清除清单与全部结论" onClick={props.onClear}>
            <Trash2 size={15} />
          </button>
        </div>
      )}

      <div className="dist-box">
        <div className="dist-title">分发方式</div>
        <div className="dist-switch" role="radiogroup" aria-label="分发方式">
          <button
            role="radio"
            aria-checked={props.distribution === 'closed'}
            className={props.distribution === 'closed' ? 'active closed' : ''}
            onClick={() => props.onDistributionChange('closed')}
          >
            闭源交付
          </button>
          <button
            role="radio"
            aria-checked={props.distribution === 'open'}
            className={props.distribution === 'open' ? 'active open' : ''}
            onClick={() => props.onDistributionChange('open')}
          >
            开源分发
          </button>
        </div>
        <p className="dist-hint">
          {props.distribution === 'closed'
            ? '闭源交付时，GPL / AGPL 组件阻止放行；弱 Copyleft 与未知许可证进入复核。'
            : '开源分发时强 Copyleft 不再阻断，但未知许可证仍需人工确认。'}
        </p>
      </div>
    </aside>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
