import type { DecisionMap, Distribution } from './types';

/**
 * 持久化层：处理结论、分发方式与当前清单关掉页面后仍保留。
 * 清单以原始文本存储，重新打开后重新解析，保证判断逻辑可复现。
 */

const KEY = 'license-lens-console-v1';

export interface PersistShape {
  rawLock: string | null;
  sourceName: string | null;
  distribution: Distribution;
  decisions: DecisionMap;
  savedAt: string;
}

const DEFAULTS: PersistShape = {
  rawLock: null,
  sourceName: null,
  distribution: 'closed',
  decisions: {},
  savedAt: '',
};

export function loadState(): PersistShape {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return { ...DEFAULTS };
    const parsed = JSON.parse(text) as Partial<PersistShape>;
    return {
      rawLock: typeof parsed.rawLock === 'string' ? parsed.rawLock : null,
      sourceName: typeof parsed.sourceName === 'string' ? parsed.sourceName : null,
      distribution: parsed.distribution === 'open' ? 'open' : 'closed',
      decisions: parsed.decisions && typeof parsed.decisions === 'object' ? parsed.decisions : {},
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveState(state: Omit<PersistShape, 'savedAt'> & { savedAt?: string }): void {
  const next: PersistShape = { ...state, savedAt: state.savedAt ?? new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    // 锁文件过大等原因写入失败时给出可识别错误
    throw new Error(`本地保存失败：${(e as Error).message}`);
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY);
}
