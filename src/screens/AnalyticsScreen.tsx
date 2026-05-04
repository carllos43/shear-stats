import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL } from "@/lib/haptics";
import {
  addDays,
  endOfDay,
  endOfMonth,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  WEEKDAY_FULL,
  WEEKDAY_SHORT,
} from "@/lib/dates";
import { periodOccupancy, dayOccupancy, dayGaps, fmtHM, scheduleForDay } from "@/lib/occupancy";
import { AIInsightCard } from "@/components/AIInsightCard";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { SmartGoalCard } from "@/components/SmartGoalCard";
import { computeSmartGoalV2 } from "@/lib/smart-goal-v2";
import type { AnalysisDayData, AnalysisWeeklyStat } from "@/types/analysis";
import { useAuth } from "@/integrations/supabase/auth-context";
import {
  ensureRecentWeeklyStats,
  fetchWeeklyHistory,
  type WeeklyStat,
} from "@/lib/weekly-stats";

type Range = "today" | "7d" | "30d" | "month" | "prev-month";

function rangeFor(r: Range): { from: Date; to: Date; label: string; days: number } {
  const now = new Date();
  switch (r) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Hoje", days: 1 };
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: "Últimos 7 dias", days: 7 };
    case "30d":
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now), label: "Últimos 30 dias", days: 30 };
    case "month": {
      const f = startOfMonth(now);
      const days = Math.max(1, Math.ceil((endOfDay(now).getTime() - f.getTime()) / 86400000));
      return { from: f, to: endOfDay(now), label: "Este mês", days };
    }
    case "prev-month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const f = startOfMonth(lastMonth);
      const t = endOfMonth(lastMonth);
      const days = Math.max(1, Math.ceil((t.getTime() - f.getTime()) / 86400000));
      return { from: f, to: t, label: "Mês anterior", days };
    }
  }
}

/** Minutos do dia ("HH:MM" → minutos). */
function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function MetricCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: number;
}) {
  return (
    <div className="rounded-3xl bg-[#1C1C1E] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-1">
        {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
        {trend !== undefined && Number.isFinite(trend) && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
              trend >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function SmartGoalV2Section({
  todayData,
  weeklyHistory,
  manualGoal,
  endMin,
}: {
  todayData: {
    total: number;
    atendimentos: number;
    occupancy: number;
    workedMinutes: number;
  };
  weeklyHistory: WeeklyStat[];
  manualGoal: number;
  endMin: number;
}) {
  const prevGoalRef = useRef<number | undefined>(undefined);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const remainingMinutes = Math.max(0, endMin - nowMin);

  const weeklyStats = weeklyHistory.map((w) => ({
    totalRevenue: w.total_revenue,
    totalMinutes: 0,
    totalAppointments: w.total_clients,
  }));

  const goal = computeSmartGoalV2({
    todayRevenue: todayData.total,
    todayAppointments: todayData.atendimentos,
    occupancy: todayData.occupancy,
    workedMinutes: todayData.workedMinutes,
    remainingMinutes,
    weeklyStats,
    dayOfWeek: now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    previousGoal: prevGoalRef.current,
    manualGoal,
  });
  prevGoalRef.current = goal.finalGoal;

  return <SmartGoalCard goal={goal} remainingMinutes={remainingMinutes} />;
}

export function AnalyticsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const workSchedule = useAppStore((s) => s.workSchedule);
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const [gearOpen, setGearOpen] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyStat[]>([]);
  const [, setTick] = useState(0);

  // tick a cada 60s para recalcular meta inteligente em tempo real
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sincroniza histórico semanal: salva semanas anteriores e carrega últimas 4.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureRecentWeeklyStats(user.id, appointments, workSchedule, 4);
        const hist = await fetchWeeklyHistory(user.id, 4);
        if (!cancelled) setWeeklyHistory(hist);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const { from, to, label, days } = useMemo(() => rangeFor(range), [range]);

  const periodItems = useMemo(
    () =>
      appointments.filter((a) => {
        const t = new Date(a.started_at).getTime();
        return t >= from.getTime() && t <= to.getTime();
      }),
    [appointments, from, to],
  );

  // Período anterior equivalente para comparação
  const prevItems = useMemo(() => {
    const span = to.getTime() - from.getTime();
    const prevFrom = from.getTime() - span - 1;
    const prevTo = from.getTime() - 1;
    return appointments.filter((a) => {
      const t = new Date(a.started_at).getTime();
      return t >= prevFrom && t <= prevTo;
    });
  }, [appointments, from, to]);

  const totalRevenue = periodItems.reduce((s, a) => s + a.price, 0);
  const prevRevenue = prevItems.reduce((s, a) => s + a.price, 0);
  const revenueTrend = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : NaN;

  const avgTicket = periodItems.length > 0 ? totalRevenue / periodItems.length : 0;
  const avgPerDay = totalRevenue / days;

  // Dia com mais faturamento (no período)
  const bestDay = useMemo(() => {
    if (periodItems.length === 0) return null;
    const byDay = new Map<string, number>();
    for (const a of periodItems) {
      const k = startOfDay(new Date(a.started_at)).toISOString();
      byDay.set(k, (byDay.get(k) ?? 0) + a.price);
    }
    let bestK = "";
    let bestV = 0;
    for (const [k, v] of byDay) if (v > bestV) ((bestK = k), (bestV = v));
    return bestK ? { date: new Date(bestK), value: bestV } : null;
  }, [periodItems]);

  // Serviço mais lucrativo no período
  const topService = useMemo(() => {
    if (periodItems.length === 0) return null;
    const map = new Map<string, { count: number; revenue: number }>();
    for (const a of periodItems) {
      const cur = map.get(a.service_name) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += a.price;
      map.set(a.service_name, cur);
    }
    let bestName = "";
    let bestRev = 0;
    let bestCount = 0;
    for (const [name, v] of map) {
      if (v.revenue > bestRev) {
        bestName = name;
        bestRev = v.revenue;
        bestCount = v.count;
      }
    }
    return bestName ? { name: bestName, revenue: bestRev, count: bestCount } : null;
  }, [periodItems]);

  // Ocupação por período: usa work_schedule (clamp por janela de cada dia).
  const occ = useMemo(
    () => periodOccupancy(from, to, appointments, workSchedule),
    [from, to, appointments, workSchedule],
  );
  const workedHoursOcc = occ.workedMinutes / 60;
  const idleHours = occ.idleMinutes / 60;
  const occupancyPct = occ.occupancyPct;
  // Ritmo R$/h baseado em horas REALMENTE trabalhadas (via expediente/clamp).
  const revenuePerHour = workedHoursOcc > 0 ? totalRevenue / workedHoursOcc : 0;

  // Ocupação do dia atual (para projeção e card "hoje")
  const todayOcc = useMemo(
    () => dayOccupancy(new Date(), appointments, workSchedule),
    [appointments, workSchedule],
  );
  const todayCfg = useMemo(
    () => scheduleForDay(workSchedule, new Date().getDay()),
    [workSchedule],
  );

  // Projeção realista: ritmo R$/h × horas restantes do expediente.
  const todayProjection = useMemo(() => {
    const now = new Date();
    const todayItems = appointments.filter((a) => isSameDay(new Date(a.started_at), now));
    const revenue = todayItems.reduce((s, a) => s + a.price, 0);

    if (todayOcc.closed) {
      return {
        revenue: 0, projected: 0, hasProjection: false, closed: true,
        ended: false, ritmo: 0, restMin: 0,
      };
    }

    const startMin = (now.getHours() * 60 + now.getMinutes());
    const endMin = (() => {
      const [h, m] = (todayCfg.end_time || "20:00").split(":").map(Number);
      return h * 60 + m;
    })();
    const restMin = Math.max(0, endMin - startMin);
    const horasTrab = Math.max(todayOcc.workedMinutes / 60, 0);

    // Expediente já terminou — mostrar como ENCERRADO com ritmo final
    if (restMin <= 0) {
      const ritmoFinal = horasTrab > 0 ? revenue / horasTrab : 0;
      return {
        revenue, projected: revenue, hasProjection: revenue > 0,
        closed: false, ended: true, ritmo: ritmoFinal, restMin: 0,
      };
    }
    // Sem atendimentos ainda — sem projeção confiável
    if (revenue <= 0 || horasTrab <= 0) {
      return {
        revenue, projected: 0, hasProjection: false,
        closed: false, ended: false, ritmo: 0, restMin,
      };
    }

    const ritmo = revenue / horasTrab; // R$/h baseado APENAS em horas reais
    const projected = revenue + ritmo * (restMin / 60);
    return {
      revenue, projected, hasProjection: true,
      closed: false, ended: false, ritmo, restMin,
    };
  }, [appointments, todayOcc, todayCfg]);

  // Gaps reais do dia (tempo ocioso e maior intervalo sem cliente)
  const todayGaps = useMemo(
    () => dayGaps(new Date(), appointments, workSchedule),
    [appointments, workSchedule],
  );

  // Faturamento dos últimos 7 dias (mais antigo → mais novo) — payload da IA
  const last7Days = useMemo(() => {
    const out = new Array(7).fill(0) as number[];
    const today = startOfDay(new Date()).getTime();
    for (const a of appointments) {
      const t = startOfDay(new Date(a.started_at)).getTime();
      const diff = Math.floor((today - t) / 86400000);
      if (diff >= 0 && diff < 7) out[6 - diff] += a.price;
    }
    return out;
  }, [appointments]);

  // Dados consolidados de "hoje" para o card de IA (independente do range selecionado)
  const todayData = useMemo(() => {
    const now = new Date();
    const todayItems = appointments.filter((a) => isSameDay(new Date(a.started_at), now));
    const total = todayItems.reduce((s, a) => s + a.price, 0);
    const atendimentos = todayItems.length;
    const avgTicket = atendimentos > 0 ? total / atendimentos : 0;
    return {
      total,
      atendimentos,
      avgTicket,
      workedMinutes: todayOcc.workedMinutes,
      idleMinutes: todayGaps.idleMinutes, // ocioso REAL (gaps), não janela total
      longestGapMinutes: todayGaps.longestGapMinutes,
      gapsCount: todayGaps.gapsCount,
      occupancy:
        todayOcc.totalMinutes > 0
          ? Math.min(100, (todayOcc.workedMinutes / todayOcc.totalMinutes) * 100)
          : 0,
      projection: todayProjection.hasProjection ? todayProjection.projected : total,
      ritmo: todayProjection.ritmo,
      ended: todayProjection.ended,
    };
  }, [appointments, todayOcc, todayProjection, todayGaps]);

  // Gráfico semanal (sempre da semana atual)
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const dailyTotals = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];
    const startMs = weekStart.getTime();
    for (const a of appointments) {
      const t = new Date(a.started_at).getTime();
      const diff = Math.floor((t - startMs) / 86400000);
      if (diff >= 0 && diff < 7) totals[diff] += a.price;
    }
    return totals;
  }, [appointments, weekStart]);
  const maxDay = useMemo(() => Math.max(...dailyTotals, 1), [dailyTotals]);
  const todayIdx = useMemo(() => weekDays.findIndex((d) => isSameDay(d, new Date())), [weekDays]);
  const weekTotal = useMemo(() => dailyTotals.reduce((s, v) => s + v, 0), [dailyTotals]);

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    const todayItems = appointments.filter((a) => isSameDay(new Date(a.started_at), new Date()));
    const todayRevenue = todayItems.reduce((s, a) => s + a.price, 0);

    if (profile.daily_goal > 0 && todayRevenue > 0) {
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      const dayProgress = Math.min(Math.max((hour - 9) / 10, 0.05), 1);
      const projected = todayRevenue / dayProgress;
      if (projected >= profile.daily_goal) {
        const above = projected - profile.daily_goal;
        out.push(
          `Hoje você projeta ${formatBRL(projected)} — ${formatBRL(above)} acima da meta. 🔥`,
        );
      } else {
        const missing = profile.daily_goal - projected;
        out.push(
          `Projeção de ${formatBRL(projected)} hoje. Faltam ${formatBRL(missing)} para a meta.`,
        );
      }
    }

    if (workedHoursOcc > 0) {
      if (occupancyPct < 60) {
        out.push(
          `Ocupação de ${occupancyPct.toFixed(0)}% — há espaço para encaixar mais clientes nas janelas livres.`,
        );
      } else if (occupancyPct >= 80) {
        out.push(
          `Excelente ocupação (${occupancyPct.toFixed(0)}%). Considere aumentar preço dos serviços mais procurados.`,
        );
      }
    }

    if (Number.isFinite(revenueTrend)) {
      if (revenueTrend > 5) {
        out.push(
          `Faturamento ${revenueTrend.toFixed(0)}% acima do período anterior. Tendência positiva.`,
        );
      } else if (revenueTrend < -5) {
        out.push(
          `Faturamento ${Math.abs(revenueTrend).toFixed(0)}% abaixo do período anterior. Vale revisar a agenda.`,
        );
      }
    }

    if (topService && periodItems.length >= 3) {
      const pct = (topService.revenue / totalRevenue) * 100;
      out.push(
        `${topService.name} responde por ${pct.toFixed(0)}% do faturamento (${topService.count} atendimentos).`,
      );
    }

    if (bestDay && periodItems.length >= 3) {
      const wd = WEEKDAY_FULL[bestDay.date.getDay()];
      out.push(`Melhor dia do período: ${wd} (${formatBRL(bestDay.value)}).`);
    }

    // Projeção mensal a partir da média diária do período
    if (range === "30d" && avgPerDay > 0) {
      const projMonth = avgPerDay * 30;
      out.push(`Projeção mensal no ritmo atual: ${formatBRL(projMonth)}.`);
    }

    if (out.length === 0)
      out.push("Registre alguns atendimentos para liberar insights do seu sócio virtual.");
    return out;
  }, [
    appointments,
    profile.daily_goal,
    workedHoursOcc,
    occupancyPct,
    revenueTrend,
    topService,
    bestDay,
    periodItems.length,
    totalRevenue,
    avgPerDay,
    range,
  ]);

  return (
    <div>
      <Header title="Análise" subtitle={label} onGear={() => setGearOpen(true)} />

      <div className="px-5 pt-4 pb-32">
        {/* Seletor de período rápido */}
        <div className="mb-3 flex gap-1.5 rounded-2xl bg-[#1C1C1E] p-1">
          {(
            [
              { k: "today", l: "Hoje" },
              { k: "7d", l: "Semana" },
              { k: "30d", l: "Mês" },
            ] as const
          ).map((opt) => {
            const sel = range === opt.k;
            return (
              <button
                key={opt.k}
                onClick={() => setRange(opt.k)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                  sel ? "bg-primary text-primary-foreground" : "text-gray-400"
                }`}
              >
                {opt.l}
              </button>
            );
          })}
        </div>

        {/* Faturamento destaque */}
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 to-[#1C1C1E] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Faturamento do período
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-primary">
              {formatBRL(totalRevenue)}
            </p>
            {Number.isFinite(revenueTrend) && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                  revenueTrend >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {revenueTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(revenueTrend).toFixed(0)}% vs anterior
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
            <div>
              <p className="uppercase tracking-wider text-gray-500">Atendimentos</p>
              <p className="mt-0.5 text-sm font-bold text-white tabular-nums">
                {periodItems.length}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-gray-500">Média/dia</p>
              <p className="mt-0.5 text-sm font-bold text-white tabular-nums">
                {formatBRL(avgPerDay)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <MetricCard label="Ticket médio" value={formatBRL(avgTicket)} />
          <MetricCard
            label="Ganho por hora"
            value={formatBRL(revenuePerHour)}
            hint={workedHoursOcc > 0 ? "R$/h trabalhada" : "sem cronômetro"}
          />
          <MetricCard
            label="Horas trabalhadas"
            value={`${workedHoursOcc.toFixed(1)}h`}
            hint={
              occ.daysOpen > 0
                ? `${fmtHM(occ.workedMinutes)} no expediente`
                : "Sem expediente"
            }
          />
          <MetricCard
            label="Ocupação"
            value={`${occupancyPct.toFixed(0)}%`}
            hint={
              occ.daysOpen > 0
                ? `${idleHours.toFixed(1)}h ociosas · ${occ.daysOpen} dia${occ.daysOpen > 1 ? "s" : ""}`
                : "Fechado no período"
            }
          />
        </div>
        {todayCfg.is_active ? (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500">
            Expediente: {todayCfg.start_time}–{todayCfg.end_time} (configurável em Ajustes).
          </p>
        ) : (
          <p className="mt-2 px-1 text-[11px] font-semibold leading-relaxed text-gray-500">
            Hoje: Fechado.
          </p>
        )}

        {/* Projeção de hoje */}
        {todayProjection.hasProjection && !todayProjection.ended && (
          <div className="mt-4 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 to-[#1C1C1E] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Projeção de hoje
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
              {formatBRL(todayProjection.projected)}
              {profile.daily_goal > 0 && todayProjection.projected > profile.daily_goal * 2 && (
                <span className="ml-2 text-[11px] font-semibold uppercase text-amber-400">
                  ritmo acima do normal
                </span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Se continuar nesse ritmo, você fará{" "}
              <span className="font-semibold text-white">
                {formatBRL(todayProjection.projected)}
              </span>{" "}
              hoje.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-black/30 px-3 py-2">
                <p className="text-gray-500">Ritmo</p>
                <p className="mt-0.5 font-bold tabular-nums text-white">
                  {formatBRL(todayProjection.ritmo)}/h
                </p>
              </div>
              <div className="rounded-xl bg-black/30 px-3 py-2">
                <p className="text-gray-500">Faltam</p>
                <p className="mt-0.5 font-bold tabular-nums text-white">
                  {fmtHM(todayProjection.restMin)}
                </p>
              </div>
            </div>
            {profile.daily_goal > 0 && (() => {
              const pct = (todayProjection.projected / profile.daily_goal) * 100;
              const color = pct < 40 ? "bg-red-500" : pct < 80 ? "bg-amber-500" : "bg-emerald-500";
              const emoji = pct < 40 ? "🔴" : pct < 80 ? "🟡" : "🟢";
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>{emoji} {pct.toFixed(0)}% da meta</span>
                    <span className="tabular-nums">{formatBRL(profile.daily_goal)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {todayProjection.ended && (
          <div className="mt-4 rounded-3xl border border-white/5 bg-[#1C1C1E] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Expediente encerrado
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-primary">
              {formatBRL(todayProjection.revenue)}
            </p>
            <p className="mt-1 text-[11px] text-gray-500">Faturamento final do dia.</p>
            {todayProjection.ritmo > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[11px]">
                <span className="text-gray-500">Ritmo médio</span>
                <span className="font-bold tabular-nums text-white">
                  {formatBRL(todayProjection.ritmo)}/h
                </span>
              </div>
            )}
          </div>
        )}

        {/* Meta inteligente dinâmica V2 (cálculo local, sempre disponível) */}
        <SmartGoalV2Section
          todayData={todayData}
          weeklyHistory={weeklyHistory}
          manualGoal={profile.daily_goal}
          endMin={parseHM(todayCfg.end_time || "20:00")}
        />


        {/* Análise inteligente (IA com fallback local + previsões) */}
        <AIInsightCard
          total={todayData.total}
          goal={profile.daily_goal}
          occupancy={todayData.occupancy}
          workedMinutes={todayData.workedMinutes}
          idleMinutes={todayData.idleMinutes}
          longestGapMinutes={todayData.longestGapMinutes}
          gapsCount={todayData.gapsCount}
          ritmo={todayData.ritmo}
          ended={todayData.ended}
          projection={todayData.projection}
          atendimentos={todayData.atendimentos}
          avgTicket={todayData.avgTicket}
          last7Days={last7Days}
          weeklyHistory={weeklyHistory}
          periodLabel="hoje"
        />

        {/* Painel de análise IA expandido (multi-modo + histórico) */}
        <AnalysisPanel
          dayData={{
            date: new Date().toISOString().slice(0, 10),
            faturamento: todayData.total,
            meta: profile.daily_goal,
            ocupacao_percent: Math.round(todayData.occupancy),
            total_agendamentos: todayData.atendimentos,
            agendamentos_realizados: todayData.atendimentos,
            ticket_medio: Math.round(todayData.avgTicket * 100) / 100,
          } satisfies AnalysisDayData}
          weeklyStats={weeklyHistory.map<AnalysisWeeklyStat>((w) => ({
            week_start: w.week_start_date,
            faturamento: w.total_revenue,
            ocupacao: w.avg_occupancy,
          }))}
        />

        {/* Serviço top */}
        {topService && (
          <div className="mt-5 rounded-3xl bg-[#1C1C1E] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Serviço mais lucrativo
            </p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-lg font-bold tracking-tight">{topService.name}</p>
              <p className="text-lg font-bold tabular-nums text-primary">
                {formatBRL(topService.revenue)}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {topService.count} atendimentos ·{" "}
              {((topService.revenue / Math.max(totalRevenue, 1)) * 100).toFixed(0)}% do total
            </p>
          </div>
        )}

        {/* Gráfico semanal */}
        <div className="mt-5 rounded-3xl bg-[#1C1C1E] p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Faturamento da semana
            </p>
            <p className="text-sm font-bold tabular-nums">{formatBRL(weekTotal)}</p>
          </div>
          <div className="flex h-32 items-end justify-between gap-2">
            {dailyTotals.map((val, i) => {
              const h = `${Math.max((val / maxDay) * 100, 4)}%`;
              const isToday = i === todayIdx;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: h }}
                    transition={{ type: "spring", stiffness: 120, damping: 20, delay: i * 0.04 }}
                    className={`w-full rounded-t-full ${isToday ? "bg-primary" : "bg-gray-700"}`}
                  />
                  <span
                    className={`text-[10px] font-semibold ${
                      isToday ? "text-primary" : "text-gray-500"
                    }`}
                  >
                    {WEEKDAY_SHORT[weekDays[i].getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <h2 className="mt-7 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Sócio virtual
        </h2>
        <ul className="space-y-2">
          {insights.map((text, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl bg-[#1C1C1E] p-4 text-sm leading-relaxed text-gray-200"
            >
              {text}
            </motion.li>
          ))}
        </ul>
      </div>

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Período de análise">
        <ul className="space-y-1">
          {(["today", "7d", "30d", "month", "prev-month"] as Range[]).map((r) => {
            const sel = range === r;
            return (
              <li key={r}>
                <button
                  onClick={() => {
                    setRange(r);
                    setGearOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                    sel ? "bg-primary/15 text-primary" : "bg-[#2C2C2E]"
                  }`}
                >
                  <span className="font-semibold tracking-tight">{rangeFor(r).label}</span>
                  {sel && <span>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </div>
  );
}
