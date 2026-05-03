export type AnalysisMode =
  | "geral"
  | "faturamento"
  | "tempo_ocupado"
  | "performance"
  | "crescimento";

export type AnalysisType = "insight" | "diagnostico" | "acao" | "oportunidade" | "alerta";
export type Severity = "alta" | "media" | "baixa";
export type DayScoreValue = "forte" | "medio" | "fraco";
export type AnalysisIcon =
  | "trending_up"
  | "warning"
  | "lightbulb"
  | "schedule"
  | "attach_money";

export interface AnalysisItem {
  tipo: AnalysisType;
  texto: string;
  severidade: Severity;
  icone_sugerido: AnalysisIcon;
}

export interface DayScore {
  value: DayScoreValue;
  faturamentoPercent: number;
  ocupacaoPercent: number;
  metaAtingida: boolean;
}

export interface AnalysisResponse {
  id: string;
  timestamp: string;
  mode: AnalysisMode;
  items: AnalysisItem[];
  score: DayScore;
}

export interface AnalysisDayData {
  date: string;
  faturamento: number;
  meta: number;
  ocupacao_percent: number;
  total_agendamentos: number;
  agendamentos_realizados: number;
  ticket_medio: number;
}

export interface AnalysisWeeklyStat {
  week_start: string;
  faturamento: number;
  ocupacao: number;
}
