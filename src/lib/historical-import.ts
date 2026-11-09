import { supabase } from "@/integrations/supabase/client";
import { useAppStore, type Appointment } from "@/store/app-store";
import { invalidatePullCache } from "@/integrations/supabase/sync";

/**
 * Importação retroativa de faturamento (ago–out/2026).
 * Cada semana é distribuída igualitariamente de segunda a sábado,
 * com o ajuste de centavos no sábado para fechar o valor exato.
 * Registros são marcados como históricos (is_historical) e NÃO contam
 * como clientes reais, ticket médio ou produtividade.
 */

export interface HistoricalWeek {
  label: string; // ex.: "Agosto · Semana 1"
  month: "agosto" | "setembro" | "outubro";
  weekIndex: number; // 1..5
  monday: string; // YYYY-MM-DD
  total: number; // faturamento semanal em R$
}

export const HISTORICAL_WEEKS: HistoricalWeek[] = [
  // Agosto (semana 5 = transição ago/set, confirmada pelo usuário)
  { label: "Agosto · Semana 1", month: "agosto", weekIndex: 1, monday: "2026-08-03", total: 816.0 },
  { label: "Agosto · Semana 2", month: "agosto", weekIndex: 2, monday: "2026-08-10", total: 945.0 },
  { label: "Agosto · Semana 3", month: "agosto", weekIndex: 3, monday: "2026-08-17", total: 759.0 },
  { label: "Agosto · Semana 4", month: "agosto", weekIndex: 4, monday: "2026-08-24", total: 770.0 },
  { label: "Agosto · Semana 5", month: "agosto", weekIndex: 5, monday: "2026-08-31", total: 615.0 },
  // Setembro (datas informadas: 05/09, 12/09, 19/09, 26/09, 28/09)
  { label: "Setembro · Semana 1", month: "setembro", weekIndex: 1, monday: "2026-08-31", total: 816.6 },
  { label: "Setembro · Semana 2", month: "setembro", weekIndex: 2, monday: "2026-09-07", total: 683.0 },
  { label: "Setembro · Semana 3", month: "setembro", weekIndex: 3, monday: "2026-09-14", total: 789.0 },
  { label: "Setembro · Semana 4", month: "setembro", weekIndex: 4, monday: "2026-09-21", total: 885.0 },
  { label: "Setembro · Semana 5", month: "setembro", weekIndex: 5, monday: "2026-09-28", total: 1053.0 },
  // Outubro (5ª semana entra em novembro)
  { label: "Outubro · Semana 1", month: "outubro", weekIndex: 1, monday: "2026-10-05", total: 1146.0 },
  { label: "Outubro · Semana 2", month: "outubro", weekIndex: 2, monday: "2026-10-12", total: 1053.0 },
  { label: "Outubro · Semana 3", month: "outubro", weekIndex: 3, monday: "2026-10-19", total: 846.0 },
  { label: "Outubro · Semana 4", month: "outubro", weekIndex: 4, monday: "2026-10-26", total: 858.0 },
  { label: "Outubro · Semana 5", month: "outubro", weekIndex: 5, monday: "2026-11-02", total: 816.0 },
];

export const HISTORICAL_SERVICE_NAME = "Atendimento histórico consolidado";
export const HISTORICAL_NOTE = "Importação histórica";

/** Divide o total semanal em 6 dias (seg–sáb); o sábado absorve os centavos. */
export function splitWeek(total: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / 6);
  const days = new Array(6).fill(base) as number[];
  days[5] = cents - base * 5; // sábado fecha o valor exato
  return days.map((c) => c / 100);
}

function addDaysISO(monday: string, offset: number): string {
  const [y, m, d] = monday.split("-").map(Number);
  const dt = new Date(y, m - 1, d + offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** UUID determinístico (hash da chave) — reimportar nunca duplica. */
function deterministicId(key: string): string {
  // cyrb53 duplo para preencher 16 bytes
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < key.length; i++) {
      const ch = key.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  };
  const hex = (h(0) + h(1)).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export interface HistoricalRecord {
  id: string;
  date: string; // YYYY-MM-DD
  weekLabel: string;
  price: number;
}

/** Gera todos os registros (90 = 15 semanas × 6 dias), com IDs estáveis. */
export function buildHistoricalRecords(userId: string): HistoricalRecord[] {
  const out: HistoricalRecord[] = [];
  for (const w of HISTORICAL_WEEKS) {
    const days = splitWeek(w.total);
    for (let i = 0; i < 6; i++) {
      const date = addDaysISO(w.monday, i);
      out.push({
        id: deterministicId(`${userId}|${w.month}|${w.weekIndex}|${date}`),
        date,
        weekLabel: w.label,
        price: days[i],
      });
    }
  }
  return out;
}

export interface ImportPreview {
  records: HistoricalRecord[];
  totalRecords: number;
  monthlyTotals: { month: string; total: number }[];
  grandTotal: number;
}

export function buildPreview(userId: string): ImportPreview {
  const records = buildHistoricalRecords(userId);
  const byMonth = new Map<string, number>();
  for (const w of HISTORICAL_WEEKS) {
    byMonth.set(w.month, (byMonth.get(w.month) ?? 0) + w.total);
  }
  const monthNames: Record<string, string> = {
    agosto: "Agosto",
    setembro: "Setembro",
    outubro: "Outubro",
  };
  return {
    records,
    totalRecords: records.length,
    monthlyTotals: [...byMonth.entries()].map(([m, t]) => ({
      month: monthNames[m] ?? m,
      total: Math.round(t * 100) / 100,
    })),
    grandTotal: Math.round(HISTORICAL_WEEKS.reduce((s, w) => s + w.total, 0) * 100) / 100,
  };
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  error?: string;
}

/**
 * Grava os registros históricos no Supabase como o usuário autenticado.
 * Idempotente: registros cujo ID já existe são pulados (nunca duplica).
 * Também upserta weekly_stats das 15 semanas (faturamento alimenta a IA;
 * total_clients fica 0 para não distorcer métricas de clientes).
 */
export async function runHistoricalImport(userId: string): Promise<ImportResult> {
  const records = buildHistoricalRecords(userId);
  const pct = useAppStore.getState().profile.barber_percentage ?? 60;

  // Quais já existem?
  const { data: existing, error: fetchErr } = await supabase
    .from("appointments")
    .select("id")
    .eq("user_id", userId)
    .eq("is_historical", true);
  if (fetchErr) return { inserted: 0, skipped: 0, error: fetchErr.message };

  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const toInsert = records.filter((r) => !existingIds.has(r.id));

  if (toInsert.length > 0) {
    const rows = toInsert.map((r) => {
      const barber = Math.round(r.price * (pct / 100) * 100) / 100;
      const owner = Math.round((r.price - barber) * 100) / 100;
      return {
        id: r.id,
        user_id: userId,
        service_id: null,
        service_name: HISTORICAL_SERVICE_NAME,
        price: r.price,
        barber_share: barber,
        owner_share: owner,
        started_at: `${r.date}T12:00:00.000Z`,
        ended_at: `${r.date}T12:00:00.000Z`,
        duration_seconds: 0,
        note: `${HISTORICAL_NOTE} · ${r.weekLabel}`,
        payment_method: null,
        is_historical: true,
      };
    });
    // Lotes de 50 para não estourar payload
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from("appointments").insert(rows.slice(i, i + 50));
      if (error) return { inserted: i, skipped: existingIds.size, error: error.message };
    }
  }

  // weekly_stats das semanas históricas (alimenta a IA; clientes = 0)
  const weeklyRows = HISTORICAL_WEEKS.map((w) => {
    const days = splitWeek(w.total);
    const bestIdx = days.indexOf(Math.max(...days));
    const worstIdx = days.indexOf(Math.min(...days));
    const allEqual = days.every((d) => d === days[0]);
    return {
      user_id: userId,
      week_start_date: w.monday,
      total_revenue: w.total,
      total_clients: 0,
      avg_ticket: 0,
      avg_occupancy: 0,
      best_day: allEqual ? null : addDaysISO(w.monday, bestIdx),
      worst_day: allEqual ? null : addDaysISO(w.monday, worstIdx),
    };
  });
  await supabase
    .from("weekly_stats")
    .upsert(weeklyRows, { onConflict: "user_id,week_start_date" });

  invalidatePullCache(userId);
  return { inserted: toInsert.length, skipped: existingIds.size };
}

/** Converte um registro histórico para o formato local do store. */
export function toLocalAppointment(r: HistoricalRecord, barberPct: number): Appointment {
  const barber = Math.round(r.price * (barberPct / 100) * 100) / 100;
  return {
    id: r.id,
    service_id: null,
    service_name: HISTORICAL_SERVICE_NAME,
    price: r.price,
    barber_share: barber,
    owner_share: Math.round((r.price - barber) * 100) / 100,
    started_at: `${r.date}T12:00:00.000Z`,
    ended_at: `${r.date}T12:00:00.000Z`,
    duration_seconds: 0,
    note: `${HISTORICAL_NOTE} · ${r.weekLabel}`,
    payment_method: null,
    is_historical: true,
  };
}
