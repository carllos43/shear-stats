import { createServerFn } from "@tanstack/react-start";
import type { ReportAIInput, ReportAIResult } from "./report-ai.shared";
import { GATEWAY_URL, MODEL, localResult, clampStr } from "./report-ai.server";

export type { ReportAIInput, ReportAIResult } from "./report-ai.shared";

export const generateReportConsultancy = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): ReportAIInput => {
    const d = (raw ?? {}) as Partial<ReportAIInput>;
    return {
      rangeLabel: String(d.rangeLabel ?? "período"),
      fromISO: String(d.fromISO ?? ""),
      toISO: String(d.toISO ?? ""),
      daysCount: Math.max(1, Math.floor(Number(d.daysCount) || 1)),
      total: Math.max(0, Number(d.total) || 0),
      count: Math.max(0, Math.floor(Number(d.count) || 0)),
      avgTicket: Math.max(0, Number(d.avgTicket) || 0),
      occupancyPct: Math.max(0, Math.min(100, Number(d.occupancyPct) || 0)),
      workedHours: Math.max(0, Number(d.workedHours) || 0),
      idleHours: Math.max(0, Number(d.idleHours) || 0),
      revenuePerHour: Math.max(0, Number(d.revenuePerHour) || 0),
      trendPct:
        d.trendPct === null || d.trendPct === undefined
          ? null
          : Number(d.trendPct),
      prevTotal: Math.max(0, Number(d.prevTotal) || 0),
      bestWeekday: d.bestWeekday ?? null,
      worstWeekday: d.worstWeekday ?? null,
      bestHour: d.bestHour ?? null,
      topService: d.topService ?? null,
      weeklyScore: Math.max(0, Math.min(100, Number(d.weeklyScore) || 0)),
      forecast: d.forecast ?? { min: 0, likely: 0, max: 0 },
      weeklyHistory: Array.isArray(d.weeklyHistory)
        ? d.weeklyHistory.slice(0, 8)
        : [],
      localDiscoveries: Array.isArray(d.localDiscoveries)
        ? d.localDiscoveries.slice(0, 5).map(String)
        : [],
      localOpportunities: Array.isArray(d.localOpportunities)
        ? d.localOpportunities.slice(0, 5).map(String)
        : [],
      localExecutive: d.localExecutive ?? { headline: "", bullets: [] },
    };
  })
  .handler(async ({ data }): Promise<ReportAIResult> => {
    const fallback = localResult(data);
    if (data.total === 0 && data.count === 0) return fallback;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback;

    const system = `Você é consultor sênior de barbearias — gera análise executiva.
REGRAS:
- Português, tom direto, profissional, sem clichês.
- SEM markdown, SEM emojis, SEM aspas.
- Cite SEMPRE números reais dos dados.
- PROIBIDO: "talvez", "considere", "que tal", "faça promoção".
- Cada texto: 1 frase curta (máx 25 palavras).
- Responda APENAS JSON com chaves:
  {
    "executive": { "headline": string, "bullets": string[] (3 itens) },
    "discoveries": string[] (3 itens — padrões interpretados, não óbvios),
    "opportunities": [{ "title": string, "description": string }] (2-3 itens com cálculo),
    "forecastNarrative": string,
    "scoreNarrative": string
  }`;

    const user = `Período: ${data.rangeLabel} (${data.fromISO} até ${data.toISO}, ${data.daysCount} dias)

MÉTRICAS:
- Faturamento: R$ ${data.total.toFixed(0)} (anterior: R$ ${data.prevTotal.toFixed(0)}, tendência: ${data.trendPct === null ? "n/a" : data.trendPct.toFixed(0) + "%"})
- Atendimentos: ${data.count}
- Ticket médio: R$ ${data.avgTicket.toFixed(0)}
- Ocupação: ${data.occupancyPct.toFixed(0)}% (trabalhou ${data.workedHours.toFixed(1)}h, ocioso ${data.idleHours.toFixed(1)}h)
- Ganho/hora: R$ ${data.revenuePerHour.toFixed(0)}
- Score semanal: ${data.weeklyScore}/100
- Melhor dia: ${data.bestWeekday ? `${data.bestWeekday.name} (R$ ${data.bestWeekday.revenue.toFixed(0)})` : "n/a"}
- Pior dia: ${data.worstWeekday ? `${data.worstWeekday.name} (R$ ${data.worstWeekday.revenue.toFixed(0)})` : "n/a"}
- Melhor horário: ${data.bestHour ? `${String(data.bestHour.hour).padStart(2, "0")}h (R$ ${data.bestHour.revenue.toFixed(0)})` : "n/a"}
- Serviço campeão: ${data.topService ? `${data.topService.name} — ${data.topService.count}x, ticket R$ ${data.topService.avgTicket.toFixed(0)}, R$/h ${data.topService.revenuePerHour.toFixed(0)}` : "n/a"}
- Previsão próx. semana: R$ ${data.forecast.min} – R$ ${data.forecast.max} (provável R$ ${data.forecast.likely})

HISTÓRICO SEMANAL:
${
  data.weeklyHistory.length > 0
    ? data.weeklyHistory
        .map(
          (w) =>
            `- ${w.week_start_date}: R$ ${w.total_revenue} | ticket R$ ${w.avg_ticket} | ocup ${w.avg_occupancy}%`,
        )
        .join("\n")
    : "Sem histórico."
}

REFERÊNCIAS LOCAIS (use como base, melhore com interpretação):
- Descobertas: ${data.localDiscoveries.join(" | ")}
- Oportunidades: ${data.localOpportunities.join(" | ")}

Gere o JSON com 3 descobertas NÃO ÓBVIAS (interprete padrões cruzando dia/hora/serviço/ticket), 2-3 oportunidades com impacto financeiro calculado, e narrativa de previsão e score.`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 14000);
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return fallback;
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return fallback;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return fallback;
        try {
          parsed = JSON.parse(m[0]) as Record<string, unknown>;
        } catch {
          return fallback;
        }
      }

      const exec = (parsed.executive ?? {}) as { headline?: unknown; bullets?: unknown };
      const bulletsRaw = Array.isArray(exec.bullets) ? exec.bullets : [];
      const discoveriesRaw = Array.isArray(parsed.discoveries) ? parsed.discoveries : [];
      const oppRaw = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];

      return {
        executive: {
          headline: clampStr(exec.headline, fallback.executive.headline, 80),
          bullets: bulletsRaw
            .slice(0, 3)
            .map((b) => clampStr(b, "", 140))
            .filter((s) => s.length > 0),
        },
        discoveries: discoveriesRaw
          .slice(0, 3)
          .map((d) => clampStr(d, "", 180))
          .filter((s) => s.length > 0),
        opportunities: oppRaw
          .slice(0, 3)
          .map((o) => {
            const r = o as { title?: unknown; description?: unknown };
            return {
              title: clampStr(r.title, "", 80),
              description: clampStr(r.description, "", 180),
            };
          })
          .filter((o) => o.title.length > 0),
        forecastNarrative: clampStr(parsed.forecastNarrative, fallback.forecastNarrative, 200),
        scoreNarrative: clampStr(parsed.scoreNarrative, fallback.scoreNarrative, 180),
        source: "ai",
      };
    } catch {
      return fallback;
    }
  });
