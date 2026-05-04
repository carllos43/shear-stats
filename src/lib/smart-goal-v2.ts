/**
 * Smart Goal V2 — meta dinâmica adaptativa.
 * 100% local, O(1). IA pode complementar mensagens, nunca números.
 */

export type GoalDifficultyV2 = "easy" | "medium" | "hard";
export type GoalStrategyV2 = "acelerar" | "manter" | "encerrado";
export type TrendDirection = "up" | "down" | "stable";

export interface WeeklyStatV2 {
  totalRevenue: number;
  totalMinutes: number;
  totalAppointments: number;
}

export interface SmartGoalV2Input {
  todayRevenue: number;
  todayAppointments: number;
  occupancy: number;
  workedMinutes: number;
  remainingMinutes: number;
  weeklyStats: WeeklyStatV2[];
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Meta calculada anteriormente no mesmo dia (para suavização). Opcional. */
  previousGoal?: number;
  /** Meta manual configurada (fallback final). Opcional. */
  manualGoal?: number;
}

export interface SmartGoalV2Output {
  finalGoal: number;
  baseGoal: number;
  projected: number;
  remaining: number;
  /** R$ por minuto necessário no tempo restante. */
  requiredRate: number;
  /** R$ por minuto realizado até agora. */
  currentRate: number;
  /** Ritmo necessário em R$/hora (derivado, conveniência para UI). */
  requiredRatePerHour: number;
  /** Ritmo atual em R$/hora (derivado). */
  currentRatePerHour: number;
  progressPct: number;
  difficulty: GoalDifficultyV2;
  strategy: GoalStrategyV2;
  message: string;
  weeklyTrend: {
    direction: TrendDirection;
    percentage: string;
    rawPct: number;
  };
}

const WEEKDAY_FACTORS: Record<number, number> = {
  0: 0.8, 1: 0.9, 2: 1.0, 3: 1.05, 4: 1.1, 5: 1.2, 6: 1.3,
};
const MIN_WORKED_MINUTES = 5;
const MAX_GOAL_CHANGE_PCT = 0.15;
const MIN_GOAL_FLOOR_PCT = 0.5;
const PACE_FACTOR_RANGE = { min: 0.7, max: 1.3 };

const MESSAGES: Record<GoalStrategyV2, string[]> = {
  acelerar: [
    "Ritmo abaixo da meta. Acelere nos próximos atendimentos.",
    "Você precisa aumentar o ticket médio para alcançar a meta hoje.",
    "Meta em risco. Foque em upsells e agendamentos cheios.",
  ],
  manter: [
    "Ritmo ideal. Continue assim e a meta vem.",
    "Você está no caminho certo. Mantenha o padrão.",
    "Desempenho estável. Meta alcançável no tempo restante.",
  ],
  encerrado: [
    "Meta batida! Excelente desempenho hoje.",
    "Dia finalizado acima da expectativa. Parabéns!",
    "Meta superada. Ótimo trabalho!",
  ],
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeSmartGoalV2(input: SmartGoalV2Input): SmartGoalV2Output {
  // 5.1 Clamp de segurança
  const occupancy = clamp(input.occupancy, 0, 100);
  const workedMinutes = Math.max(0, input.workedMinutes);
  const remainingMinutes = Math.max(0, input.remainingMinutes);
  const todayRevenue = Math.max(0, input.todayRevenue);

  // 5.2 Base histórica
  const weeks = input.weeklyStats ?? [];
  let baseGoal: number;
  if (weeks.length === 0) {
    baseGoal = input.manualGoal && input.manualGoal > 0
      ? input.manualGoal
      : Math.max(todayRevenue * 1.2, 100);
  } else {
    const totalRev = weeks.reduce((s, w) => s + (w.totalRevenue || 0), 0);
    const avgWeekly = totalRev / weeks.length;
    baseGoal = avgWeekly / 6; // 6 dias úteis
    if (baseGoal <= 0 && input.manualGoal && input.manualGoal > 0) {
      baseGoal = input.manualGoal;
    }
  }

  // 5.3 Projeção
  let projected: number;
  if (workedMinutes < MIN_WORKED_MINUTES) {
    projected = baseGoal;
  } else {
    const totalMin = workedMinutes + remainingMinutes;
    projected = (todayRevenue / workedMinutes) * totalMin;
  }

  // 5.4 Fator de ritmo
  const performanceRatio = baseGoal > 0 ? projected / baseGoal : 1;
  const paceFactor = clamp(
    0.9 + performanceRatio * 0.2,
    PACE_FACTOR_RANGE.min,
    PACE_FACTOR_RANGE.max,
  );

  // 5.5 Ajuste por ocupação
  let occupancyMultiplier = 1.0;
  if (occupancy < 40) occupancyMultiplier = 0.9;
  else if (occupancy > 70) occupancyMultiplier = 1.1;

  // 5.6 Meta bruta
  const wdFactor = WEEKDAY_FACTORS[input.dayOfWeek] ?? 1;
  let rawGoal = Math.max(baseGoal, projected * paceFactor, baseGoal * wdFactor);
  rawGoal = rawGoal * occupancyMultiplier;

  // 5.7 Clamps finais
  const minGoal = baseGoal * MIN_GOAL_FLOOR_PCT;
  let finalGoal = Math.max(rawGoal, minGoal);

  // Suavização contra meta anterior (limita variação a 15%)
  if (input.previousGoal && input.previousGoal > 0) {
    const maxUp = input.previousGoal * (1 + MAX_GOAL_CHANGE_PCT);
    const maxDown = input.previousGoal * (1 - MAX_GOAL_CHANGE_PCT);
    finalGoal = clamp(finalGoal, maxDown, maxUp);
  }

  // 5.8 Métricas derivadas
  const remaining = Math.max(0, finalGoal - todayRevenue);
  const currentRate = workedMinutes > 0 ? todayRevenue / workedMinutes : 0;
  const requiredRate = remainingMinutes > 0 ? remaining / remainingMinutes : 0;
  const progressPct = finalGoal > 0 ? (todayRevenue / finalGoal) * 100 : 0;

  let difficulty: GoalDifficultyV2;
  if (currentRate <= 0) {
    difficulty = remaining === 0 ? "easy" : "medium";
  } else if (requiredRate > currentRate * 1.5) {
    difficulty = "hard";
  } else if (requiredRate > currentRate) {
    difficulty = "medium";
  } else {
    difficulty = "easy";
  }

  // 5.9 Estratégia
  let strategy: GoalStrategyV2;
  if (remainingMinutes <= 0 || todayRevenue >= finalGoal) {
    strategy = remainingMinutes <= 0 ? "encerrado" : todayRevenue >= finalGoal ? "encerrado" : "manter";
  } else if (currentRate > 0 && requiredRate > currentRate * 1.05) {
    strategy = "acelerar";
  } else {
    strategy = "manter";
  }

  // 5.10 Mensagem (rotação determinística por dia)
  const dayHash = Math.floor(Date.now() / 86_400_000);
  const pool = MESSAGES[strategy];
  const message = pool[dayHash % pool.length];

  // 5.11 Tendência semanal
  const currentWeek = weeks[weeks.length - 1]?.totalRevenue ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.totalRevenue ?? currentWeek;
  const trendPct = lastWeek > 0 ? ((currentWeek - lastWeek) / lastWeek) * 100 : 0;
  const direction: TrendDirection =
    trendPct > 5 ? "up" : trendPct < -5 ? "down" : "stable";

  return {
    finalGoal,
    baseGoal,
    projected,
    remaining,
    requiredRate,
    currentRate,
    requiredRatePerHour: requiredRate * 60,
    currentRatePerHour: currentRate * 60,
    progressPct,
    difficulty,
    strategy,
    message,
    weeklyTrend: {
      direction,
      percentage: Math.abs(trendPct).toFixed(1) + "%",
      rawPct: trendPct,
    },
  };
}
