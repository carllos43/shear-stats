import type { AnalysisMode, DayScore, DayScoreValue } from "@/types/analysis";

export function calculateDayScore(
  faturamento: number,
  meta: number,
  ocupacao: number,
): DayScore {
  const faturamentoPercent = meta > 0 ? (faturamento / meta) * 100 : 0;
  let value: DayScoreValue;
  if (faturamentoPercent >= 100 && ocupacao >= 80) value = "forte";
  else if (faturamentoPercent >= 70 || ocupacao >= 60) value = "medio";
  else value = "fraco";

  return {
    value,
    faturamentoPercent: Math.round(faturamentoPercent * 10) / 10,
    ocupacaoPercent: Math.round(ocupacao * 10) / 10,
    metaAtingida: meta > 0 && faturamento >= meta,
  };
}

export function getScoreEmoji(s: DayScoreValue): string {
  return { forte: "🔥", medio: "⚠️", fraco: "❌" }[s];
}

export function getScoreLabel(s: DayScoreValue): string {
  return { forte: "Dia forte", medio: "Dia médio", fraco: "Dia fraco" }[s];
}

export function getModeLabel(m: AnalysisMode): string {
  return {
    geral: "Geral",
    faturamento: "Faturamento",
    tempo_ocupado: "Tempo Ocupado",
    performance: "Performance",
    crescimento: "Crescimento",
  }[m];
}

/** Cores para dark-mode (consistente com #1C1C1E base). */
export function getModeChipClass(m: AnalysisMode, active: boolean): string {
  if (!active) return "bg-white/5 text-gray-400 hover:bg-white/10";
  const map: Record<AnalysisMode, string> = {
    geral: "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/40",
    faturamento: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40",
    tempo_ocupado: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/40",
    performance: "bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/40",
    crescimento: "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40",
  };
  return map[m];
}
