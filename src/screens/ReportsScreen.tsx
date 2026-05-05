import { motion } from "framer-motion";
import { Download, FileText, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { BottomSheet } from "@/components/BottomSheet";
import { useAppStore } from "@/store/app-store";
import { formatBRL, haptic } from "@/lib/haptics";
import {
  addDays,
  endOfDay,
  endOfMonth,
  formatHourMinute,
  startOfDay,
  startOfMonth,
  WEEKDAY_FULL,
  WEEKDAY_SHORT,
} from "@/lib/dates";
import { periodOccupancy } from "@/lib/occupancy";
import { useAuth } from "@/integrations/supabase/auth-context";
import { ensureRecentWeeklyStats } from "@/lib/weekly-stats";

type Range = "today" | "7d" | "month" | "prev-month";

function rangeFor(r: Range): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (r) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Hoje" };
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: "Últimos 7 dias" };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now), label: "Este mês" };
    case "prev-month": {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return { from: startOfMonth(last), to: endOfMonth(last), label: "Mês anterior" };
    }
  }
}

const ranges: { key: Range; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "month", label: "Este mês" },
  { key: "prev-month", label: "Mês anterior" },
];

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

function durationDot(min: number) {
  if (min <= 30) return "bg-emerald-500";
  if (min <= 60) return "bg-amber-400";
  return "bg-red-500";
}

function generateReportInsight(trendPct: number | null, hasPrev: boolean): string {
  if (!hasPrev || trendPct === null) return "Sem dados suficientes do período anterior para comparar.";
  if (trendPct > 20) return "Seu faturamento está crescendo bem nesse período.";
  if (trendPct < -20) return "Queda significativa. Vale revisar dias fracos.";
  if (trendPct > 5) return "Crescimento leve em relação ao período anterior.";
  if (trendPct < -5) return "Leve queda em relação ao período anterior.";
  return "Faturamento está estável.";
}

export function ReportsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const workSchedule = useAppStore((s) => s.workSchedule);
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("7d");
  const [gearOpen, setGearOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shopName, setShopName] = useState(profile.barbershop_name);

  const { from, to, label } = useMemo(() => rangeFor(range), [range]);

  const items = useMemo(
    () =>
      appointments
        .filter((a) => {
          const t = new Date(a.started_at).getTime();
          return t >= from.getTime() && t <= to.getTime();
        })
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [appointments, from, to],
  );

  const prevItems = useMemo(() => {
    const span = to.getTime() - from.getTime();
    const pf = from.getTime() - span - 1;
    const pt = from.getTime() - 1;
    return appointments.filter((a) => {
      const t = new Date(a.started_at).getTime();
      return t >= pf && t <= pt;
    });
  }, [appointments, from, to]);

  const total = useMemo(() => items.reduce((s, a) => s + a.price, 0), [items]);
  const totalBarber = useMemo(() => items.reduce((s, a) => s + (a.barber_share ?? 0), 0), [items]);
  const totalOwner = useMemo(() => items.reduce((s, a) => s + (a.owner_share ?? 0), 0), [items]);

  const prevTotal = useMemo(() => prevItems.reduce((s, a) => s + a.price, 0), [prevItems]);
  const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const hasPrev = prevTotal > 0;

  // ticket médio + tendência
  const avgTicket = items.length > 0 ? total / items.length : 0;
  const prevAvg = prevItems.length > 0 ? prevTotal / prevItems.length : 0;
  const ticketTrend = prevAvg > 0 ? ((avgTicket - prevAvg) / prevAvg) * 100 : null;

  // ocupação
  const occ = useMemo(
    () => periodOccupancy(from, to, appointments, workSchedule),
    [from, to, appointments, workSchedule],
  );

  // por dia da semana (faturamento agregado por weekday no período)
  const byWeekday = useMemo(() => {
    const arr = new Array(7).fill(0) as number[];
    for (const a of items) arr[new Date(a.started_at).getDay()] += a.price;
    return arr;
  }, [items]);

  const { bestWd, worstWd } = useMemo(() => {
    const present = byWeekday
      .map((v, i) => ({ i, v }))
      .filter((x) => x.v > 0);
    if (present.length === 0) return { bestWd: null, worstWd: null };
    const best = present.reduce((a, b) => (b.v > a.v ? b : a));
    const worst = present.reduce((a, b) => (b.v < a.v ? b : a));
    return { bestWd: best, worstWd: worst };
  }, [byWeekday]);

  // série diária do período (até 14 barras p/ caber)
  const dailySeries = useMemo(() => {
    const days: { date: Date; total: number }[] = [];
    const startMs = startOfDay(from).getTime();
    const endMs = startOfDay(to).getTime();
    const dayCount = Math.min(14, Math.floor((endMs - startMs) / 86400000) + 1);
    const realStart = endMs - (dayCount - 1) * 86400000;
    for (let i = 0; i < dayCount; i++) {
      days.push({ date: new Date(realStart + i * 86400000), total: 0 });
    }
    for (const a of items) {
      const t = startOfDay(new Date(a.started_at)).getTime();
      const idx = Math.round((t - realStart) / 86400000);
      if (idx >= 0 && idx < dayCount) days[idx].total += a.price;
    }
    return days;
  }, [items, from, to]);
  const maxBar = useMemo(() => Math.max(1, ...dailySeries.map((d) => d.total)), [dailySeries]);

  const insight = useMemo(() => generateReportInsight(trend, hasPrev), [trend, hasPrev]);

  const ticketInsight = useMemo(() => {
    if (!Number.isFinite(ticketTrend)) return null;
    if (ticketTrend > 5) return `Ticket médio subiu ${ticketTrend.toFixed(0)}%.`;
    if (ticketTrend < -5 && items.length > prevItems.length)
      return "Você está atendendo mais clientes, mas ganhando menos por cliente.";
    if (ticketTrend < -5) return `Ticket médio caiu ${Math.abs(ticketTrend).toFixed(0)}%.`;
    return null;
  }, [ticketTrend, items.length, prevItems.length]);

  const patternInsight = useMemo(() => {
    if (byWeekday.every((v) => v === 0)) return null;
    const sorted = byWeekday
      .map((v, i) => ({ i, v }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    if (sorted.length < 2) return null;
    const top = sorted.slice(0, Math.min(2, sorted.length)).map((x) => x.i).sort();
    const names = top.map((i) => WEEKDAY_FULL[i]);
    return `Seu movimento é mais forte em ${names.join(" e ")}.`;
  }, [byWeekday]);

  const handleExport = async () => {
    if (exporting) return;
    haptic(15);
    setExporting(true);
    try {
      const { generateReportPdf } = await import("@/lib/pdf");
      await generateReportPdf({
        barbershopName: shopName || profile.barbershop_name,
        from,
        to,
        rangeLabel: label,
        appointments: items,
        barberPercentage: profile.barber_percentage,
        workSchedule,
        bestWeekday: bestWd ? { name: WEEKDAY_FULL[bestWd.i], value: bestWd.v } : null,
        worstWeekday: worstWd ? { name: WEEKDAY_FULL[worstWd.i], value: worstWd.v } : null,
        insight,
      });
      if (user?.id) {
        ensureRecentWeeklyStats(user.id, appointments, workSchedule, 4).catch(() => {});
      }
    } catch (e) {
      console.error("PDF error", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <Header title="Relatórios" subtitle="Exportação contábil" onGear={() => setGearOpen(true)} />

      <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 scrollbar-hide">
        {ranges.map((r) => {
          const sel = range === r.key;
          return (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={r.key}
              onClick={() => {
                setRange(r.key);
                haptic(8);
              }}
              className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold tracking-tight ${
                sel ? "bg-primary text-primary-foreground" : "bg-[#1C1C1E] text-gray-300"
              }`}
            >
              {r.label}
            </motion.button>
          );
        })}
      </div>

      <div className="px-5 pt-5 pb-32">
        <div className="rounded-3xl bg-[#1C1C1E] p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {label}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-3xl font-bold tabular-nums text-primary">{formatBRL(total)}</p>
                {Number.isFinite(trend) && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                      trend >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {trend >= 0 ? "+" : "-"}
                    {Math.abs(trend).toFixed(0)}% vs anterior
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Atendimentos</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{items.length}</p>
            </div>
          </div>

          {/* Mini gráfico de barras */}
          {dailySeries.length > 1 && (
            <div className="mt-4">
              <div className="flex h-16 items-end gap-1">
                {dailySeries.map((d, i) => {
                  const h = Math.max(2, (d.total / maxBar) * 100);
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ duration: 0.4, delay: i * 0.02 }}
                        className={`w-full rounded-sm ${
                          d.total > 0 ? "bg-primary/70" : "bg-white/5"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-1">
                {dailySeries.map((d, i) => (
                  <p key={i} className="flex-1 text-center text-[9px] text-gray-600">
                    {WEEKDAY_SHORT[d.date.getDay()]}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Barbeiro ({profile.barber_percentage}%)
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">{formatBRL(totalBarber)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Dono ({100 - profile.barber_percentage}%)
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-primary">{formatBRL(totalOwner)}</p>
            </div>
          </div>

          {(bestWd || worstWd) && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
              {bestWd && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Melhor dia
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-400">
                    {WEEKDAY_FULL[bestWd.i]}
                  </p>
                  <p className="text-[11px] tabular-nums text-gray-400">{formatBRL(bestWd.v)}</p>
                </div>
              )}
              {worstWd && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Pior dia
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-red-400">
                    {WEEKDAY_FULL[worstWd.i]}
                  </p>
                  <p className="text-[11px] tabular-nums text-gray-400">{formatBRL(worstWd.v)}</p>
                </div>
              )}
            </div>
          )}

          {/* Métricas de tempo */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Trabalho
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{fmtMin(occ.workedMinutes)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Ocioso
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-300">
                {fmtMin(occ.idleMinutes)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Ocupação
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-primary">
                {occ.occupancyPct.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        {/* Insights determinísticos */}
        {(insight || ticketInsight || patternInsight) && (
          <div className="mt-3 space-y-2 rounded-3xl bg-[#1C1C1E] p-4">
            {insight && <p className="text-xs text-gray-300">{insight}</p>}
            {ticketInsight && <p className="text-xs text-gray-300">{ticketInsight}</p>}
            {patternInsight && <p className="text-xs text-gray-300">{patternInsight}</p>}
          </div>
        )}

        <h2 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Pré-visualização
        </h2>
        {items.length === 0 ? (
          <div className="rounded-3xl bg-[#1C1C1E] p-8 text-center">
            <FileText size={28} className="mx-auto mb-2 text-gray-600" />
            <p className="text-sm text-gray-400">Sem atendimentos no período selecionado.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-[#1C1C1E]">
            {items.slice(0, 8).map((a, i) => {
              const durMin = Math.max(0, Math.round((a.duration_seconds ?? 0) / 60));
              return (
                <li
                  key={a.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i > 0 ? "border-t border-white/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight">{a.service_name}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-500 tabular-nums">
                      {new Date(a.started_at).toLocaleDateString("pt-BR")} ·{" "}
                      {formatHourMinute(a.started_at)}
                      {durMin > 0 && (
                        <>
                          <span>·</span>
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${durationDot(durMin)}`}
                          />
                          <span>{durMin}min</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-primary tabular-nums">{formatBRL(a.price)}</span>
                </li>
              );
            })}
            {items.length > 8 && (
              <li className="border-t border-white/5 px-4 py-3 text-center text-[11px] text-gray-500">
                + {items.length - 8} atendimentos no PDF
              </li>
            )}
          </ul>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleExport}
          disabled={items.length === 0 || exporting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground disabled:opacity-40"
        >
          {exporting ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Gerando PDF...
            </>
          ) : (
            <>
              <Download size={18} /> Gerar PDF
            </>
          )}
        </motion.button>
      </div>

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Cabeçalho do relatório">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Nome da barbearia
        </p>
        <input
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="w-full rounded-2xl bg-[#2C2C2E] px-4 py-3 outline-none placeholder:text-gray-500"
          placeholder="Minha Barbearia"
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setGearOpen(false)}
          className="mt-5 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground"
        >
          Confirmar
        </motion.button>
      </BottomSheet>
    </div>
  );
}
