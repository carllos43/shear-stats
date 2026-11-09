import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/integrations/supabase/auth-context";
import { useAppStore } from "@/store/app-store";
import { formatBRL } from "@/lib/haptics";
import { fetchHistoricalPeriods, sumPeriods } from "@/lib/historical-import";
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

export function AnnualAnalysisSection() {
  const { user } = useAuth();
  const appointments = useAppStore((s) => s.appointments);
  const [periods, setPeriods] = useState<DbHistoricalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    fetchHistoricalPeriods(user.id)
      .then(setPeriods)
      .catch((e) => setError(e?.message || "Erro ao carregar histórico"))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const year = new Date().getFullYear();

  const monthly = useMemo(() => {
    const real = aggregateRealByMonth(appointments);
    const result: MonthAgg[] = [];
    const now = new Date();

    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      const realData = real.get(key);
      const hist = periods.find((p) => p.period_start.startsWith(key));
      const isPast = m < now.getMonth();

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
        });
      }
    }
    return result;
  }, [appointments, periods, year]);

  const totals = useMemo(() => sumPeriods(periods), [periods]);
  const completeMonths = monthly.filter((m) => m.isComplete && m.revenue > 0);
  const avgRevenue = completeMonths.length
    ? completeMonths.reduce((s, m) => s + m.revenue, 0) / completeMonths.length
    : 0;

  const monthsLeft = Math.max(0, 11 - new Date().getMonth());
  const projectedYearRevenue = totals.revenue + avgRevenue * monthsLeft;

  const scenarios = useMemo(() => {
    if (completeMonths.length < 2) {
      return { conservative: null, likely: null, optimistic: null, note: "Poucos meses completos para cenários confiáveis." };
    }
    const vals = completeMonths.map((m) => m.revenue).sort((a, b) => a - b);
    const base = completeMonths.length + monthsLeft;
    return {
      conservative: vals[0] * base,
      likely: avgRevenue * base,
      optimistic: vals[vals.length - 1] * base,
      note: `Base: ${completeMonths.length} meses completos. Média aritmética. Sem crescimento inventado. Confiança limitada.`,
    };
  }, [completeMonths, avgRevenue, monthsLeft]);

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

  if (loading) {
    return (
      <section className="mt-8">
        <div className="h-24 animate-pulse rounded-2xl bg-secondary/50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Visão anual · {year}</h2>
        <span className="text-[11px] text-muted-foreground">Consolidado separado de reais</span>
      </div>

      {periods.length > 0 && (
        <div className="flex gap-2">
          <Metric label="Ganhos" value={formatBRL(totals.revenue)} />
          <Metric label="Despesas" value={formatBRL(totals.expenses)} />
          <Metric label="Resultado" value={formatBRL(totals.result)} accent />
        </div>
      )}

      {monthly.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Evolução mensal</p>
          <div className="mt-3 space-y-2.5">
            {monthly.map((m) => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-[12px] font-medium">{m.label}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/80"
                    style={{ width: `${(m.revenue / maxMonth) * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-[12px] tabular-nums font-medium">
                  {formatBRL(m.revenue)}
                </span>
                <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                  {m.source === "historical" ? "consol." : m.source === "mixed" ? "misto" : "real"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-card p-4">
        <p className="text-[11px] font-medium text-muted-foreground">Projeção de fechamento</p>
        <p className="mt-2 text-sm">
          Média (meses completos): <span className="font-semibold">{formatBRL(avgRevenue)}</span>
        </p>
        <p className="mt-1 text-sm">
          Projetada: <span className="font-semibold">{formatBRL(projectedYearRevenue)}</span>
        </p>
        {scenarios.note && <p className="mt-2 text-[11px] text-muted-foreground">{scenarios.note}</p>}
        {scenarios.likely != null && (
          <div className="mt-3 flex gap-2 text-center">
            <div className="flex-1 rounded-xl bg-secondary/60 py-2">
              <p className="text-[10px] text-muted-foreground">Conservador</p>
              <p className="text-sm font-semibold">{formatBRL(scenarios.conservative!)}</p>
            </div>
            <div className="flex-1 rounded-xl bg-primary/10 py-2">
              <p className="text-[10px] text-muted-foreground">Provável</p>
              <p className="text-sm font-semibold text-primary">{formatBRL(scenarios.likely)}</p>
            </div>
            <div className="flex-1 rounded-xl bg-secondary/60 py-2">
              <p className="text-[10px] text-muted-foreground">Otimista</p>
              <p className="text-sm font-semibold">{formatBRL(scenarios.optimistic!)}</p>
            </div>
          </div>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Metodologia: média aritmética dos meses completos. Meses incompletos não entram na média. Sem crescimento percentual inventado. Confiança limitada com poucos meses de dados.
        </p>
      </div>

      {serviceStats.length > 0 && (
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Serviços realizados (somente reais)</p>
          <ul className="mt-3 divide-y divide-border/40">
            {serviceStats.slice(0, 6).map((s) => (
              <li key={s.name} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {s.count}× · {s.share.toFixed(0)}% · {formatBRL(s.avg)}
                  </span>
                </div>
                <span className="tabular-nums font-medium">{formatBRL(s.revenue)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Quantidade e ticket médio apenas de atendimentos reais. Histórico consolidado não entra aqui.
          </p>
        </div>
      )}

      {periods.length === 0 && serviceStats.length === 0 && (
        <div className="rounded-2xl bg-secondary/40 p-4 text-sm text-muted-foreground">
          Nenhum período consolidado ou atendimentos reais suficientes ainda. Importe o histórico em Ajustes ou registre atendimentos.
        </div>
      )}
    </section>
  );
}
