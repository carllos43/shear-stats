import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/integrations/supabase/auth-context";
import { useAppStore } from "@/store/app-store";
import { formatBRL } from "@/lib/haptics";
import { fetchHistoricalPeriods, sumPeriods, CONSOLIDATED_PERIODS } from "@/lib/historical-import";
import type { DbHistoricalPeriod } from "@/integrations/supabase/client";
import type { Appointment } from "@/store/app-store";

interface MonthAgg {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  result: number;
  realAppointments: number;
  source: "real" | "historical" | "mixed";
  isComplete: boolean;
  isPartial?: boolean;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function aggregateRealByMonth(appointments: Appointment[]): Map<string, { revenue: number; count: number }> {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const a of appointments) {
    if (a.is_historical) continue;
    const k = monthKey(new Date(a.started_at));
    const cur = map.get(k) ?? { revenue: 0, count: 0 };
    cur.revenue += a.price;
    cur.count += 1;
    map.set(k, cur);
  }
  return map;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-2xl bg-secondary/60 px-3 py-3">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

export function AnnualAnalysisSection() {
  const { user } = useAuth();
  const appointments = useAppStore((s) => s.appointments);
  const [periods, setPeriods] = useState<DbHistoricalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbAvailable, setDbAvailable] = useState(true);
  const [monthlyGoal, setMonthlyGoal] = useState(3000);

  useEffect(() => {
    if (!user?.id) {
      setDbAvailable(false);
      return;
    }
    setLoading(true);
    fetchHistoricalPeriods(user.id)
      .then((rows) => {
        setPeriods(rows);
        setDbAvailable(true);
      })
      .catch(() => setDbAvailable(false))
      .finally(() => setLoading(false));
  }, [user?.id]);

  // Fallback: usa os valores consolidados conhecidos se o banco não retornar nada
  const effectivePeriods: DbHistoricalPeriod[] = useMemo(() => {
    if (periods.length > 0) return periods;
    return CONSOLIDATED_PERIODS.map((p, i) => ({
      id: `local-${i}`,
      user_id: user?.id ?? "",
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
    }));
  }, [periods, user?.id]);

  const year = new Date().getFullYear();
  const now = new Date();

  const monthly = useMemo(() => {
    const real = aggregateRealByMonth(appointments);
    const result: MonthAgg[] = [];

    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      const realData = real.get(key);
      const hist = effectivePeriods.find((p) => p.period_start.startsWith(key));
      const isPast = m < now.getMonth();
      const isCurrent = key === monthKey(now);

      if (hist) {
        result.push({
          key,
          label: monthLabel(key),
          revenue: Number(hist.revenue),
          expenses: Number(hist.expenses),
          result: Number(hist.result),
          realAppointments: realData?.count ?? 0,
          source: realData ? "mixed" : "historical",
          isComplete: true,
        });
      } else if (realData && realData.revenue > 0) {
        result.push({
          key,
          label: monthLabel(key),
          revenue: realData.revenue,
          expenses: 0,
          result: realData.revenue,
          realAppointments: realData.count,
          source: "real",
          isComplete: isPast,
          isPartial: isCurrent,
        });
      }
    }
    return result;
  }, [appointments, effectivePeriods, year, now]);

  const totals = useMemo(() => sumPeriods(effectivePeriods), [effectivePeriods]);
  const completeMonths = monthly.filter((m) => m.isComplete && m.revenue > 0);
  const avgRevenue = completeMonths.length
    ? completeMonths.reduce((s, m) => s + m.revenue, 0) / completeMonths.length
    : 0;

  const currentMonthKey = monthKey(now);
  const currentMonth = monthly.find((m) => m.key === currentMonthKey);
  const currentRevenue = currentMonth?.revenue ?? 0;
  const currentRealCount = currentMonth?.realAppointments ?? 0;

  // Projeção de novembro (mês atual)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = dayOfMonth;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  // Dias úteis aproximados (sem domingo) restantes — simplificado
  const workDaysLeft = Math.max(0, Math.floor(daysLeft * 6 / 7));
  const avgDaily = daysElapsed > 0 && currentRevenue > 0 ? currentRevenue / daysElapsed : 0;
  const projectedMonthRevenue = currentRevenue + avgDaily * workDaysLeft;

  const goalProgress = monthlyGoal > 0 ? (currentRevenue / monthlyGoal) * 100 : 0;
  const goalRemaining = Math.max(0, monthlyGoal - currentRevenue);
  const dailyNeeded = workDaysLeft > 0 ? goalRemaining / workDaysLeft : goalRemaining;

  const monthComparisons = useMemo(() => {
    const comps: { from: string; to: string; deltaRev: number; deltaExp: number; deltaRes: number }[] = [];
    for (let i = 1; i < monthly.length; i++) {
      const prev = monthly[i - 1];
      const curr = monthly[i];
      if (prev.revenue <= 0) continue;
      comps.push({
        from: prev.label,
        to: curr.label,
        deltaRev: curr.revenue - prev.revenue,
        deltaExp: curr.expenses - prev.expenses,
        deltaRes: curr.result - prev.result,
      });
    }
    return comps;
  }, [monthly]);

  const serviceStats = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const a of appointments) {
      if (a.is_historical) continue;
      const cur = map.get(a.service_name) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += a.price;
      map.set(a.service_name, cur);
    }
    const totalRev = Array.from(map.values()).reduce((s, v) => s + v.revenue, 0);
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        revenue: v.revenue,
        share: totalRev > 0 ? (v.revenue / totalRev) * 100 : 0,
        avg: v.count > 0 ? v.revenue / v.count : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [appointments]);

  const maxMonth = Math.max(...monthly.map((m) => m.revenue), 1);

  // Análise financeira concreta
  const financialInsights = useMemo(() => {
    const lines: string[] = [];
    if (currentRevenue > 0) {
      lines.push(`Neste mês você já registrou ${formatBRL(currentRevenue)} em ${currentRealCount} atendimento(s) real(is).`);
    }
    if (goalRemaining > 0 && monthlyGoal > 0) {
      lines.push(`Faltam ${formatBRL(goalRemaining)} para a meta de ${formatBRL(monthlyGoal)}. Precisa de cerca de ${formatBRL(dailyNeeded)} por dia útil restante.`);
    }
    if (monthComparisons.length > 0) {
      const last = monthComparisons[monthComparisons.length - 1];
      if (last.deltaRev > 0 && last.deltaExp > last.deltaRev) {
        lines.push(`De ${last.from} para ${last.to}, os ganhos subiram ${formatBRL(last.deltaRev)}, mas as despesas subiram ${formatBRL(last.deltaExp)}. Por isso o resultado caiu ${formatBRL(Math.abs(last.deltaRes))}.`);
      } else if (last.deltaRes > 0) {
        lines.push(`De ${last.from} para ${last.to}, o resultado melhorou ${formatBRL(last.deltaRes)}.`);
      }
    }
    if (serviceStats.length > 0) {
      const top = serviceStats[0];
      lines.push(`O serviço que mais gera receita é "${top.name}" (${formatBRL(top.revenue)}, ${top.share.toFixed(0)}% do total real).`);
    }
    if (projectedMonthRevenue > currentRevenue) {
      lines.push(`Projeção de fechamento do mês (baseada na média diária atual): ${formatBRL(projectedMonthRevenue)}.`);
    }
    if (lines.length === 0) {
      lines.push("Ainda não há atendimentos reais suficientes neste mês para uma análise detalhada.");
    }
    return lines;
  }, [currentRevenue, currentRealCount, goalRemaining, monthlyGoal, dailyNeeded, monthComparisons, serviceStats, projectedMonthRevenue]);

  if (loading) {
    return (
      <section className="mt-6">
        <div className="h-20 animate-pulse rounded-2xl bg-secondary/50" />
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Análise financeira · {year}</h2>
        {!dbAvailable && (
          <span className="text-[10px] text-amber-400">Banco não disponível — usando valores locais</span>
        )}
      </div>

      {/* Resumo */}
      <div className="flex gap-2">
        <Metric label="Ganhos" value={formatBRL(totals.revenue)} />
        <Metric label="Despesas" value={formatBRL(totals.expenses)} />
        <Metric label="Resultado" value={formatBRL(totals.result)} accent />
      </div>

      {/* Meta + projeção do mês */}
      <div className="rounded-2xl bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Meta mensal</p>
          <input
            type="number"
            value={monthlyGoal}
            onChange={(e) => setMonthlyGoal(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-lg bg-secondary px-2 py-1 text-right text-[13px] tabular-nums outline-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{goalProgress.toFixed(0)}% · {formatBRL(currentRevenue)}</span>
            <span>Faltam {formatBRL(goalRemaining)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, goalProgress)}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Média diária necessária: <span className="font-medium text-foreground">{formatBRL(dailyNeeded)}</span>
          </p>
        </div>
        {currentRevenue > 0 && (
          <div className="border-t border-border/40 pt-3 text-[12px]">
            <p className="text-muted-foreground">Projeção de fechamento (média diária × dias úteis restantes)</p>
            <p className="mt-1 font-semibold">{formatBRL(projectedMonthRevenue)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Base: {formatBRL(currentRevenue)} em {daysElapsed} dias · {workDaysLeft} dias úteis restantes. Sem inventar crescimento.
            </p>
          </div>
        )}
      </div>

      {/* Evolução */}
      {monthly.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Evolução mensal</p>
          <div className="mt-3 space-y-2">
            {monthly.map((m) => (
              <div key={m.key} className="flex items-center gap-2 text-[13px]">
                <span className="w-14 shrink-0 font-medium">{m.label}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/80" style={{ width: `${(m.revenue / maxMonth) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right tabular-nums font-medium">{formatBRL(m.revenue)}</span>
                <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground">
                  {m.isPartial ? "parcial" : m.source === "historical" ? "consol." : "real"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparação */}
      {monthComparisons.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground">O que mudou entre os meses</p>
          <ul className="mt-2 space-y-2 text-[13px]">
            {monthComparisons.map((c, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-medium">{c.from} → {c.to}:</span>{" "}
                ganhos {c.deltaRev >= 0 ? "+" : ""}{formatBRL(c.deltaRev)},{" "}
                despesas {c.deltaExp >= 0 ? "+" : ""}{formatBRL(c.deltaExp)},{" "}
                resultado {c.deltaRes >= 0 ? "+" : ""}{formatBRL(c.deltaRes)}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Serviços reais */}
      {serviceStats.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Serviços realizados (somente reais)</p>
          <ul className="mt-2 divide-y divide-border/30">
            {serviceStats.slice(0, 5).map((s) => (
              <li key={s.name} className="flex items-center justify-between py-2 text-[13px]">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{s.count}× · {s.share.toFixed(0)}%</span>
                </div>
                <span className="tabular-nums font-medium">{formatBRL(s.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Análise financeira concreta */}
      <div className="rounded-2xl bg-card p-4">
        <p className="text-[13px] font-semibold">Análise financeira</p>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-foreground/90">
          {financialInsights.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Calculado a partir dos dados disponíveis. Histórico consolidado não entra em ticket médio nem em quantidade de atendimentos.
          {!dbAvailable && " Valores de ago–out/2026 são os consolidados informados (banco não acessível no momento)."}
        </p>
      </div>
    </section>
  );
}
