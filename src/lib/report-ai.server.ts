import type { ReportAIInput, ReportAIResult } from "./report-ai.shared";

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "google/gemini-2.5-flash";

export function localResult(d: ReportAIInput): ReportAIResult {
  return {
    executive: d.localExecutive,
    discoveries: d.localDiscoveries,
    opportunities: d.localOpportunities.map((t) => ({
      title: t,
      description: "",
    })),
    forecastNarrative: `Próxima semana tende a fechar entre R$ ${d.forecast.min.toLocaleString("pt-BR")} e R$ ${d.forecast.max.toLocaleString("pt-BR")}.`,
    scoreNarrative:
      d.weeklyScore >= 75
        ? "Score alto — período sólido."
        : d.weeklyScore >= 50
          ? "Score médio — há espaço claro para crescer."
          : "Score baixo — corrija os pontos críticos.",
    source: "local",
  };
}

export function clampStr(s: unknown, fallback: string, max = 220): string {
  if (typeof s !== "string") return fallback;
  const t = s.replace(/[*_`"#>]/g, "").trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}
