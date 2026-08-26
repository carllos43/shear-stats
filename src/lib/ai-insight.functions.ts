import { createServerFn } from "@tanstack/react-start";
import type {
  AnalysisItem,
  AnalysisMode,
  AnalysisDayData,
  AnalysisWeeklyStat,
  DayScore,
} from "@/types/analysis";
import type {
  InsightInput,
  AnalysisInput,
  AnalysisResult,
  AdvancedInput,
} from "./ai-insight.shared";
import {
  GATEWAY_URL,
  MODEL,
  localInsight,
  sanitize,
  localAnalysis,
  clampNumber,
  clampStr,
  ALLOWED_TYPES,
  ALLOWED_ICONS,
  ALLOWED_SEV,
  pick,
  modeFocus,
  localAdvancedItems,
} from "./ai-insight.server";

export type { InsightInput, AnalysisInput, AnalysisResult } from "./ai-insight.shared";

export const generateInsight = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Partial<InsightInput>;
    return {
      total: Number(d.total) || 0,
      goal: Number(d.goal) || 0,
      occupancy: Math.max(0, Math.min(100, Number(d.occupancy) || 0)),
      periodLabel: typeof d.periodLabel === "string" ? d.periodLabel : "hoje",
    } satisfies InsightInput;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { insight: localInsight(data), source: "local" as const };

    const prompt = `Você é um assistente para barbeiro. Dados (${data.periodLabel}):
Faturamento: R$ ${data.total.toFixed(2)}
Meta: R$ ${data.goal.toFixed(2)}
Ocupação: ${data.occupancy.toFixed(0)}%

Gere UM insight curto (1 frase, máximo 25 palavras), direto, em português, sem aspas e sem markdown.`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "Responda em português com UMA frase curta, prática e direta." },
            { role: "user", content: prompt },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) return { insight: localInsight(data), source: "local" as const };
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return { insight: localInsight(data), source: "local" as const };
      return { insight: sanitize(text), source: "ai" as const };
    } catch {
      return { insight: localInsight(data), source: "local" as const };
    }
  });

export const generateAnalysis = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): AnalysisInput => {
    const d = (raw ?? {}) as Partial<AnalysisInput>;
    const t = (d.today ?? {}) as Partial<AnalysisInput["today"]>;
    return {
      today: {
        total: Number(t.total) || 0,
        goal: Number(t.goal) || 0,
        occupancy: Math.max(0, Math.min(100, Number(t.occupancy) || 0)),
        idleMinutes: Math.max(0, Number(t.idleMinutes) || 0),
        workedMinutes: Math.max(0, Number(t.workedMinutes) || 0),
        longestGapMinutes: Math.max(0, Number(t.longestGapMinutes) || 0),
        gapsCount: Math.max(0, Math.floor(Number(t.gapsCount) || 0)),
        projection: Math.max(0, Number(t.projection) || 0),
        atendimentos: Math.max(0, Math.floor(Number(t.atendimentos) || 0)),
        avgTicket: Math.max(0, Number(t.avgTicket) || 0),
        ritmo: Math.max(0, Number(t.ritmo) || 0),
        ended: Boolean(t.ended),
      },
      last7Days: Array.isArray(d.last7Days)
        ? d.last7Days.map((n) => Math.max(0, Number(n) || 0)).slice(0, 30)
        : [],
      weeklyHistory: Array.isArray(d.weeklyHistory)
        ? d.weeklyHistory.slice(0, 8).map((w) => ({
            week_start_date: String(w?.week_start_date ?? ""),
            total_revenue: Number(w?.total_revenue) || 0,
            total_clients: Number(w?.total_clients) || 0,
            avg_ticket: Number(w?.avg_ticket) || 0,
            avg_occupancy: Number(w?.avg_occupancy) || 0,
          }))
        : [],
      periodLabel: typeof d.periodLabel === "string" ? d.periodLabel : "hoje",
    };
  })
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const fallback = localAnalysis(data);

    // Guardas: sem dados → não chama IA
    if (data.today.total === 0 && data.today.atendimentos === 0 && data.last7Days.every((v) => v === 0)) {
      return fallback;
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback;

    const payload = {
      hoje: data.today,
      ultimos7Dias: data.last7Days,
      historicoSemanal: data.weeklyHistory,
      previsoesBase: {
        metaHoje: fallback.metaHoje,
        previsaoAmanha: fallback.previsaoAmanha,
        previsaoSemana: fallback.previsaoSemana,
      },
    };

    const system = `Você é analista de performance para barbeiro independente.
REGRAS RÍGIDAS:
- Use SEMPRE números reais dos dados (atendimentos, ticket médio, R$, ocupação, gaps).
- PROIBIDO: "talvez", "considere", "pense em", "que tal", "faça promoção".
- PROIBIDO frases genéricas. Cada frase DEVE citar pelo menos 1 número concreto.
- Cite ticket médio, faturamento ou tempo ocioso REAL ao dar conselhos.
- Para "acao": dê 1 ação específica com número (ex.: "Suba ticket de R$30 para R$40 → R$280 hoje").
- Use as previsoesBase como referência; só altere se houver razão clara nos dados.
- Responda APENAS JSON válido, chaves: insight, diagnostico, acao, metaHoje, previsaoAmanha, previsaoSemana, padrao.
- Cada texto: 1 frase, máx 25 palavras. Números puros (sem "R$" string).`;

    const user = `Dados (${data.periodLabel}):
${JSON.stringify(payload, null, 2)}

Gere JSON com insight (observação principal com número), diagnostico (o que os números mostram), acao (ação concreta com cálculo), metaHoje, previsaoAmanha, previsaoSemana, padrao.`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 12000);
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
        // tenta extrair JSON do meio do texto
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return fallback;
        try {
          parsed = JSON.parse(m[0]) as Record<string, unknown>;
        } catch {
          return fallback;
        }
      }

      return {
        insight: clampStr(parsed.insight, fallback.insight),
        diagnostico: clampStr(parsed.diagnostico, fallback.diagnostico),
        acao: clampStr(parsed.acao, fallback.acao),
        metaHoje: clampNumber(parsed.metaHoje, fallback.metaHoje),
        previsaoAmanha: clampNumber(parsed.previsaoAmanha, fallback.previsaoAmanha),
        previsaoSemana: clampNumber(parsed.previsaoSemana, fallback.previsaoSemana),
        padrao: clampStr(parsed.padrao, fallback.padrao),
        source: "ai",
      };
    } catch {
      return fallback;
    }
  });

export const generateAdvancedAnalysis = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): AdvancedInput => {
    const r = (raw ?? {}) as Partial<AdvancedInput>;
    const d = (r.dayData ?? {}) as Partial<AnalysisDayData>;
    const s = (r.score ?? {}) as Partial<DayScore>;
    const allowedModes: AnalysisMode[] = [
      "geral",
      "faturamento",
      "tempo_ocupado",
      "performance",
      "crescimento",
    ];
    return {
      mode: allowedModes.includes(r.mode as AnalysisMode)
        ? (r.mode as AnalysisMode)
        : "geral",
      dayData: {
        date: String(d.date ?? new Date().toISOString().slice(0, 10)),
        faturamento: Math.max(0, Number(d.faturamento) || 0),
        meta: Math.max(0, Number(d.meta) || 0),
        ocupacao_percent: Math.max(0, Math.min(100, Number(d.ocupacao_percent) || 0)),
        total_agendamentos: Math.max(0, Math.floor(Number(d.total_agendamentos) || 0)),
        agendamentos_realizados: Math.max(
          0,
          Math.floor(Number(d.agendamentos_realizados) || 0),
        ),
        ticket_medio: Math.max(0, Number(d.ticket_medio) || 0),
      },
      weeklyStats: Array.isArray(r.weeklyStats)
        ? r.weeklyStats.slice(0, 8).map((w) => ({
            week_start: String((w as AnalysisWeeklyStat)?.week_start ?? ""),
            faturamento: Number((w as AnalysisWeeklyStat)?.faturamento) || 0,
            ocupacao: Number((w as AnalysisWeeklyStat)?.ocupacao) || 0,
          }))
        : [],
      previousAnalyses: Array.isArray(r.previousAnalyses)
        ? r.previousAnalyses.slice(0, 5).map((p) => ({
            timestamp: String(p?.timestamp ?? ""),
            insights: Array.isArray(p?.insights)
              ? p.insights.slice(0, 5).map((x) => String(x))
              : [],
          }))
        : [],
      score: {
        value: pick(["forte", "medio", "fraco"] as const, s.value, "medio"),
        faturamentoPercent: Number(s.faturamentoPercent) || 0,
        ocupacaoPercent: Number(s.ocupacaoPercent) || 0,
        metaAtingida: Boolean(s.metaAtingida),
      },
      seed: Math.floor(Number(r.seed) || 0),
    };
  })
  .handler(async ({ data }): Promise<{ items: AnalysisItem[]; source: "ai" | "local" }> => {
    const fallback = { items: localAdvancedItems(data), source: "local" as const };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback;

    const previousTexts =
      data.previousAnalyses.length > 0
        ? data.previousAnalyses
            .map(
              (p, i) => `[${i + 1}] ${p.timestamp}: ${p.insights.join(" | ")}`,
            )
            .join("\n")
        : "Nenhuma.";
    const weeklyTexts =
      data.weeklyStats.length > 0
        ? data.weeklyStats
            .map((w) => `- ${w.week_start}: R$ ${w.faturamento}, ${w.ocupacao}% ocupação`)
            .join("\n")
        : "Sem histórico.";

    const system = `Você é consultor sênior de barbearias. Gere análises objetivas em JSON.
REGRAS:
- Entre 3 e 5 itens.
- tipo ∈ {insight, diagnostico, acao, oportunidade, alerta}
- icone_sugerido ∈ {trending_up, warning, lightbulb, schedule, attach_money}
- severidade ∈ {alta, media, baixa}
- Cada texto: máximo 200 caracteres, cite números reais.
- NÃO repita insights anteriores.
- Responda APENAS JSON: {"items":[...]}`;

    const user = `Modo: ${data.mode}
Foco: ${modeFocus(data.mode)}
Score do dia: ${data.score.value} (${data.score.faturamentoPercent}% meta, ${data.score.ocupacaoPercent}% ocupação)

Dados do dia:
- Data: ${data.dayData.date}
- Faturamento: R$ ${data.dayData.faturamento}
- Meta: R$ ${data.dayData.meta}
- Ocupação: ${data.dayData.ocupacao_percent}%
- Atendimentos: ${data.dayData.agendamentos_realizados}/${data.dayData.total_agendamentos}
- Ticket médio: R$ ${data.dayData.ticket_medio}

Histórico semanal:
${weeklyTexts}

Análises anteriores (NÃO REPITA):
${previousTexts}

Seed: ${data.seed}`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 12000);
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

      let parsed: { items?: unknown };
      try {
        parsed = JSON.parse(text) as { items?: unknown };
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return fallback;
        try {
          parsed = JSON.parse(m[0]) as { items?: unknown };
        } catch {
          return fallback;
        }
      }

      const arr = Array.isArray(parsed.items) ? parsed.items : [];
      const items: AnalysisItem[] = arr
        .slice(0, 5)
        .map((raw): AnalysisItem => {
          const r = raw as Partial<AnalysisItem>;
          const texto = clampStr(r.texto, "", 200);
          return {
            tipo: pick(ALLOWED_TYPES, r.tipo, "insight"),
            texto,
            severidade: pick(ALLOWED_SEV, r.severidade, "media"),
            icone_sugerido: pick(ALLOWED_ICONS, r.icone_sugerido, "lightbulb"),
          };
        })
        .filter((it) => it.texto.length > 0);

      if (items.length < 3) return fallback;
      return { items, source: "ai" };
    } catch {
      return fallback;
    }
  });

