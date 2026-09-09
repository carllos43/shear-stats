import { create } from "zustand";

export type SyncStatus = "idle" | "saving" | "error";

interface SyncState {
  pending: number;
  failed: number;
  lastError: string | null;
  status: SyncStatus;
  begin: () => void;
  done: () => void;
  fail: (msg: string) => void;
  clearError: () => void;
}

export const useSyncStatus = create<SyncState>((set, get) => ({
  pending: 0,
  failed: 0,
  lastError: null,
  status: "idle",
  begin: () => set((s) => ({ pending: s.pending + 1, status: "saving" })),
  done: () =>
    set((s) => {
      const pending = Math.max(0, s.pending - 1);
      return { pending, status: pending > 0 ? "saving" : s.failed > 0 ? "error" : "idle" };
    }),
  fail: (msg) =>
    set((s) => {
      const pending = Math.max(0, s.pending - 1);
      return { pending, failed: s.failed + 1, lastError: msg, status: "error" };
    }),
  clearError: () => set({ failed: 0, lastError: null, status: get().pending > 0 ? "saving" : "idle" }),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma gravação remota com contador de pendências e até 2 reenvios.
 * Nunca lança: o app é offline-first, o erro fica visível no status.
 */
export async function trackedWrite(label: string, fn: () => Promise<void>): Promise<void> {
  const { begin, done, fail } = useSyncStatus.getState();
  begin();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fn();
      done();
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(600 * (attempt + 1));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.error(`sync ${label}:`, msg);
  fail(msg);
}
