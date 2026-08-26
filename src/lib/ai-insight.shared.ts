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

export interface AdvancedInput {
  mode: AnalysisMode;
  dayData: AnalysisDayData;
  weeklyStats: AnalysisWeeklyStat[];
  previousAnalyses: Array<{ timestamp: string; insights: string[] }>;
  score: DayScore;
  seed: number;
}
