import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { generateInsight } from "@/server/ai-insight.functions";

interface Props {
  total: number;
  goal: number;
  occupancy: number;
  periodLabel?: string;
}

/**
 * Insight curto gerado por IA com fallback local.
 * - Debounce 600ms para evitar chamadas em rajada quando os dados mudam.
 * - Nunca trava a UI: enquanto carrega, mostra placeholder discreto.
 */
export function AIInsightCard({ total, goal, occupancy, periodLabel }: Props) {
  const [insight, setInsight] = useState<string>("");
  const [source, setSource] = useState<"ai" | "local" | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await generateInsight({
          data: { total, goal, occupancy, periodLabel },
        });
        if (id !== reqId.current) return;
        setInsight(res.insight);
        setSource(res.source);
      } catch {
        if (id !== reqId.current) return;
        setInsight("Continue acompanhando seus números para identificar padrões.");
        setSource("local");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [total, goal, occupancy, periodLabel]);

  return (
    <div className="mt-4 rounded-3xl border border-white/5 bg-[#1C1C1E] p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Insight {source === "ai" ? "IA" : source === "local" ? "" : ""}
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-200">
        {loading && !insight ? (
          <span className="inline-block h-3 w-48 animate-pulse rounded bg-white/10" />
        ) : (
          insight
        )}
      </p>
    </div>
  );
}
