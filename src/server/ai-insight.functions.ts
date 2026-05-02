import { createServerFn } from "@tanstack/react-start";

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
        projection: Math.max(0, Number(t.projection) || 0),
        atendimentos: Math.max(0, Math.floor(Number(t.atendimentos) || 0)),
        avgTicket: Math.max(0, Number(t.avgTicket) || 0),
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
    };

    const system = `Você é um analista de performance para barbeiros independentes.
Analise os dados (já calculados) e gere insights práticos. NUNCA invente números.
Use APENAS os dados fornecidos para metas e previsões. Responda em português.
Retorne SOMENTE um objeto JSON válido com as chaves exatas:
insight, diagnostico, acao, metaHoje, previsaoAmanha, previsaoSemana, padrao.
Cada texto: máximo 1 frase curta. Números devem ser realistas (R$, sem string).`;

    const user = `Dados (${data.periodLabel}):
${JSON.stringify(payload, null, 2)}

Gere o JSON com:
1. insight: principal observação do dia
2. diagnostico: o que os números mostram
3. acao: 1 ação prática para melhorar agora
4. metaHoje: meta de faturamento ideal para hoje (number, R$)
5. previsaoAmanha: faturamento esperado amanhã (number, R$)
6. previsaoSemana: faturamento esperado nos próximos 7 dias (number, R$)
7. padrao: padrão identificado nos dados`;

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
