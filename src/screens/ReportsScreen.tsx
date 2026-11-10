import { toast } from "sonner";
import { motion } from "framer-motion";
import { Download, FileText, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/dates";
import { useAuth } from "@/integrations/supabase/auth-context";
import { ensureRecentWeeklyStats, fetchWeeklyHistory, type WeeklyStat } from "@/lib/weekly-stats";
import {
  computeReportAnalytics,
  executiveSummaryLocal,
} from "@/lib/report-analytics";
import {
  generateReportConsultancy,
  type ReportAIResult,
} from "@/lib/report-ai.functions";
import { DateRangePicker } from "@/components/DateRangePicker";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  AIDiscoveriesCard,
  AIExecutiveSummary,
  AIHeatmapCard,
  AIIdleLossCard,
  AIOpportunityCard,
  AIWeeklyForecast,
  AIWeeklyScore,
  ServicePerformanceCard,
  WeekdayBreakdown,
} from "@/components/reports/ReportCards";

type Range = "today" | "7d" | "month" | "prev-month" | "custom";

interface PersistedRange {
  key: Range;
  fromISO?: string;
  toISO?: string;
}

const STORAGE_KEY = "barbermetrics:reports_range";

function defaultRangeFor(r: Exclude<Range, "custom">): { from: Date; to: Date; label: string } {
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

function loadPersisted(): PersistedRange | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedRange;
    if (!["today", "7d", "month", "prev-month", "custom"].includes(p.key)) return null;
    if (p.key === "custom" && (!p.fromISO || !p.toISO || !Number.isFinite(Date.parse(p.fromISO)) || !Number.isFinite(Date.parse(p.toISO)) || Date.parse(p.fromISO) > Date.parse(p.toISO))) return null;
    return p;
  } catch {
    return null;
  }
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

const ranges: { key: Exclude<Range, "custom">; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "month", label: "Este mês" },
  { key: "prev-month", label: "Mês anterior" },
];

export function ReportsScreen() {
  const appointments = useAppStore((s) => s.appointments);
  const profile = useAppStore((s) => s.profile);
  const workSchedule = useAppStore((s) => s.workSchedule);
  const { user } = useAuth();

  const persisted = useMemo(() => loadPersisted(), []);
  // "custom" sem datas salvas volta para 7 dias — evita rótulo divergente dos números.
  const [range, setRange] = useState<Range>(
    persisted?.key === "custom" && (!persisted.fromISO || !persisted.toISO)
      ? "7d"
      : (persisted?.key ?? "7d"),
  );
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(
    persisted?.key === "custom" && persisted.fromISO && persisted.toISO
      ? { from: new Date(persisted.fromISO), to: new Date(persisted.toISO) }
      : null,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shopName, setShopName] = useState(profile.barbershop_name);

  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyStat[]>([]);
  const [aiResult, setAiResult] = useState<ReportAIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiReqId = useRef(0);

  // Resolve current period
  const { from, to, label } = useMemo(() => {
    if (range === "custom" && customRange) {
      return {
        from: startOfDay(customRange.from),
        to: endOfDay(customRange.to),
        label: `${customRange.from.toLocaleDateString("pt-BR")} – ${customRange.to.toLocaleDateString("pt-BR")}`,
      };
    }
    if (range === "custom") {
      // fallback to 7d if no custom set
      return defaultRangeFor("7d");
    }
    return defaultRangeFor(range);
  }, [range, customRange]);

  // Persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: PersistedRange = {
      key: range,
      fromISO: range === "custom" && customRange ? customRange.from.toISOString() : undefined,
      toISO: range === "custom" && customRange ? customRange.to.toISOString() : undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, [range, customRange]);

  // Load weekly history once
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    fetchWeeklyHistory(user.id, 8).then((wh) => {
      if (alive) setWeeklyHistory(wh);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Compute analytics
  const analytics = useMemo(
    () =>
      computeReportAnalytics(
        from,
        to,
        appointments,
        workSchedule,
        profile.daily_goal,
      ),
    [from, to, appointments, workSchedule, profile.daily_goal],
  );

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

  const localExec = useMemo(() => executiveSummaryLocal(analytics), [analytics]);

  // AI consultancy — debounced
  useEffect(() => {
    const id = ++aiReqId.current;
    setAiLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await generateReportConsultancy({
          data: {
            rangeLabel: label,
            fromISO: from.toISOString(),
            toISO: to.toISOString(),
            daysCount: analytics.daysCount,
            total: analytics.total,
            count: analytics.count,
            avgTicket: analytics.avgTicket,
            occupancyPct: analytics.occupancyPct,
            workedHours: analytics.workedMinutes / 60,
            idleHours: analytics.idleMinutes / 60,
            revenuePerHour: analytics.revenuePerHour,
            trendPct: analytics.trendPct,
            prevTotal: analytics.prevTotal,
            bestWeekday: analytics.bestWeekday
              ? { name: WEEKDAY_FULL[analytics.bestWeekday.i], revenue: analytics.bestWeekday.v }
              : null,
            worstWeekday: analytics.worstWeekday
              ? { name: WEEKDAY_FULL[analytics.worstWeekday.i], revenue: analytics.worstWeekday.v }
              : null,
            bestHour: analytics.bestHour
              ? { hour: analytics.bestHour.hour, revenue: analytics.bestHour.revenue }
              : null,
            topService: analytics.topService
              ? {
                  name: analytics.topService.name,
                  revenue: analytics.topService.revenue,
                  count: analytics.topService.count,
                  avgTicket: analytics.topService.avgTicket,
                  revenuePerHour: analytics.topService.revenuePerHour,
                }
              : null,
            weeklyScore: analytics.weeklyScore.value,
            forecast: analytics.forecast,
            weeklyHistory: weeklyHistory.map((w) => ({
              week_start_date: w.week_start_date,
              total_revenue: w.total_revenue,
              avg_ticket: w.avg_ticket,
              avg_occupancy: w.avg_occupancy,
            })),
            localDiscoveries: analytics.discoveries,
            localOpportunities: analytics.opportunities.map((o) => o.title),
            localExecutive: { headline: localExec.headline, bullets: localExec.bullets },
          },
        });
        if (id !== aiReqId.current) return;
        setAiResult(res);
      } catch {
        if (id !== aiReqId.current) return;
        setAiResult(null);
      } finally {
        if (id === aiReqId.current) setAiLoading(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [
    analytics,
    weeklyHistory,
    label,
    from,
    to,
    localExec.headline,
    localExec.bullets,
  ]);

  // Merge AI + local for display
  const execHeadline = aiResult?.executive.headline || localExec.headline;
  const execBullets =
    aiResult?.executive.bullets && aiResult.executive.bullets.length > 0
      ? aiResult.executive.bullets
      : localExec.bullets;
  const discoveries =
    aiResult?.discoveries && aiResult.discoveries.length > 0
      ? aiResult.discoveries
      : analytics.discoveries;
  const aiOpps = aiResult?.opportunities ?? [];
  const opportunitiesDisplay =
    aiOpps.length > 0
      ? aiOpps.map((o, i) => ({
          title: o.title,
          description: o.description,
          impact: analytics.opportunities[i]?.impact,
        }))
      : analytics.opportunities;

  const forecastNarrative =
    aiResult?.forecastNarrative ||
    `Próxima semana tende a fechar entre ${formatBRL(analytics.forecast.min)} e ${formatBRL(analytics.forecast.max)}.`;
  const scoreNarrative =
    aiResult?.scoreNarrative ||
    (analytics.weeklyScore.value >= 75
      ? "Score alto — período sólido."
      : analytics.weeklyScore.value >= 50
        ? "Score médio — há espaço claro para crescer."
        : "Score baixo — corrija os pontos críticos.");

  const source: "ai" | "local" = aiResult?.source ?? "local";

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
        bestWeekday: analytics.bestWeekday
          ? { name: WEEKDAY_FULL[analytics.bestWeekday.i], value: analytics.bestWeekday.v }
          : null,
        worstWeekday: analytics.worstWeekday
          ? { name: WEEKDAY_FULL[analytics.worstWeekday.i], value: analytics.worstWeekday.v }
          : null,
        insight: execHeadline,
        executiveBullets: execBullets,
        discoveries,
        opportunities: opportunitiesDisplay.map((o) => ({
          title: o.title,
          description: o.description,
        })),
        forecast: analytics.forecast,
        forecastNarrative,
        weeklyScore: analytics.weeklyScore.value,
        scoreNarrative,
        avgTicket: analytics.avgTicket,
        revenuePerHour: analytics.revenuePerHour,
        idleLossEstimate: analytics.idleLossEstimate,
        topService: analytics.topService
          ? {
              name: analytics.topService.name,
              revenue: analytics.topService.revenue,
              count: analytics.topService.count,
              avgTicket: analytics.topService.avgTicket,
            }
          : null,
      });
      if (user?.id) {
        ensureRecentWeeklyStats(user.id, appointments, workSchedule, 4).catch(() => {});
      }
    } catch (e) {
      console.error("PDF error", e);
      toast.error("Não foi possível gerar o PDF", { description: "Tente de novo em alguns segundos." });
    } finally {
      setExporting(false);
    }
  };

  const customLabel =
    range === "custom" && customRange
      ? `${customRange.from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${customRange.to.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
      : "Personalizado";

  return (
    <div>
      <Header title="Relatórios" subtitle="Central inteligente" onGear={() => setGearOpen(true)} />

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
                sel ? "bg-primary text-primary-foreground" : "bg-card text-foreground/80"
              }`}
            >
              {r.label}
            </motion.button>
          );
        })}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            haptic(8);
            setPickerOpen(true);
          }}
          className={`flex shrink-0 snap-start items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold tracking-tight ${
            range === "custom"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-foreground/80"
          }`}
        >
          <CalendarIcon size={14} />
          {customLabel}
        </motion.button>
      </div>

      <div className="px-5 pt-5 pb-32 space-y-3">
        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-card p-4"
        >
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-3xl font-semibold tabular-nums text-primary">
              {formatBRL(analytics.total)}
            </p>
            {analytics.trendPct !== null && (
              <span
                className={`text-[11px] font-medium ${
                  analytics.trendPct >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {analytics.trendPct >= 0 ? "+" : "-"}
                {Math.abs(analytics.trendPct).toFixed(0)}% vs anterior
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Atendimentos</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">{analytics.count}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Ticket médio</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums">
                {formatBRL(analytics.avgTicket)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Ocupação</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-primary">
                {analytics.occupancyPct.toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Trabalho</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {fmtMin(analytics.workedMinutes)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Ocioso</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground/80">
                {fmtMin(analytics.idleMinutes)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">R$/hora</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatBRL(analytics.revenuePerHour)}
              </p>
            </div>
          </div>
        </motion.div>

        <CollapsibleSection title="Resumo executivo">
          <AIExecutiveSummary
            headline={execHeadline}
            bullets={execBullets}
            vibe={localExec.vibe}
            source={source}
            loading={aiLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Score do período">
          <AIWeeklyScore
            score={analytics.weeklyScore}
            narrative={scoreNarrative}
            source={source}
            loading={aiLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Descobertas da IA">
          <AIDiscoveriesCard
            discoveries={discoveries}
            source={source}
            loading={aiLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Oportunidades">
          <AIOpportunityCard
            opportunities={opportunitiesDisplay}
            source={source}
            loading={aiLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Perda por ociosidade">
          <AIIdleLossCard a={analytics} />
        </CollapsibleSection>

        <CollapsibleSection title="Previsão da semana">
          <AIWeeklyForecast
            forecast={analytics.forecast}
            narrative={forecastNarrative}
            source={source}
            loading={aiLoading}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Serviço campeão">
          <ServicePerformanceCard a={analytics} />
        </CollapsibleSection>

        <CollapsibleSection title="Faturamento por dia">
          <WeekdayBreakdown a={analytics} />
        </CollapsibleSection>

        <CollapsibleSection title="Heatmap de horários">
          <AIHeatmapCard a={analytics} />
        </CollapsibleSection>

        <CollapsibleSection title="Pré-visualização">
          {items.length === 0 ? (
            <div className="py-6 text-center">
              <FileText size={24} className="mx-auto mb-2 text-muted-foreground/70" />
              <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {items.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.service_name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(a.started_at).toLocaleDateString("pt-BR")} · {formatHourMinute(a.started_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary tabular-nums">{formatBRL(a.price)}</span>
                </li>
              ))}
              {items.length > 6 && (
                <li className="py-2 text-center text-[11px] text-muted-foreground">
                  + {items.length - 6} no PDF
                </li>
              )}
            </ul>
          )}
        </CollapsibleSection>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleExport}
          disabled={items.length === 0 || exporting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {exporting ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Gerando PDF...
            </>
          ) : (
            <>
              <Download size={18} /> Gerar PDF inteligente
            </>
          )}
        </motion.button>
      </div>

      <DateRangePicker
        open={pickerOpen}
        initialRange={customRange}
        onClose={() => setPickerOpen(false)}
        onConfirm={(r) => {
          setCustomRange(r);
          setRange("custom");
          setPickerOpen(false);
        }}
      />

      <BottomSheet open={gearOpen} onClose={() => setGearOpen(false)} title="Cabeçalho do relatório">
        <p className="mb-2 text-[12px] font-medium text-muted-foreground">
          Nome da barbearia
        </p>
        <input
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="w-full rounded-2xl bg-card-elevated px-4 py-3 outline-none placeholder:text-muted-foreground"
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
