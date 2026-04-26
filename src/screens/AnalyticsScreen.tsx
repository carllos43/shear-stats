import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
  WEEKDAY_SHORT,
} from "@/lib/dates";

type Range = "7d" | "30d" | "month" | "prev-month";

function rangeFor(r: Range): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (r) {
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: "Últimos 7 dias" };
    case "30d":
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now), label: "Últimos 30 dias" };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now), label: "Este mês" };
    case "prev-month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth), label: "Mês anterior" };
    }
  }
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-[#1C1C1E] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

export function AnalyticsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const [range, setRange] = useState<Range>("7d");
  const [gearOpen, setGearOpen] = useState(false);

  const { from, to, label } = useMemo(() => rangeFor(range), [range]);

  const periodItems = useMemo(
    () =>
      appointments.filter((a) => {
        const t = new Date(a.started_at).getTime();
        return t >= from.getTime() && t <= to.getTime();
      }),
    [appointments, from, to],
  );

  const totalRevenue = periodItems.reduce((s, a) => s + a.price, 0);
  const totalSeconds = periodItems.reduce((s, a) => s + a.duration_seconds, 0);
  const workedHours = totalSeconds / 3600;
  const avgTicket = periodItems.length > 0 ? totalRevenue / periodItems.length : 0;
  const revenuePerHour = workedHours > 0 ? totalRevenue / workedHours : 0;

  // Idle hours: gaps between appointments within work hours per day
  const idleSeconds = useMemo(() => {
    const byDay = new Map<string, typeof periodItems>();
    for (const a of periodItems) {
      const k = startOfDay(new Date(a.started_at)).toISOString();
      const arr = byDay.get(k) ?? [];
      arr.push(a);
      byDay.set(k, arr);
    }
    let idle = 0;
    for (const list of byDay.values()) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        const gap =
          (new Date(sorted[i].started_at).getTime() -
            new Date(sorted[i - 1].ended_at).getTime()) /
          1000;
        if (gap > 0 && gap < 4 * 3600) idle += gap; // ignora gaps > 4h (almoço/intervalo)
      }
    }
    return idle;
  }, [periodItems]);
  const idleHours = idleSeconds / 3600;

  // Weekly chart — current week (Mon..Sun)
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const dailyTotals = weekDays.map((d) =>
    appointments
      .filter((a) => isSameDay(new Date(a.started_at), d))
      .reduce((s, a) => s + a.price, 0),
  );
  const maxDay = Math.max(...dailyTotals, 1);
  const todayIdx = weekDays.findIndex((d) => isSameDay(d, new Date()));

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
        out.push(`Mantendo o ritmo, você fatura ${formatBRL(projected)} hoje — meta atingida.`);
      } else {
        const missing = profile.daily_goal - projected;
        out.push(`Projeção de ${formatBRL(projected)} hoje. Faltam ${formatBRL(missing)} para a meta.`);
      }
    }
    if (workedHours > 0) {
      const idlePct = (idleHours / (workedHours + idleHours)) * 100;
      if (idlePct > 40) out.push(`Ociosidade de ${idlePct.toFixed(0)}% no período — alta.`);
      else if (idlePct < 20) out.push(`Ociosidade baixa (${idlePct.toFixed(0)}%) — ótima ocupação.`);
    }
    // Comparação semana atual vs anterior
    const thisWeekTotal = dailyTotals.reduce((s, v) => s + v, 0);
    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekItems = appointments.filter((a) => {
      const d = new Date(a.started_at);
      return d >= prevWeekStart && d < weekStart;
    });
    const prevWeekTotal = prevWeekItems.reduce((s, a) => s + a.price, 0);
    if (prevWeekTotal > 0) {
      const delta = ((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100;
      if (delta > 5) out.push(`Faturamento ${delta.toFixed(0)}% acima da semana passada.`);
      else if (delta < -5) out.push(`Faturamento ${Math.abs(delta).toFixed(0)}% abaixo da semana passada.`);
    }
    if (out.length === 0)
      out.push("Registre alguns atendimentos para liberar insights do seu sócio virtual.");
    return out;
  }, [appointments, profile.daily_goal, workedHours, idleHours, dailyTotals, weekStart]);

  return (
    <div>
      <Header title="Análise" subtitle={label} onGear={() => setGearOpen(true)} />

      <div className="px-5 pt-4 pb-32">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Horas trabalhadas" value={`${workedHours.toFixed(1)}h`} />
          <MetricCard label="Horas ociosas" value={`${idleHours.toFixed(1)}h`} />
          <MetricCard label="Ganho por hora" value={formatBRL(revenuePerHour)} hint="R$/h" />
          <MetricCard label="Ticket médio" value={formatBRL(avgTicket)} />
        </div>

        <div className="mt-5 rounded-3xl bg-[#1C1C1E] p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Faturamento da semana
            </p>
            <p className="text-sm font-bold tabular-nums">
              {formatBRL(dailyTotals.reduce((s, v) => s + v, 0))}
            </p>
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
                  <span className={`text-[10px] font-semibold ${isToday ? "text-primary" : "text-gray-500"}`}>
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
          {(["7d", "30d", "month", "prev-month"] as Range[]).map((r) => {
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
