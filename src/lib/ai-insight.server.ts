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
import type {
  InsightInput,
  AnalysisInput,
  AnalysisResult,
  AdvancedInput,
} from "./ai-insight.shared";

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "google/gemini-2.5-flash";

/* ============================================================
 * Insight curto (compat — usado pelo AIInsightCard)
 * ============================================================ */

export function localInsight(d: InsightInput): string {
  const percent = d.goal > 0 ? (d.total / d.goal) * 100 : 0;
  if (d.goal > 0 && percent >= 100) return "Meta batida. Excelente desempenho hoje.";
  if (d.goal > 0 && percent >= 70) return "Você está perto da meta. Continue nesse ritmo.";
  if (d.occupancy < 50) return "Baixa ocupação. Tente reduzir o tempo ocioso.";
  if (d.goal > 0 && percent < 30)
    return "Faturamento abaixo do esperado. Foque em atrair mais clientes.";
  return "Dia tranquilo. Ainda dá tempo de melhorar o faturamento.";
}

export function sanitize(text: string): string {
  const clean = text.replace(/[*_`"#>]/g, "").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return firstSentence.length > 180 ? firstSentence.slice(0, 177) + "..." : firstSentence;
}

export function avg(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, v) => s + v, 0) / a.length;
}
export function sum(a: number[]): number {
  return a.reduce((s, v) => s + v, 0);
}

export function localAnalysis(d: AnalysisInput): AnalysisResult {
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

export function clampNumber(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  // teto sanidade: 100x meta ou 100x média7
  return Math.min(v, 1_000_000);
}

export function clampStr(s: unknown, fallback: string, max = 220): string {
  if (typeof s !== "string") return fallback;
  const t = s.replace(/[*_`"#>]/g, "").trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

export const ALLOWED_TYPES: AnalysisType[] = [
  "insight",
  "diagnostico",
  "acao",
  "oportunidade",
  "alerta",
];
export const ALLOWED_ICONS: AnalysisIcon[] = [
  "trending_up",
  "warning",
  "lightbulb",
  "schedule",
  "attach_money",
];
export const ALLOWED_SEV: Severity[] = ["alta", "media", "baixa"];

export function pick<T>(allowed: readonly T[], v: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

export function modeFocus(m: AnalysisMode): string {
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

export function localAdvancedItems(input: AdvancedInput): AnalysisItem[] {
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
