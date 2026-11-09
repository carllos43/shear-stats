import { supabase } from "@/integrations/supabase/client";
import type { DbHistoricalPeriod } from "@/integrations/supabase/client";

/**
 * Importação de períodos financeiros consolidados (histórico informado pelo usuário).
 * NÃO cria atendimentos individuais. Não inventa clientes, serviços ou horários.
 * Dados ficam em historical_periods, separados de appointments reais.
 */

export interface ConsolidatedPeriod {
  label: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  revenue: number;
  expenses: number;
  result: number;
  origin: string;
  type: string;
  notes?: string;
  discrepancy_note?: string | null;
}

/** Valores consolidados informados (ago–out/2026). Resultado = revenue - expenses. */
export const CONSOLIDATED_PERIODS: ConsolidatedPeriod[] = [
  {
    label: "Agosto 2026",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    revenue: 3905.0,
    expenses: 1802.0,
    result: 2103.0,
    origin: "histórico informado pelo usuário",
    type: "monthly_consolidated",
    notes: "Dados consolidados. Discrepância de R$ 5,00 em relação à soma de semanas anterior documentada no roadmap; valor aqui é o consolidado informado.",
    discrepancy_note: null, // 3905 - 1802 = 2103 exatamente
  },
  {
    label: "Setembro 2026",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    revenue: 4226.6,
    expenses: 1594.0,
    result: 2632.6,
    origin: "histórico informado pelo usuário",
    type: "monthly_consolidated",
    notes: "Dados consolidados informados.",
    discrepancy_note: null,
  },
  {
    label: "Outubro 2026",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    revenue: 4719.0,
    expenses: 2456.0,
    result: 2263.0,
    origin: "histórico informado pelo usuário",
    type: "monthly_consolidated",
    notes: "Dados consolidados informados.",
    discrepancy_note: null,
  },
];

export const TOTALS = {
  revenue: 12850.6,
  expenses: 5852.0,
  result: 6998.6,
};

/** Verifica se result == revenue - expenses (tolerância de 1 centavo). */
export function isResultConsistent(p: ConsolidatedPeriod): boolean {
  return Math.abs(p.result - (p.revenue - p.expenses)) < 0.015;
}

/**
 * Insere ou atualiza os períodos consolidados de forma idempotente.
 * Não apaga registros existentes. Não cria appointments.
 */
export async function upsertConsolidatedPeriods(userId: string): Promise<{
  upserted: number;
  skipped: number;
  warnings: string[];
}> {
  const warnings: string[] = [];
  let upserted = 0;
  let skipped = 0;

  for (const p of CONSOLIDATED_PERIODS) {
    if (!isResultConsistent(p) && !p.discrepancy_note) {
      warnings.push(`${p.label}: result inconsistente e sem discrepancy_note — pulado`);
      skipped++;
      continue;
    }

    const row = {
      user_id: userId,
      period_start: p.period_start,
      period_end: p.period_end,
      revenue: p.revenue,
      expenses: p.expenses,
      result: p.result,
      label: p.label,
      origin: p.origin,
      type: p.type,
      notes: p.notes ?? null,
      discrepancy_note: p.discrepancy_note ?? null,
    };

    const { error } = await supabase
      .from("historical_periods")
      .upsert(row, { onConflict: "user_id,period_start,period_end,type" });

    if (error) {
      warnings.push(`${p.label}: ${error.message}`);
      skipped++;
    } else {
      upserted++;
    }
  }

  return { upserted, skipped, warnings };
}

/** Busca períodos consolidados do usuário. */
export async function fetchHistoricalPeriods(userId: string): Promise<DbHistoricalPeriod[]> {
  const { data, error } = await supabase
    .from("historical_periods")
    .select("*")
    .eq("user_id", userId)
    .order("period_start", { ascending: true });

  if (error) {
    console.warn("fetchHistoricalPeriods:", error.message);
    return [];
  }
  return (data ?? []) as DbHistoricalPeriod[];
}

/** Soma totais dos períodos carregados (para conferência). */
export function sumPeriods(periods: DbHistoricalPeriod[]) {
  return periods.reduce(
    (acc, p) => ({
      revenue: acc.revenue + Number(p.revenue),
      expenses: acc.expenses + Number(p.expenses),
      result: acc.result + Number(p.result),
    }),
    { revenue: 0, expenses: 0, result: 0 },
  );
}
