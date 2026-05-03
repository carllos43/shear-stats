import { createServerFn } from "@tanstack/react-start";
import type {
  AnalysisItem,
  AnalysisMode,
  AnalysisDayData,
  AnalysisWeeklyStat,
  DayScore,
  AnalysisIcon,
  AnalysisType,
  Severity,
} from "@/types/analysis";

/* ============================================================
 * Tipos compartilhados
 * ============================================================ */

export interface InsightInput {
  total: number;
  goal: number;
  occupancy: number;
  periodLabel?: string;
}

export interface AnalysisInput {
  today: {
    total: number;
    goal: number;
    occupancy: number;        // 0..100
    idleMinutes: number;      // ocioso REAL (gaps)
    workedMinutes: number;
    longestGapMinutes?: number;
    gapsCount?: number;
    projection: number;
    atendimentos: number;
    avgTicket: number;
    ritmo?: number;           // R$/h real
    ended?: boolean;          // expediente encerrado?
  };
  last7Days: number[];        // faturamento dos últimos 7 dias (mais antigo → mais novo)
  weeklyHistory: Array<{
    week_start_date: string;
    total_revenue: number;
    total_clients: number;
    avg_ticket: number;
    avg_occupancy: number;
  }>;
  periodLabel?: string;
}

export interface AnalysisResult {
  insight: string;
  diagnostico: string;
  acao: string;
  metaHoje: number;
  previsaoAmanha: number;
  previsaoSemana: number;
  padrao: string;
  source: "ai" | "local";
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

/* ============================================================
 * Insight curto (compat — usado pelo AIInsightCard)
 * ============================================================ */

function localInsight(d: InsightInput): string {
  const percent = d.goal > 0 ? (d.total / d.goal) * 100 : 0;
  if (d.goal > 0 && percent >= 100) return "Meta batida. Excelente desempenho hoje.";
  if (d.goal > 0 && percent >= 70) return "Você está perto da meta. Continue nesse ritmo.";
  if (d.occupancy < 50) return "Baixa ocupação. Tente reduzir o tempo ocioso.";
  if (d.goal > 0 && percent < 30)
    return "Faturamento abaixo do esperado. Foque em atrair mais clientes.";
  return "Dia tranquilo. Ainda dá tempo de melhorar o faturamento.";
}

function sanitize(text: string): string {
  const clean = text.replace(/[*_`"#>]/g, "").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return firstSentence.length > 180 ? firstSentence.slice(0, 177) + "..." : firstSentence;
}

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

/* ============================================================
 * Análise completa (com previsões)
 * ============================================================ */

function avg(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sum(a: number[]): number {
  return a.reduce((s, v) => s + v, 0);
}

function localAnalysis(d: AnalysisInput): AnalysisResult {
  const last7 = d.last7Days.filter((x) => Number.isFinite(x));
  const media7 = avg(last7);
  const wh = d.weeklyHistory.filter((w) => w.total_revenue > 0);
  const mediaSemanal = avg(wh.map((w) => w.total_revenue));

  // crescimento entre as 2 semanas mais recentes
  let crescimento = 0;
  if (wh.length >= 2) {
    const a = wh[1].total_revenue;
    const b = wh[0].total_revenue;
    if (a > 0) crescimento = (b - a) / a;
  }
  const previsaoSemana = mediaSemanal > 0
    ? Math.round(mediaSemanal * (1 + Math.max(-0.3, Math.min(0.3, crescimento))))
    : Math.round(media7 * 7);

  // previsão amanhã: média do mesmo dia da semana, ajustada por ocupação atual
  const tomorrowDow = (new Date().getDay() + 1) % 7;
  const sameDow = last7.filter((_, i) => {
    const d2 = new Date();
    d2.setDate(d2.getDate() - (6 - i));
    return d2.getDay() === tomorrowDow;
  });
  const baseAmanha = sameDow.length > 0 ? avg(sameDow) : media7;
  const ajusteOcup = d.today.occupancy > 0 ? 0.85 + (d.today.occupancy / 100) * 0.3 : 1;
  const previsaoAmanha = Math.round(baseAmanha * ajusteOcup);

  // meta: média + leve crescimento (5–10%)
  const baseMeta = mediaSemanal > 0 ? mediaSemanal / 6 : media7;
  const goal = d.today.goal > 0 ? d.today.goal : Math.max(baseMeta * 1.07, 100);

  const pct = goal > 0 ? (d.today.total / goal) * 100 : 0;
  const ticket = d.today.avgTicket;
  const at = d.today.atendimentos;

  let insight: string;
  if (d.today.ended) {
    insight = `Dia encerrado com ${at} atendimento${at !== 1 ? "s" : ""} e ticket médio R$ ${ticket.toFixed(2)}.`;
  } else if (at === 0) {
    insight = "Sem atendimentos ainda hoje. Acione clientes pelo WhatsApp.";
  } else {
    insight = `Você atendeu ${at} cliente${at !== 1 ? "s" : ""} com ticket médio R$ ${ticket.toFixed(2)}.`;
  }

  const longest = d.today.longestGapMinutes ?? 0;
  const idleH = (d.today.idleMinutes / 60).toFixed(1);
  let diagnostico: string;
  if (longest >= 60 && d.today.idleMinutes > 0) {
    const longestH = (longest / 60).toFixed(1);
    diagnostico = `${idleH}h ociosas hoje, sendo ${longestH}h no maior intervalo sem cliente.`;
  } else if (d.today.occupancy < 50 && d.today.workedMinutes > 0) {
    diagnostico = `Ocupação de ${d.today.occupancy.toFixed(0)}% — agenda com ${idleH}h livres.`;
  } else if (at > 0) {
    diagnostico = `${at} atendimentos a R$ ${ticket.toFixed(2)} de média totalizam R$ ${d.today.total.toFixed(2)}.`;
  } else {
    diagnostico = "Sem dados suficientes para diagnóstico do dia.";
  }

  let acao: string;
  if (at > 0 && ticket > 0 && ticket < 45) {
    const novo = ticket + 10;
    const projetado = Math.round(at * novo);
    acao = `Suba o ticket para R$ ${novo.toFixed(0)} sugerindo combo (corte+barba): faturaria R$ ${projetado} hoje.`;
  } else if (longest >= 60) {
    acao = "Ofereça encaixe no WhatsApp para preencher o maior intervalo livre.";
  } else if (pct < 70 && goal > 0) {
    const falta = Math.max(0, Math.round(goal - d.today.total));
    acao = `Faltam R$ ${falta} para a meta — agende mais 1 cliente antes do fim do expediente.`;
  } else {
    acao = "Mantenha o ritmo. Ajuste preço dos serviços mais procurados.";
  }

  return {
    insight,
    diagnostico,
    acao,
    metaHoje: Math.round(goal),
    previsaoAmanha,
    previsaoSemana,
    padrao:
      wh.length >= 2
        ? `Média semanal: R$ ${mediaSemanal.toFixed(0)} (variação ${(crescimento * 100).toFixed(0)}%).`
        : last7.length >= 3
          ? `Média diária dos últimos 7 dias: R$ ${media7.toFixed(0)}.`
          : "Histórico ainda curto para identificar padrões.",
    source: "local",
  };
}

function clampNumber(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  // teto sanidade: 100x meta ou 100x média7
  return Math.min(v, 1_000_000);
}

function clampStr(s: unknown, fallback: string, max = 220): string {
  if (typeof s !== "string") return fallback;
  const t = s.replace(/[*_`"#>]/g, "").trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

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

/* ============================================================
 * Análise avançada multi-modo (insights estruturados)
 * ============================================================ */

interface AdvancedInput {
  mode: AnalysisMode;
  dayData: AnalysisDayData;
  weeklyStats: AnalysisWeeklyStat[];
  previousAnalyses: Array<{ timestamp: string; insights: string[] }>;
  score: DayScore;
  seed: number;
}

const ALLOWED_TYPES: AnalysisType[] = [
  "insight",
  "diagnostico",
  "acao",
  "oportunidade",
  "alerta",
];
const ALLOWED_ICONS: AnalysisIcon[] = [
  "trending_up",
  "warning",
  "lightbulb",
  "schedule",
  "attach_money",
];
const ALLOWED_SEV: Severity[] = ["alta", "media", "baixa"];

function pick<T>(allowed: readonly T[], v: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function modeFocus(m: AnalysisMode): string {
  switch (m) {
    case "geral":
      return "Visão integrada: conecte faturamento, ocupação e atendimentos.";
    case "faturamento":
      return "Foque em receita, ticket médio e oportunidades de aumentar receita.";
    case "tempo_ocupado":
      return "Analise gaps na agenda e otimização de ocupação.";
    case "performance":
      return "Avalie produtividade e gargalos operacionais.";
    case "crescimento":
      return "Identifique tendências e projeções com base no histórico.";
  }
}

function localAdvancedItems(input: AdvancedInput): AnalysisItem[] {
  const { dayData: d, score, mode, weeklyStats } = input;
  const items: AnalysisItem[] = [];
  const pct = score.faturamentoPercent;
  const mediaSemanal =
    weeklyStats.length > 0
      ? weeklyStats.reduce((s, w) => s + w.faturamento, 0) / weeklyStats.length
      : 0;

  // INSIGHT principal sempre presente
  items.push({
    tipo: "insight",
    texto:
      d.agendamentos_realizados > 0
        ? `Você fez R$ ${d.faturamento.toFixed(0)} em ${d.agendamentos_realizados} atendimentos (ticket R$ ${d.ticket_medio.toFixed(0)}).`
        : "Sem atendimentos realizados ainda neste período.",
    severidade: "media",
    icone_sugerido: "trending_up",
  });

  // DIAGNÓSTICO
  items.push({
    tipo: "diagnostico",
    texto: score.metaAtingida
      ? `Meta batida (${pct.toFixed(0)}%) com ${d.ocupacao_percent.toFixed(0)}% de ocupação.`
      : `${pct.toFixed(0)}% da meta atingida; ocupação em ${d.ocupacao_percent.toFixed(0)}%.`,
    severidade: pct < 50 ? "alta" : pct < 80 ? "media" : "baixa",
    icone_sugerido: "schedule",
  });

  // AÇÃO
  if (d.ticket_medio > 0 && d.ticket_medio < 45 && d.agendamentos_realizados > 0) {
    const novo = d.ticket_medio + 10;
    items.push({
      tipo: "acao",
      texto: `Suba o ticket para R$ ${novo.toFixed(0)} com combo: faria R$ ${(d.agendamentos_realizados * novo).toFixed(0)} hoje.`,
      severidade: "media",
      icone_sugerido: "attach_money",
    });
  } else if (!score.metaAtingida && d.meta > 0) {
    const falta = Math.max(0, d.meta - d.faturamento);
    items.push({
      tipo: "acao",
      texto: `Faltam R$ ${falta.toFixed(0)} para a meta — agende mais 1 cliente antes de fechar.`,
      severidade: "alta",
      icone_sugerido: "lightbulb",
    });
  } else {
    items.push({
      tipo: "acao",
      texto: "Mantenha o ritmo e reforce upsell de barba nos próximos atendimentos.",
      severidade: "baixa",
      icone_sugerido: "lightbulb",
    });
  }

  // OPORTUNIDADE / ALERTA opcional baseado em modo
  if (mode === "tempo_ocupado" && d.ocupacao_percent < 60) {
    items.push({
      tipo: "oportunidade",
      texto: `Ocupação em ${d.ocupacao_percent.toFixed(0)}% — há janelas livres para encaixe via WhatsApp.`,
      severidade: "media",
      icone_sugerido: "schedule",
    });
  }
  if (mode === "crescimento" && mediaSemanal > 0) {
    items.push({
      tipo: "oportunidade",
      texto: `Média semanal histórica: R$ ${mediaSemanal.toFixed(0)}. Ritmo atual define a próxima semana.`,
      severidade: "baixa",
      icone_sugerido: "trending_up",
    });
  }
  if (pct < 40 && d.meta > 0) {
    items.push({
      tipo: "alerta",
      texto: `Faturamento muito abaixo da meta (${pct.toFixed(0)}%) — revisar agenda do dia.`,
      severidade: "alta",
      icone_sugerido: "warning",
    });
  }

  return items.slice(0, 5);
}

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

