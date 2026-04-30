import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
import { periodOccupancy, dayOccupancy, fmtHM, scheduleForDay } from "@/lib/occupancy";

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

export function AnalyticsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const [range, setRange] = useState<Range>("today");
  const [gearOpen, setGearOpen] = useState(false);

  const { from, to, label, days } = useMemo(() => rangeFor(range), [range]);

  // Janela de trabalho diária (em segundos), vinda dos Ajustes
  const workDaySeconds = useMemo(() => {
    const start = parseHM(profile.work_start || "09:00");
    const end = parseHM(profile.work_end || "19:00");
    const diff = Math.max(0, end - start);
    return diff * 60;
  }, [profile.work_start, profile.work_end]);

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

  // Apenas atendimentos com tempo cronometrado entram em horas/ocupação
  const timedItems = periodItems.filter((a) => a.duration_seconds > 0);
  const totalSeconds = timedItems.reduce((s, a) => s + a.duration_seconds, 0);
  const workedHours = totalSeconds / 3600;
  const avgTicket = periodItems.length > 0 ? totalRevenue / periodItems.length : 0;
  const revenuePerHour = workedHours > 0 ? totalRevenue / workedHours : 0;
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

  // Ocupação baseada no horário de trabalho definido em Ajustes.
  // total_periodo = nº de dias do range (apenas dias com horário) * janela diária
  // Para "today": só conta o dia atual (1 janela).
  // Para ranges multi-dia: conta cada dia distinto entre from..to.
  const totalAvailableSeconds = useMemo(() => {
    if (workDaySeconds <= 0) return 0;
    // conta dias distintos no intervalo
    const startMs = startOfDay(from).getTime();
    const endMs = startOfDay(to).getTime();
    const numDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    return numDays * workDaySeconds;
  }, [from, to, workDaySeconds]);

  const idleSeconds = Math.max(0, totalAvailableSeconds - totalSeconds);
  const idleHours = idleSeconds / 3600;
  const occupancyPct =
    totalAvailableSeconds > 0
      ? Math.min(100, (totalSeconds / totalAvailableSeconds) * 100)
      : 0;

  // Projeção de hoje: extrapola o faturamento atual com base na fração já decorrida do expediente.
  const todayProjection = useMemo(() => {
    const now = new Date();
    const todayItems = appointments.filter((a) => isSameDay(new Date(a.started_at), now));
    const revenue = todayItems.reduce((s, a) => s + a.price, 0);
    const startMin = parseHM(profile.work_start || "09:00");
    const endMin = parseHM(profile.work_end || "19:00");
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const totalMin = Math.max(1, endMin - startMin);
    const elapsedMin = Math.min(Math.max(nowMin - startMin, 0), totalMin);
    const fraction = elapsedMin / totalMin;
    if (revenue <= 0 || fraction < 0.05) {
      return { revenue, projected: revenue, fraction, hasProjection: false };
    }
    const projected = revenue / fraction;
    return { revenue, projected, fraction, hasProjection: true };
  }, [appointments, profile.work_start, profile.work_end]);

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

    if (workedHours > 0) {
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
    workedHours,
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
            hint={workedHours > 0 ? "R$/h trabalhada" : "sem cronômetro"}
          />
          <MetricCard
            label="Horas trabalhadas"
            value={`${workedHours.toFixed(1)}h`}
            hint={timedItems.length > 0 ? `${timedItems.length} cronometrados` : undefined}
          />
          <MetricCard
            label="Ocupação"
            value={`${occupancyPct.toFixed(0)}%`}
            hint={`${idleHours.toFixed(1)}h ociosas · ${profile.work_start}–${profile.work_end}`}
          />
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500">
          Ocupação = tempo trabalhando ÷ tempo total no salão ({profile.work_start}–
          {profile.work_end}, configurável em Ajustes).
        </p>

        {/* Projeção de hoje */}
        {todayProjection.hasProjection && (
          <div className="mt-4 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 to-[#1C1C1E] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Projeção de hoje
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
              {formatBRL(todayProjection.projected)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Se continuar nesse ritmo, você fará{" "}
              <span className="font-semibold text-white">
                {formatBRL(todayProjection.projected)}
              </span>{" "}
              hoje. Atual: {formatBRL(todayProjection.revenue)} (
              {Math.round(todayProjection.fraction * 100)}% do expediente).
            </p>
          </div>
        )}

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
