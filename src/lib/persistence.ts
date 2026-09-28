/**
 * 持久化：处理结论、分发方式、导入的清单文本，关掉页面再打开仍然保留。
 * 全部存 localStorage，仅这一个模块接触存储 API。
 */
import type { Decision, Distribution } from './types';

const META_KEY = 'license-lens:meta:v1';
const LOCK_KEY = 'license-lens:lockfile:v1';

export interface PersistedMeta {
  distribution: Distribution;
  decisions: Record<string, Decision>;
}

export function loadMeta(): PersistedMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { distribution: 'closed', decisions: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedMeta>;
    return {
      distribution: parsed.distribution === 'open' ? 'open' : 'closed',
      decisions: parsed.decisions ?? {},
    };
  } catch {
    return { distribution: 'closed', decisions: {} };
  }
}

export function saveMeta(meta: PersistedMeta): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function loadLockText(): string {
  try {
    return localStorage.getItem(LOCK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLockText(text: string): { ok: boolean; error?: string } {
  try {
    if (text) localStorage.setItem(LOCK_KEY, text);
    else localStorage.removeItem(LOCK_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function clearAll(): void {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}
