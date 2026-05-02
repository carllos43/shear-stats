import { useEffect, useRef, useState } from "react";
import { Sparkles, Target, TrendingUp, CalendarDays } from "lucide-react";
import { generateAnalysis, type AnalysisResult } from "@/server/ai-insight.functions";
import { formatBRL } from "@/lib/haptics";

interface Props {
  total: number;
  goal: number;
  occupancy: number;
  workedMinutes: number;
  idleMinutes: number;
  projection: number;
  atendimentos: number;
  avgTicket: number;
  last7Days: number[];
  longestGapMinutes?: number;
  gapsCount?: number;
  ritmo?: number;
  ended?: boolean;
  weeklyHistory: Array<{
    week_start_date: string;
    total_revenue: number;
    total_clients: number;
    avg_ticket: number;
    avg_occupancy: number;
  }>;
  periodLabel?: string;
}

/** Cache em memória — 1 entrada por hash de payload. Evita chamadas repetidas. */
const cache = new Map<string, AnalysisResult>();
const hashKey = (p: Omit<Props, "periodLabel">) =>
  JSON.stringify({
    t: Math.round(p.total),
    g: Math.round(p.goal),
    o: Math.round(p.occupancy),
    w: Math.round(p.workedMinutes / 5),
    i: Math.round(p.idleMinutes / 5),
    p: Math.round(p.projection),
    a: p.atendimentos,
    av: Math.round(p.avgTicket),
    l7: p.last7Days.map((n) => Math.round(n)),
    wh: p.weeklyHistory.map((w) => Math.round(w.total_revenue)),
  });

export function AIInsightCard(props: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const key = hashKey(props);
    const cached = cache.get(key);
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await generateAnalysis({
          data: {
            today: {
              total: props.total,
              goal: props.goal,
              occupancy: props.occupancy,
              workedMinutes: props.workedMinutes,
              idleMinutes: props.idleMinutes,
              projection: props.projection,
              atendimentos: props.atendimentos,
              avgTicket: props.avgTicket,
            },
            last7Days: props.last7Days,
            weeklyHistory: props.weeklyHistory,
            periodLabel: props.periodLabel,
          },
        });
        if (id !== reqId.current) return;
        cache.set(key, res);
        setResult(res);
      } catch {
        if (id !== reqId.current) return;
        // mantém estado anterior se houver
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.total,
    props.goal,
    props.occupancy,
    props.workedMinutes,
    props.idleMinutes,
    props.projection,
    props.atendimentos,
    props.avgTicket,
    props.last7Days.join(","),
    props.weeklyHistory.length,
    props.periodLabel,
  ]);

  return (
    <>
      {/* Card principal: insight / diagnóstico / ação */}
      <div className="mt-4 rounded-3xl border border-white/5 bg-[#1C1C1E] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Análise inteligente
          </p>
          {result?.source === "ai" && (
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
              IA
            </span>
          )}
        </div>

        {loading && !result ? (
          <div className="mt-3 space-y-2">
            <span className="block h-3 w-3/4 animate-pulse rounded bg-white/10" />
            <span className="block h-3 w-2/3 animate-pulse rounded bg-white/10" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-white/10" />
          </div>
        ) : result ? (
          <div className="mt-2 space-y-2.5">
            <p className="text-sm leading-relaxed text-gray-100">{result.insight}</p>
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Diagnóstico
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-300">{result.diagnostico}</p>
            </div>
            <div className="rounded-2xl bg-primary/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Ação recomendada
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-100">{result.acao}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Seção Previsões */}
      {result && (
        <div className="mt-3 rounded-3xl border border-white/5 bg-[#1C1C1E] p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Previsões
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PredictionTile
              icon={<Target className="h-3.5 w-3.5" />}
              label="Meta hoje"
              value={formatBRL(result.metaHoje)}
            />
            <PredictionTile
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Amanhã"
              value={formatBRL(result.previsaoAmanha)}
            />
            <PredictionTile
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="Próx. 7 dias"
              value={formatBRL(result.previsaoSemana)}
            />
          </div>
          {result.padrao && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              <span className="font-semibold text-gray-400">Padrão:</span> {result.padrao}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function PredictionTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-black/30 px-3 py-2.5">
      <div className="flex items-center gap-1 text-gray-500">
        {icon}
        <p className="text-[9px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-1 text-sm font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}
