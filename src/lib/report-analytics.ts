import type { Appointment, WorkScheduleDay } from "@/store/app-store";
import { periodOccupancy, scheduleForDay, parseHM } from "@/lib/occupancy";
import { startOfDay, addDays, WEEKDAY_FULL } from "@/lib/dates";

export interface HourBucket {
  hour: number;
  revenue: number;
  count: number;
}

export interface ServicePerf {
  name: string;
  revenue: number;
  count: number;
  avgTicket: number;
  durationMin: number;
  revenuePerHour: number;
}

export interface OpportunityItem {
  title: string;
  impact: number;
  description: string;
}

export interface WeeklyScore {
  value: number; // 0-100
  pros: string[];
  cons: string[];
  metrics: {
    occupancy: number;
    goalAttainment: number;
    consistency: number;
    growth: number;
    avgTicket: number;
  };
}

export interface ReportAnalytics {
  daysCount: number;
  total: number;
  count: number;
  avgTicket: number;
  workedMinutes: number;
  idleMinutes: number;
  totalAvailableMinutes: number;
  occupancyPct: number;
  revenuePerHour: number;
  byWeekday: number[];
  byWeekdayCount: number[];
  byHour: HourBucket[];
  bestWeekday: { i: number; v: number } | null;
  worstWeekday: { i: number; v: number } | null;
  bestHour: HourBucket | null;
  weakestHours: HourBucket[];
  topService: ServicePerf | null;
  serviceRanking: ServicePerf[];
  prevTotal: number;
  prevIdleMinutes: number;
  trendPct: number | null;
  idleLossEstimate: number;
  forecast: { min: number; likely: number; max: number };
  weeklyScore: WeeklyScore;
  discoveries: string[];
  opportunities: OpportunityItem[];
}

const fmtBRL0 = (n: number) =>
  `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

function hoursOpenPerDay(
  schedule: WorkScheduleDay[] | undefined,
  dow: number,
): { start: number; end: number } | null {
  const cfg = scheduleForDay(schedule, dow);
  if (!cfg.is_active) return null;
  const s = parseHM(cfg.start_time);
  const e = parseHM(cfg.end_time);
  if (e <= s) return null;
  return { start: s, end: e };
}

export function computeReportAnalytics(
  from: Date,
  to: Date,
  appointments: Appointment[],
  schedule: WorkScheduleDay[] | undefined,
  dailyGoal: number,
): ReportAnalytics {
  const items = appointments
    .filter((a) => {
      const t = new Date(a.started_at).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const total = items.reduce((s, a) => s + a.price, 0);
  const count = items.length;
  const avgTicket = count > 0 ? total / count : 0;

  const occ = periodOccupancy(from, to, items, schedule);
  const workedH = occ.workedMinutes / 60;
  const revenuePerHour = workedH > 0 ? total / workedH : 0;

  // weekday aggregation
  const byWeekday = new Array(7).fill(0) as number[];
  const byWeekdayCount = new Array(7).fill(0) as number[];
  for (const a of items) {
    const d = new Date(a.started_at).getDay();
    byWeekday[d] += a.price;
    byWeekdayCount[d] += 1;
  }
  const presentWd = byWeekday.map((v, i) => ({ i, v })).filter((x) => x.v > 0);
  const bestWeekday = presentWd.length ? presentWd.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const worstWeekday = presentWd.length ? presentWd.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  // hourly aggregation (only hours within any open schedule)
  const hourMap = new Map<number, HourBucket>();
  for (const a of items) {
    const dt = new Date(a.started_at);
    const h = dt.getHours();
    const cur = hourMap.get(h) ?? { hour: h, revenue: 0, count: 0 };
    cur.revenue += a.price;
    cur.count += 1;
    hourMap.set(h, cur);
  }
  // also seed open hours with zeros
  const openHourSet = new Set<number>();
  const startMs = startOfDay(from).getTime();
  const endMs = startOfDay(to).getTime();
  for (let t = startMs; t <= endMs; t += 86400000) {
    const dow = new Date(t).getDay();
    const win = hoursOpenPerDay(schedule, dow);
    if (!win) continue;
    for (let h = Math.floor(win.start / 60); h < Math.ceil(win.end / 60); h++) {
      openHourSet.add(h);
      if (!hourMap.has(h)) hourMap.set(h, { hour: h, revenue: 0, count: 0 });
    }
  }
  const byHour = [...hourMap.values()].sort((a, b) => a.hour - b.hour);
  const bestHour = byHour.length
    ? byHour.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    : null;
  const weakestHours = byHour
    .filter((h) => openHourSet.has(h.hour))
    .filter((h) => h.count <= 1)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 3);

  // service performance
  const svcMap = new Map<string, { revenue: number; count: number; durSec: number }>();
  for (const a of items) {
    const key = a.service_name || "Sem nome";
    const cur = svcMap.get(key) ?? { revenue: 0, count: 0, durSec: 0 };
    cur.revenue += a.price;
    cur.count += 1;
    cur.durSec += a.duration_seconds || 0;
    svcMap.set(key, cur);
  }
  const serviceRanking: ServicePerf[] = [...svcMap.entries()]
    .map(([name, v]) => {
      const durationMin = v.count > 0 ? Math.round(v.durSec / 60 / v.count) : 0;
      const totalH = v.durSec / 3600;
      return {
        name,
        revenue: v.revenue,
        count: v.count,
        avgTicket: v.count > 0 ? v.revenue / v.count : 0,
        durationMin,
        revenuePerHour: totalH > 0 ? v.revenue / totalH : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const topService = serviceRanking[0] ?? null;

  // previous period (mirror)
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span - 1);
  const prevTo = new Date(from.getTime() - 1);
  const prevItems = appointments.filter((a) => {
    const t = new Date(a.started_at).getTime();
    return t >= prevFrom.getTime() && t <= prevTo.getTime();
  });
  const prevTotal = prevItems.reduce((s, a) => s + a.price, 0);
  const prevOcc = periodOccupancy(prevFrom, prevTo, prevItems, schedule);
  const trendPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  const idleLossEstimate = Math.round((occ.idleMinutes / 60) * revenuePerHour);

  // FORECAST — based on daily averages with confidence band
  const daysCount = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
  const dailyAvg = total / daysCount;
  const likelyWeek = dailyAvg * 7;
  const growth = trendPct !== null ? Math.max(-0.25, Math.min(0.25, trendPct / 100)) : 0;
  const forecast = {
    min: Math.round(likelyWeek * (0.85 + growth * 0.5)),
    likely: Math.round(likelyWeek * (1 + growth)),
    max: Math.round(likelyWeek * (1.15 + growth * 0.5)),
  };

  // WEEKLY SCORE
  const goalSum = dailyGoal * daysCount;
  const goalAttainment = goalSum > 0 ? Math.min(120, (total / goalSum) * 100) : 0;
  const consistency = (() => {
    if (presentWd.length < 2) return 50;
    const mean = byWeekday.reduce((s, v) => s + v, 0) / 7;
    const variance =
      byWeekday.reduce((s, v) => s + (v - mean) ** 2, 0) / 7;
    const sd = Math.sqrt(variance);
    if (mean <= 0) return 30;
    const cv = sd / mean;
    return Math.max(0, Math.min(100, 100 - cv * 50));
  })();
  const growthScore = trendPct === null
    ? 50
    : Math.max(0, Math.min(100, 50 + trendPct));
  const ticketScore = Math.max(0, Math.min(100, (avgTicket / 60) * 100));
  const occupancyScore = occ.occupancyPct;
  const value = Math.round(
    occupancyScore * 0.25 +
      Math.min(100, goalAttainment) * 0.3 +
      consistency * 0.15 +
      growthScore * 0.15 +
      ticketScore * 0.15,
  );
  const pros: string[] = [];
  const cons: string[] = [];
  if (occupancyScore >= 70) pros.push(`Ocupação alta (${occupancyScore.toFixed(0)}%)`);
  if (goalAttainment >= 90) pros.push(`Meta ${goalAttainment.toFixed(0)}% atingida`);
  if (growthScore >= 65 && trendPct !== null)
    pros.push(`Crescimento de ${trendPct.toFixed(0)}%`);
  if (consistency >= 70) pros.push("Faturamento consistente entre os dias");
  if (avgTicket >= 50) pros.push(`Ticket médio forte (${fmtBRL0(avgTicket)})`);
  if (occupancyScore < 55) cons.push(`Ocupação baixa (${occupancyScore.toFixed(0)}%)`);
  if (goalAttainment < 70 && goalSum > 0)
    cons.push(`Meta ${goalAttainment.toFixed(0)}% — abaixo do ideal`);
  if (trendPct !== null && trendPct < -10)
    cons.push(`Queda de ${Math.abs(trendPct).toFixed(0)}% vs período anterior`);
  if (consistency < 55) cons.push("Faturamento desigual entre dias");
  if (avgTicket > 0 && avgTicket < 35) cons.push(`Ticket baixo (${fmtBRL0(avgTicket)})`);
  const weeklyScore: WeeklyScore = {
    value: Math.max(0, Math.min(100, value)),
    pros: pros.slice(0, 3),
    cons: cons.slice(0, 3),
    metrics: {
      occupancy: occupancyScore,
      goalAttainment,
      consistency,
      growth: growthScore,
      avgTicket: ticketScore,
    },
  };

  // DISCOVERIES (local) — top 3
  const discoveries: string[] = [];
  if (bestWeekday && total > 0) {
    const pct = (bestWeekday.v / total) * 100;
    discoveries.push(
      `${WEEKDAY_FULL[bestWeekday.i]} gerou ${pct.toFixed(0)}% do faturamento do período.`,
    );
  }
  if (bestHour) {
    const next = bestHour.hour + 1;
    discoveries.push(
      `Seu horário mais lucrativo é entre ${String(bestHour.hour).padStart(2, "0")}h e ${String(next).padStart(2, "0")}h (${fmtBRL0(bestHour.revenue)}).`,
    );
  }
  if (topService && serviceRanking.length > 1) {
    const share = (topService.revenue / total) * 100;
    discoveries.push(
      `${topService.name} respondeu por ${share.toFixed(0)}% do faturamento.`,
    );
  }
  if (discoveries.length < 3 && weakestHours.length > 0) {
    const h = weakestHours[0];
    discoveries.push(
      `Horário mais fraco: ${String(h.hour).padStart(2, "0")}h — quase sem atendimentos.`,
    );
  }
  if (discoveries.length < 3 && avgTicket > 0) {
    discoveries.push(`Ticket médio do período: ${fmtBRL0(avgTicket)}.`);
  }

  // OPPORTUNITIES (local, baseadas em dados reais)
  const opportunities: OpportunityItem[] = [];
  // 1) preencher 2 horários ociosos por dia útil
  if (occ.idleMinutes > 0 && revenuePerHour > 0 && daysCount > 0) {
    const extraHoursPerWeek = Math.min(daysCount, 7) * 2;
    const impact = Math.round(extraHoursPerWeek * revenuePerHour * 0.6);
    if (impact >= 50) {
      opportunities.push({
        title: "Preencher 2 horários ociosos por dia",
        impact,
        description: `Pode gerar ~${fmtBRL0(impact)} extras na semana usando seu ganho médio por hora.`,
      });
    }
  }
  // 2) ticket +R$5
  if (count > 0) {
    const monthlyMultiplier = (30 / daysCount);
    const impact = Math.round(count * 5 * monthlyMultiplier);
    if (impact >= 50) {
      opportunities.push({
        title: "Aumentar ticket médio em R$5",
        impact,
        description: `Geraria +${fmtBRL0(impact)}/mês mantendo o mesmo volume.`,
      });
    }
  }
  // 3) expandir melhor dia
  if (bestWeekday && bestWeekday.v > 0) {
    const ocupBest = occ.occupancyPct;
    if (ocupBest < 90) {
      const impact = Math.round(bestWeekday.v * 0.2);
      if (impact >= 50) {
        opportunities.push({
          title: `Expandir horários de ${WEEKDAY_FULL[bestWeekday.i]}`,
          impact,
          description: `Seu dia mais forte ainda tem espaço — +${fmtBRL0(impact)} estimados.`,
        });
      }
    }
  }
  // 4) reduzir gap do horário fraco
  if (weakestHours.length > 0 && revenuePerHour > 0) {
    const impact = Math.round(weakestHours.length * revenuePerHour * 1.5);
    if (impact >= 50) {
      opportunities.push({
        title: `Ativar horário ${String(weakestHours[0].hour).padStart(2, "0")}h`,
        impact,
        description: `Promoção neste horário pode somar ~${fmtBRL0(impact)} no período.`,
      });
    }
  }
  opportunities.sort((a, b) => b.impact - a.impact);

  return {
    daysCount,
    total,
    count,
    avgTicket,
    workedMinutes: occ.workedMinutes,
    idleMinutes: occ.idleMinutes,
    totalAvailableMinutes: occ.totalMinutes,
    occupancyPct: occ.occupancyPct,
    revenuePerHour,
    byWeekday,
    byWeekdayCount,
    byHour,
    bestWeekday,
    worstWeekday,
    bestHour,
    weakestHours,
    topService,
    serviceRanking,
    prevTotal,
    prevIdleMinutes: prevOcc.idleMinutes,
    trendPct,
    idleLossEstimate,
    forecast,
    weeklyScore,
    discoveries: discoveries.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
  };
}

export function executiveSummaryLocal(a: ReportAnalytics): {
  vibe: "forte" | "medio" | "fraco";
  headline: string;
  bullets: string[];
} {
  const score = a.weeklyScore.value;
  const vibe = score >= 75 ? "forte" : score >= 50 ? "medio" : "fraco";
  const headline =
    vibe === "forte"
      ? "Período forte e consistente"
      : vibe === "medio"
        ? "Desempenho médio com espaço para crescer"
        : "Desempenho fraco — atenção aos pontos críticos";
  const bullets: string[] = [];
  if (a.trendPct !== null) {
    if (a.trendPct > 5) bullets.push(`Crescimento de ${a.trendPct.toFixed(0)}% vs período anterior`);
    else if (a.trendPct < -5) bullets.push(`Queda de ${Math.abs(a.trendPct).toFixed(0)}% vs período anterior`);
    else bullets.push("Faturamento estável vs período anterior");
  }
  if (a.bestWeekday)
    bullets.push(`Melhor dia: ${WEEKDAY_FULL[a.bestWeekday.i]} (${fmtBRL0(a.bestWeekday.v)})`);
  if (a.opportunities[0])
    bullets.push(`Maior oportunidade: ${a.opportunities[0].title}`);
  return { vibe, headline, bullets: bullets.slice(0, 3) };
}
