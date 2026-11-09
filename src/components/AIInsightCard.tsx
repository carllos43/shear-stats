import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Target, TrendingUp, CalendarDays } from "lucide-react";
import { generateAnalysis, type AnalysisResult } from "@/lib/ai-insight.functions";
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
              longestGapMinutes: props.longestGapMinutes ?? 0,
              gapsCount: props.gapsCount ?? 0,
              projection: props.projection,
              atendimentos: props.atendimentos,
              avgTicket: props.avgTicket,
              ritmo: props.ritmo ?? 0,
              ended: props.ended ?? false,
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
        toast.error("A análise inteligente não respondeu", {
          description: "Mostrando os dados calculados. Tente novamente mais tarde.",
        });
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
      <div className="mt-5 rounded-2xl bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={2} />
          <p className="text-[13px] font-semibold tracking-tight">Análise inteligente</p>
          {result?.source === "ai" && (
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              IA
            </span>
          )}
        </div>

        {loading && !result ? (
          <div className="mt-4 space-y-2">
            <span className="block h-3 w-4/5 animate-pulse rounded-md bg-secondary" />
            <span className="block h-3 w-3/5 animate-pulse rounded-md bg-secondary" />
            <span className="block h-3 w-2/5 animate-pulse rounded-md bg-secondary" />
          </div>
        ) : result ? (
          <div className="mt-3 space-y-3">
            <p className="text-[15px] leading-snug text-foreground/95">{result.insight}</p>
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Diagnóstico</p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{result.diagnostico}</p>
            </div>
            <div className="rounded-xl bg-primary/8 p-3">
              <p className="text-[11px] font-medium text-primary">Ação recomendada</p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">{result.acao}</p>
            </div>
          </div>
        ) : null}
      </div>

      {result && (
        <div className="mt-3 rounded-2xl bg-card p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" strokeWidth={2} />
            <p className="text-[13px] font-semibold tracking-tight">Previsões</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PredictionTile icon={<Target className="h-3.5 w-3.5" />} label="Meta hoje" value={formatBRL(result.metaHoje)} />
            <PredictionTile icon={<TrendingUp className="h-3.5 w-3.5" />} label="Amanhã" value={formatBRL(result.previsaoAmanha)} />
            <PredictionTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="Próx. 7 dias" value={formatBRL(result.previsaoSemana)} />
          </div>
          {result.padrao && (
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-medium">Padrão:</span> {result.padrao}
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
    <div className="rounded-xl bg-secondary/40 px-2.5 py-2.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <p className="text-[10px] font-medium">{label}</p>
      </div>
      <p className="mt-1 text-[13px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
