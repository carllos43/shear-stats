import { supabase } from "@/integrations/supabase/client";
import type { Appointment, WorkScheduleDay } from "@/store/app-store";
import { startOfWeek, addDays, startOfDay, endOfDay } from "@/lib/dates";
import { periodOccupancy } from "@/lib/occupancy";

export interface WeeklyStat {
  week_start_date: string; // YYYY-MM-DD (segunda-feira)
  total_revenue: number;
  total_clients: number;
  avg_ticket: number;
  avg_occupancy: number;
  best_day: string | null;
  worst_day: string | null;
}

const isoDate = (d: Date) => {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** Agrega uma semana específica (Mon..Sun) a partir dos appointments locais. */
export function computeWeeklyStat(
  weekStart: Date,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
): WeeklyStat {
  const from = startOfDay(weekStart);
  const to = endOfDay(addDays(from, 6));
  const items = appointments.filter((a) => {
    const t = new Date(a.started_at).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });

  const total_revenue = items.reduce((s, a) => s + a.price, 0);
  const total_clients = items.length;
  const avg_ticket = total_clients > 0 ? total_revenue / total_clients : 0;

  const occ = periodOccupancy(from, to, items, schedule);

  // best/worst day por faturamento
  const byDay = new Array(7).fill(0) as number[];
  for (const a of items) {
    const t = new Date(a.started_at).getTime();
    const idx = Math.floor((t - from.getTime()) / 86400000);
    if (idx >= 0 && idx < 7) byDay[idx] += a.price;
  }
  let bestIdx = -1;
  let worstIdx = -1;
  let bestV = -1;
  let worstV = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 7; i++) {
    if (byDay[i] > bestV) {
      bestV = byDay[i];
      bestIdx = i;
    }
    if (byDay[i] < worstV) {
      worstV = byDay[i];
      worstIdx = i;
    }
  }

  return {
    week_start_date: isoDate(from),
    total_revenue: Math.round(total_revenue * 100) / 100,
    total_clients,
    avg_ticket: Math.round(avg_ticket * 100) / 100,
    avg_occupancy: Math.round(occ.occupancyPct * 10) / 10,
    best_day: bestIdx >= 0 && bestV > 0 ? isoDate(addDays(from, bestIdx)) : null,
    worst_day: worstIdx >= 0 && byDay.some((v) => v > 0) ? isoDate(addDays(from, worstIdx)) : null,
  };
}

/** Upsert silencioso de uma semana específica. */
export async function upsertWeeklyStat(
  userId: string,
  stat: WeeklyStat,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("weekly_stats")
      .upsert(
        {
          user_id: userId,
          week_start_date: stat.week_start_date,
          total_revenue: stat.total_revenue,
          total_clients: stat.total_clients,
          avg_ticket: stat.avg_ticket,
          avg_occupancy: stat.avg_occupancy,
          best_day: stat.best_day,
          worst_day: stat.worst_day,
        },
        { onConflict: "user_id,week_start_date" },
      );
    if (error) console.warn("upsertWeeklyStat:", error.message);
  } catch (err) {
    console.warn("upsertWeeklyStat failed:", err);
  }
}

/** Carrega últimas N semanas do servidor (silencioso se tabela não existir). */
export async function fetchWeeklyHistory(
  userId: string,
  limit = 4,
): Promise<WeeklyStat[]> {
  try {
    const { data, error } = await supabase
      .from("weekly_stats")
      .select("week_start_date,total_revenue,total_clients,avg_ticket,avg_occupancy,best_day,worst_day")
      .eq("user_id", userId)
      .order("week_start_date", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as WeeklyStat[]).map((w) => ({
      week_start_date: String(w.week_start_date).slice(0, 10),
      total_revenue: Number(w.total_revenue) || 0,
      total_clients: Number(w.total_clients) || 0,
      avg_ticket: Number(w.avg_ticket) || 0,
      avg_occupancy: Number(w.avg_occupancy) || 0,
      best_day: w.best_day ? String(w.best_day).slice(0, 10) : null,
      worst_day: w.worst_day ? String(w.worst_day).slice(0, 10) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Garante que as últimas N semanas COMPLETAS estão salvas no servidor.
 * Idempotente — pode ser chamado várias vezes sem custo extra (UPSERT).
 * Não salva a semana atual (incompleta).
 */
export async function ensureRecentWeeklyStats(
  userId: string,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
  weeksBack = 4,
): Promise<void> {
  const currentWeekStart = startOfWeek(new Date());
  const stats: WeeklyStat[] = [];
  for (let i = 1; i <= weeksBack; i++) {
    const ws = addDays(currentWeekStart, -7 * i);
    const stat = computeWeeklyStat(ws, appointments, schedule);
    // só salva semana que teve algum movimento
    if (stat.total_revenue > 0 || stat.total_clients > 0) stats.push(stat);
  }
  for (const s of stats) {
    await upsertWeeklyStat(userId, s);
  }
}
