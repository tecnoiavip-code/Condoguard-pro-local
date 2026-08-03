// Local persistent job store for device sync.
// Survives navigating away from the Devices page; cleared on browser close.
// Works as a singleton across React mounts via window globals.

export type SyncJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface SyncJobState {
  status: SyncJobStatus;
  message: string;
  total: number;
  current: number;
  photosSynced: number;
  tagsSynced: number;
  errors: number;
  startedAt?: number;
  finishedAt?: number;
}

const STORAGE_KEY = 'devices_sync_job_v1';
const LISTENERS: Set<(s: SyncJobState) => void> = new Set();

const defaultState: SyncJobState = {
  status: 'idle',
  message: '',
  total: 0,
  current: 0,
  photosSynced: 0,
  tagsSynced: 0,
  errors: 0,
};

export function getSyncJobState(): SyncJobState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

export function setSyncJobState(patch: Partial<SyncJobState>) {
  const next = { ...getSyncJobState(), ...patch };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  LISTENERS.forEach((cb) => {
    try { cb(next); } catch { /* ignore */ }
  });
  // Cross-tab notify
  try {
    window.dispatchEvent(new CustomEvent('sync-job-update', { detail: next }));
  } catch { /* ignore */ }
}

export function resetSyncJob() {
  setSyncJobState({ ...defaultState });
}

export function subscribeSyncJob(cb: (s: SyncJobState) => void): () => void {
  LISTENERS.add(cb);
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as SyncJobState;
    if (detail) cb(detail);
  };
  window.addEventListener('sync-job-update', onEvent);
  return () => {
    LISTENERS.delete(cb);
    window.removeEventListener('sync-job-update', onEvent);
  };
}

// Singleton flag: prevent starting two syncs at once across mounts.
const RUNNING_FLAG = '__devicesSyncRunning__';
export function isSyncRunning(): boolean {
  return !!(window as any)[RUNNING_FLAG];
}
export function markSyncRunning(running: boolean) {
  (window as any)[RUNNING_FLAG] = running;
}
