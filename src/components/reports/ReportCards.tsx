import { motion } from "framer-motion";
import {
  Sparkles,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  Zap,
  Target,
  Crown,
  Activity,
  Clock,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ReportAnalytics } from "@/lib/report-analytics";
import { formatBRL } from "@/lib/haptics";
import { WEEKDAY_FULL, WEEKDAY_SHORT } from "@/lib/dates";

function CardShell({
  icon,
  title,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-white/5 bg-[#1C1C1E] p-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{title}</p>
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </motion.div>
  );
}

function AIBadge({ source }: { source: "ai" | "local" }) {
  if (source !== "ai") return null;
  return (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
      IA
    </span>
  );
}

export function AIExecutiveSummary({
  headline,
  bullets,
  vibe,
  source,
  loading,
}: {
  headline: string;
  bullets: string[];
  vibe: "forte" | "medio" | "fraco";
  source: "ai" | "local";
  loading?: boolean;
}) {
  const vibeIcon =
    vibe === "forte" ? "🔥" : vibe === "medio" ? "📊" : "⚠️";
  const vibeColor =
    vibe === "forte"
      ? "from-emerald-500/20 to-primary/10"
      : vibe === "medio"
        ? "from-amber-500/15 to-primary/10"
        : "from-red-500/15 to-primary/10";

  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" />}
      title="Resumo executivo"
      badge={<AIBadge source={source} />}
    >
      <div className={`rounded-2xl bg-gradient-to-br ${vibeColor} p-3`}>
        <p className="text-sm font-semibold leading-snug text-white">
          {vibeIcon} {headline}
        </p>
      </div>
      {loading && bullets.length === 0 ? (
        <div className="mt-3 space-y-2">
          <span className="block h-3 w-2/3 animate-pulse rounded bg-white/10" />
          <span className="block h-3 w-3/4 animate-pulse rounded bg-white/10" />
          <span className="block h-3 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-300">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function AIDiscoveriesCard({
  discoveries,
  source,
  loading,
}: {
  discoveries: string[];
  source: "ai" | "local";
  loading?: boolean;
}) {
  return (
    <CardShell
      icon={<Lightbulb className="h-4 w-4" />}
      title="Descobertas da IA"
      badge={<AIBadge source={source} />}
    >
      {loading && discoveries.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-3 w-full animate-pulse rounded bg-white/10" />
          ))}
        </div>
      ) : discoveries.length === 0 ? (
        <p className="text-xs text-gray-500">Sem descobertas suficientes para o período.</p>
      ) : (
        <ul className="space-y-2">
          {discoveries.map((d, i) => (
            <li
              key={i}
              className="rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-gray-200"
            >
              {d}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function AIOpportunityCard({
  opportunities,
  source,
  loading,
}: {
  opportunities: { title: string; description: string; impact?: number }[];
  source: "ai" | "local";
  loading?: boolean;
}) {
  return (
    <CardShell
      icon={<Zap className="h-4 w-4" />}
      title="Oportunidades"
      badge={<AIBadge source={source} />}
    >
      {loading && opportunities.length === 0 ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <span key={i} className="block h-12 w-full animate-pulse rounded-2xl bg-white/10" />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <p className="text-xs text-gray-500">Sem oportunidades claras no período.</p>
      ) : (
        <ul className="space-y-2">
          {opportunities.map((o, i) => (
            <li key={i} className="rounded-2xl bg-primary/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold tracking-tight text-white">{o.title}</p>
                {o.impact !== undefined && o.impact > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-300">
                    +{formatBRL(o.impact)}
                  </span>
                )}
              </div>
              {o.description && (
                <p className="mt-1 text-xs leading-relaxed text-gray-300">{o.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export function AIIdleLossCard({ a }: { a: ReportAnalytics }) {
  const idleH = a.idleMinutes / 60;
  const prevIdleH = a.prevIdleMinutes / 60;
  const diffPct =
    prevIdleH > 0 ? ((idleH - prevIdleH) / prevIdleH) * 100 : null;
  return (
    <CardShell icon={<Clock className="h-4 w-4" />} title="Perda por ociosidade">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums text-red-400">
            {formatBRL(a.idleLossEstimate)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {idleH.toFixed(1)}h ociosas × R$ {a.revenuePerHour.toFixed(0)}/h
          </p>
        </div>
        {diffPct !== null && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
              diffPct <= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {diffPct <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
            {diffPct >= 0 ? "+" : "-"}
            {Math.abs(diffPct).toFixed(0)}% vs anterior
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        Você deixou de faturar aproximadamente {formatBRL(a.idleLossEstimate)} no período.
      </p>
    </CardShell>
  );
}

export function AIWeeklyForecast({
  forecast,
  narrative,
  source,
  loading,
}: {
  forecast: { min: number; likely: number; max: number };
  narrative: string;
  source: "ai" | "local";
  loading?: boolean;
}) {
  return (
    <CardShell
      icon={<TrendingUp className="h-4 w-4" />}
      title="Previsão IA — próx. semana"
      badge={<AIBadge source={source} />}
    >
      <div className="grid grid-cols-3 gap-2">
        <ForecastTile label="Mínima" value={formatBRL(forecast.min)} tone="muted" />
        <ForecastTile label="Provável" value={formatBRL(forecast.likely)} tone="primary" />
        <ForecastTile label="Otimista" value={formatBRL(forecast.max)} tone="emerald" />
      </div>
      {loading ? (
        <span className="mt-3 block h-3 w-3/4 animate-pulse rounded bg-white/10" />
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-gray-400">{narrative}</p>
      )}
    </CardShell>
  );
}

function ForecastTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "primary" | "emerald";
}) {
  const cls =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-400"
        : "text-gray-300";
  return (
    <div className="rounded-2xl bg-black/30 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

export function AIWeeklyScore({
  score,
  narrative,
  source,
  loading,
}: {
  score: ReportAnalytics["weeklyScore"];
  narrative: string;
  source: "ai" | "local";
  loading?: boolean;
}) {
  const v = score.value;
  const color =
    v >= 75 ? "text-emerald-400" : v >= 50 ? "text-primary" : "text-red-400";
  const ring =
    v >= 75 ? "stroke-emerald-400" : v >= 50 ? "stroke-primary" : "stroke-red-400";
  const C = 2 * Math.PI * 28;
  const offset = C - (v / 100) * C;
  return (
    <CardShell
      icon={<Activity className="h-4 w-4" />}
      title="Score do período"
      badge={<AIBadge source={source} />}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r="28" className="fill-none stroke-white/10" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r="28"
              className={`fill-none ${ring}`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className={`text-xl font-bold tabular-nums ${color}`}>{v}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">/100</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <span className="block h-3 w-3/4 animate-pulse rounded bg-white/10" />
          ) : (
            <p className="text-xs leading-relaxed text-gray-300">{narrative}</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {score.pros.map((p, i) => (
          <div
            key={`p-${i}`}
            className="flex items-start gap-1.5 rounded-xl bg-emerald-500/10 px-2.5 py-1.5"
          >
            <Trophy size={11} className="mt-0.5 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-tight text-emerald-200">{p}</p>
          </div>
        ))}
        {score.cons.map((c, i) => (
          <div
            key={`c-${i}`}
            className="flex items-start gap-1.5 rounded-xl bg-red-500/10 px-2.5 py-1.5"
          >
            <AlertTriangle size={11} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-[11px] leading-tight text-red-200">{c}</p>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

export function AIHeatmapCard({ a }: { a: ReportAnalytics }) {
  if (a.byHour.length === 0) return null;
  const max = Math.max(1, ...a.byHour.map((h) => h.revenue));
  return (
    <CardShell icon={<Target className="h-4 w-4" />} title="Heatmap de horários">
      <div className="space-y-1">
        {a.byHour.map((h) => {
          const pct = (h.revenue / max) * 100;
          const intensity = h.revenue > 0 ? Math.max(0.15, pct / 100) : 0.05;
          return (
            <div key={h.hour} className="flex items-center gap-2">
              <span className="w-9 text-[11px] tabular-nums text-gray-500">
                {String(h.hour).padStart(2, "0")}h
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-white/5">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-primary"
                  style={{ width: `${pct}%`, opacity: intensity }}
                />
              </div>
              <span className="w-14 text-right text-[10px] tabular-nums text-gray-400">
                {h.count > 0 ? formatBRL(h.revenue) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {a.bestHour && (
        <p className="mt-3 text-[11px] text-gray-500">
          Pico: <span className="font-semibold text-primary">
            {String(a.bestHour.hour).padStart(2, "0")}h
          </span>
          {" "}
          ({formatBRL(a.bestHour.revenue)}).
        </p>
      )}
    </CardShell>
  );
}

export function ServicePerformanceCard({ a }: { a: ReportAnalytics }) {
  const top = a.topService;
  if (!top) return null;
  return (
    <CardShell icon={<Crown className="h-4 w-4" />} title="Serviço campeão">
      <p className="text-base font-bold tracking-tight text-white">{top.name}</p>
      <p className="text-xs text-gray-400">
        Foi o serviço mais lucrativo do período.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Faturamento" value={formatBRL(top.revenue)} accent />
        <Metric label="Quantidade" value={`${top.count}x`} />
        <Metric label="Ticket médio" value={formatBRL(top.avgTicket)} />
        <Metric
          label="R$/h estimado"
          value={top.revenuePerHour > 0 ? formatBRL(top.revenuePerHour) : "—"}
        />
      </div>
      {a.serviceRanking.length > 1 && (
        <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {a.serviceRanking.slice(1, 4).map((s) => (
            <div key={s.name} className="flex items-center justify-between text-[11px]">
              <span className="truncate text-gray-400">{s.name}</span>
              <span className="tabular-nums text-gray-300">
                {s.count}x · {formatBRL(s.revenue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/30 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${accent ? "text-primary" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

export function WeekdayBreakdown({ a }: { a: ReportAnalytics }) {
  const max = Math.max(1, ...a.byWeekday);
  return (
    <CardShell icon={<TrendingUp className="h-4 w-4" />} title="Faturamento por dia da semana">
      <div className="flex items-end justify-between gap-1.5">
        {a.byWeekday.map((v, i) => {
          const h = Math.max(2, (v / max) * 100);
          const isBest = a.bestWeekday?.i === i && v > 0;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] tabular-nums text-gray-500">
                {v > 0 ? formatBRL(v).replace("R$\u00A0", "") : "—"}
              </span>
              <div className="flex h-20 w-full items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className={`w-full rounded ${isBest ? "bg-primary" : v > 0 ? "bg-primary/40" : "bg-white/5"}`}
                />
              </div>
              <span className="text-[10px] font-semibold text-gray-400">{WEEKDAY_SHORT[i]}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        {a.bestWeekday
          ? `${WEEKDAY_FULL[a.bestWeekday.i]} é seu dia mais forte.`
          : "Sem dados de comparação."}
      </p>
    </CardShell>
  );
}
