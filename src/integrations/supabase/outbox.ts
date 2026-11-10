/**
 * Fila persistente de gravações que falharam (offline-first).
 * Guardada no aparelho por usuário; reenviada no próximo pull/retry.
 */
export type OutboxOp =
  | { kind: "appt-upsert"; id: string; row: Record<string, unknown> }
  | { kind: "appt-delete"; id: string }
  | { kind: "service-upsert"; id: string; row: Record<string, unknown> }
  | { kind: "service-delete"; id: string }
  | { kind: "profile-upsert"; id: string; row: Record<string, unknown> }
  | { kind: "schedule-upsert"; id: string; rows: Record<string, unknown>[] };

const key = (userId: string) => `barbermetrics-outbox-${userId}`;

export function readOutbox(userId: string): OutboxOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((op) => op && typeof op.id === "string" && typeof op.kind === "string") : [];
  } catch {
    return [];
  }
}

function write(userId: string, ops: OutboxOp[]) {
  if (typeof window === "undefined") return;
  if (ops.length === 0) window.localStorage.removeItem(key(userId));
  else window.localStorage.setItem(key(userId), JSON.stringify(ops));
}

/** Adiciona op; a última op para o mesmo registro substitui as anteriores. */
export function enqueue(userId: string, op: OutboxOp) {
  const entity = op.kind.split("-")[0];
  const ops = readOutbox(userId).filter(
    (o) => !(o.id === op.id && o.kind.startsWith(entity)),
  );
  ops.push(op);
  write(userId, ops);
}

export function removeOp(userId: string, op: OutboxOp) {
  write(
    userId,
    readOutbox(userId).filter((o) => JSON.stringify(o) !== JSON.stringify(op)),
  );
}

/** Marca de qual conta são os dados guardados neste aparelho. */
const OWNER_KEY = "barbermetrics-owner";
export function getDeviceOwner(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(OWNER_KEY);
}
export function setDeviceOwner(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OWNER_KEY, userId);
}
