import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/integrations/supabase/auth-context";
import { useAppStore } from "@/store/app-store";
import { formatBRL } from "@/lib/haptics";
import { fetchHistoricalPeriods, CONSOLIDATED_PERIODS } from "@/lib/historical-import";
import type { DbHistoricalPeriod } from "@/integrations/supabase/client";
import type { Appointment } from "@/store/app-store";

type Origin = "consolidado" | "real" | "parcial" | "misto";

interface MonthRow {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  result: number;
  realCount: number;
  origin: Origin;
  isComplete: boolean;
  note: string;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
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
    if (!user?.id) { setDbAvailable(false); return; }
    setLoading(true);
    fetchHistoricalPeriods(user.id)
      .then((rows) => { setPeriods(rows); setDbAvailable(true); })
      .catch(() => setDbAvailable(false))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const effectivePeriods = useMemo(() => {
    if (periods.length > 0) return periods;
    return CONSOLIDATED_PERIODS.map((p, i) => ({
      id: `local-${i}`, user_id: user?.id ?? "",
      period_start: p.period_start, period_end: p.period_end,
      revenue: p.revenue, expenses: p.expenses, result: p.result,
      label: p.label, origin: p.origin, type: p.type,
      notes: p.notes ?? null, discrepancy_note: p.discrepancy_note ?? null,
    }));
  }, [periods, user?.id]);

  const now = new Date();
  const currentKey = monthKey(now);

  // Agrupa reais por mês
  const realByMonth = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>();
    for (const a of appointments) {
      if (a.is_historical) continue;
      const k = monthKey(new Date(a.started_at));
      const cur = map.get(k) ?? { revenue: 0, count: 0 };
      cur.revenue += a.price; cur.count += 1;
      map.set(k, cur);
    }
    return map;
  }, [appointments]);

  // Monta linhas de mês separando origem
  const months = useMemo(() => {
    const rows: MonthRow[] = [];
    const seen = new Set<string>();

    // Consolidados primeiro (ago, set, out)
    for (const p of effectivePeriods) {
      const key = p.period_start.slice(0, 7);
      if (seen.has(key)) continue;
      seen.add(key);
      const real = realByMonth.get(key);
      rows.push({
        key, label: monthLabel(key),
        revenue: Number(p.revenue), expenses: Number(p.expenses), result: Number(p.result),
        realCount: real?.count ?? 0,
        origin: "consolidado",
        isComplete: true,
        note: "Valor consolidado informado",
      });
    }

    // Meses só com reais (abr, mai, nov parcial etc.)
    for (const [key, data] of realByMonth) {
      if (seen.has(key)) continue;
      const isCurrent = key === currentKey;
      rows.push({
        key, label: monthLabel(key),
        revenue: data.revenue, expenses: 0, result: data.revenue,
        realCount: data.count,
        origin: isCurrent ? "parcial" : "real",
        isComplete: !isCurrent,
        note: isCurrent ? "Mês em andamento — apenas reais" : "Somente atendimentos reais",
      });
    }

    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }, [effectivePeriods, realByMonth, currentKey]);

  const current = months.find((m) => m.key === currentKey);
  const currentRev = current?.revenue ?? 0;
  const currentExp = current?.expenses ?? 0;
  const currentRes = currentRev - currentExp;
  const currentCount = current?.realCount ?? 0;

  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - daysElapsed);
  const workDaysLeft = Math.max(0, Math.floor(daysLeft * 6 / 7));
  const avgDaily = daysElapsed > 0 && currentRev > 0 ? currentRev / daysElapsed : 0;
  const projected = currentRev + avgDaily * workDaysLeft;
  const goalRem = Math.max(0, monthlyGoal - currentRev);
  const dailyNeed = workDaysLeft > 0 ? goalRem / workDaysLeft : goalRem;
  const goalPct = monthlyGoal > 0 ? (currentRev / monthlyGoal) * 100 : 0;

  // Comparações só entre meses completos equivalentes
  const comparisons = useMemo(() => {
    const complete = months.filter((m) => m.isComplete);
    const out: { from: string; to: string; dRev: number; dExp: number; dRes: number; note?: string }[] = [];
    for (let i = 1; i < complete.length; i++) {
      const a = complete[i - 1], b = complete[i];
      // Só compara se mesma origem ou ambos consolidados/reais fechados
      if (a.origin === b.origin || (a.origin === "consolidado" && b.origin === "consolidado")) {
        out.push({ from: a.label, to: b.label, dRev: b.revenue - a.revenue, dExp: b.expenses - a.expenses, dRes: b.result - a.result });
      } else {
        out.push({
          from: a.label, to: b.label,
          dRev: b.revenue - a.revenue, dExp: b.expenses - a.expenses, dRes: b.result - a.result,
          note: `Origens diferentes (${a.origin} → ${b.origin}). Comparação apenas informativa.`,
        });
      }
    }
    return out;
  }, [months]);

  // Serviços reais
  const services = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const a of appointments) {
      if (a.is_historical) continue;
      const cur = map.get(a.service_name) ?? { count: 0, revenue: 0 };
      cur.count += 1; cur.revenue += a.price;
      map.set(a.service_name, cur);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.revenue, 0);
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, share: total > 0 ? (v.revenue / total) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [appointments]);

  // Insights concretos
  const insights = useMemo(() => {
    const lines: string[] = [];
    if (currentRev > 0) {
      lines.push(`Novembro (em andamento): ${formatBRL(currentRev)} em ${currentCount} atendimento(s) real(is). Despesas conhecidas: ${formatBRL(currentExp)}. Resultado atual: ${formatBRL(currentRes)}.`);
    }
    if (monthlyGoal > 0) {
      lines.push(`Meta mensal ${formatBRL(monthlyGoal)}: ${goalPct.toFixed(0)}% atingido. Faltam ${formatBRL(goalRem)} (~${formatBRL(dailyNeed)}/dia útil).`);
    }
    if (projected > currentRev) {
      lines.push(`Projeção de fechamento: ${formatBRL(projected)} (média diária ${formatBRL(avgDaily)} × ${workDaysLeft} dias úteis restantes).`);
    }
    const cons = months.filter((m) => m.origin === "consolidado");
    if (cons.length >= 2) {
      const last = cons[cons.length - 1], prev = cons[cons.length - 2];
      if (last.expenses > prev.expenses && last.revenue > prev.revenue) {
        lines.push(`${prev.label} → ${last.label}: ganhos +${formatBRL(last.revenue - prev.revenue)}, mas despesas +${formatBRL(last.expenses - prev.expenses)}. Resultado ${last.result >= prev.result ? "subiu" : "caiu"} ${formatBRL(Math.abs(last.result - prev.result))}.`);
      }
    }
    if (services.length > 0) {
      const top = services[0];
      lines.push(`Serviço que mais gera receita (reais): ${top.name} — ${formatBRL(top.revenue)} (${top.share.toFixed(0)}%).`);
    }
    if (lines.length === 0) lines.push("Ainda não há dados suficientes para uma análise detalhada.");
    return lines;
  }, [currentRev, currentCount, currentExp, currentRes, monthlyGoal, goalPct, goalRem, dailyNeed, projected, avgDaily, workDaysLeft, months, services]);

  const maxRev = Math.max(...months.map((m) => m.revenue), 1);

  if (loading) return <section className="mt-6"><div className="h-20 animate-pulse rounded-2xl bg-secondary/50" /></section>;

  return (
    <section className="mt-6 space-y-4">
      {/* Hero card estilo referência */}
      <div className="rounded-3xl glass p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold tracking-tight">SASS</h2>
          <span className="rounded-full border border-emerald-400/40 px-3 py-1 text-[11px] font-medium text-emerald-400">
            Visão geral
          </span>
        </div>
        <p className="mt-4 text-[11px] font-medium tracking-wider text-muted-foreground">FATURAMENTO DO MÊS</p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{formatBRL(currentRev)}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-secondary/50 px-3 py-3">
            <p className="text-[12px] text-muted-foreground">Despesas</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(currentExp)}</p>
          </div>
          <div className="rounded-2xl bg-secondary/50 px-3 py-3">
            <p className="text-[12px] text-muted-foreground">Resultado</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${currentRes >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatBRL(currentRes)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-secondary/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold">Meta mensal</p>
            <span className="text-[13px] text-muted-foreground">{goalPct.toFixed(0)}% concluída</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${Math.min(100, goalPct)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Faltam {formatBRL(goalRem)}</span>
            <input
              type="number"
              value={monthlyGoal}
              onChange={(e) => setMonthlyGoal(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 rounded bg-secondary px-2 py-0.5 text-right text-[12px] tabular-nums outline-none"
            />
          </div>
        </div>
      </div>

      {/* Projeção */}
      <div className="rounded-2xl glass p-4">
        <p className="text-[13px] font-semibold">Projeção de fechamento</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(projected)}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Média diária {formatBRL(avgDaily)} × {workDaysLeft} dias úteis restantes
        </p>
      </div>

      {/* Evolução com origem clara */}
      <div className="rounded-2xl glass p-4">
        <p className="text-[11px] font-medium text-muted-foreground">Evolução por origem</p>
        <div className="mt-2 space-y-2">
          {months.map((m) => (
            <div key={m.key} className="flex items-center gap-2 text-[13px]">
              <span className="w-16 shrink-0 font-medium">{m.label}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary/70" style={{ width: `${(m.revenue / maxRev) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums font-medium">{formatBRL(m.revenue)}</span>
              <span className={`w-20 shrink-0 text-right text-[10px] ${m.origin === "consolidado" ? "text-primary" : m.origin === "parcial" ? "text-amber-400" : "text-muted-foreground"}`}>
                {m.origin === "consolidado" ? "consolidado" : m.origin === "parcial" ? "em andamento" : "reais"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Consolidado = valores informados (ago–out). Reais = atendimentos individuais. Em andamento = mês atual incompleto.
        </p>
      </div>

      {/* Comparações */}
      {comparisons.length > 0 && (
        <div className="rounded-2xl glass p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Comparação entre meses</p>
          <ul className="mt-2 space-y-2 text-[13px]">
            {comparisons.map((c, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-medium">{c.from} → {c.to}:</span> ganhos {c.dRev >= 0 ? "+" : ""}{formatBRL(c.dRev)}, despesas {c.dExp >= 0 ? "+" : ""}{formatBRL(c.dExp)}, resultado {c.dRes >= 0 ? "+" : ""}{formatBRL(c.dRes)}.
                {c.note && <span className="block text-[11px] text-amber-400/90">{c.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">Novembro não entra em comparação de mês fechado porque está incompleto.</p>
        </div>
      )}

      {/* Serviços */}
      {services.length > 0 && (
        <div className="rounded-2xl glass p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Serviços realizados (somente reais)</p>
          <ul className="mt-2 divide-y divide-border/30">
            {services.slice(0, 5).map((s) => (
              <li key={s.name} className="flex items-center justify-between py-2 text-[13px]">
                <div><span className="font-medium">{s.name}</span><span className="ml-2 text-[11px] text-muted-foreground">{s.count}× · {s.share.toFixed(0)}%</span></div>
                <span className="tabular-nums font-medium">{formatBRL(s.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Análise */}
      <div className="rounded-2xl glass p-4">
        <p className="text-[13px] font-semibold">Análise financeira</p>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
          {insights.map((l, i) => <li key={i}>• {l}</li>)}
        </ul>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Valores consolidados de ago–out/2026 conferidos. Atendimentos reais não são misturados no ticket médio nem na quantidade.
          {!dbAvailable && " Banco não acessível — usando fallback local."}
        </p>
      </div>
    </section>
  );
}
