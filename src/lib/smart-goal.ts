/**
 * Meta inteligente dinâmica.
 * Cálculo 100% local — IA pode complementar texto, mas nunca altera números.
 */

export type GoalDifficulty = "facil" | "normal" | "agressiva";

export interface SmartGoalInput {
  /** Faturamento já realizado HOJE (R$). */
  currentRevenue: number;
  /** Ticket médio histórico (R$). */
  avgTicket: number;
  /** Faturamento dos últimos 7 dias (mais antigo → mais novo). */
  last7Days: number[];
  /** Histórico semanal (faturamento por semana). */
  weeklyRevenues?: number[];
  /** Meta manual configurada (fallback). */
  manualGoal: number;
  /** Minutos do início do expediente de hoje. */
  startMin: number;
  /** Minutos do fim do expediente de hoje. */
  endMin: number;
  /** Minutos atuais (hora atual). */
  nowMin: number;
  /** Minutos efetivamente trabalhados até agora. */
  workedMinutes: number;
}

export interface SmartGoal {
  /** Meta base (média histórica). */
  baseGoal: number;
  /** Projeção do dia no ritmo atual. */
  projected: number;
  /** Tendência semanal (média diária da semana). */
  weeklyTrend: number;
  /** Meta final = média ponderada de baseGoal/projected/weeklyTrend. */
  finalGoal: number;
  /** Quanto falta para a meta. */
  remaining: number;
  /** Ritmo R$/h necessário para bater a meta. */
  requiredRate: number;
  /** Tempo restante de expediente, em minutos. */
  remainingMinutes: number;
  /** Classificação do desafio. */
  difficulty: GoalDifficulty;
  /** Texto curto pronto para exibir. */
  message: string;
  /** % atingido da meta final. */
  progressPct: number;
  /** Indica se o expediente já encerrou. */
  ended: boolean;
}

function avg(nums: number[]): number {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0) return 0;
  return valid.reduce((s, n) => s + n, 0) / valid.length;
}

export function computeSmartGoal(i: SmartGoalInput): SmartGoal {
  const FALLBACK = i.manualGoal > 0 ? i.manualGoal : 300;

  // 1) Meta base = média dos últimos 7 dias (>0). Fallback: weekly_stats. Fallback: manual.
  const last7Avg = avg(i.last7Days);
  const weeklyAvg = avg(i.weeklyRevenues ?? []) / 7; // média diária a partir das semanas
  const baseGoal =
    last7Avg > 0 ? last7Avg : weeklyAvg > 0 ? weeklyAvg : FALLBACK;

  // 2) Projeção do dia
  const workedHours = i.workedMinutes / 60;
  const totalHours = Math.max(0, (i.endMin - i.startMin) / 60);
  const projected =
    workedHours > 0 && totalHours > 0
      ? (i.currentRevenue / workedHours) * totalHours
      : i.currentRevenue;

  // 3) Tendência semanal (mesmo conceito de daily)
  const weeklyTrend = weeklyAvg > 0 ? weeklyAvg : last7Avg;

  // 4) Meta final = média entre base, projeção e tendência (somente valores válidos)
  const parts = [baseGoal, projected, weeklyTrend].filter((n) => n > 0);
  const finalGoal = parts.length > 0 ? parts.reduce((s, n) => s + n, 0) / parts.length : FALLBACK;

  // 5) Cálculos derivados
  const remaining = Math.max(0, finalGoal - i.currentRevenue);
  const remainingMinutes = Math.max(0, i.endMin - i.nowMin);
  const remainingHours = remainingMinutes / 60;
  const requiredRate = remainingHours > 0 ? remaining / remainingHours : 0;
  const ended = remainingMinutes <= 0;

  // 6) Classificação
  let difficulty: GoalDifficulty = "normal";
  if (i.avgTicket > 0 && requiredRate > 0) {
    const ratio = requiredRate / i.avgTicket;
    if (ratio < 0.8) difficulty = "facil";
    else if (ratio > 1.4) difficulty = "agressiva";
    else difficulty = "normal";
  } else if (remaining === 0) {
    difficulty = "facil";
  }

  // 7) Texto curto
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  let message: string;
  if (ended) {
    message =
      i.currentRevenue >= finalGoal
        ? `Meta de ${fmt(finalGoal)} batida. Excelente fechamento. 🔥`
        : `Expediente encerrado em ${fmt(i.currentRevenue)} (meta era ${fmt(finalGoal)}).`;
  } else if (remaining === 0) {
    message = `Meta de ${fmt(finalGoal)} já atingida. Tudo daqui em diante é lucro extra.`;
  } else {
    const horasTxt =
      remainingMinutes >= 60
        ? `${(remainingMinutes / 60).toFixed(1)}h`
        : `${remainingMinutes}min`;
    message = `Para atingir ${fmt(finalGoal)} hoje, mantenha um ritmo de ${fmt(requiredRate)}/h nas próximas ${horasTxt}.`;
  }

  const progressPct = finalGoal > 0 ? Math.min(100, (i.currentRevenue / finalGoal) * 100) : 0;

  return {
    baseGoal,
    projected,
    weeklyTrend,
    finalGoal,
    remaining,
    requiredRate,
    remainingMinutes,
    difficulty,
    message,
    progressPct,
    ended,
  };
}
